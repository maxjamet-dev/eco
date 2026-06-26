import { app } from 'electron'
import { createLogger } from './logger'

const log = createLogger('updater')

/**
 * Revisa actualizaciones en GitHub Releases (electron-updater).
 * Solo corre en la app empaquetada; en desarrollo no hace nada.
 * La configuración del feed sale de `electron-builder.yml` (publish: github).
 */
export async function initAutoUpdate(): Promise<void> {
  if (!app.isPackaged) return
  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.autoDownload = true
    autoUpdater.on('error', (e) => log.error('auto-update', String(e)))
    autoUpdater.on('update-available', (info) =>
      log.info('Actualización disponible', { version: info.version })
    )
    autoUpdater.on('update-downloaded', (info) =>
      log.info('Actualización descargada (se instalará al salir)', { version: info.version })
    )
    await autoUpdater.checkForUpdatesAndNotify()
  } catch (e) {
    log.error('No se pudo iniciar el auto-update', String(e))
  }
}
