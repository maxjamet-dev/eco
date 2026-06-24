import { randomUUID } from 'node:crypto'
import type { SqlDb } from './driver'
import type {
  Device,
  Recording,
  RecordingMode,
  RecordingStatus,
  Speaker,
  SpeakerOrigin
} from '@shared/types'

interface RecordingRow {
  id: string
  titulo: string
  fecha_inicio: string
  duracion_ms: number
  ruta_audio_mic: string | null
  ruta_audio_sys: string | null
  offset_sys_ms: number
  modo: string
  estado: string
  backend_usado: string | null
}

interface SpeakerRow {
  id: number
  recording_id: string
  etiqueta: string
  nombre: string | null
  origen: string
}

function toRecording(r: RecordingRow): Recording {
  return {
    id: r.id,
    titulo: r.titulo,
    fechaInicio: r.fecha_inicio,
    duracionMs: r.duracion_ms,
    rutaAudioMic: r.ruta_audio_mic,
    rutaAudioSys: r.ruta_audio_sys,
    offsetSysMs: r.offset_sys_ms,
    modo: r.modo as RecordingMode,
    estado: r.estado as RecordingStatus,
    backendUsado: (r.backend_usado as Device | null) ?? null
  }
}

function toSpeaker(r: SpeakerRow): Speaker {
  return {
    id: r.id,
    recordingId: r.recording_id,
    etiqueta: r.etiqueta,
    nombre: r.nombre,
    origen: r.origen as SpeakerOrigin
  }
}

export class RecordingRepository {
  constructor(private readonly db: SqlDb) {}

  create(input: {
    titulo?: string
    modo: RecordingMode
    fechaInicio: string
    id?: string
  }): Recording {
    const id = input.id ?? randomUUID()
    this.db
      .prepare(
        `INSERT INTO recordings (id, titulo, fecha_inicio, modo, estado)
         VALUES (?, ?, ?, ?, 'recording')`
      )
      .run(id, input.titulo ?? 'Reunión sin título', input.fechaInicio, input.modo)
    return this.get(id)!
  }

  get(id: string): Recording | null {
    const row = this.db
      .prepare('SELECT * FROM recordings WHERE id = ?')
      .get<RecordingRow>(id)
    return row ? toRecording(row) : null
  }

  list(filtro?: string): Recording[] {
    if (filtro && filtro.trim()) {
      const like = `%${filtro.trim()}%`
      return this.db
        .prepare(
          `SELECT * FROM recordings WHERE titulo LIKE ? ORDER BY fecha_inicio DESC`
        )
        .all<RecordingRow>(like)
        .map(toRecording)
    }
    return this.db
      .prepare('SELECT * FROM recordings ORDER BY fecha_inicio DESC')
      .all<RecordingRow>()
      .map(toRecording)
  }

  setStatus(id: string, estado: RecordingStatus): void {
    this.db.prepare('UPDATE recordings SET estado = ? WHERE id = ?').run(estado, id)
  }

  setAudioPaths(id: string, micPath: string | null, sysPath: string | null, offsetMs: number): void {
    this.db
      .prepare(
        'UPDATE recordings SET ruta_audio_mic = ?, ruta_audio_sys = ?, offset_sys_ms = ? WHERE id = ?'
      )
      .run(micPath, sysPath, offsetMs, id)
  }

  setDuration(id: string, duracionMs: number): void {
    this.db.prepare('UPDATE recordings SET duracion_ms = ? WHERE id = ?').run(duracionMs, id)
  }

  setBackend(id: string, backend: Device): void {
    this.db.prepare('UPDATE recordings SET backend_usado = ? WHERE id = ?').run(backend, id)
  }

  setTitle(id: string, titulo: string): void {
    this.db.prepare('UPDATE recordings SET titulo = ? WHERE id = ?').run(titulo, id)
  }

  delete(id: string): void {
    // ON DELETE CASCADE limpia speakers, segmentos, summary, action_items, jobs.
    this.db.prepare('DELETE FROM recordings WHERE id = ?').run(id)
  }

  /** Limpia datos derivados (para reprocesar de forma idempotente). */
  clearTranscriptAndSummary(id: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM transcript_segments WHERE recording_id = ?').run(id)
      this.db.prepare('DELETE FROM speakers WHERE recording_id = ?').run(id)
      this.db.prepare('DELETE FROM summaries WHERE recording_id = ?').run(id)
      this.db.prepare('DELETE FROM action_items WHERE recording_id = ?').run(id)
    })
  }

  listByStatus(estados: RecordingStatus[]): Recording[] {
    if (estados.length === 0) return []
    const placeholders = estados.map(() => '?').join(',')
    return this.db
      .prepare(`SELECT * FROM recordings WHERE estado IN (${placeholders})`)
      .all<RecordingRow>(...estados)
      .map(toRecording)
  }

  // ---- Hablantes ----

  upsertSpeaker(input: {
    recordingId: string
    etiqueta: string
    origen: SpeakerOrigin
    nombre?: string | null
  }): Speaker {
    const existing = this.db
      .prepare('SELECT * FROM speakers WHERE recording_id = ? AND etiqueta = ?')
      .get<SpeakerRow>(input.recordingId, input.etiqueta)
    if (existing) return toSpeaker(existing)
    const res = this.db
      .prepare(
        'INSERT INTO speakers (recording_id, etiqueta, nombre, origen) VALUES (?, ?, ?, ?)'
      )
      .run(input.recordingId, input.etiqueta, input.nombre ?? null, input.origen)
    return {
      id: res.lastInsertRowid,
      recordingId: input.recordingId,
      etiqueta: input.etiqueta,
      nombre: input.nombre ?? null,
      origen: input.origen
    }
  }

  listSpeakers(recordingId: string): Speaker[] {
    return this.db
      .prepare('SELECT * FROM speakers WHERE recording_id = ? ORDER BY id')
      .all<SpeakerRow>(recordingId)
      .map(toSpeaker)
  }

  renameSpeaker(recordingId: string, speakerId: number, nombre: string): void {
    this.db
      .prepare('UPDATE speakers SET nombre = ? WHERE id = ? AND recording_id = ?')
      .run(nombre, speakerId, recordingId)
  }
}
