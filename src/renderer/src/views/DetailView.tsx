import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { formatTimestamp } from '../lib/format'
import { buildMarkdown, buildTranscriptText } from '../lib/exportMarkdown'
import type { Project, RecordingDetail, Speaker, TranscriptSegment } from '@shared/types'

export function DetailView({ recordingId }: { recordingId: string }): JSX.Element {
  const navigate = useStore((s) => s.navigate)
  const progress = useStore((s) => s.progressByRecording[recordingId])
  const [detail, setDetail] = useState<RecordingDetail | null>(null)
  const [projects, setProjects] = useState<Array<Project & { numReuniones: number }>>([])
  const [query, setQuery] = useState('')
  const [filtered, setFiltered] = useState<TranscriptSegment[] | null>(null)
  const [tituloEdit, setTituloEdit] = useState('')
  const [descEdit, setDescEdit] = useState('')
  const [copied, setCopied] = useState('')
  const [editingSpeaker, setEditingSpeaker] = useState<number | null>(null)
  const [spkName, setSpkName] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentTrack, setCurrentTrack] = useState<'mic' | 'system'>('system')

  const load = useCallback(async () => {
    const d = await api.getRecording(recordingId)
    setDetail(d)
    if (d) {
      setTituloEdit(d.recording.titulo)
      setDescEdit(d.recording.descripcion ?? '')
    }
  }, [recordingId])

  useEffect(() => {
    void load()
  }, [load, progress?.estado])

  useEffect(() => {
    void api.listProjects().then(setProjects)
  }, [])

  async function copy(texto: string, etiqueta: string): Promise<void> {
    await navigator.clipboard.writeText(texto)
    setCopied(etiqueta)
    setTimeout(() => setCopied(''), 1800)
  }

  async function saveTitulo(): Promise<void> {
    if (detail && tituloEdit.trim() && tituloEdit !== detail.recording.titulo) {
      await api.updateRecording(recordingId, { titulo: tituloEdit.trim() })
      void load()
    }
  }

  async function saveDesc(): Promise<void> {
    if (detail && descEdit !== (detail.recording.descripcion ?? '')) {
      await api.updateRecording(recordingId, { descripcion: descEdit.trim() || null })
      void load()
    }
  }

  async function setProyecto(projectId: string | null): Promise<void> {
    await api.updateRecording(recordingId, { projectId })
    void load()
  }

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

  function startRename(sp: Speaker): void {
    setEditingSpeaker(sp.id)
    setSpkName(sp.nombre ?? '')
  }

  async function confirmRename(sp: Speaker): Promise<void> {
    const nombre = spkName.trim()
    setEditingSpeaker(null)
    if (nombre && nombre !== (sp.nombre ?? '')) {
      await api.renameSpeaker(recordingId, sp.id, nombre)
      void load()
    }
  }

  async function regenerar(): Promise<void> {
    setRegenerating(true)
    try {
      await api.regenerateSummary(recordingId)
    } finally {
      setRegenerating(false)
      void load()
    }
  }

  async function valorar(fb: 'up' | 'down'): Promise<void> {
    if (!detail?.summary) return
    const next = detail.summary.feedback === fb ? null : fb
    await api.setSummaryFeedback(recordingId, next)
    void load()
  }

  return (
    <div className="view detail-view">
      <div className="detail-header">
        <button className="btn btn-sm" onClick={() => navigate({ name: 'home' })}>
          ← Volver
        </button>
        <input
          className="detail-title-input"
          value={tituloEdit}
          onChange={(e) => setTituloEdit(e.target.value)}
          onBlur={saveTitulo}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          title="Editar título"
        />
        {recording.tipo === 'importada' && <span className="chip">importada</span>}
        <StatusBadge estado={recording.estado} />
      </div>

      <div className="context-bar">
        <select
          className="project-select"
          value={recording.projectId ?? ''}
          onChange={(e) => setProyecto(e.target.value || null)}
        >
          <option value="">Sin proyecto</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <div className="copy-actions">
          <button
            className="btn btn-primary btn-sm"
            disabled={segments.length === 0}
            onClick={() => copy(buildMarkdown(detail), 'IA')}
          >
            {copied === 'IA' ? '✓ Copiado' : '📋 Copiar para IA'}
          </button>
          <button
            className="btn btn-sm"
            disabled={segments.length === 0}
            onClick={() => copy(buildTranscriptText(detail), 'TX')}
          >
            {copied === 'TX' ? '✓ Copiado' : 'Copiar transcripción'}
          </button>
        </div>
      </div>

      <textarea
        className="desc-input"
        placeholder="Descripción / contexto de la reunión (se incluye al copiar para IA)…"
        value={descEdit}
        onChange={(e) => setDescEdit(e.target.value)}
        onBlur={saveDesc}
        rows={2}
      />

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
                    {editingSpeaker === sp.id ? (
                      <input
                        className="search-input"
                        autoFocus
                        value={spkName}
                        placeholder={sp.etiqueta === 'MIC' ? 'Yo' : sp.etiqueta}
                        onChange={(e) => setSpkName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void confirmRename(sp)
                          if (e.key === 'Escape') setEditingSpeaker(null)
                        }}
                        onBlur={() => void confirmRename(sp)}
                      />
                    ) : (
                      <span>{sp.nombre ?? (sp.etiqueta === 'MIC' ? 'Yo' : sp.etiqueta)}</span>
                    )}
                    <button className="btn btn-xs" onClick={() => startRename(sp)}>
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
              <div className="ai-actions">
                <span className="ai-q">¿Útil?</span>
                <button
                  className={`fb ${summary.feedback === 'up' ? 'on' : ''}`}
                  title="Buen resumen"
                  aria-label="Buen resumen"
                  onClick={() => valorar('up')}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 10v11M14 4l-2 6h6a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 17 21H7V10l4-7a1.5 1.5 0 0 1 3 1z" />
                  </svg>
                </button>
                <button
                  className={`fb ${summary.feedback === 'down' ? 'on down' : ''}`}
                  title="Resumen flojo"
                  aria-label="Resumen flojo"
                  onClick={() => valorar('down')}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 14V3M10 20l2-6H6a2 2 0 0 1-2-2.3l1-6A2 2 0 0 1 7 3h10v11l-4 7a1.5 1.5 0 0 1-3-1z" />
                  </svg>
                </button>
                <button className="regen" onClick={regenerar} disabled={regenerating}>
                  {regenerating ? 'Regenerando…' : '↻ Regenerar'}
                </button>
              </div>
              <p className="muted model-note">Generado por {summary.modeloUsado}</p>
            </div>
          )}

          {!summary && recording.estado === 'completed' && segments.length > 0 && (
            <div className="card">
              <h3 className="card-title">Resumen</h3>
              <p className="muted">Aún no has generado el resumen de esta reunión.</p>
              <button className="btn btn-primary btn-sm" onClick={regenerar} disabled={regenerating}>
                {regenerating ? 'Generando…' : '✨ Generar resumen'}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
