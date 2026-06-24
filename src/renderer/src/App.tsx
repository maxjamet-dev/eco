import { useEffect } from 'react'
import { useStore } from './store'
import { onEvent } from './api'
import { HomeView } from './views/HomeView'
import { RecordingView } from './views/RecordingView'
import { DetailView } from './views/DetailView'
import { SettingsView } from './views/SettingsView'

export function App(): JSX.Element {
  const view = useStore((s) => s.view)
  const navigate = useStore((s) => s.navigate)
  const loadSettings = useStore((s) => s.loadSettings)
  const applyProgress = useStore((s) => s.applyProgress)

  useEffect(() => {
    void loadSettings()
    const off = onEvent('processing:progress', applyProgress)
    return off
  }, [loadSettings, applyProgress])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 onClick={() => navigate({ name: 'home' })} className="app-logo">
          Grabador de Reuniones
        </h1>
        <span className="badge">100% local</span>
        <nav className="app-nav">
          <button
            className={`nav-btn ${view.name === 'home' ? 'active' : ''}`}
            onClick={() => navigate({ name: 'home' })}
          >
            Inicio
          </button>
          <button
            className={`nav-btn ${view.name === 'settings' ? 'active' : ''}`}
            onClick={() => navigate({ name: 'settings' })}
          >
            Ajustes
          </button>
        </nav>
      </header>
      <main className="app-main">
        {view.name === 'home' && <HomeView />}
        {view.name === 'recording' && <RecordingView recordingId={view.recordingId} />}
        {view.name === 'detail' && <DetailView recordingId={view.recordingId} />}
        {view.name === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}
