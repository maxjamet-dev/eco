import type { SqlDb } from './driver'
import type { JobStage, JobStatus, ProcessingJob } from '@shared/types'

interface JobRow {
  id: number
  recording_id: string
  etapa: string
  estado: string
  intentos: number
  error: string | null
}

function toJob(r: JobRow): ProcessingJob {
  return {
    id: r.id,
    recordingId: r.recording_id,
    etapa: r.etapa as JobStage,
    estado: r.estado as JobStatus,
    intentos: r.intentos,
    error: r.error
  }
}

export class JobRepository {
  constructor(private readonly db: SqlDb) {}

  enqueue(recordingId: string, etapa: JobStage, creadoEn: string): ProcessingJob {
    const res = this.db
      .prepare(
        `INSERT INTO processing_jobs (recording_id, etapa, estado, intentos, creado_en)
         VALUES (?, ?, 'pending', 0, ?)`
      )
      .run(recordingId, etapa, creadoEn)
    return this.get(res.lastInsertRowid)!
  }

  get(id: number): ProcessingJob | null {
    const row = this.db.prepare('SELECT * FROM processing_jobs WHERE id = ?').get<JobRow>(id)
    return row ? toJob(row) : null
  }

  /** Próximo trabajo pendiente (FIFO). */
  nextPending(): ProcessingJob | null {
    const row = this.db
      .prepare(
        `SELECT * FROM processing_jobs WHERE estado = 'pending' ORDER BY id ASC LIMIT 1`
      )
      .get<JobRow>()
    return row ? toJob(row) : null
  }

  listByRecording(recordingId: string): ProcessingJob[] {
    return this.db
      .prepare('SELECT * FROM processing_jobs WHERE recording_id = ? ORDER BY id')
      .all<JobRow>(recordingId)
      .map(toJob)
  }

  markRunning(id: number): void {
    this.db
      .prepare(
        `UPDATE processing_jobs SET estado = 'running', intentos = intentos + 1, error = NULL WHERE id = ?`
      )
      .run(id)
  }

  markDone(id: number): void {
    this.db.prepare(`UPDATE processing_jobs SET estado = 'done' WHERE id = ?`).run(id)
  }

  markFailed(id: number, error: string): void {
    this.db
      .prepare(`UPDATE processing_jobs SET estado = 'failed', error = ? WHERE id = ?`)
      .run(error, id)
  }

  /** Reencola un trabajo fallido para reintento (SDD §11.3, §12). */
  requeue(id: number): void {
    this.db.prepare(`UPDATE processing_jobs SET estado = 'pending' WHERE id = ?`).run(id)
  }

  /** Trabajos interrumpidos (running) al reiniciar la app → reencolar. */
  resetRunningToPending(): number {
    const res = this.db
      .prepare(`UPDATE processing_jobs SET estado = 'pending' WHERE estado = 'running'`)
      .run()
    return res.changes
  }

  pendingCount(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM processing_jobs WHERE estado = 'pending'`)
      .get<{ c: number }>()
    return row?.c ?? 0
  }
}
