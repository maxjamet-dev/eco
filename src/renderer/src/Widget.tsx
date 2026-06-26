import { useState } from 'react'
import { api } from './api'

/** Widget flotante que aparece al detectar una reunión: ofrece grabar. */
export function Widget(): JSX.Element {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  const appName = params.get('app') ?? 'una reunión'
  const [busy, setBusy] = useState(false)

  async function grabar(): Promise<void> {
    setBusy(true)
    try {
      const settings = await api.getSettings()
      const { id } = await api.startRecording(undefined, settings.modoPorDefecto)
      await api.openRecording(id)
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="widget">
      <div className="widget-head">
        <span className="glyph" aria-hidden="true">
          <i />
        </span>
        <div className="widget-text">
          <span className="widget-title">Reunión detectada</span>
          <span className="widget-sub">{appName} está usando el micrófono</span>
        </div>
      </div>
      <div className="widget-actions">
        <button className="widget-btn ignore" onClick={() => void api.closeWidget()} disabled={busy}>
          Ignorar
        </button>
        <button className="widget-btn rec" onClick={grabar} disabled={busy}>
          <span className="rd" />
          {busy ? 'Iniciando…' : 'Grabar'}
        </button>
      </div>
    </div>
  )
}
