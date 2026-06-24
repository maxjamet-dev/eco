import { randomUUID } from 'node:crypto'
import type { SqlDb } from './driver'
import type {
  Device,
  Recording,
  RecordingMode,
  RecordingStatus,
  RecordingTipo,
  Speaker,
  SpeakerOrigin
} from '@shared/types'

interface RecordingRow {
  id: string
  titulo: string
  descripcion: string | null
  fecha_inicio: string
  duracion_ms: number
  ruta_audio_mic: string | null
  ruta_audio_sys: string | null
  offset_sys_ms: number
  modo: string
  estado: string
  backend_usado: string | null
  project_id: string | null
  tipo: string
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
    descripcion: r.descripcion,
    fechaInicio: r.fecha_inicio,
    duracionMs: r.duracion_ms,
    rutaAudioMic: r.ruta_audio_mic,
    rutaAudioSys: r.ruta_audio_sys,
    offsetSysMs: r.offset_sys_ms,
    modo: r.modo as RecordingMode,
    estado: r.estado as RecordingStatus,
    backendUsado: (r.backend_usado as Device | null) ?? null,
    projectId: r.project_id,
    tipo: (r.tipo as RecordingTipo) ?? 'grabada'
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
    descripcion?: string | null
    modo: RecordingMode
    fechaInicio: string
    id?: string
    tipo?: RecordingTipo
    projectId?: string | null
    estado?: RecordingStatus
  }): Recording {
    const id = input.id ?? randomUUID()
    this.db
      .prepare(
        `INSERT INTO recordings (id, titulo, descripcion, fecha_inicio, modo, estado, tipo, project_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.titulo ?? 'Reunión sin título',
        input.descripcion ?? null,
        input.fechaInicio,
        input.modo,
        input.estado ?? 'recording',
        input.tipo ?? 'grabada',
        input.projectId ?? null
      )
    return this.get(id)!
  }

  get(id: string): Recording | null {
    const row = this.db
      .prepare('SELECT * FROM recordings WHERE id = ?')
      .get<RecordingRow>(id)
    return row ? toRecording(row) : null
  }

  list(filtro?: string, projectId?: string | null): Recording[] {
    const where: string[] = []
    const params: unknown[] = []
    if (filtro && filtro.trim()) {
      where.push('titulo LIKE ?')
      params.push(`%${filtro.trim()}%`)
    }
    if (projectId !== undefined && projectId !== null) {
      where.push('project_id = ?')
      params.push(projectId)
    }
    const sql =
      'SELECT * FROM recordings' +
      (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
      ' ORDER BY fecha_inicio DESC'
    return this.db.prepare(sql).all<RecordingRow>(...params).map(toRecording)
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

  setDescription(id: string, descripcion: string | null): void {
    this.db.prepare('UPDATE recordings SET descripcion = ? WHERE id = ?').run(descripcion, id)
  }

  setProject(id: string, projectId: string | null): void {
    this.db.prepare('UPDATE recordings SET project_id = ? WHERE id = ?').run(projectId, id)
  }

  /** Actualiza varios campos editables a la vez (título, descripción, proyecto). */
  update(
    id: string,
    patch: { titulo?: string; descripcion?: string | null; projectId?: string | null }
  ): void {
    if (patch.titulo !== undefined) this.setTitle(id, patch.titulo)
    if (patch.descripcion !== undefined) this.setDescription(id, patch.descripcion)
    if (patch.projectId !== undefined) this.setProject(id, patch.projectId)
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
