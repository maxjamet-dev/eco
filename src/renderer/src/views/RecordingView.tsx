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
  const startRef = useRef(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startRef.current), 200)
    const off = onEvent('audio:levels', (data) => {
      if (data.recordingId === recordingId) {
        setLevels({ mic: data.micLevel, sys: data.sysLevel })
      }
    })
    return () => {
      clearInterval(timer)
      off()
    }
  }, [recordingId])

  async function detener(): Promise<void> {
    setStopping(true)
    await api.stopRecording(recordingId)
    navigate({ name: 'detail', recordingId })
  }

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

      <button className="btn btn-danger btn-stop" onClick={detener} disabled={stopping}>
        {stopping ? 'Deteniendo…' : '■ Detener'}
      </button>
    </div>
  )
}
