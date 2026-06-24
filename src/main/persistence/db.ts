import type { SqlDb } from './driver'
import { runMigrations } from './migrations'
import { dbPath } from '../paths'
import { createLogger } from '../logger'
import { createBetterSqliteDriver } from './betterSqliteDriver'
import { createRepositories, type Repositories } from './index'

const log = createLogger('db')

let instance: SqlDb | null = null
let repos: Repositories | null = null

/**
 * Devuelve la conexión singleton a la base de datos de producción
 * (better-sqlite3), aplicando migraciones al abrir.
 *
 * En tests NO se usa este módulo: se construyen repos con un driver
 * `node:sqlite` (ver nodeSqliteDriver.ts), evitando el módulo nativo.
 */
export function getDatabase(): SqlDb {
  if (instance) return instance
  const path = dbPath()
  log.info('Abriendo base de datos', { path })
  instance = createBetterSqliteDriver(path)
  runMigrations(instance)
  return instance
}

/** Inyecta un driver ya abierto (tests). Aplica migraciones. */
export function openDatabaseWith(driver: SqlDb): SqlDb {
  runMigrations(driver)
  instance = driver
  return driver
}

/** Repositorios de producción (sobre la DB singleton de better-sqlite3). */
export function getRepositories(): Repositories {
  if (!repos) repos = createRepositories(getDatabase())
  return repos
}

export function closeDatabase(): void {
  if (instance) {
    instance.close()
    instance = null
    repos = null
  }
}
