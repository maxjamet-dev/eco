import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { formatTimestamp } from '../lib/format'
import type { RecordingDetail, Speaker, TranscriptSegment } from '@shared/types'

export function DetailView({ recordingId }: { recordingId: string }): JSX.Element {
  const navigate = useStore((s) => s.navigate)
  const progress = useStore((s) => s.progressByRecording[recordingId])
  const [detail, setDetail] = useState<RecordingDetail | null>(null)
  const [query, setQuery] = useState('')
  const [filtered, setFiltered] = useState<TranscriptSegment[] | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentTrack, setCurrentTrack] = useState<'mic' | 'system'>('system')

  const load = useCallback(async () => {
    setDetail(await api.getRecording(recordingId))
  }, [recordingId])

  useEffect(() => {
    void load()
  }, [load, progress?.estado])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length >= 2) setFiltered(await api.searchTranscript(recordingId, query))
      else setFiltered(null)
    }, 250)
    return () => clearTimeout(t)
  }, [query, recordingId])

  if (!detail) return <div className="view">Cargando…</div>

  const { recording, speakers, segments, summary } = detail
  const shown = filtered ?? segments
  const offset = recording.offsetSysMs

  function playSegment(seg: TranscriptSegment): void {
    const isMic = seg.speaker === 'Yo'
    const track: 'mic' | 'system' = isMic ? 'mic' : 'system'
    const audio = audioRef.current
    if (!audio) return
    const targetSrc = `recmedia://${recordingId}/${track === 'mic' ? 'mic.wav' : 'system.wav'}`
    if (currentTrack !== track || !audio.src.endsWith(`${track === 'mic' ? 'mic.wav' : 'system.wav'}`)) {
      audio.src = targetSrc
      setCurrentTrack(track)
    }
    const seekMs = isMic ? seg.inicioMs : Math.max(0, seg.inicioMs - offset)
    audio.currentTime = seekMs / 1000
    void audio.play()
  }

  async function rename(sp: Speaker): Promise<void> {
    const nombre = window.prompt(`Nombre para ${sp.etiqueta}`, sp.nombre ?? '')
    if (nombre && nombre.trim()) {
      await api.renameSpeaker(recordingId, sp.id, nombre.trim())
      void load()
    }
  }

  return (
    <div className="view detail-view">
      <div className="detail-header">
        <button className="btn btn-sm" onClick={() => navigate({ name: 'home' })}>
          ← Volver
        </button>
        <h2 className="detail-title">{recording.titulo}</h2>
        <StatusBadge estado={recording.estado} />
      </div>

      {recording.estado !== 'completed' && recording.estado !== 'failed' && (
        <div className="processing-banner">
          Procesando… {progress?.estado ? `(${progress.estado})` : ''}
        </div>
      )}
      {recording.estado === 'failed' && (
        <div className="error-banner">
          Ocurrió un error procesando esta grabación.{' '}
          <button className="btn btn-sm" onClick={() => api.retryRecording(recordingId).then(load)}>
            Reintentar
          </button>
        </div>
      )}

      <audio ref={audioRef} controls className="audio-player" />

      <div className="detail-grid">
        <section className="transcript-pane">
          <div className="pane-head">
            <h3>Transcripción</h3>
            <input
              className="search-input search-sm"
              placeholder="Buscar en esta reunión…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {shown.length === 0 ? (
            <p className="muted">Aún no hay transcripción.</p>
          ) : (
            <ul className="segments">
              {shown.map((seg, i) => (
                <li key={i} className="segment" onClick={() => playSegment(seg)}>
                  <span className="segment-time">{formatTimestamp(seg.inicioMs)}</span>
                  <span className={`segment-speaker ${seg.speaker === 'Yo' ? 'is-me' : ''}`}>
                    {seg.speaker}
                  </span>
                  <span className="segment-text">{seg.texto}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="side-pane">
          {speakers.length > 0 && (
            <div className="card">
              <h3 className="card-title">Participantes</h3>
              <ul className="speaker-list">
                {speakers.map((sp) => (
                  <li key={sp.id} className="speaker-item">
                    <span>{sp.nombre ?? (sp.etiqueta === 'MIC' ? 'Yo' : sp.etiqueta)}</span>
                    <button className="btn btn-xs" onClick={() => rename(sp)}>
                      Renombrar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary && (
            <div className="card">
              <h3 className="card-title">Resumen</h3>
              <p className="summary-text">{summary.resumen}</p>
              {summary.puntosClave.length > 0 && (
                <>
                  <h4 className="card-subtitle">Puntos clave</h4>
                  <ul className="bullet-list">
                    {summary.puntosClave.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
              {summary.actionItems.length > 0 && (
                <>
                  <h4 className="card-subtitle">Tareas</h4>
                  <ul className="action-list">
                    {summary.actionItems.map((a, i) => (
                      <li key={i}>
                        <span className="action-desc">{a.descripcion}</span>
                        {a.responsable && <span className="action-owner">{a.responsable}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="muted model-note">Generado por {summary.modeloUsado}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
