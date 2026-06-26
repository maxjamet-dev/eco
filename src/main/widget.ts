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
