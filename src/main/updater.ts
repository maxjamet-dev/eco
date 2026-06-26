import { app, BrowserWindow } from 'electron'
import { createLogger } from './logger'

const log = createLogger('updater')

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'dev'

let wired = false

function emit(state: UpdateState, extra: Record<string, unknown> = {}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:status', { state, ...extra })
  }
}

async function getUpdater(): Promise<import('electron-updater').AppUpdater> {
  // electron-updater es CJS: según el interop ESM, `autoUpdater` puede venir
  // directo o bajo `.default`. Lo resolvemos de ambas formas.
  const mod = (await import('electron-updater')) as unknown as {
    autoUpdater?: import('electron-updater').AppUpdater
    default?: { autoUpdater?: import('electron-updater').AppUpdater }
  }
  const autoUpdater = mod.autoUpdater ?? mod.default?.autoUpdater
  if (!autoUpdater) throw new Error('electron-updater no expone autoUpdater')
  if (!wired) {
    wired = true
    autoUpdater.autoDownload = true
    autoUpdater.on('checking-for-update', () => emit('checking'))
    autoUpdater.on('update-available', (i) => emit('available', { version: i.version }))
    autoUpdater.on('update-not-available', () => emit('not-available'))
    autoUpdater.on('download-progress', (p) => emit('downloading', { percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (i) => emit('downloaded', { version: i.version }))
    autoUpdater.on('error', (e) => emit('error', { message: String(e) }))
  }
  return autoUpdater
}

/** Revisión automática al arrancar (solo app empaquetada). */
export async function initAutoUpdate(): Promise<void> {
  if (!app.isPackaged) return
  try {
    const u = await getUpdater()
    await u.checkForUpdates()
  } catch (e) {
    log.error('init auto-update', String(e))
  }
}

/** Revisión manual (botón "Buscar actualizaciones"). */
export async function checkForUpdates(): Promise<{ ok: boolean }> {
  if (!app.isPackaged) {
    emit('dev')
    return { ok: false }
  }
  try {
    const u = await getUpdater()
    await u.checkForUpdates()
    return { ok: true }
  } catch (e) {
    emit('error', { message: String(e) })
    return { ok: false }
  }
}

/** Reinicia e instala la actualización ya descargada. */
export async function quitAndInstall(): Promise<{ ok: boolean }> {
  if (!app.isPackaged) return { ok: false }
  try {
    const u = await getUpdater()
    setImmediate(() => u.quitAndInstall())
    return { ok: true }
  } catch (e) {
    log.error('quitAndInstall', String(e))
    return { ok: false }
  }
}
