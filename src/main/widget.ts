import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { createLogger } from './logger'

const log = createLogger('widget')

let widget: BrowserWindow | null = null

const WIDTH = 340
const HEIGHT = 132

/** Muestra el widget flotante "¿Grabar esta reunión?" abajo a la derecha. */
export function showWidget(appName: string): void {
  if (widget) {
    widget.show()
    widget.focus()
    return
  }
  const { workArea } = screen.getPrimaryDisplay()
  widget = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: workArea.x + workArea.width - WIDTH - 16,
    y: workArea.y + workArea.height - HEIGHT - 16,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  widget.setAlwaysOnTop(true, 'screen-saver')

  const hash = `widget?app=${encodeURIComponent(appName)}`
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void widget.loadURL(`${devUrl}#${hash}`)
  } else {
    void widget.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }

  widget.once('ready-to-show', () => widget?.show())
  widget.on('closed', () => {
    widget = null
  })
  log.info('Widget de reunión mostrado', { app: appName })
}

export function hideWidget(): void {
  widget?.close()
  widget = null
}

// ===== Widget de control de grabación (escritorio, always-on-top) =====

let recWidget: BrowserWindow | null = null
const REC_W = 300
const REC_H = 96

/** Muestra el control flotante de grabación en el escritorio (abajo-derecha). */
export function showRecordingWidget(recordingId: string, startedAt: number): void {
  if (recWidget) {
    recWidget.show()
    return
  }
  const { workArea } = screen.getPrimaryDisplay()
  recWidget = new BrowserWindow({
    width: REC_W,
    height: REC_H,
    x: workArea.x + workArea.width - REC_W - 16,
    y: workArea.y + workArea.height - REC_H - 16,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  recWidget.setAlwaysOnTop(true, 'screen-saver')

  const hash = `widget?mode=rec&id=${encodeURIComponent(recordingId)}&t=${startedAt}`
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void recWidget.loadURL(`${devUrl}#${hash}`)
  } else {
    void recWidget.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
  recWidget.once('ready-to-show', () => recWidget?.show())
  recWidget.on('closed', () => {
    recWidget = null
  })
  log.info('Widget de grabación mostrado', { recordingId })
}

export function hideRecordingWidget(): void {
  recWidget?.close()
  recWidget = null
}
