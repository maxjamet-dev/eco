import { app, Menu, nativeImage, Tray } from 'electron'
import { resourcePath } from './paths'
import { createLogger } from './logger'

const log = createLogger('tray')

let tray: Tray | null = null

export interface TrayCallbacks {
  onOpen: () => void
  onQuit: () => void
}

function iconFor(recording: boolean): Electron.NativeImage {
  return nativeImage.createFromPath(resourcePath(recording ? 'tray-rec.ico' : 'tray-idle.ico'))
}

/** Crea el ícono de bandeja con su menú (idempotente). */
export function setupTray(cb: TrayCallbacks): void {
  if (tray) return
  try {
    tray = new Tray(iconFor(false))
  } catch (e) {
    log.error('No se pudo crear el ícono de bandeja', String(e))
    return
  }
  tray.setToolTip('eco')
  tray.on('click', cb.onOpen)
  tray.on('double-click', cb.onOpen)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir eco', click: cb.onOpen },
      { type: 'separator' },
      { label: 'Salir', click: cb.onQuit }
    ])
  )
}

/** Cambia el ícono/tooltip según el estado de grabación. */
export function setTrayRecording(recording: boolean): void {
  if (!tray) return
  tray.setImage(iconFor(recording))
  tray.setToolTip(recording ? 'eco — grabando' : 'eco')
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

/** Registra (o quita) el arranque de eco con Windows, oculto en la bandeja. */
export function setAutoLaunch(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    args: ['--hidden']
  })
}
