import { BrowserWindow, ipcMain, shell } from 'electron'
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
import { recordingDir, dataDir } from '../paths'
import { createLogger } from '../logger'

const log = createLogger('ipc')

// Una grabación activa a la vez (MVP).
let activeCapture: { controller: NativeCaptureController; recordingId: string } | null = null
const detector = new HardwareDetector()

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

  ipcMain.handle('recordings:list', async (_e, payload: { filtro?: string }) => {
    return repos.recordings.list(payload?.filtro)
  })

  ipcMain.handle('recording:get', async (_e, payload: { id: string }): Promise<RecordingDetail | null> => {
    const recording = repos.recordings.get(payload.id)
    if (!recording) return null
    return {
      recording,
      speakers: repos.recordings.listSpeakers(payload.id),
      segments: repos.transcripts.listByRecording(payload.id),
      summary: repos.summaries.get(payload.id)
    }
  })

  ipcMain.handle('recording:retry', async (_e, payload: { id: string }) => {
    getOrchestrator().retry(payload.id)
    return { ok: true }
  })

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

  log.info('Handlers IPC registrados')
}
