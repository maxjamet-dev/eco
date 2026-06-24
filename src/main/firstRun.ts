import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { SystemReadiness } from '@shared/types'
import { HardwareDetector } from './hardware/detect'
import { OllamaHttpTransport } from './providers/ollama/ollamaTransport'
import { getRepositories } from './persistence/db'
import { hasSecret, HF_TOKEN_KEY } from './secrets'

/** Resuelve rutas candidatas de un recurso (dev o empaquetado). */
function existsInAny(rel: string[], file: string): boolean {
  const bases = [
    process.resourcesPath ? join(process.resourcesPath) : null,
    app?.isPackaged === false ? app.getAppPath() : null,
    process.cwd()
  ].filter((p): p is string => Boolean(p))
  return bases.some((b) => existsSync(join(b, ...rel, file)))
}

/**
 * Comprueba el estado de preparación del sistema para el asistente de primer
 * arranque (SDD §14): GPU, entorno Python, binario de captura, Ollama y token.
 */
export async function checkReadiness(detector: HardwareDetector): Promise<SystemReadiness> {
  const gpu = await detector.detect()

  const pythonReady =
    existsInAny(['python', '.venv', 'Scripts'], 'python.exe') &&
    existsInAny(['python'], 'worker.py')

  const whisperBinReady =
    existsInAny(['native', 'target', 'release'], 'meetcap.exe') ||
    existsInAny(['resources', 'capture'], 'meetcap.exe') ||
    existsInAny(['capture'], 'meetcap.exe')

  const ollama = new OllamaHttpTransport()
  const health = await ollama.healthCheck()

  const settings = getRepositories().settings.getAll()
  const modeloLlmDisponible = health.models.some(
    (m) => m === settings.modeloLlm || m.startsWith(settings.modeloLlm.split(':')[0])
  )

  const hasHfToken = hasSecret(HF_TOKEN_KEY)

  const listoParaUsar = pythonReady && whisperBinReady && health.ok && modeloLlmDisponible

  return {
    gpu,
    pythonReady,
    whisperBinReady,
    ollamaReady: health.ok,
    ollamaModels: health.models,
    modeloLlmDisponible,
    hasHfToken,
    listoParaUsar
  }
}
