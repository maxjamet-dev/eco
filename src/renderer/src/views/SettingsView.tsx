import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import type { AppSettings, HardwareInfo } from '@shared/types'

export function SettingsView(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const loadSettings = useStore((s) => s.loadSettings)
  const [local, setLocal] = useState<AppSettings | null>(settings)
  const [hardware, setHardware] = useState<HardwareInfo | null>(null)
  const [hfToken, setHfToken] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    setLocal(settings)
  }, [settings])

  useEffect(() => {
    void api.detectHardware().then(setHardware)
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

  return (
    <div className="view settings-view">
      <h2>Ajustes</h2>
      {savedMsg && <div className="saved-toast">{savedMsg}</div>}

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
