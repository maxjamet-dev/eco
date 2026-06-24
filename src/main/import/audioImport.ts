import { execFile } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { app } from 'electron'
import type { Recording } from '@shared/types'
import { getRepositories } from '../persistence/db'
import { getOrchestrator } from '../orchestrator'
import { recordingDir } from '../paths'
import { createLogger } from '../logger'

const log = createLogger('import')

/** Resuelve el binario de ffmpeg (estático en resources, o en el PATH). */
function resolveFfmpeg(): string {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe') : null,
    app?.isPackaged === false ? join(app.getAppPath(), 'resources', 'ffmpeg', 'ffmpeg.exe') : null,
    join(process.cwd(), 'resources', 'ffmpeg', 'ffmpeg.exe')
  ].filter((p): p is string => Boolean(p))
  return candidates.find((p) => existsSync(p)) ?? 'ffmpeg'
}

/** Convierte cualquier audio a WAV PCM 16 kHz mono usando ffmpeg. */
function convertToWav(input: string, output: string): Promise<void> {
  const ffmpeg = resolveFfmpeg()
  return new Promise((resolve, reject) => {
    execFile(
      ffmpeg,
      ['-y', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', output],
      { maxBuffer: 16 * 1024 * 1024 },
      (err, _stdout, stderr) => {
        if (err) reject(new Error(`ffmpeg falló: ${stderr || err.message}`))
        else resolve()
      }
    )
  })
}

interface ImportInput {
  /** Ruta del archivo de origen (cuando viene de diálogo o drag&drop). */
  filePath?: string
  /** Nombre + datos (cuando viene de portapapeles / bytes). */
  fileName?: string
  dataBase64?: string
  titulo?: string
  descripcion?: string | null
  projectId?: string | null
}

/**
 * Importa un audio externo (nota de voz de WhatsApp, mp3, m4a…): lo convierte a
 * WAV 16 kHz mono, crea una reunión `tipo='importada'` y la encola para
 * transcripción + diarización + resumen (reusa el pipeline del orquestador).
 */
export async function importAudio(input: ImportInput): Promise<{ id: string }> {
  const repos = getRepositories()
  const nombreOrigen = input.filePath
    ? basename(input.filePath)
    : input.fileName ?? 'audio importado'

  const rec: Recording = repos.recordings.create({
    titulo: input.titulo?.trim() || nombreOrigen.replace(/\.[^.]+$/, ''),
    descripcion: input.descripcion ?? null,
    modo: 'online',
    fechaInicio: new Date().toISOString(),
    tipo: 'importada',
    projectId: input.projectId ?? null,
    estado: 'captured'
  })

  const dir = recordingDir(rec.id)

  // Material de origen: ruta directa o bytes (portapapeles) volcados a disco.
  let sourcePath = input.filePath
  if (!sourcePath && input.dataBase64) {
    const ext = (input.fileName?.match(/\.[^.]+$/)?.[0] ?? '.bin').toLowerCase()
    sourcePath = join(dir, `source${ext}`)
    writeFileSync(sourcePath, Buffer.from(input.dataBase64, 'base64'))
  }
  if (!sourcePath) {
    repos.recordings.delete(rec.id)
    throw new Error('Importación sin archivo ni datos de audio')
  }

  const wavPath = join(dir, 'system.wav')
  try {
    log.info('Convirtiendo audio importado', { source: sourcePath })
    await convertToWav(sourcePath, wavPath)
  } catch (e) {
    repos.recordings.setStatus(rec.id, 'failed')
    log.error('Conversión de audio falló', String(e))
    throw e
  }

  // Pista del sistema = audio importado (se diariza); sin pista de micrófono.
  repos.recordings.setAudioPaths(rec.id, null, wavPath, 0)
  repos.recordings.setStatus(rec.id, 'captured')
  getOrchestrator().enqueue(rec.id)

  return { id: rec.id }
}
