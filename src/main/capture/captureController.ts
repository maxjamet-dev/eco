import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { createLogger } from '../logger'

const log = createLogger('capture')

export interface CaptureStartOptions {
  recordingId: string
  outDir: string
  micDeviceId?: string | null
  sysDeviceId?: string | null
}

export interface CaptureResult {
  micPath: string | null
  sysPath: string | null
  offsetSysMs: number
  durationMs: number
}

export interface CaptureMeta {
  mic_path?: string
  system_path?: string
  offset_sys_ms?: number
  duration_ms?: number
}

export type LevelListener = (micLevel: number, sysLevel: number) => void

/** Resuelve la ruta del binario de captura Rust (dev o empaquetado). */
function resolveCaptureBinary(): string | null {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'capture', 'meetcap.exe') : null,
    app?.isPackaged === false ? join(app.getAppPath(), 'native', 'target', 'release', 'meetcap.exe') : null,
    join(process.cwd(), 'native', 'target', 'release', 'meetcap.exe'),
    join(process.cwd(), 'resources', 'capture', 'meetcap.exe')
  ].filter((p): p is string => Boolean(p))
  return candidates.find((p) => existsSync(p)) ?? null
}

/**
 * Binding al binario nativo de captura (SDD §5.4, §9.1).
 * Control por stdin/stdout con mensajes JSON por línea.
 *   → {"cmd":"start", ...}  → {"cmd":"stop"}
 *   ← {"event":"level", ...} {"event":"state", ...} {"event":"error", ...}
 */
export class NativeCaptureController {
  private proc: ChildProcess | null = null
  private outDir = ''
  private levelListener: LevelListener | null = null
  private stopResolve: ((meta: CaptureMeta) => void) | null = null
  private startTimeMs = 0

  onLevels(cb: LevelListener): void {
    this.levelListener = cb
  }

  async start(opts: CaptureStartOptions): Promise<void> {
    const bin = resolveCaptureBinary()
    if (!bin) {
      throw new Error(
        'Binario de captura no encontrado (native/target/release/meetcap.exe). ' +
          'Compila el módulo Rust (cargo build --release) o ejecuta el asistente.'
      )
    }
    this.outDir = opts.outDir
    log.info('Iniciando captura', { bin, recordingId: opts.recordingId })

    const proc = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc = proc
    this.startTimeMs = Date.now()

    proc.stdout?.setEncoding('utf8')
    let buffer = ''
    proc.stdout?.on('data', (chunk: string) => {
      buffer += chunk
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (line) this.handleEvent(line)
      }
    })
    proc.stderr?.on('data', (c: Buffer) => log.debug('capture stderr', c.toString('utf8').trimEnd()))
    proc.on('exit', (code) => log.info('captura terminó', { code }))

    this.send({
      cmd: 'start',
      recordingId: opts.recordingId,
      outDir: opts.outDir,
      micId: opts.micDeviceId ?? null,
      sysId: opts.sysDeviceId ?? null
    })
  }

  async stop(): Promise<CaptureResult> {
    if (!this.proc) {
      return { micPath: null, sysPath: null, offsetSysMs: 0, durationMs: 0 }
    }
    const metaPromise = new Promise<CaptureMeta>((resolve) => {
      this.stopResolve = resolve
      // Respaldo: si el binario no emite meta, leemos meta.json del outDir.
      setTimeout(() => {
        if (this.stopResolve) {
          void this.readMetaFallback().then((m) => {
            if (this.stopResolve) {
              this.stopResolve(m)
              this.stopResolve = null
            }
          })
        }
      }, 5000)
    })
    this.send({ cmd: 'stop' })

    const meta = await metaPromise
    this.proc = null
    const durationMs = meta.duration_ms ?? Date.now() - this.startTimeMs
    return {
      micPath: meta.mic_path ?? join(this.outDir, 'mic.wav'),
      sysPath: meta.system_path ?? join(this.outDir, 'system.wav'),
      offsetSysMs: meta.offset_sys_ms ?? 0,
      durationMs
    }
  }

  private async readMetaFallback(): Promise<CaptureMeta> {
    try {
      const raw = await readFile(join(this.outDir, 'meta.json'), 'utf8')
      return JSON.parse(raw) as CaptureMeta
    } catch {
      return {}
    }
  }

  private handleEvent(line: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line)
    } catch {
      log.debug('captura: línea no-JSON', line)
      return
    }
    switch (msg.event) {
      case 'level':
        this.levelListener?.(Number(msg.mic ?? 0), Number(msg.sys ?? 0))
        break
      case 'stopped':
        if (this.stopResolve) {
          this.stopResolve((msg.meta ?? {}) as CaptureMeta)
          this.stopResolve = null
        }
        break
      case 'error':
        log.error('captura: error del binario', String(msg.message ?? ''))
        break
      default:
        break
    }
  }

  private send(obj: Record<string, unknown>): void {
    this.proc?.stdin?.write(JSON.stringify(obj) + '\n')
  }
}
