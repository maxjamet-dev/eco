import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { join, normalize } from 'node:path'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import type { AppSettings } from '@shared/types'
import type { IpcEventMap } from '@shared/ipc'
import { configureLogger, createLogger } from './logger'
import { logsDir, recordingsDir } from './paths'
import { destroyTray, setAutoLaunch, setupTray } from './tray'
import { startMeetingDetector } from './meetingDetector'
import { hideWidget, showWidget } from './widget'
import { getActiveRecordingId, getActiveRecordingMode, isRecordingActive } from './ipc/handlers'
import { initAutoUpdate } from './updater'
import { getRepositories } from './persistence/db'

const log = createLogger('main')
let mainWindow: BrowserWindow | null = null
let isQuitting = false

function currentSettings(): AppSettings | null {
  try {
    return getRepositories().settings.getAll()
  } catch {
    return null
  }
}

/** ¿eco fue lanzado oculto (autoarranque con Windows)? */
function launchedHidden(): boolean {
  return process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin
}

function showMainWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function quitApp(): void {
  isQuitting = true
  app.quit()
}

function sendToMain<C extends keyof IpcEventMap>(channel: C, payload: IpcEventMap[C]): void {
  mainWindow?.webContents.send(channel, payload)
}

// Esquema privilegiado para servir el audio local de las grabaciones de forma
// segura al renderer (sin exponer el disco). URL: recmedia://<id>/mic.wav
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'recmedia',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
  }
])

function registerMediaProtocol(): void {
  protocol.handle('recmedia', (request) => {
    try {
      const url = new URL(request.url)
      const recordingId = url.hostname
      const fileName = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      // Solo permitimos los WAV conocidos dentro de la carpeta de la grabación.
      if (!['mic.wav', 'system.wav'].includes(fileName)) {
        return new Response('Not found', { status: 404 })
      }
      const base = recordingsDir()
      const target = normalize(join(base, recordingId, fileName))
      if (!target.startsWith(normalize(base)) || !existsSync(target)) {
        return new Response('Forbidden', { status: 403 })
      }

      // Soporte de byte-ranges → el <audio> puede saltar a cualquier minuto.
      // Sin esto, el reproductor solo puede ir a lo ya buffereado (el inicio).
      const size = statSync(target).size
      const rangeHeader = request.headers.get('Range')
      const toWeb = (s: NodeJS.ReadableStream): ReadableStream =>
        Readable.toWeb(s as Readable) as unknown as ReadableStream

      if (rangeHeader) {
        const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader)
        const start = m ? parseInt(m[1], 10) : 0
        const end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1
        if (start >= size || start > end) {
          return new Response('Rango inválido', {
            status: 416,
            headers: { 'Content-Range': `bytes */${size}` }
          })
        }
        return new Response(toWeb(createReadStream(target, { start, end })), {
          status: 206,
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1)
          }
        })
      }

      return new Response(toWeb(createReadStream(target)), {
        status: 200,
        headers: {
          'Content-Type': 'audio/wav',
          'Accept-Ranges': 'bytes',
          'Content-Length': String(size)
        }
      })
    } catch (e) {
      log.error('protocolo recmedia', String(e))
      return new Response('Error', { status: 500 })
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 940,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0e1015',
    title: 'eco',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const startHidden = launchedHidden()
  mainWindow.on('ready-to-show', () => {
    if (!startHidden) mainWindow?.show()
  })

  // Cerrar la ventana la oculta a la bandeja (eco sigue corriendo); salir de
  // verdad es desde el menú de la bandeja.
  mainWindow.on('close', (e) => {
    if (isQuitting) return
    const s = currentSettings()
    if (s?.minimizarABandejaAlCerrar !== false) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite inyecta ELECTRON_RENDERER_URL en desarrollo.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Pregunta (1 sola vez) si arrancar eco con Windows. */
async function maybeAskAutostart(settings: AppSettings): Promise<void> {
  if (settings.preguntoInicioConWindows || launchedHidden() || !mainWindow) return
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Sí, iniciar con Windows', 'Ahora no'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: 'eco',
    message: '¿Iniciar eco automáticamente con Windows?',
    detail:
      'Así eco queda en la bandeja y puede detectar tus reuniones para ofrecerte grabarlas. Puedes cambiarlo cuando quieras en Ajustes.'
  })
  const enable = response === 0
  try {
    getRepositories().settings.set({ iniciarConWindows: enable, preguntoInicioConWindows: true })
    setAutoLaunch(enable)
  } catch (e) {
    log.error('No se pudo guardar la preferencia de autoarranque', String(e))
  }
}

async function bootstrap(): Promise<void> {
  configureLogger({ dir: logsDir, level: 'info' })
  log.info('Arrancando aplicación', { version: app.getVersion() })

  registerMediaProtocol()

  // Registro perezoso de servicios + IPC (se completa en sprints posteriores).
  try {
    const { registerServices } = await import('./bootstrap')
    await registerServices()
  } catch (error) {
    log.error('Fallo al registrar servicios', String(error))
  }

  createWindow()

  setupTray({ onOpen: showMainWindow, onQuit: quitApp })

  // Handlers de UI/widget (necesitan la ventana principal + la ventana widget).
  ipcMain.handle('ui:openRecording', (_e, payload: { recordingId: string }) => {
    showMainWindow()
    sendToMain('ui:navigate', { name: 'recording', recordingId: payload.recordingId })
    hideWidget()
    return { ok: true }
  })
  ipcMain.handle('widget:close', () => {
    hideWidget()
    return { ok: true }
  })

  // Detección de reuniones por micrófono → widget para grabar / auto-stop.
  startMeetingDetector({
    isEnabled: () => currentSettings()?.detectarReuniones !== false,
    isRecording: () => isRecordingActive(),
    onStart: (appName) => {
      if (!isRecordingActive()) showWidget(appName)
    },
    onEnd: () => {
      hideWidget()
      // El auto-stop solo aplica a reuniones en línea (detectadas por una app
      // usando el micrófono). En presencial el mic siempre está "libre" desde
      // la perspectiva del detector, así que NO debemos cortar la grabación.
      const id = getActiveRecordingId()
      if (id && getActiveRecordingMode() !== 'presencial') {
        sendToMain('recording:autoStop', { recordingId: id })
      }
    }
  })

  const settings = currentSettings()
  if (settings) {
    setAutoLaunch(settings.iniciarConWindows)
    await maybeAskAutostart(settings)
  }

  void initAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

// Instancia única: si ya hay un eco corriendo (p.ej. en la bandeja), enfocamos
// ese en vez de abrir otro.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())
  app.whenReady().then(bootstrap).catch((err) => {
    log.error('Error fatal en arranque', String(err))
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  isQuitting = true
  destroyTray()
  try {
    const { shutdownServices } = await import('./bootstrap')
    await shutdownServices()
  } catch {
    // nada que hacer en cierre
  }
})
