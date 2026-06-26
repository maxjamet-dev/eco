import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type {
  AppSettings,
  AudioLevels,
  RecordingDetail,
  RecordingMode
} from '@shared/types'
import { getRepositories } from '../persistence/db'
import { getOrchestrator } from '../orchestrator'
import { NativeCaptureController } from '../capture/captureController'
import { HardwareDetector } from '../hardware/detect'
import { hasSecret, setSecret, HF_TOKEN_KEY } from '../secrets'
import { setAutoLaunch, setTrayRecording } from '../tray'
import { getEnvStatus, prepareEnv } from '../envManager'
import { getOllamaStatus, pullOllamaModel } from '../ollamaManager'
import { recordingDir, dataDir } from '../paths'
import { createLogger } from '../logger'
import { importAudio } from '../import/audioImport'

const log = createLogger('ipc')

// Una grabación activa a la vez (MVP).
let activeCapture: { controller: NativeCaptureController; recordingId: string } | null = null
const detector = new HardwareDetector()

/** ¿Hay una grabación en curso? (lo consulta el detector de reuniones.) */
export function isRecordingActive(): boolean {
  return activeCapture !== null
}
/** Id de la grabación en curso, o null. */
export function getActiveRecordingId(): string | null {
  return activeCapture?.recordingId ?? null
}

function broadcastLevels(levels: AudioLevels): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('audio:levels', levels)
  }
}

