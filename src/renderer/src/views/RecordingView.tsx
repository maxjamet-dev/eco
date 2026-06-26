import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { api, onEvent } from '../api'
import { LevelMeter } from '../components/LevelMeter'
import { formatDuration } from '../lib/format'

export function RecordingView({ recordingId }: { recordingId: string }): JSX.Element {
  const navigate = useStore((s) => s.navigate)
  const [elapsed, setElapsed] = useState(0)
  const [levels, setLevels] = useState({ mic: 0, sys: 0 })
  const [stopping, setStopping] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startRef.current), 200)
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
  }, [recordingId])

  async function detener(): Promise<void> {
    setCountdown(null)
    setStopping(true)
    await api.stopRecording(recordingId)
    navigate({ name: 'detail', recordingId })
  }

  // Cuenta regresiva del auto-stop: al llegar a 0, detiene.
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      void detener()
      return
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown])

  return (
    <div className="view recording-view">
      <div className="rec-indicator">
        <span className="rec-dot" />
        Grabando
      </div>
      <div className="rec-timer">{formatDuration(elapsed)}</div>

      <div className="rec-meters">
        <LevelMeter label="Yo (micrófono)" level={levels.mic} />
        <LevelMeter label="Los demás (sistema)" level={levels.sys} />
      </div>

      <p className="muted rec-hint">
        El audio se guarda localmente en dos pistas. La transcripción y el resumen
        comienzan automáticamente al detener.
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
