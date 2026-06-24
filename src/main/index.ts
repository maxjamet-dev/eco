import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { configureLogger, createLogger } from './logger'
import { logsDir } from './paths'

const log = createLogger('main')
let mainWindow: BrowserWindow | null = null

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
