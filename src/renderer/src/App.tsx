import { useEffect, useState } from 'react'
import { useStore } from './store'
import { api, onEvent } from './api'
import { HomeView } from './views/HomeView'
import { RecordingView } from './views/RecordingView'
import { DetailView } from './views/DetailView'
import { SettingsView } from './views/SettingsView'
import type { RecordingMode } from '@shared/types'
import { Onboarding } from './Onboarding'

const ALL = '__all__'

export function App(): JSX.Element {
  const view = useStore((s) => s.view)
  const navigate = useStore((s) => s.navigate)
  const settings = useStore((s) => s.settings)
  const projects = useStore((s) => s.projects)
  const projectFilter = useStore((s) => s.projectFilter)
  const loadSettings = useStore((s) => s.loadSettings)
  const loadProjects = useStore((s) => s.loadProjects)
  const setProjectFilter = useStore((s) => s.setProjectFilter)
  const assignRecording = useStore((s) => s.assignRecording)
  const createProject = useStore((s) => s.createProject)
  const renameProject = useStore((s) => s.renameProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const applyProgress = useStore((s) => s.applyProgress)
  const startRecording = useStore((s) => s.startRecording)
  const activeRecording = useStore((s) => s.activeRecording)
  const handleRecordingEnded = useStore((s) => s.handleRecordingEnded)

  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [grabMenu, setGrabMenu] = useState(false)
  const [editProj, setEditProj] = useState<{ id: string; nombre: string } | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    // Primer arranque: si el entorno de IA no está listo, mostramos el asistente.
    void api.envStatus().then((s) => setShowOnboarding(!s.ready))
  }, [])

  useEffect(() => {
    void loadSettings()
    void loadProjects()
    const offProgress = onEvent('processing:progress', applyProgress)
    // Navegación pedida desde main (p.ej. el widget al iniciar una grabación).
    const offNav = onEvent('ui:navigate', (target) => navigate(target))
    // Grabación detenida (desde el widget de escritorio o donde sea).
    const offEnded = onEvent('recording:ended', (d) => handleRecordingEnded(d.recordingId))
    return () => {
      offProgress()
      offNav()
      offEnded()
    }
  }, [loadSettings, loadProjects, applyProgress, navigate, handleRecordingEnded])

  // Cierra los menús contextuales al hacer clic fuera.
  useEffect(() => {
    if (menuFor === null && !grabMenu) return
    const close = (): void => {
      setMenuFor(null)
      setGrabMenu(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuFor, grabMenu])

  async function grabar(modo?: RecordingMode): Promise<void> {
    setGrabMenu(false)
    if (activeRecording) {
      // Ya hay una grabación en curso: vuelve a ella en vez de iniciar otra.
      navigate({ name: 'recording', recordingId: activeRecording.id })
      return
    }
    await startRecording(modo ?? settings?.modoPorDefecto ?? 'online')
  }

  function renombrarConfirm(): void {
    if (editProj && editProj.nombre.trim()) void renameProject(editProj.id, editProj.nombre.trim())
    setEditProj(null)
  }

  function irAProyecto(projectId: string | null): void {
    setProjectFilter(projectId)
    navigate({ name: 'home' })
  }

  function aceptaSoltar(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes('text/recording-id')
  }

  function onDropEnProyecto(projectId: string | null, e: React.DragEvent): void {
    e.preventDefault()
    setDropTarget(null)
    const id = e.dataTransfer.getData('text/recording-id')
    if (id) void assignRecording(id, projectId)
  }

  async function confirmarNuevoProyecto(): Promise<void> {
    const nombre = nuevoNombre.trim()
    setCreando(false)
    setNuevoNombre('')
    if (!nombre) return
    const p = await createProject(nombre)
    if (p) irAProyecto(p.id)
  }

  function renombrar(id: string, actual: string): void {
    setMenuFor(null)
    setEditProj({ id, nombre: actual })
  }

  function eliminar(id: string, nombre: string): void {
    setMenuFor(null)
    if (window.confirm(`¿Eliminar el proyecto "${nombre}"? Las reuniones no se borran.`)) {
      void deleteProject(id)
    }
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="side-brand" onClick={() => navigate({ name: 'home' })}>
          <span className="glyph" aria-hidden="true">
            <i />
          </span>
          <span className="side-wm">eco</span>
        </div>

        <div className="grabar-wrap">
          <button className="grabar" onClick={() => grabar()}>
            <span className="rd" />
            {activeRecording ? 'Grabando…' : 'Grabar'}
          </button>
          {!activeRecording && (
            <button
              className="grabar-caret"
              title="Elegir modo de grabación"
              onClick={(e) => {
                e.stopPropagation()
                setGrabMenu((m) => !m)
              }}
            >
              ▾
            </button>
          )}
          {grabMenu && !activeRecording && (
            <div className="grabar-menu" onMouseDown={(e) => e.stopPropagation()}>
              <button onClick={() => grabar('online')}>
                <b>En línea</b>
                <span>Reunión por Zoom/Meet/Teams (yo + los demás)</span>
              </button>
              <button onClick={() => grabar('presencial')}>
                <b>Presencial</b>
                <span>Solo micrófono, en la misma sala</span>
              </button>
            </div>
          )}
        </div>

        <nav className="side-nav">
          <button
            className={`side-link ${view.name === 'home' ? 'on' : ''}`}
            onClick={() => navigate({ name: 'home' })}
          >
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 11l9-8 9 8" />
              <path d="M5 10v10h14V10" />
            </svg>
            Inicio
          </button>
          <button
            className={`side-link ${view.name === 'settings' ? 'on' : ''}`}
            onClick={() => navigate({ name: 'settings' })}
          >
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-1.7-1L15 3H9.6l-.4 2.6a7.5 7.5 0 0 0-1.7 1l-2.3-1-2 3.4L5.2 11a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 0 0 1.7 1l.4 2.6H15l.4-2.6a7.5 7.5 0 0 0 1.7-1l2.3 1 2-3.4z" />
            </svg>
            Ajustes
          </button>
        </nav>

        <div className="side-sec">Proyectos</div>
        <div className="projs">
          <div
            className={`proj ${projectFilter === null ? 'on' : ''} ${dropTarget === ALL ? 'drop' : ''}`}
            onClick={() => irAProyecto(null)}
            onDragOver={(e) => {
              if (aceptaSoltar(e)) {
                e.preventDefault()
                setDropTarget(ALL)
              }
            }}
            onDragLeave={() => setDropTarget((t) => (t === ALL ? null : t))}
            onDrop={(e) => onDropEnProyecto(null, e)}
            title="Todas las reuniones (suelta aquí para quitar de un proyecto)"
          >
            <span className="pdot" />
            Todas
          </div>

          {projects.map((p) => (
            <div key={p.id} style={{ position: 'relative' }}>
              <div
                className={`proj ${projectFilter === p.id ? 'on' : ''} ${dropTarget === p.id ? 'drop' : ''}`}
                onClick={() => irAProyecto(p.id)}
                onDragOver={(e) => {
                  if (aceptaSoltar(e)) {
                    e.preventDefault()
                    setDropTarget(p.id)
                  }
                }}
                onDragLeave={() => setDropTarget((t) => (t === p.id ? null : t))}
                onDrop={(e) => onDropEnProyecto(p.id, e)}
              >
                <span className="pdot" />
                {editProj?.id === p.id ? (
                  <input
                    className="search-input proj-rename"
                    autoFocus
                    value={editProj.nombre}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditProj({ id: p.id, nombre: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renombrarConfirm()
                      if (e.key === 'Escape') setEditProj(null)
                    }}
                    onBlur={renombrarConfirm}
                  />
                ) : (
                  p.nombre
                )}
                <span className="proj-right">
                  <span className="ct">{p.numReuniones}</span>
                  <button
                    className="proj-dots"
                    title="Opciones del proyecto"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuFor((m) => (m === p.id ? null : p.id))
                    }}
                  >
                    ⋯
                  </button>
                </span>
              </div>
              {menuFor === p.id && (
                <div className="pmenu" onMouseDown={(e) => e.stopPropagation()}>
                  <button onClick={() => renombrar(p.id, p.nombre)}>Renombrar</button>
                  <button className="danger" onClick={() => eliminar(p.id, p.nombre)}>
                    Eliminar proyecto
                  </button>
                </div>
              )}
            </div>
          ))}

          {creando ? (
            <input
              className="search-input proj-new"
              autoFocus
              placeholder="Nombre del proyecto…"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmarNuevoProyecto()
                if (e.key === 'Escape') {
                  setCreando(false)
                  setNuevoNombre('')
                }
              }}
              onBlur={() => void confirmarNuevoProyecto()}
            />
          ) : (
            <button className="proj add" onClick={() => setCreando(true)}>
              <span className="pdot" style={{ background: 'transparent' }} />+ Proyecto
            </button>
          )}
        </div>

        <div className="side-ambient" aria-hidden="true">
          {[30, 55, 40, 70, 50, 85, 45, 65, 35, 60, 48, 75, 40, 55, 30, 52].map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
      </aside>

      <main className="content">
        {view.name === 'home' && <HomeView />}
        {view.name === 'recording' && <RecordingView recordingId={view.recordingId} />}
        {view.name === 'detail' && <DetailView recordingId={view.recordingId} />}
        {view.name === 'settings' && <SettingsView />}
      </main>

      {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}
    </div>
  )
}
