import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Logger local rotado (SDD §12). Sin red. Niveles configurables.
 * Escribe a logs/app.log y rota al superar ~5 MB.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const MAX_BYTES = 5 * 1024 * 1024

let logDirFn: () => string = () => {
  // Por defecto, junto al cwd hasta que main configure la carpeta real.
  const dir = join(process.cwd(), 'logs')
  mkdirSync(dir, { recursive: true })
  return dir
}
// En tests (Vitest) solo mostramos errores para no ensuciar la salida.
let minLevel: LogLevel = process.env['VITEST'] ? 'error' : 'info'

export function configureLogger(opts: { dir?: () => string; level?: LogLevel }): void {
  if (opts.dir) logDirFn = opts.dir
  if (opts.level) minLevel = opts.level
}

function rotateIfNeeded(file: string): void {
  try {
    if (existsSync(file) && statSync(file).size > MAX_BYTES) {
      renameSync(file, file + '.1')
    }
  } catch {
    // si la rotación falla, seguimos escribiendo igual
  }
}

function write(level: LogLevel, scope: string, msg: string, extra?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return
  const file = join(logDirFn(), 'app.log')
  rotateIfNeeded(file)
  // Sin Date.now() prohibido aquí: estamos en runtime real de Electron, no en workflow.
  const ts = new Date().toISOString()
  let line = `${ts} [${level.toUpperCase()}] (${scope}) ${msg}`
  if (extra !== undefined) {
    try {
      line += ' ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))
    } catch {
      line += ' [extra no serializable]'
    }
  }
  line += '\n'
  try {
    appendFileSync(file, line)
  } catch {
    // último recurso: consola
  }
  // Espejo en consola para desarrollo.
  const consoleFn =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  consoleFn(line.trimEnd())
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, extra?: unknown) => write('debug', scope, msg, extra),
    info: (msg: string, extra?: unknown) => write('info', scope, msg, extra),
    warn: (msg: string, extra?: unknown) => write('warn', scope, msg, extra),
    error: (msg: string, extra?: unknown) => write('error', scope, msg, extra)
  }
}

export type Logger = ReturnType<typeof createLogger>
