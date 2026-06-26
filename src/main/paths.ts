import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, renameSync } from 'node:fs'

/**
 * Rutas canónicas de almacenamiento (SDD §8.3).
 * Todo vive bajo %APPDATA%/eco/ por defecto.
 */

const DATA_DIR = 'eco'
const LEGACY_DATA_DIR = 'grabador-reuniones'

let baseDirOverride: string | null = null

/** Permite redirigir la carpeta de datos (tests / ajuste de usuario). */
export function setDataDir(dir: string): void {
  baseDirOverride = dir
}

export function dataDir(): string {
  if (baseDirOverride) {
    mkdirSync(baseDirOverride, { recursive: true })
    return baseDirOverride
  }
  const appData = app.getPath('appData')
  const dir = join(appData, DATA_DIR)
  // Migración 1 vez: si existe la carpeta antigua y no la nueva, la renombramos
  // (conserva grabaciones/DB/modelos del nombre anterior "grabador-reuniones").
  const legacy = join(appData, LEGACY_DATA_DIR)
  if (!existsSync(dir) && existsSync(legacy)) {
    try {
      renameSync(legacy, dir)
    } catch {
      // si no se puede (carpeta en uso), seguimos con la carpeta nueva vacía
    }
  }
  mkdirSync(dir, { recursive: true })
  return dir
}

export function dbPath(): string {
  return join(dataDir(), 'data.db')
}

export function recordingsDir(): string {
  const dir = join(dataDir(), 'recordings')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function recordingDir(id: string): string {
  const dir = join(recordingsDir(), id)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function modelsDir(): string {
  const dir = join(dataDir(), 'models')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function logsDir(): string {
  const dir = join(dataDir(), 'logs')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Resuelve un recurso empaquetado (íconos, etc.) en dev y en producción.
 * En producción electron-builder copia `resources/` a `process.resourcesPath`.
 */
export function resourcePath(...rel: string[]): string {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'resources', ...rel) : null,
    process.resourcesPath ? join(process.resourcesPath, ...rel) : null,
    app?.isPackaged === false ? join(app.getAppPath(), 'resources', ...rel) : null,
    join(process.cwd(), 'resources', ...rel)
  ].filter((p): p is string => Boolean(p))
  return candidates.find((p) => existsSync(p)) ?? candidates[candidates.length - 1]
}
