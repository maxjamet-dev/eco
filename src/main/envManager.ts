import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { dataDir, resourcePath } from './paths'
import { createLogger } from './logger'

const log = createLogger('env')

let preparing = false

function runtimeDir(): string {
  return join(dataDir(), 'runtime')
}
function venvPython(): string {
  return join(runtimeDir(), 'venv', 'Scripts', 'python.exe')
}
function readyFile(): string {
  return join(runtimeDir(), '.ready')
}

export interface EnvStatus {
  ready: boolean
  device: string | null
  preparing: boolean
}

/** ¿Está listo el entorno de IA (venv creado + marca de éxito)? */
export function getEnvStatus(): EnvStatus {
  const ready = existsSync(venvPython()) && existsSync(readyFile())
  let device: string | null = null
  if (ready) {
    try {
      device = readFileSync(readyFile(), 'utf8').trim() || null
    } catch {
      device = null
    }
  }
  return { ready, device, preparing }
}

function emit(line: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('env:progress', { line })
  }
}

/**
 * Ejecuta el script de preparación (descarga/instala el entorno de IA) y
 * transmite su salida línea a línea al renderer vía `env:progress`.
 */
export async function prepareEnv(device: 'cuda' | 'cpu'): Promise<{ ok: boolean }> {
  if (preparing) return { ok: false }
  preparing = true
  const script = resourcePath('prepare-eco.ps1')
  log.info('Preparando entorno de IA', { device, script })
  emit(`::step::Iniciando preparación (${device})`)

  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    '-DataDir',
    dataDir(),
    '-Device',
    device
  ]
  // Si el instalador trae un uv.exe propio, lo usamos; si no, el del sistema (dev).
  const bundledUv = resourcePath('uv.exe')
  if (existsSync(bundledUv)) args.push('-UvExe', bundledUv)

  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', args, { windowsHide: true })

    const onData = (chunk: Buffer): void => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim()) emit(line)
      }
    }
    ps.stdout.on('data', onData)
    ps.stderr.on('data', onData)

    ps.on('close', (code) => {
      preparing = false
      const ok = code === 0 && getEnvStatus().ready
      emit(ok ? '::done::ok' : `::done::error (código ${code})`)
      log.info('Preparación finalizada', { code, ok })
      resolve({ ok })
    })
    ps.on('error', (err) => {
      preparing = false
      emit(`::error::${String(err)}`)
      log.error('Fallo lanzando la preparación', String(err))
      resolve({ ok: false })
    })
  })
}
