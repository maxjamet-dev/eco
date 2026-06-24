import { DatabaseSync } from 'node:sqlite'
import type { SqlDb, SqlStatement } from './driver'

/**
 * Adaptador de `node:sqlite` (incluido en Node 22.5+) a la interfaz `SqlDb`.
 * Se usa en TESTS para evitar recompilar el módulo nativo de better-sqlite3
 * contra el ABI de Electron. La semántica SQL es idéntica (ambos son SQLite).
 */
export function createNodeSqliteDriver(path = ':memory:'): SqlDb {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  return {
    prepare(sql: string): SqlStatement {
      const stmt = db.prepare(sql)
      return {
        run: (...params) => {
          const r = stmt.run(...(params as never[]))
          return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }
        },
        get: <T>(...params: unknown[]) => stmt.get(...(params as never[])) as T | undefined,
        all: <T>(...params: unknown[]) => stmt.all(...(params as never[])) as T[]
      }
    },
    exec: (sql: string) => {
      db.exec(sql)
    },
    transaction: <T>(fn: () => T): T => {
      db.exec('BEGIN')
      try {
        const result = fn()
        db.exec('COMMIT')
        return result
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
    pragma: (statement: string) => {
      db.exec(`PRAGMA ${statement}`)
    },
    close: () => db.close()
  }
}
