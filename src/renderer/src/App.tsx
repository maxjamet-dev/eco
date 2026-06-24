import { useState } from 'react'

/**
 * Shell mínimo de arranque. La UI completa (Home, Recording, Detail, Settings)
 * se construye en el Sprint 7 sobre este esqueleto.
 */
export function App(): JSX.Element {
  const [boot] = useState(() => new Date().toLocaleTimeString('es-CL'))
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Grabador de Reuniones</h1>
        <span className="badge">100% local</span>
      </header>
      <main className="app-main">
        <p className="muted">Arranque del shell a las {boot}.</p>
        <p className="muted">UI en construcción (Sprint 7).</p>
      </main>
    </div>
  )
}
