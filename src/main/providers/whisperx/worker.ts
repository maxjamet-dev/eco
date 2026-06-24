import { spawn, type ChildProcess } from 'node:child_process'
import { connect } from 'node:net'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { createLogger } from '../../logger'
import type { WhisperXTransport } from './whisperXProvider'
import type { WhisperXRequest } from './protocol'

const log = createLogger('whisperx-worker')

const DEFAULT_PORT = 8765
const READY_TIMEOUT_MS = 120_000
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000 // transcripciones largas

/**
 * Resuelve el ejecutable de Python del venv y la ruta del worker.
 * En desarrollo: ./python/.venv + ./python/worker.py
 * Empaquetado: resources/python/.venv + resources/python/worker.py
 */
function resolvePythonPaths(): { python: string; script: string; cwd: string } | null {
  const candidates = [
    // Empaquetado (extraResources)
    process.resourcesPath ? join(process.resourcesPath, 'python') : null,
    // Desarrollo
    app?.isPackaged === false ? join(app.getAppPath(), 'python') : null,
    join(process.cwd(), 'python')
  ].filter((p): p is string => Boolean(p))

  for (const base of candidates) {
    const python = join(base, '.venv', 'Scripts', 'python.exe')
    const script = join(base, 'worker.py')
    if (existsSync(python) && existsSync(script)) {
      return { python, script, cwd: base }
    }
  }
  return null
}

/**
 * Gestiona el ciclo de vida del worker whisperX (proceso Python persistente)
 * e implementa el transporte TCP (SDD §5.4, §10.2).
 */
export class WhisperXWorker implements WhisperXTransport {
  private proc: ChildProcess | null = null
  private port = DEFAULT_PORT
  private ready = false
  private startPromise: Promise<void> | null = null

  constructor(opts: { port?: number } = {}) {
    if (opts.port) this.port = opts.port
  }

  /** Arranca el worker si no está corriendo. Idempotente. */
  async ensureStarted(): Promise<void> {
    if (this.ready) return
    if (this.startPromise) return this.startPromise
    this.startPromise = this.start()
    try {
      await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  private start(): Promise<void> {
    const paths = resolvePythonPaths()
    if (!paths) {
      return Promise.reject(
        new Error(
          'No se encontró el entorno Python de whisperX (python/.venv + worker.py). ' +
            'Ejecuta el asistente de primer arranque.'
        )
      )
    }
    log.info('Arrancando worker whisperX', { python: paths.python, port: this.port })

    return new Promise<void>((resolve, reject) => {
      const proc = spawn(paths.python, [paths.script, '--port', String(this.port)], {
        cwd: paths.cwd,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.proc = proc

      const timer = setTimeout(() => {
        reject(new Error('Timeout esperando READY del worker whisperX'))
        proc.kill()
      }, READY_TIMEOUT_MS)

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        log.debug('worker stdout', text.trimEnd())
        if (text.includes('READY')) {
          this.ready = true
          clearTimeout(timer)
          resolve()
        }
      })
      proc.stderr?.on('data', (chunk: Buffer) => {
        log.debug('worker stderr', chunk.toString('utf8').trimEnd())
      })
      proc.on('exit', (code) => {
        log.warn('worker whisperX terminó', { code })
        this.ready = false
        this.proc = null
      })
      proc.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }

  /** Envía una petición y espera la respuesta JSON (newline-delimited). */
  async send(req: WhisperXRequest): Promise<unknown> {
    await this.ensureStarted()
    return new Promise<unknown>((resolve, reject) => {
      const socket = connect(this.port, '127.0.0.1')
      let buffer = ''
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error('Timeout en petición a whisperX'))
      }, REQUEST_TIMEOUT_MS)

      socket.on('connect', () => {
        socket.write(JSON.stringify(req) + '\n')
      })
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        const nl = buffer.indexOf('\n')
        if (nl >= 0) {
          clearTimeout(timer)
          const line = buffer.slice(0, nl)
          socket.end()
          try {
            resolve(JSON.parse(line))
          } catch (e) {
            reject(new Error(`Respuesta no-JSON del worker: ${String(e)}`))
          }
        }
      })
      socket.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }

  stop(): void {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
      this.ready = false
    }
  }
}
