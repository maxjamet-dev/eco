import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { onEvent } from '../api'
import { formatDuration } from '../lib/format'

/**
 * Control flotante de grabación (abajo a la izquierda). Persiste mientras se
 * graba, sin importar en qué vista estés. Minimizarlo (−) NO detiene la
 * grabación; solo "Detener" lo hace.
 */
export function RecordingDock(): JSX.Element | null {
  const active = useStore((s) => s.activeRecording)
  const expanded = useStore((s) => s.dockExpanded)
  const setExpanded = useStore((s) => s.setDockExpanded)
  const stop = useStore((s) => s.stopActiveRecording)
  const navigate = useStore((s) => s.navigate)
  const view = useStore((s) => s.view)
  const [elapsed, setElapsed] = useState(0)
  const [levels, setLevels] = useState({ mic: 0, sys: 0 })
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    if (!active) return
    const tick = (): void => setElapsed(Date.now() - active.startedAt)
    tick()
    const timer = setInterval(tick, 250)
    const off = onEvent('audio:levels', (d) => {
      if (d.recordingId === active.id) setLevels({ mic: d.micLevel, sys: d.sysLevel })
    })
    return () => {
      clearInterval(timer)
      off()
    }
  }, [active])

  if (!active) return null

  const enRecordingView = view.name === 'recording' && view.recordingId === active.id

  async function detener(): Promise<void> {
    setStopping(true)
    try {
      await stop()
    } finally {
      setStopping(false)
    }
  }

  // Minimizado: píldora compacta con punto rojo + tiempo.
  if (!expanded) {
    return (
      <button className="dock dock-pill" onClick={() => setExpanded(true)} title="Control de grabación">
        <span className="dock-rec-dot" />
        {formatDuration(elapsed)}
      </button>
    )
  }

  const peak = Math.round(Math.max(levels.mic, levels.sys) * 100)

  return (
    <div className="dock dock-card">
      <div className="dock-row">
        <span className="dock-rec-dot" />
        <span className="dock-title">Grabando</span>
        <span className="dock-time">{formatDuration(elapsed)}</span>
        <button className="dock-min" title="Minimizar (sigue grabando)" onClick={() => setExpanded(false)}>
          –
        </button>
      </div>
      <div className="dock-bar">
        <div className="dock-bar-fill" style={{ width: `${Math.min(100, peak)}%` }} />
      </div>
      <div className="dock-actions">
        {!enRecordingView && (
          <button
            className="btn btn-sm"
            onClick={() => navigate({ name: 'recording', recordingId: active.id })}
          >
            Ver
          </button>
        )}
        <button className="btn btn-sm dock-stop" onClick={detener} disabled={stopping}>
          {stopping ? 'Deteniendo…' : '■ Detener'}
        </button>
      </div>
    </div>
  )
}
