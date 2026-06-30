import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { onEvent } from '../api'
import { LevelMeter } from '../components/LevelMeter'
import { formatDuration } from '../lib/format'

export function RecordingView({ recordingId }: { recordingId: string }): JSX.Element {
  const activeRecording = useStore((s) => s.activeRecording)
  const stopActiveRecording = useStore((s) => s.stopActiveRecording)
  const [elapsed, setElapsed] = useState(0)
  const [levels, setLevels] = useState({ mic: 0, sys: 0 })
  const [stopping, setStopping] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  // Cronómetro basado en el inicio GLOBAL: navegar fuera y volver no lo reinicia.
  const startedAt = activeRecording?.startedAt ?? null
  const esPresencial = activeRecording?.modo === 'presencial'

  useEffect(() => {
    const tick = (): void => setElapsed(startedAt ? Date.now() - startedAt : 0)
    tick()
    const timer = setInterval(tick, 200)
    const offLevels = onEvent('audio:levels', (data) => {
      if (data.recordingId === recordingId) {
        setLevels({ mic: data.micLevel, sys: data.sysLevel })
      }
    })
    // La reunión detectada terminó → ofrecer detener con cuenta regresiva.
    const offAuto = onEvent('recording:autoStop', (data) => {
      if (data.recordingId === recordingId) setCountdown(20)
    })
    return () => {
      clearInterval(timer)
      offLevels()
      offAuto()
    }
  }, [recordingId, startedAt])

  async function detener(): Promise<void> {
    setCountdown(null)
    setStopping(true)
    // El estado global se encarga de detener y navegar al detalle.
    await stopActiveRecording()
  }

  // Cuenta regresiva del auto-stop (solo reuniones en línea): al llegar a 0, detiene.
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      void detener()
      return
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  return (
    <div className="view recording-view">
      <div className="rec-indicator">
        <span className="rec-dot" />
        Grabando{esPresencial ? ' · presencial' : ''}
      </div>
      <div className="rec-timer">{formatDuration(elapsed)}</div>

      <div className="rec-meters">
        <LevelMeter label="Yo (micrófono)" level={levels.mic} />
        {!esPresencial && <LevelMeter label="Los demás (sistema)" level={levels.sys} />}
      </div>

      <p className="muted rec-hint">
        {esPresencial
          ? 'Modo presencial: se graba solo el micrófono de la sala. Puedes navegar por la app; la grabación sigue.'
          : 'El audio se guarda localmente en dos pistas. Puedes navegar por la app sin detener la grabación.'}
      </p>

      {countdown !== null && (
        <div className="autostop">
          <span>
            La reunión terminó. ¿Sigues ahí? Se detiene en <b>{countdown}s</b>
          </span>
          <div className="autostop-actions">
            <button className="btn btn-sm" onClick={() => setCountdown(null)}>
              Seguir grabando
            </button>
            <button className="btn btn-sm btn-primary" onClick={detener}>
              Detener ahora
            </button>
          </div>
        </div>
      )}

      <button className="btn btn-danger btn-stop" onClick={detener} disabled={stopping}>
        {stopping ? 'Deteniendo…' : '■ Detener'}
      </button>
    </div>
  )
}