/** Registra todos los handlers IPC tipados (SDD §10.1). */
export function registerIpcHandlers(): void {
  const repos = getRepositories()

  ipcMain.handle('recording:start', async (_e, payload: { titulo?: string; modo: RecordingMode }) => {
    const settings = repos.settings.getAll()
    const rec = repos.recordings.create({
      titulo: payload.titulo,
      modo: payload.modo,
      fechaInicio: new Date().toISOString()
    })
    const controller = new NativeCaptureController()
    controller.onLevels((mic, sys) =>
      broadcastLevels({ recordingId: rec.id, micLevel: mic, sysLevel: sys })
    )
    try {
      await controller.start({
        recordingId: rec.id,
        outDir: recordingDir(rec.id),
        micDeviceId: settings.micDeviceId,
        sysDeviceId: settings.sysDeviceId
      })
      activeCapture = { controller, recordingId: rec.id }
      setTrayRecording(true)
    } catch (err) {
      log.error('No se pudo iniciar la captura', String(err))
      repos.recordings.setStatus(rec.id, 'failed')
      throw err
    }
    return { id: rec.id }
  })

  ipcMain.handle('recording:stop', async (_e, payload: { id: string }) => {
    if (!activeCapture || activeCapture.recordingId !== payload.id) {
      return { ok: false }
    }
    const result = await activeCapture.controller.stop()
    activeCapture = null
    setTrayRecording(false)
    repos.recordings.setAudioPaths(payload.id, result.micPath, result.sysPath, result.offsetSysMs)
    repos.recordings.setDuration(payload.id, result.durationMs)
    repos.recordings.setStatus(payload.id, 'captured')
    getOrchestrator().enqueue(payload.id)
    return { ok: true }
  })

  ipcMain.handle('recording:delete', async (_e, payload: { id: string }) => {
    repos.recordings.delete(payload.id)
    return { ok: true }
  })

  ipcMain.handle(
    'recordings:list',
    async (_e, payload: { filtro?: string; projectId?: string | null }) => {
      return repos.recordings.list(payload?.filtro, payload?.projectId)
    }
  )

  ipcMain.handle('recording:get', async (_e, payload: { id: string }): Promise<RecordingDetail | null> => {
    const recording = repos.recordings.get(payload.id)
    if (!recording) return null
    return {
      recording,
      speakers: repos.recordings.listSpeakers(payload.id),
      segments: repos.transcripts.listByRecording(payload.id),
      summary: repos.summaries.get(payload.id),
      project: recording.projectId ? repos.projects.get(recording.projectId) : null
    }
  })

  ipcMain.handle(
    'recording:update',
    async (
      _e,
      payload: { id: string; titulo?: string; descripcion?: string | null; projectId?: string | null }
    ) => {
      const { id, ...patch } = payload
      repos.recordings.update(id, patch)
      return { ok: true }
    }
  )

  ipcMain.handle('recording:importFile', async (_e, payload) => {
    return importAudio(payload)
  })

  ipcMain.handle('recording:importBytes', async (_e, payload) => {
    return importAudio(payload)
  })

  ipcMain.handle('dialog:pickAudio', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Importar audio',
      properties: ['openFile'],
      filters: [
        { name: 'Audio', extensions: ['opus', 'ogg', 'm4a', 'mp3', 'wav', 'aac', 'flac', 'webm', 'mp4'] }
      ]
    })
    return { filePath: result.canceled || !result.filePaths[0] ? null : result.filePaths[0] }
  })

  // ---- Proyectos ----
  ipcMain.handle('projects:list', async () => {
    return repos.projects.list().map((p) => ({
      ...p,
      numReuniones: repos.projects.countRecordings(p.id)
    }))
  })

  ipcMain.handle('projects:create', async (_e, payload: { nombre: string; descripcion?: string | null }) => {
    return repos.projects.create({
      nombre: payload.nombre,
      descripcion: payload.descripcion ?? null,
      creadoEn: new Date().toISOString()
    })
  })

  ipcMain.handle(
    'projects:update',
    async (_e, payload: { id: string; nombre?: string; descripcion?: string | null }) => {
      const { id, ...patch } = payload
      repos.projects.update(id, patch)
      return { ok: true }
    }
  )

  ipcMain.handle('projects:delete', async (_e, payload: { id: string }) => {
    repos.projects.delete(payload.id)
    return { ok: true }
  })

  ipcMain.handle('recording:retry', async (_e, payload: { id: string }) => {
    getOrchestrator().retry(payload.id)
    return { ok: true }
  })

  ipcMain.handle('summary:regenerate', async (_e, payload: { id: string }) => {
    return getOrchestrator().resummarize(payload.id)
  })

  ipcMain.handle(
    'summary:setFeedback',
    async (_e, payload: { recordingId: string; feedback: 'up' | 'down' | null }) => {
      repos.summaries.setFeedback(payload.recordingId, payload.feedback)
      return { ok: true }
    }
  )

  ipcMain.handle('transcript:search', async (_e, payload: { id: string; query: string }) => {
    return repos.transcripts.search(payload.id, payload.query)
  })

  ipcMain.handle('transcript:searchGlobal', async (_e, payload: { query: string }) => {
    return repos.transcripts.searchGlobal(payload.query)
  })

  ipcMain.handle(
    'speaker:rename',
    async (_e, payload: { recordingId: string; speakerId: number; nombre: string }) => {
      repos.recordings.renameSpeaker(payload.recordingId, payload.speakerId, payload.nombre)
      return { ok: true }
    }
  )

  ipcMain.handle('settings:get', async (): Promise<AppSettings> => {
    const s = repos.settings.getAll()
    return { ...s, tieneTokenHf: hasSecret(HF_TOKEN_KEY), carpetaDatos: dataDir() }
  })

  ipcMain.handle('settings:set', async (_e, patch: Partial<AppSettings>): Promise<AppSettings> => {
    // No persistimos campos derivados/sensibles.
    const { tieneTokenHf: _t, carpetaDatos: _c, ...safe } = patch
    const s = repos.settings.set(safe)
    if ('iniciarConWindows' in safe) setAutoLaunch(s.iniciarConWindows)
    return { ...s, tieneTokenHf: hasSecret(HF_TOKEN_KEY), carpetaDatos: dataDir() }
  })

  ipcMain.handle('settings:setHfToken', async (_e, payload: { token: string }) => {
    const ok = setSecret(HF_TOKEN_KEY, payload.token)
    return { ok }
  })

  ipcMain.handle('audio:listDevices', async () => {
    // La enumeración real la provee el binario de captura (Sprint 6).
    // Mientras tanto devolvemos listas vacías; la UI usa dispositivos por defecto.
    return { inputs: [], outputs: [] }
  })

  ipcMain.handle('hardware:detect', async (_e, payload: { force?: boolean }) => {
    return detector.detect(payload?.force ?? false)
  })

  ipcMain.handle('system:readiness', async () => {
    const { checkReadiness } = await import('../firstRun')
    return checkReadiness(detector)
  })

  ipcMain.handle('system:openDataFolder', async () => {
    await shell.openPath(dataDir())
    return { ok: true }
  })

  ipcMain.handle('env:status', async () => getEnvStatus())
  ipcMain.handle('env:prepare', async (_e, payload: { device: 'cuda' | 'cpu' }) =>
    prepareEnv(payload.device)
  )

  ipcMain.handle('ollama:status', async () => getOllamaStatus())
  ipcMain.handle('ollama:pull', async () => pullOllamaModel())

  log.info('Handlers IPC registrados')
}
