/**
 * Abstracción mínima sobre un driver SQLite síncrono.
 *
 * Producción: adaptador sobre `better-sqlite3` (compilado para el ABI de Electron).
 * Tests: adaptador sobre `node:sqlite` (Node 22.5+), evitando el rebuild nativo.
 *
 * Ambos drivers son síncronos, lo que encaja con el modelo del proceso main
 * (SDD §9.6: better-sqlite3 síncrono, ideal en main).
 */

export interface SqlRunResult {
  changes: number
  lastInsertRowid: number
}

export interface SqlStatement {
  run(...params: unknown[]): SqlRunResult
  get<T = unknown>(...params: unknown[]): T | undefined
  all<T = unknown>(...params: unknown[]): T[]
}

export interface SqlDb {
  prepare(sql: string): SqlStatement
  exec(sql: string): void
  /** Ejecuta `fn` dentro de una transacción; revierte si lanza. */
  transaction<T>(fn: () => T): T
  pragma(statement: string): void
  close(): void
}
