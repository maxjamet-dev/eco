import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

/**
 * Rutas canónicas de almacenamiento (SDD §8.3).
 * Todo vive bajo %APPDATA%/grabador-reuniones/ por defecto.
 */

let baseDirOverride: string | null = null

/** Permite redirigir la carpeta de datos (tests / ajuste de usuario). */
export function setDataDir(dir: string): void {
  baseDirOverride = dir
}

export function dataDir(): string {
  const dir = baseDirOverride ?? join(app.getPath('appData'), 'grabador-reuniones')
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
