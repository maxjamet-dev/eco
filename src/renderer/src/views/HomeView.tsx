import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { ESTADO_KIND, formatClock, formatDayGroup, formatDuration } from '../lib/format'
import type { Recording, RecordingStatus, TranscriptSegment } from '@shared/types'

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

/** Estado de la grabación → variante del nodo-eco del riel. */
function enodeKind(estado: RecordingStatus): 'done' | 'work' | 'err' | 'live' {
  if (estado === 'recording') return 'live'
  const k = ESTADO_KIND[estado]
  return k === 'done' ? 'done' : k === 'error' ? 'err' : 'work'
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Suma duración por día de la semana en curso (lun→dom). */
function weeklyStats(recs: Recording[]): { perDay: number[]; count: number; total: number } {
  const now = new Date()
  const offset = (now.getDay() + 6) % 7 // 0 = lunes
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset).getTime()
  const perDay = [0, 0, 0, 0, 0, 0, 0]
  let count = 0
  let total = 0
  for (const r of recs) {
    const d = new Date(r.fechaInicio)
    const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const idx = Math.floor((dia - monday) / 86_400_000)
    if (idx >= 0 && idx < 7) {
      perDay[idx] += r.duracionMs
      count += 1
      total += r.duracionMs
    }
  }
  return { perDay, count, total }
}

