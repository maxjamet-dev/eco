import type { SqlDb } from './driver'
import type { MeetingSummary } from '@shared/types'

interface SummaryRow {
  resumen: string
  puntos_clave: string
  modelo_usado: string | null
  feedback: number | null
}

interface ActionItemRow {
  descripcion: string
  responsable: string | null
}

export class SummaryRepository {
  constructor(private readonly db: SqlDb) {}

  upsert(recordingId: string, summary: MeetingSummary): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO summaries (recording_id, resumen, puntos_clave, modelo_usado)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(recording_id) DO UPDATE SET
             resumen = excluded.resumen,
             puntos_clave = excluded.puntos_clave,
             modelo_usado = excluded.modelo_usado,
             feedback = NULL`
        )
        .run(
          recordingId,
          summary.resumen,
          JSON.stringify(summary.puntosClave ?? []),
          summary.modeloUsado
        )

      this.db.prepare('DELETE FROM action_items WHERE recording_id = ?').run(recordingId)
      const stmt = this.db.prepare(
        'INSERT INTO action_items (recording_id, descripcion, responsable) VALUES (?, ?, ?)'
      )
      for (const item of summary.actionItems ?? []) {
        stmt.run(recordingId, item.descripcion, item.responsable ?? null)
      }
    })
  }

  get(recordingId: string): MeetingSummary | null {
    const row = this.db
      .prepare('SELECT * FROM summaries WHERE recording_id = ?')
      .get<SummaryRow>(recordingId)
    if (!row) return null
    const actionItems = this.db
      .prepare('SELECT descripcion, responsable FROM action_items WHERE recording_id = ? ORDER BY id')
      .all<ActionItemRow>(recordingId)
    let puntosClave: string[] = []
    try {
      puntosClave = JSON.parse(row.puntos_clave) as string[]
    } catch {
      puntosClave = []
    }
    return {
      resumen: row.resumen,
      puntosClave,
      actionItems: actionItems.map((a) => ({
        descripcion: a.descripcion,
        responsable: a.responsable ?? undefined
      })),
      modeloUsado: row.modelo_usado ?? '',
      feedback: row.feedback === 1 ? 'up' : row.feedback === -1 ? 'down' : null
    }
  }

  /** Guarda la valoración del usuario sobre el resumen. */
  setFeedback(recordingId: string, feedback: 'up' | 'down' | null): void {
    const valor = feedback === 'up' ? 1 : feedback === 'down' ? -1 : null
    this.db
      .prepare('UPDATE summaries SET feedback = ? WHERE recording_id = ?')
      .run(valor, recordingId)
  }
}
