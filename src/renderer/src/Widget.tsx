import { useEffect, useState } from 'react'
import { api, onEvent } from './api'
import { formatDuration } from './lib/format'

const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')

/** Punto de entrada del widget: detección de reunión o control de grabación. */
export function Widget(): JSX.Element {
  return params.get('mode') === 'rec' ? <RecordingWidget /> : <DetectWidget />
}

/** Control de grabación flotante en el escritorio (always-on-top). */
function RecordingWidget(): JSX.Element {
  const id = params.get('id') ?? ''
  const startedAt = Number(params.get('t') ?? Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    const tick = (): void => setElapsed(Date.now() - startedAt)
    tick()
    const timer = setInterval(tick, 250)
    const off = onEvent('audio:levels', (d) => {
      if (d.recordingId === id) setLevel(Math.max(d.micLevel, d.sysLevel))
    })
    return () => {
      clearInterval(timer)
      off()
    }
  }, [id, startedAt])

  async function detener(): Promise<void> {
    setStopping(true)
    try {
      await api.stopRecording(id)
    } catch {
      setStopping(false)
    }
  }

  return (
    <div className="rwidget">
      <div className="rwidget-top">
        <span className="rwidget-dot" />
        <span className="rwidget-title">Grabando</span>
        <span className="rwidget-time">{formatDuration(elapsed)}</span>
      </div>
      <div className="rwidget-bar">
        <div className="rwidget-bar-fill" style={{ width: `${Math.min(100, Math.round(level * 100))}%` }} />
      </div>
      <div className="rwidget-actions">
        <button className="widget-btn ignore" onClick={() => void api.openRecording(id)}>
          Abrir
        </button>
        <button className="widget-btn rec stop" onClick={detener} disabled={stopping}>
          <span className="sq" />
          {stopping ? 'Deteniendo…' : 'Detener'}
        </button>
      </div>
    </div>
  )
}

/** Widget que aparece al detectar una reunión: ofrece grabar. */
function DetectWidget(): JSX.Element {
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
