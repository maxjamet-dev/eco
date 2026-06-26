interface LevelMeterProps {
  label: string
  level: number // 0..1
}

/** Medidor de nivel de audio en vivo. */
export function LevelMeter({ label, level }: LevelMeterProps): JSX.Element {
  const pct = Math.min(100, Math.round(level * 100))
  const danger = pct > 90
  // Tu voz (micrófono) es "lo vivo" → rojo; el sistema va neutro.
  const isMine = /mic|yo/i.test(label)
  const fill =
    danger || isMine ? 'var(--live)' : 'linear-gradient(90deg, var(--mist), var(--slate))'
  return (
    <div className="level-meter">
      <span className="level-label">{label}</span>
      <div className="level-track">
        <div className="level-fill" style={{ width: `${pct}%`, background: fill }} />
      </div>
    </div>
  )
}
