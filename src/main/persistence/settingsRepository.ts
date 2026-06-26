import type { SqlDb } from './driver'
import type { AppSettings } from '@shared/types'

/**
 * Settings persistidos como pares clave/valor (JSON por valor).
 * El token de Hugging Face NUNCA se guarda aquí (va por safeStorage del SO);
 * solo se almacena el booleano `tieneTokenHf` para la UI.
 */

export const DEFAULT_SETTINGS: AppSettings = {
  modeloAsr: 'large-v3-turbo',
  modeloLlm: 'qwen3:8b',
  micDeviceId: null,
  sysDeviceId: null,
  carpetaDatos: '',
  modoPorDefecto: 'online',
  backend: 'auto',
  tieneTokenHf: false,
  usarNube: false,
  idiomaTranscripcion: 'es',
  resumenAutomatico: false,
  minimizarABandejaAlCerrar: true,
  iniciarConWindows: false,
  detectarReuniones: true,
  preguntoInicioConWindows: false
}

interface SettingRow {
  clave: string
  valor: string
}

export class SettingsRepository {
  constructor(private readonly db: SqlDb) {}

  getAll(): AppSettings {
    const rows = this.db.prepare('SELECT clave, valor FROM settings').all<SettingRow>()
    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS }
    for (const row of rows) {
      try {
        merged[row.clave] = JSON.parse(row.valor)
      } catch {
        // valor corrupto: se ignora y queda el default
      }
    }
    return merged as unknown as AppSettings
  }

  set(patch: Partial<AppSettings>): AppSettings {
    const stmt = this.db.prepare(
      `INSERT INTO settings (clave, valor) VALUES (?, ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
    )
    this.db.transaction(() => {
      for (const [clave, valor] of Object.entries(patch)) {
        stmt.run(clave, JSON.stringify(valor))
      }
    })
    return this.getAll()
  }
}
