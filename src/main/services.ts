import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { ProcessingProgress } from '@shared/types'
import type { TranscriptionProvider } from '@shared/providers'
import { getRepositories } from './persistence/db'
import { HardwareDetector } from './hardware/detect'
import { selectBackend } from './hardware/backendSelector'
import { WhisperXWorker } from './providers/whisperx/worker'
import { WhisperXProvider } from './providers/whisperx/whisperXProvider'
import { WhisperCppProvider } from './providers/whispercpp/whisperCppProvider'
import { OllamaProvider } from './providers/ollama/ollamaProvider'
import { OllamaHttpTransport } from './providers/ollama/ollamaTransport'
import { initOrchestrator, type OrchestratorDeps } from './orchestrator'
import { getSecret, HF_TOKEN_KEY } from './secrets'
import { modelsDir } from './paths'
import { createLogger } from './logger'

const log = createLogger('services')

/** Emite progreso a todas las ventanas abiertas. */
function emitProgress(p: ProcessingProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('processing:progress', p)
  }
}

/** Resuelve el binario y modelo de whisper.cpp (fallback CPU), si existen. */
function resolveWhisperCpp(): { binPath: string; modelPath: string } | null {
  const base = modelsDir()
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'whispercpp') : null,
    join(base, '..', 'whispercpp'),
    join(process.cwd(), 'resources', 'whispercpp')
  ].filter((p): p is string => Boolean(p))
  for (const dir of candidates) {
    const bin = join(dir, 'whisper-cli.exe')
    const model = join(dir, 'ggml-large-v3-turbo.bin')
    if (existsSync(bin) && existsSync(model)) return { binPath: bin, modelPath: model }
  }
  return null
}

/**
 * Ensambla todos los servicios de producción e inicializa el orquestador
 * con sus dependencias reales (cableado / DI manual).
 */
export function buildServices(): void {
  const repos = getRepositories()
  const detector = new HardwareDetector()
  const whisperXWorker = new WhisperXWorker()
  const whisperX = new WhisperXProvider(whisperXWorker)
  const ollama = new OllamaProvider(new OllamaHttpTransport())

  const selectProviders: OrchestratorDeps['selectProviders'] = async () => {
    const settings = repos.settings.getAll()
    const hw = await detector.detect()
    const decision = selectBackend(hw, settings.backend)
    log.info('Backend seleccionado', { device: decision.device, motivo: decision.motivo })

    let transcription: TranscriptionProvider
    if (decision.transcriptionProvider === 'whisperx') {
      transcription = whisperX
    } else {
      const cpp = resolveWhisperCpp()
      if (!cpp) {
        throw new Error(
          'Fallback CPU no disponible: falta el binario/modelo de whisper.cpp. ' +
            'Ejecuta el asistente de primer arranque o usa una GPU NVIDIA.'
        )
      }
      transcription = new WhisperCppProvider(cpp)
    }
    return { device: decision.device, transcription }
  }

  initOrchestrator({
    repos,
    selectProviders,
    summarization: ollama,
    getSettings: () => repos.settings.getAll(),
    getHfToken: () => getSecret(HF_TOKEN_KEY),
    emitProgress,
    now: () => new Date().toISOString()
  })

  log.info('Servicios ensamblados')
}
