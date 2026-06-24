import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { formatDate, formatDuration } from '../lib/format'
import type { Project, RecordingMode, TranscriptSegment } from '@shared/types'

/** Lee un File del navegador a base64 (para importar por drag&drop o pegado). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '') // quita el prefijo data:...;base64,
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const AUDIO_EXT = /\.(opus|ogg|m4a|mp3|wav|aac|flac|webm|mp4)$/i

export function HomeView(): JSX.Element {
  const recordings = useStore((s) => s.recordings)
  const refresh = useStore((s) => s.refreshRecordings)
  const navigate = useStore((s) => s.navigate)
  const settings = useStore((s) => s.settings)
  const projectFilter = useStore((s) => s.projectFilter)
  const setProjectFilter = useStore((s) => s.setProjectFilter)
  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState<Array<Project & { numReuniones: number }>>([])
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [globalHits, setGlobalHits] = useState<
    Array<{ recordingId: string; titulo: string; segment: TranscriptSegment }>
  >([])
  const dropRef = useRef<HTMLDivElement>(null)
  const [creandoProyecto, setCreandoProyecto] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')

  async function reloadProjects(): Promise<void> {
    setProjects(await api.listProjects())
  }

  useEffect(() => {
    void refresh()
    void reloadProjects()
  }, [refresh])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length >= 2) setGlobalHits(await api.searchGlobal(query))
      else setGlobalHits([])
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  async function grabar(): Promise<void> {
    const modo: RecordingMode = settings?.modoPorDefecto ?? 'online'
    const { id } = await api.startRecording(undefined, modo)
    navigate({ name: 'recording', recordingId: id })
  }

  function showToast(msg: string): void {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function importViaDialog(): Promise<void> {
    const { filePath } = await api.pickAudio()
    if (!filePath) return
    setImporting(true)
    try {
      const { id } = await api.importAudioFile(filePath, projectFilter)
      showToast('Audio importado, procesando…')
      await refresh()
      navigate({ name: 'detail', recordingId: id })
    } catch (e) {
      showToast('Error al importar: ' + String(e))
    } finally {
      setImporting(false)
    }
  }

  async function importFile(file: File): Promise<void> {
    if (!AUDIO_EXT.test(file.name)) {
      showToast('Formato no reconocido: ' + file.name)
      return
    }
    setImporting(true)
    try {
      const dataBase64 = await fileToBase64(file)
      const { id } = await api.importAudioBytes(file.name, dataBase64, projectFilter)
      showToast('Audio importado, procesando…')
      await refresh()
      navigate({ name: 'detail', recordingId: id })
    } catch (e) {
      showToast('Error al importar: ' + String(e))
    } finally {
      setImporting(false)
    }
  }

  function onDrop(e: React.DragEvent): void {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void importFile(file)
  }

  function onPaste(e: React.ClipboardEvent): void {
    const file = e.clipboardData.files?.[0]
    if (file) void importFile(file)
  }

  async function confirmarNuevoProyecto(): Promise<void> {
    const nombre = nuevoNombre.trim()
    setCreandoProyecto(false)
    setNuevoNombre('')
    if (nombre) {
      const p = await api.createProject(nombre)
      await reloadProjects()
      setProjectFilter(p.id)
    }
  }

  async function eliminarProyecto(p: Project, ev: React.MouseEvent): Promise<void> {
    ev.stopPropagation()
    if (window.confirm(`¿Eliminar el proyecto "${p.nombre}"? Las reuniones no se borran.`)) {
      await api.deleteProject(p.id)
      if (projectFilter === p.id) setProjectFilter(null)
      await reloadProjects()
      await refresh()
    }
  }

  async function eliminar(id: string, ev: React.MouseEvent): Promise<void> {
    ev.stopPropagation()
    await api.deleteRecording(id)
    void refresh()
    void reloadProjects()
  }

  async function reintentar(id: string, ev: React.MouseEvent): Promise<void> {
    ev.stopPropagation()
    await api.retryRecording(id)
    void refresh()
  }

  return (
    <div
      className={`view ${dragOver ? 'drag-over' : ''}`}
      ref={dropRef}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      tabIndex={0}
    >
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Buscar en todas las transcripciones…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" disabled={importing} onClick={importViaDialog}>
          {importing ? 'Importando…' : '⬆ Importar audio'}
        </button>
        <button className="btn btn-primary btn-record" onClick={grabar}>
          ● Grabar
        </button>
      </div>

      <div className="project-chips">
        <button
          className={`chip-btn ${projectFilter === null ? 'active' : ''}`}
          onClick={() => setProjectFilter(null)}
        >
          Todas
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            className={`chip-btn ${projectFilter === p.id ? 'active' : ''}`}
            onClick={() => setProjectFilter(p.id)}
            onDoubleClick={(e) => eliminarProyecto(p, e)}
            title="Doble clic para eliminar el proyecto"
          >
            {p.nombre} <span className="chip-count">{p.numReuniones}</span>
          </button>
        ))}
        {creandoProyecto ? (
          <input
            className="search-input search-sm"
            autoFocus
            placeholder="Nombre del proyecto…"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void confirmarNuevoProyecto()
              if (e.key === 'Escape') {
                setCreandoProyecto(false)
                setNuevoNombre('')
              }
            }}
            onBlur={() => void confirmarNuevoProyecto()}
          />
        ) : (
          <button className="chip-btn chip-add" onClick={() => setCreandoProyecto(true)}>
            + Proyecto
          </button>
        )}
      </div>

      {toast && <div className="saved-toast">{toast}</div>}

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
          <p>No hay grabaciones en esta vista.</p>
          <p className="muted">
            Pulsa “Grabar”, “Importar audio”, o arrastra/pega un audio (WhatsApp, mp3…) aquí.
          </p>
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
                <span className="recording-title">
                  {r.titulo}
                  {r.tipo === 'importada' && <span className="chip">importada</span>}
                </span>
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

      {dragOver && <div className="drop-overlay">Suelta el audio para importarlo</div>}
    </div>
  )
}
