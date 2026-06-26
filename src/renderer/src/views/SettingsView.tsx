import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { api, onEvent } from '../api'
import type { AppSettings, HardwareInfo, SystemReadiness } from '@shared/types'

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <li className="check-item">
      <span className={ok ? 'check-ok' : 'check-no'}>{ok ? '✅' : '⚠️'}</span>
      {children}
    </li>
  )
}

export function SettingsView(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const loadSettings = useStore((s) => s.loadSettings)
  const [local, setLocal] = useState<AppSettings | null>(settings)
  const [hardware, setHardware] = useState<HardwareInfo | null>(null)
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null)
  const [hfToken, setHfToken] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [envStatus, setEnvStatus] = useState<{
    ready: boolean
    device: string | null
    preparing: boolean
  } | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [envLines, setEnvLines] = useState<string[]>([])
  const [ollamaSt, setOllamaSt] = useState<{
    running: boolean
    modelReady: boolean
    model: string
  } | null>(null)
  const [pullingModel, setPullingModel] = useState(false)
  const [ollamaLines, setOllamaLines] = useState<string[]>([])

  useEffect(() => {
    setLocal(settings)
  }, [settings])

  useEffect(() => {
    void api.detectHardware().then(setHardware)
    void api.readiness().then(setReadiness)
    void api.envStatus().then(setEnvStatus)
    void api.ollamaStatus().then(setOllamaSt)
  }, [])

  useEffect(() => {
    const offEnv = onEvent('env:progress', ({ line }) => {
      setEnvLines((prev) => [...prev.slice(-200), line])
    })
    const offOllama = onEvent('ollama:progress', ({ line }) => {
      setOllamaLines((prev) => [...prev.slice(-200), line])
    })
    return () => {
      offEnv()
      offOllama()
    }
  }, [])

  if (!local) return <div className="view">Cargando ajustes…</div>

  async function update(patch: Partial<AppSettings>): Promise<void> {
    const next = await api.setSettings(patch)
    setLocal(next)
    await loadSettings()
    setSavedMsg('Guardado')
    setTimeout(() => setSavedMsg(''), 1500)
  }

  async function guardarToken(): Promise<void> {
    if (!hfToken.trim()) return
    const { ok } = await api.setHfToken(hfToken.trim())
    if (ok) {
      setHfToken('')
      await loadSettings()
      setSavedMsg('Token guardado')
      setTimeout(() => setSavedMsg(''), 1500)
    }
  }

  async function prepararEntorno(): Promise<void> {
    const device: 'cuda' | 'cpu' = readiness?.gpu.device === 'cuda' ? 'cuda' : 'cpu'
    setEnvLines([])
    setPreparing(true)
    await api.prepareEnv(device)
    setPreparing(false)
    void api.envStatus().then(setEnvStatus)
    void api.readiness().then(setReadiness)
  }

  async function descargarModelo(): Promise<void> {
    setOllamaLines([])
    setPullingModel(true)
    await api.pullOllamaModel()
    setPullingModel(false)
    void api.ollamaStatus().then(setOllamaSt)
  }

  return (
    <div className="view settings-view">
      <h2>Ajustes</h2>
      {savedMsg && <div className="saved-toast">{savedMsg}</div>}

      <div className="card">
        <h3 className="card-title">
          Estado del sistema {readiness?.listoParaUsar ? '— ✅ Listo' : '— configuración pendiente'}
        </h3>
        {readiness ? (
          <ul className="check-list">
            <Check ok={readiness.gpu.tieneCuda}>
              GPU NVIDIA / CUDA {readiness.gpu.tieneCuda ? `(${readiness.gpu.gpuNombre})` : '(se usará CPU)'}
            </Check>
            <Check ok={readiness.pythonReady}>Entorno Python whisperX</Check>
            <Check ok={readiness.whisperBinReady}>Binario de captura (Rust)</Check>
            <Check ok={readiness.ollamaReady}>Servidor Ollama accesible</Check>
            <Check ok={readiness.modeloLlmDisponible}>
              Modelo de resumen descargado{' '}
              {!readiness.modeloLlmDisponible && local ? `(falta: ${local.modeloLlm})` : ''}
            </Check>
            <Check ok={readiness.hasHfToken}>Token de Hugging Face (diarización)</Check>
          </ul>
        ) : (
          <p className="muted">Comprobando…</p>
        )}
        <button className="btn btn-sm" onClick={() => api.readiness().then(setReadiness)}>
          Volver a comprobar
        </button>
      </div>

      <div className="card">
        <h3 className="card-title">Hardware</h3>
        {hardware ? (
          <p className="muted">
            {hardware.tieneCuda
              ? `GPU: ${hardware.gpuNombre} · ${hardware.vramMb} MB VRAM · driver ${hardware.driverVersion}`
              : 'Sin GPU NVIDIA detectada — se usará CPU (más lento, diarización degradada).'}
          </p>
        ) : (
          <p className="muted">Detectando…</p>
        )}
        <button className="btn btn-sm" onClick={() => api.detectHardware(true).then(setHardware)}>
          Volver a detectar
        </button>
      </div>

      <div className="card">
        <h3 className="card-title">
          Entorno de IA {envStatus?.ready ? '— ✅ listo' : '— sin preparar'}
        </h3>
        <p className="muted">
          Descarga e instala el motor de transcripción (whisperX + pyannote). Puede pesar
          varios GB y tardar; se hace una sola vez. Se instalará para{' '}
          <strong>{readiness?.gpu.device === 'cuda' ? 'GPU NVIDIA (cu128)' : 'CPU'}</strong>.
        </p>
        <button className="btn btn-primary btn-sm" onClick={prepararEntorno} disabled={preparing}>
          {preparing
            ? 'Preparando…'
            : envStatus?.ready
              ? 'Reparar / reinstalar entorno'
              : '⬇ Preparar entorno'}
        </button>
        {(preparing || envLines.length > 0) && (
          <pre className="env-log">
            {envLines
              .map((l) =>
                l
                  .replace(/^::step::/, '▸ ')
                  .replace(/^::done::/, '✓ ')
                  .replace(/^::error::/, '✗ ')
              )
              .join('\n')}
          </pre>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">
          Resúmenes (Ollama) {ollamaSt?.modelReady ? '— ✅ listo' : ''}
        </h3>
        {ollamaSt && !ollamaSt.running && (
          <>
            <p className="muted">
              Ollama no está disponible. Los resúmenes lo necesitan (es opcional: transcribir
              funciona sin él). Instálalo y ábrelo.
            </p>
            <a className="btn btn-sm" href="https://ollama.com/download" target="_blank" rel="noreferrer">
              Descargar Ollama
            </a>
          </>
        )}
        {ollamaSt && ollamaSt.running && !ollamaSt.modelReady && (
          <>
            <p className="muted">
              Ollama está corriendo, pero falta el modelo <strong>{ollamaSt.model}</strong>.
            </p>
            <button className="btn btn-primary btn-sm" onClick={descargarModelo} disabled={pullingModel}>
              {pullingModel ? 'Descargando…' : `⬇ Descargar modelo (${ollamaSt.model})`}
            </button>
          </>
        )}
        {ollamaSt && ollamaSt.modelReady && (
          <p className="muted">
            ✅ Listo para resumir con <strong>{ollamaSt.model}</strong>.
          </p>
        )}
        {(pullingModel || ollamaLines.length > 0) && (
          <pre className="env-log">{ollamaLines.join('\n')}</pre>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">Motores de IA</h3>
        <label className="field">
          <span>Modelo de transcripción (whisper)</span>
          <select value={local.modeloAsr} onChange={(e) => update({ modeloAsr: e.target.value })}>
            <option value="large-v3-turbo">large-v3-turbo (recomendado, 8 GB VRAM)</option>
            <option value="large-v3">large-v3 (máxima calidad)</option>
            <option value="medium">medium</option>
            <option value="small">small</option>
          </select>
        </label>
        <label className="field">
          <span>Modelo de resumen (Ollama)</span>
          <input
            value={local.modeloLlm}
            onChange={(e) => setLocal({ ...local, modeloLlm: e.target.value })}
            onBlur={(e) => update({ modeloLlm: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Backend de cómputo</span>
          <select
            value={local.backend}
            onChange={(e) => update({ backend: e.target.value as AppSettings['backend'] })}
          >
            <option value="auto">Automático</option>
            <option value="cuda">Forzar CUDA</option>
            <option value="cpu">Forzar CPU</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h3 className="card-title">Grabación</h3>
        <label className="field">
          <span>Modo por defecto</span>
          <select
            value={local.modoPorDefecto}
            onChange={(e) =>
              update({ modoPorDefecto: e.target.value as AppSettings['modoPorDefecto'] })
            }
          >
            <option value="online">En línea (Yo vs los demás)</option>
            <option value="presencial">Presencial</option>
          </select>
        </label>
        <label className="field">
          <span>Resumen al terminar</span>
          <select
            value={local.resumenAutomatico ? 'auto' : 'manual'}
            onChange={(e) => update({ resumenAutomatico: e.target.value === 'auto' })}
          >
            <option value="manual">A petición (con un botón)</option>
            <option value="auto">Automático al terminar</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h3 className="card-title">Sistema</h3>
        <label className="field">
          <span>Al cerrar la ventana</span>
          <select
            value={local.minimizarABandejaAlCerrar ? 'bandeja' : 'salir'}
            onChange={(e) => update({ minimizarABandejaAlCerrar: e.target.value === 'bandeja' })}
          >
            <option value="bandeja">Mantener en la bandeja</option>
            <option value="salir">Salir de eco</option>
          </select>
        </label>
        <label className="field">
          <span>Iniciar con Windows</span>
          <select
            value={local.iniciarConWindows ? 'si' : 'no'}
            onChange={(e) => update({ iniciarConWindows: e.target.value === 'si' })}
          >
            <option value="no">No</option>
            <option value="si">Sí (oculto en la bandeja)</option>
          </select>
        </label>
        <label className="field">
          <span>Detectar reuniones automáticamente</span>
          <select
            value={local.detectarReuniones ? 'si' : 'no'}
            onChange={(e) => update({ detectarReuniones: e.target.value === 'si' })}
          >
            <option value="si">Sí (ofrecer grabar al detectar el micrófono)</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h3 className="card-title">Token de Hugging Face (diarización)</h3>
        <p className="muted">
          Necesario para identificar participantes (pyannote). El token se guarda
          cifrado y nunca sale del equipo.{' '}
          {local.tieneTokenHf ? '✅ Hay un token guardado.' : '⚠️ Aún no hay token.'}
        </p>
        <div className="field-row">
          <input
            type="password"
            placeholder="hf_…"
            value={hfToken}
            onChange={(e) => setHfToken(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={guardarToken}>
            Guardar token
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Datos</h3>
        <p className="muted">Carpeta: {local.carpetaDatos}</p>
        <button className="btn btn-sm" onClick={() => api.openDataFolder()}>
          Abrir carpeta de datos
        </button>
      </div>
    </div>
  )
}
