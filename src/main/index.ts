import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { configureLogger, createLogger } from './logger'
import { logsDir, recordingsDir } from './paths'

const log = createLogger('main')
let mainWindow: BrowserWindow | null = null

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
      if (!target.startsWith(normalize(base))) {
        return new Response('Forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(target).toString())
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
    backgroundColor: '#0f1115',
    title: 'Grabador de Reuniones',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.whenReady().then(bootstrap).catch((err) => {
  log.error('Error fatal en arranque', String(err))
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  try {
    const { shutdownServices } = await import('./bootstrap')
    await shutdownServices()
  } catch {
    // nada que hacer en cierre
  }
})