export function HomeView(): JSX.Element {
  const recordings = useStore((s) => s.recordings)
  const refresh = useStore((s) => s.refreshRecordings)
  const loadProjects = useStore((s) => s.loadProjects)
  const navigate = useStore((s) => s.navigate)
  const projectFilter = useStore((s) => s.projectFilter)
  const projects = useStore((s) => s.projects)
  const assignRecording = useStore((s) => s.assignRecording)
  const [query, setQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [moveOpen, setMoveOpen] = useState(false)
  const [globalHits, setGlobalHits] = useState<
    Array<{ recordingId: string; titulo: string; segment: TranscriptSegment }>
  >([])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length >= 2) setGlobalHits(await api.searchGlobal(query))
      else setGlobalHits([])
    }, 250)
    return () => clearTimeout(t)
  }, [query])

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
      void loadProjects()
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
      void loadProjects()
      navigate({ name: 'detail', recordingId: id })
    } catch (e) {
      showToast('Error al importar: ' + String(e))
    } finally {
      setImporting(false)
    }
  }

  function onDrop(e: React.DragEvent): void {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void importFile(file)
  }

  function onPaste(e: React.ClipboardEvent): void {
    const file = e.clipboardData.files?.[0]
    if (file) void importFile(file)
  }

  async function eliminar(id: string, ev: React.MouseEvent): Promise<void> {
    ev.stopPropagation()
    await api.deleteRecording(id)
    void refresh()
    void loadProjects()
  }

  async function reintentar(id: string, ev: React.MouseEvent): Promise<void> {
    ev.stopPropagation()
    await api.retryRecording(id)
    void refresh()
  }

  function toggleSel(id: string, ev: React.MouseEvent): void {
    ev.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSel(): void {
    setSelected(new Set())
    setMoveOpen(false)
  }

  /** Asigna todas las seleccionadas a un proyecto (null = quitar). */
  async function moverA(projectId: string | null): Promise<void> {
    for (const id of selected) await assignRecording(id, projectId)
    clearSel()
  }

  async function eliminarSeleccion(): Promise<void> {
    if (!window.confirm(`¿Eliminar ${selected.size} grabación(es)?`)) return
    for (const id of selected) await api.deleteRecording(id)
    clearSel()
    void refresh()
    void loadProjects()
  }

  // Agrupa las grabaciones por día, conservando el orden de llegada (desc).
  const groups: Array<{ label: string; items: Recording[] }> = []
  for (const r of recordings) {
    const label = formatDayGroup(r.fechaInicio)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(r)
    else groups.push({ label, items: [r] })
  }

  const stats = weeklyStats(recordings)
  const maxDay = Math.max(1, ...stats.perDay)
  const todayIdx = (new Date().getDay() + 6) % 7

  return (
    <div
      className={`home ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      tabIndex={0}
    >
      <div className="home-head">
        <input
          className="search-input"
          placeholder="Buscar en todas las transcripciones…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" disabled={importing} onClick={importViaDialog}>
          {importing ? 'Importando…' : '⬆ Importar audio'}
        </button>
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
        <>
          {stats.count > 0 && (
            <div className="statstrip">
              <div>
                <div className="strip-lbl">Esta semana</div>
                <div className="strip-big">
                  {stats.count} {stats.count === 1 ? 'reunión' : 'reuniones'} ·{' '}
                  {formatDuration(stats.total)}
                </div>
              </div>
              <div className="chart" aria-hidden="true">
                {stats.perDay.map((ms, i) => (
                  <div className="chart-day" key={i}>
                    <div
                      className={`chart-bar ${i === todayIdx ? 'cur' : ''}`}
                      style={{ height: `${Math.max(3, Math.round((ms / maxDay) * 30))}px` }}
                    />
                    <span>{WEEKDAYS[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {groups.map((g) => (
          <div className="daygrp" key={g.label}>
            <div className="dayh">{g.label}</div>
            <div className="rail">
              {g.items.map((r) => (
                <div
                  key={r.id}
                  className={`node ${selected.has(r.id) ? 'sel' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/recording-id', r.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => navigate({ name: 'detail', recordingId: r.id })}
                  title="Arrástrame a un proyecto para asignarme"
                >
                  <span
                    className="node-chk"
                    role="checkbox"
                    aria-checked={selected.has(r.id)}
                    tabIndex={0}
                    title="Seleccionar"
                    onClick={(e) => toggleSel(r.id, e)}
                  />
                  <span className={`enode ${enodeKind(r.estado)}`} aria-hidden="true">
                    <span className="ring r1" />
                    <span className="ring r2" />
                    <span className="core" />
                  </span>
                  <div className="node-info">
                    <span className="node-title">
                      {r.titulo}
                      {r.tipo === 'importada' && <span className="chip">importada</span>}
                    </span>
                    {r.estado !== 'completed' && r.estado !== 'failed' ? (
                      <span className="node-skel" aria-hidden="true">
                        <span className="skln w2" />
                        <span className="skln w1" />
                      </span>
                    ) : (
                      <span className="node-meta">
                        {formatClock(r.fechaInicio)} · {formatDuration(r.duracionMs)} ·{' '}
                        {r.modo === 'online' ? 'En línea' : 'Presencial'}
                      </span>
                    )}
                  </div>
                  <div className="node-acts">
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
                </div>
              ))}
            </div>
          </div>
          ))}
        </>
      )}

      {selected.size > 0 && (
        <div className="selbar">
          <span className="selbar-cnt">
            {selected.size} seleccionada{selected.size > 1 ? 's' : ''}
          </span>
          <div className="selbar-move">
            <button className="selbar-btn primary" onClick={() => setMoveOpen((o) => !o)}>
              Mover a… ▾
            </button>
            {moveOpen && (
              <div className="move-menu">
                {projects.map((p) => (
                  <button key={p.id} onClick={() => moverA(p.id)}>
                    {p.nombre}
                  </button>
                ))}
                <button className="move-none" onClick={() => moverA(null)}>
                  Sin proyecto
                </button>
              </div>
            )}
          </div>
          <button className="selbar-btn danger" onClick={eliminarSeleccion}>
            Eliminar
          </button>
          <button className="selbar-btn ghost" onClick={clearSel} aria-label="Cancelar selección">
            ✕
          </button>
        </div>
      )}

      {dragOver && <div className="drop-overlay">Suelta el audio para importarlo</div>}
    </div>
  )
}
