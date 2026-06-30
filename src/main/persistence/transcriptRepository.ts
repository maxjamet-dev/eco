import type { SqlDb } from './driver'
import type { TranscriptSegment } from '@shared/types'
import { speakerDisplayName } from '@shared/speakers'

interface SegmentJoinRow {
  inicio_ms: number
  fin_ms: number
  texto: string
  speaker_nombre: string | null
  speaker_etiqueta: string | null
}

/** Etiqueta legible para un hablante (fuente única en @shared/speakers). */
function speakerLabel(nombre: string | null, etiqueta: string | null): string {
  return speakerDisplayName(etiqueta, nombre)
}

export class TranscriptRepository {
  constructor(private readonly db: SqlDb) {}

  /**
   * Inserta segmentos. `speakerIdByLabel` mapea la etiqueta de hablante de cada
   * segmento al id ya persistido en `speakers`.
   */
  insertSegments(
    recordingId: string,
    segments: Array<{ inicioMs: number; finMs: number; etiqueta: string; texto: string }>,
    speakerIdByLabel: Map<string, number>
  ): void {
    const stmt = this.db.prepare(
      `INSERT INTO transcript_segments (recording_id, inicio_ms, fin_ms, speaker_id, texto)
       VALUES (?, ?, ?, ?, ?)`
    )
    this.db.transaction(() => {
      for (const s of segments) {
        const speakerId = speakerIdByLabel.get(s.etiqueta) ?? null
        stmt.run(recordingId, s.inicioMs, s.finMs, speakerId, s.texto)
      }
    })
  }

  listByRecording(recordingId: string): TranscriptSegment[] {
    return this.db
      .prepare(
        `SELECT ts.inicio_ms, ts.fin_ms, ts.texto,
                sp.nombre AS speaker_nombre, sp.etiqueta AS speaker_etiqueta
         FROM transcript_segments ts
         LEFT JOIN speakers sp ON sp.id = ts.speaker_id
         WHERE ts.recording_id = ?
         ORDER BY ts.inicio_ms ASC`
      )
      .all<SegmentJoinRow>(recordingId)
      .map((r) => ({
        inicioMs: r.inicio_ms,
        finMs: r.fin_ms,
        speaker: speakerLabel(r.speaker_nombre, r.speaker_etiqueta),
        texto: r.texto
      }))
  }

  /** Búsqueda FTS5 dentro de una grabación. */
  search(recordingId: string, query: string): TranscriptSegment[] {
    const match = sanitizeFtsQuery(query)
    if (!match) return []
    return this.db
      .prepare(
        `SELECT ts.inicio_ms, ts.fin_ms, ts.texto,
                sp.nombre AS speaker_nombre, sp.etiqueta AS speaker_etiqueta
         FROM transcript_fts fts
         JOIN transcript_segments ts ON ts.id = fts.rowid
         LEFT JOIN speakers sp ON sp.id = ts.speaker_id
         WHERE fts.texto MATCH ? AND ts.recording_id = ?
         ORDER BY ts.inicio_ms ASC`
      )
      .all<SegmentJoinRow>(match, recordingId)
      .map((r) => ({
        inicioMs: r.inicio_ms,
        finMs: r.fin_ms,
        speaker: speakerLabel(r.speaker_nombre, r.speaker_etiqueta),
        texto: r.texto
      }))
  }

  /** Búsqueda FTS5 global (todas las grabaciones). */
  searchGlobal(
    query: string
  ): Array<{ recordingId: string; titulo: string; segment: TranscriptSegment }> {
    const match = sanitizeFtsQuery(query)
    if (!match) return []
    const rows = this.db
      .prepare(
        `SELECT ts.recording_id, r.titulo, ts.inicio_ms, ts.fin_ms, ts.texto,
                sp.nombre AS speaker_nombre, sp.etiqueta AS speaker_etiqueta
         FROM transcript_fts fts
         JOIN transcript_segments ts ON ts.id = fts.rowid
         JOIN recordings r ON r.id = ts.recording_id
         LEFT JOIN speakers sp ON sp.id = ts.speaker_id
         WHERE fts.texto MATCH ?
         ORDER BY r.fecha_inicio DESC, ts.inicio_ms ASC
         LIMIT 200`
      )
      .all<SegmentJoinRow & { recording_id: string; titulo: string }>(match)
    return rows.map((r) => ({
      recordingId: r.recording_id,
      titulo: r.titulo,
      segment: {
        inicioMs: r.inicio_ms,
        finMs: r.fin_ms,
        speaker: speakerLabel(r.speaker_nombre, r.speaker_etiqueta),
        texto: r.texto
      }
    }))
  }
}

/**
 * Convierte una consulta del usuario en una expresión FTS5 segura.
 * Cada término se entrecomilla y se le añade `*` para prefijo, evitando que
 * la sintaxis de FTS5 (operadores, comillas) cause errores o inyección.
 */
export function sanitizeFtsQuery(query: string): string | null {
  const terms = query
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/["*]/g, '').trim())
    .filter((t) => t.length > 0)
  if (terms.length === 0) return null
  return terms.map((t) => `"${t}"*`).join(' ')
}
