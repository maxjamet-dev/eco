import Database from 'better-sqlite3'
import type { SqlDb, SqlStatement } from './driver'

/**
 * Adaptador de `better-sqlite3` a la interfaz `SqlDb`.
 * Se usa en producción (proceso main de Electron).
 */
export function createBetterSqliteDriver(path: string): SqlDb {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')

  return {
    prepare(sql: string): SqlStatement {
      const stmt = db.prepare(sql)
      return {
        run: (...params) => {
          const r = stmt.run(...(params as never[]))
          return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) }
        },
        get: <T>(...params: unknown[]) => stmt.get(...(params as never[])) as T | undefined,
        all: <T>(...params: unknown[]) => stmt.all(...(params as never[])) as T[]
      }
    },
    exec: (sql: string) => {
      db.exec(sql)
    },
    transaction: <T>(fn: () => T): T => db.transaction(fn)(),
    pragma: (statement: string) => {
      db.pragma(statement)
    },
    close: () => db.close()
  }
}
