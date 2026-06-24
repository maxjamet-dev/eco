import { createLogger } from './logger'

/**
 * Punto único de cableado de servicios (DI manual) e IPC.
 * Se va completando por sprints: persistencia → orquestador → proveedores → IPC.
 */
const log = createLogger('bootstrap')

let initialized = false

export async function registerServices(): Promise<void> {
  if (initialized) return
  log.info('Inicializando servicios…')

  // 1) Persistencia (SQLite + migraciones).
  const { getDatabase } = await import('./persistence/db')
  getDatabase()

  // 2) Servicios: hardware, proveedores y orquestador (DI manual).
  const { buildServices } = await import('./services')
  buildServices()

  // 3) IPC: handlers tipados.
  const { registerIpcHandlers } = await import('./ipc/handlers')
  registerIpcHandlers()

  // 4) Orquestador: reanudar trabajos pendientes tras reinicio.
  const { getOrchestrator } = await import('./orchestrator')
  await getOrchestrator().resumePending()

  initialized = true
  log.info('Servicios listos')
}

export async function shutdownServices(): Promise<void> {
  if (!initialized) return
  log.info('Cerrando servicios…')
  try {
    const { getOrchestrator } = await import('./orchestrator')
    await getOrchestrator().shutdown()
  } catch (e) {
    log.warn('Error cerrando orquestador', String(e))
  }
  try {
    const { closeDatabase } = await import('./persistence/db')
    closeDatabase()
  } catch (e) {
    log.warn('Error cerrando base de datos', String(e))
  }
  initialized = false
}
