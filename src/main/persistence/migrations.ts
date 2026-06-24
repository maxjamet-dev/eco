import type { SqlDb } from './driver'
import { createLogger } from '../logger'

const log = createLogger('migrations')

/**
 * Migraciones versionadas (SDD §8.2). Cada entrada se aplica una sola vez,
 * en orden, dentro de una transacción. `user_version` (PRAGMA) lleva la cuenta.
 */
interface Migration {
  version: number
  name: string
  up: string
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'esquema_inicial',
    up: `
      CREATE TABLE recordings (
        id              TEXT PRIMARY KEY,
        titulo          TEXT NOT NULL DEFAULT 'Reunión sin título',
        fecha_inicio    TEXT NOT NULL,
        duracion_ms     INTEGER NOT NULL DEFAULT 0,
        ruta_audio_mic  TEXT,
        ruta_audio_sys  TEXT,
        offset_sys_ms   INTEGER NOT NULL DEFAULT 0,
        modo            TEXT NOT NULL DEFAULT 'online',
        estado          TEXT NOT NULL DEFAULT 'recording',
        backend_usado   TEXT
      );

      CREATE TABLE speakers (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
        etiqueta     TEXT NOT NULL,
        nombre       TEXT,
        origen       TEXT NOT NULL DEFAULT 'diar'
      );

      CREATE TABLE transcript_segments (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
        inicio_ms    INTEGER NOT NULL,
        fin_ms       INTEGER NOT NULL,
        speaker_id   INTEGER REFERENCES speakers(id) ON DELETE SET NULL,
        texto        TEXT NOT NULL
      );

      CREATE TABLE summaries (
        recording_id TEXT PRIMARY KEY REFERENCES recordings(id) ON DELETE CASCADE,
        resumen      TEXT NOT NULL DEFAULT '',
        puntos_clave TEXT NOT NULL DEFAULT '[]',
        modelo_usado TEXT
      );

      CREATE TABLE action_items (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
        descripcion  TEXT NOT NULL,
        responsable  TEXT
      );

      CREATE TABLE processing_jobs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
        etapa        TEXT NOT NULL,
        estado       TEXT NOT NULL DEFAULT 'pending',
        intentos     INTEGER NOT NULL DEFAULT 0,
        error        TEXT,
        creado_en    TEXT NOT NULL
      );

      CREATE TABLE settings (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );

      -- Índices (SDD §8.2)
      CREATE INDEX idx_segments_recording ON transcript_segments(recording_id);
      CREATE INDEX idx_segments_inicio   ON transcript_segments(recording_id, inicio_ms);
      CREATE INDEX idx_speakers_recording ON speakers(recording_id);
      CREATE INDEX idx_action_recording  ON action_items(recording_id);
      CREATE INDEX idx_jobs_recording    ON processing_jobs(recording_id);
      CREATE INDEX idx_recordings_estado ON recordings(estado);
      CREATE INDEX idx_jobs_estado       ON processing_jobs(estado);

      -- Búsqueda de texto completo (FTS5) sobre el texto de los segmentos.
      CREATE VIRTUAL TABLE transcript_fts USING fts5(
        texto,
        content='transcript_segments',
        content_rowid='id',
        tokenize='unicode61 remove_diacritics 2'
      );

      -- Triggers para mantener FTS5 sincronizado (FR-11).
      CREATE TRIGGER transcript_ai AFTER INSERT ON transcript_segments BEGIN
        INSERT INTO transcript_fts(rowid, texto) VALUES (new.id, new.texto);
      END;
      CREATE TRIGGER transcript_ad AFTER DELETE ON transcript_segments BEGIN
        INSERT INTO transcript_fts(transcript_fts, rowid, texto) VALUES ('delete', old.id, old.texto);
      END;
      CREATE TRIGGER transcript_au AFTER UPDATE ON transcript_segments BEGIN
        INSERT INTO transcript_fts(transcript_fts, rowid, texto) VALUES ('delete', old.id, old.texto);
        INSERT INTO transcript_fts(rowid, texto) VALUES (new.id, new.texto);
      END;
    `
  }
]

/** Aplica todas las migraciones pendientes. Idempotente. */
export function runMigrations(db: SqlDb): number {
  const row = db.prepare('PRAGMA user_version').get<{ user_version: number }>()
  const current = row?.user_version ?? 0
  let applied = current

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue
    log.info(`Aplicando migración v${migration.version}: ${migration.name}`)
    db.transaction(() => {
      db.exec(migration.up)
      // PRAGMA user_version no acepta binding de parámetros.
      db.exec(`PRAGMA user_version = ${migration.version}`)
    })
    applied = migration.version
  }

  if (applied !== current) {
    log.info(`Esquema actualizado de v${current} a v${applied}`)
  }
  return applied
}

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version
