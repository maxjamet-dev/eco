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
  const [validating, setValidating] = useState(false)
  const [hfResult, setHfResult] = useState<{
    validToken: boolean
    user: string | null
    accessOk: boolean
  } | null>(null)

  useEffect(() => {
    void api.detectHardware().then((h) => setDevice(h.device === 'cuda' ? 'cuda' : 'cpu'))
    void api.getSettings().then((s) => setTokenSaved(s.tieneTokenHf))
    const off = onEvent('env:progress', ({ line }) => setLines((p) => [...p.slice(-200), line]))
    return off
  }, [])

  async function verificarYGuardar(): Promise<void> {
    if (!token.trim()) return
    setValidating(true)
    const res = await api.validateHfToken(token.trim())
    setValidating(false)
    setHfResult(res)
    if (res.validToken) {
      await api.setHfToken(token.trim())
      setTokenSaved(true)
    }
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
              Para <strong>separar las voces</strong> (quién dijo qué), eco usa unos modelos
              gratuitos de “pyannote” que piden un token. Son 4 pasos, una sola vez:
            </p>
            <ol className="onb-list">
              <li>
                Crea una cuenta gratis:{' '}
                <a href="https://huggingface.co/join" target="_blank" rel="noreferrer">
                  huggingface.co/join
                </a>
              </li>
              <li>
                Inicia sesión y <strong>acepta las DOS licencias</strong> (botón “Agree” en cada
                una):
                <br />
                <a
                  href="https://huggingface.co/pyannote/segmentation-3.0"
                  target="_blank"
                  rel="noreferrer"
                >
                  ① segmentation-3.0
                </a>{' '}
                ·{' '}
                <a
                  href="https://huggingface.co/pyannote/speaker-diarization-3.1"
                  target="_blank"
                  rel="noreferrer"
                >
                  ② speaker-diarization-3.1
                </a>
              </li>
              <li>
                Genera un token (tipo “Read”):{' '}
                <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">
                  huggingface.co/settings/tokens
                </a>
              </li>
              <li>Pégalo aquí y pulsa “Verificar”:</li>
            </ol>
            <input
              className="search-input"
              type="password"
              placeholder="hf_…"
              value={token}
              onChange={(e) => {
                setToken(e.target.value)
                setHfResult(null)
              }}
            />
            {hfResult && (
              <div className="onb-result">
                {hfResult.validToken ? (
                  <>
                    <p className="ok">
                      ✅ Token válido{hfResult.user ? ` — conectado como ${hfResult.user}` : ''}.
                    </p>
                    {hfResult.accessOk ? (
                      <p className="ok">✅ Acceso a los modelos confirmado. ¡Todo listo!</p>
                    ) : (
                      <p className="warn">
                        ⚠️ Te falta aceptar alguna licencia. Vuelve a los enlaces ① y ② de
                        arriba, pulsa “Agree”, y verifica de nuevo.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="warn">⚠️ El token no es válido. Revísalo o genera uno nuevo.</p>
                )}
              </div>
            )}
            {tokenSaved && !hfResult && <p className="onb-p muted">✅ Ya hay un token guardado.</p>}
            <div className="onb-actions">
              <button className="btn btn-sm" onClick={() => setStep(2)}>
                Saltar por ahora
              </button>
              {hfResult?.validToken ? (
                <button className="btn btn-primary btn-sm" onClick={() => setStep(2)}>
                  Continuar
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={verificarYGuardar}
                  disabled={!token.trim() || validating}
                >
                  {validating ? 'Verificando…' : 'Verificar y guardar'}
                </button>
              )}
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
