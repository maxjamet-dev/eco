import { useEffect, useState } from 'react'
import { api, onEvent } from './api'

/** Asistente de primer arranque: token de Hugging Face → preparar entorno de IA. */
export function Onboarding({ onDone }: { onDone: () => void }): JSX.Element {
  const [step, setStep] = useState(0)
  const [device, setDevice] = useState<'cuda' | 'cpu'>('cpu')
  const [token, setToken] = useState('')
  const [tokenSaved, setTokenSaved] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    void api.detectHardware().then((h) => setDevice(h.device === 'cuda' ? 'cuda' : 'cpu'))
    void api.getSettings().then((s) => setTokenSaved(s.tieneTokenHf))
    const off = onEvent('env:progress', ({ line }) => setLines((p) => [...p.slice(-200), line]))
    return off
  }, [])

  async function guardarToken(): Promise<void> {
    if (token.trim()) {
      await api.setHfToken(token.trim())
      setTokenSaved(true)
      setToken('')
    }
    setStep(2)
  }

  async function preparar(): Promise<void> {
    setLines([])
    setPreparing(true)
    const { ok } = await api.prepareEnv(device)
    setPreparing(false)
    if (ok) setStep(3)
  }

  return (
    <div className="onb">
      <div className="onb-card">
        <div className="onb-head">
          <span className="glyph" aria-hidden="true">
            <i />
          </span>
          <span className="onb-wm">eco</span>
          <span className="onb-steps">{step + 1} / 4</span>
        </div>

        {step === 0 && (
          <>
            <h2>Preparemos eco</h2>
            <p className="onb-p">
              Antes de grabar tu primera reunión, eco necesita instalar su motor de IA
              (transcripción y separación de voces). Son un par de pasos y se hace una sola vez.
            </p>
            <p className="onb-p muted">
              Equipo detectado: <strong>{device === 'cuda' ? 'GPU NVIDIA (rápido)' : 'CPU (más lento)'}</strong>.
            </p>
            <div className="onb-actions">
              <button className="btn btn-sm" onClick={onDone}>
                Configurar después
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setStep(1)}>
                Empezar
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Token de Hugging Face</h2>
            <p className="onb-p">
              Para <strong>separar las voces</strong> (quién dijo qué) eco usa un modelo gratuito
              que requiere un token. Tres pasos rápidos:
            </p>
            <ol className="onb-list">
              <li>
                Crea una cuenta gratis en{' '}
                <a href="https://huggingface.co/join" target="_blank" rel="noreferrer">
                  huggingface.co/join
                </a>
              </li>
              <li>
                Acepta la licencia del modelo en{' '}
                <a
                  href="https://huggingface.co/pyannote/speaker-diarization-3.1"
                  target="_blank"
                  rel="noreferrer"
                >
                  pyannote/speaker-diarization-3.1
                </a>
              </li>
              <li>
                Genera un token en{' '}
                <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">
                  huggingface.co/settings/tokens
                </a>{' '}
                y pégalo aquí:
              </li>
            </ol>
            <input
              className="search-input"
              type="password"
              placeholder="hf_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            {tokenSaved && <p className="onb-p muted">✅ Ya hay un token guardado.</p>}
            <div className="onb-actions">
              <button className="btn btn-sm" onClick={() => setStep(2)}>
                Saltar por ahora
              </button>
              <button className="btn btn-primary btn-sm" onClick={guardarToken}>
                {token.trim() ? 'Guardar y continuar' : 'Continuar'}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Instalar el motor de IA</h2>
            <p className="onb-p">
              Vamos a descargar e instalar la transcripción (whisperX + pyannote) para{' '}
              <strong>{device === 'cuda' ? 'GPU NVIDIA' : 'CPU'}</strong>. Puede pesar varios GB y
              tardar; se hace una sola vez.
            </p>
            <div className="onb-actions">
              {!preparing && (
                <button className="btn btn-sm" onClick={onDone}>
                  Configurar después
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={preparar} disabled={preparing}>
                {preparing ? 'Preparando…' : '⬇ Preparar entorno'}
              </button>
            </div>
            {(preparing || lines.length > 0) && (
              <pre className="env-log">
                {lines
                  .map((l) =>
                    l
                      .replace(/^::step::/, '▸ ')
                      .replace(/^::done::/, '✓ ')
                      .replace(/^::error::/, '✗ ')
                  )
                  .join('\n')}
              </pre>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h2>¡eco está listo! 🎉</h2>
            <p className="onb-p">
              Ya puedes grabar reuniones, transcribirlas y resumirlas. eco también quedará en la
              bandeja para detectar tus reuniones automáticamente.
            </p>
            <div className="onb-actions">
              <button className="btn btn-primary btn-sm" onClick={onDone}>
                Entrar a eco
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
