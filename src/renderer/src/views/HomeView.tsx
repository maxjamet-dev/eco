import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { formatDate, formatDuration } from '../lib/format'
import type { RecordingMode, TranscriptSegment } from '@shared/types'

export function HomeView(): JSX.Element {
  const recordings = useStore((s) => s.recordings)
  const refresh = useStore((s) => s.refreshRecordings)
  const navigate = useStore((s) => s.navigate)
  const settings = useStore((s) => s.settings)
  const [query, setQuery] = useState('')
  const [globalHits, setGlobalHits] = useState<
    Array<{ recordingId: string; titulo: string; segment: TranscriptSegment }>
  >([])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setGlobalHits(await api.searchGlobal(query))
      } else {
        setGlobalHits([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  async function grabar(): Promise<void> {
    const modo: RecordingMode = settings?.modoPorDefecto ?? 'online'
    const { id } = await api.startRecording(undefined, modo)
    navigate({ name: 'recording', recordingId: id })
  }

  async function eliminar(id: string, ev: React.MouseEvent): Promise<void> {
    ev.stopPropagation()
    await api.deleteRecording(id)
    void refresh()
  }

  async function reintentar(id: string, ev: React.MouseEvent): Promise<void> {
    ev.stopPropagation()
    await api.retryRecording(id)
    void refresh()
  }

  return (
    <div className="view">
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Buscar en todas las transcripciones…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn-primary btn-record" onClick={grabar}>
          ● Grabar
        </button>
      </div>

      {globalHits.length > 0 && (
        <div className="card">
          <h3 className="card-title">Resultados de búsqueda</h3>
          <ul className="hit-list">
            {globalHits.map((hit, i) => (
              <li
                key={i}
                className="hit"
                onClick={() => navigate({ name: 'detail', recordingId: hit.recordingId })}
              >
                <span className="hit-title">{hit.titulo}</span>
                <span className="hit-text">
                  <strong>{hit.segment.speaker}:</strong> {hit.segment.texto}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recordings.length === 0 ? (
        <div className="empty">
          <p>No hay grabaciones todavía.</p>
          <p className="muted">Pulsa “Grabar” para comenzar tu primera reunión.</p>
        </div>
      ) : (
        <ul className="recording-list">
          {recordings.map((r) => (
            <li
              key={r.id}
              className="recording-item"
              onClick={() => navigate({ name: 'detail', recordingId: r.id })}
            >
              <div className="recording-main">
                <span className="recording-title">{r.titulo}</span>
                <span className="recording-meta muted">
                  {formatDate(r.fechaInicio)} · {formatDuration(r.duracionMs)} ·{' '}
                  {r.modo === 'online' ? 'En línea' : 'Presencial'}
                </span>
              </div>
              <div className="recording-actions">
                <StatusBadge estado={r.estado} />
                {r.estado === 'failed' && (
                  <button className="btn btn-sm" onClick={(e) => reintentar(r.id, e)}>
                    Reintentar
                  </button>
                )}
                <button className="btn btn-sm btn-danger" onClick={(e) => eliminar(r.id, e)}>
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
