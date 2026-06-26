import { spawn } from 'node:child_process'
import { BrowserWindow } from 'electron'
import { OllamaHttpTransport } from './providers/ollama/ollamaTransport'
import { getRepositories } from './persistence/db'
import { createLogger } from './logger'

const log = createLogger('ollama')

let pulling = false

export interface OllamaStatus {
  running: boolean
  modelReady: boolean
  model: string
}

/** ¿Está Ollama corriendo y con el modelo de resumen descargado? */
export async function getOllamaStatus(): Promise<OllamaStatus> {
  const model = getRepositories().settings.getAll().modeloLlm
  try {
    const health = await new OllamaHttpTransport().healthCheck()
    const base = model.split(':')[0]
    const modelReady = health.ok && health.models.some((m) => m === model || m.startsWith(base))
    return { running: health.ok, modelReady, model }
  } catch {
    return { running: false, modelReady: false, model }
  }
}

function emit(line: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('ollama:progress', { line })
  }
}

/** Descarga el modelo de resumen vía `ollama pull` (requiere Ollama instalado). */
export async function pullOllamaModel(): Promise<{ ok: boolean }> {
  if (pulling) return { ok: false }
  pulling = true
  const model = getRepositories().settings.getAll().modeloLlm
  log.info('Descargando modelo Ollama', { model })
  emit(`Descargando modelo ${model}… (puede pesar varios GB)`)
  return new Promise((resolve) => {
    const ps = spawn('ollama', ['pull', model], { windowsHide: true, shell: true })
    const onData = (chunk: Buffer): void => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim()) emit(line.trim())
      }
    }
    ps.stdout.on('data', onData)
    ps.stderr.on('data', onData)
    ps.on('close', (code) => {
      pulling = false
      emit(code === 0 ? '✓ Modelo listo' : `✗ Error (código ${code})`)
      resolve({ ok: code === 0 })
    })
    ps.on('error', (err) => {
      pulling = false
      emit(`✗ ${String(err)} — ¿está instalado Ollama?`)
      resolve({ ok: false })
    })
  })
}
