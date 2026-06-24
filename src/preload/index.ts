import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_EVENT_CHANNELS,
  IPC_REQUEST_CHANNELS,
  type IpcEventChannel,
  type IpcRequestChannel
} from '@shared/ipc'

/**
 * Puente seguro (contextBridge) entre renderer y main.
 * Solo se exponen canales conocidos; el renderer nunca toca Node ni el disco.
 */
const api = {
  invoke(channel: IpcRequestChannel, payload: unknown): Promise<unknown> {
    if (!IPC_REQUEST_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`Canal IPC no permitido: ${String(channel)}`))
    }
    return ipcRenderer.invoke(channel, payload)
  },
  on(channel: IpcEventChannel, listener: (data: unknown) => void): () => void {
    if (!IPC_EVENT_CHANNELS.includes(channel)) {
      throw new Error(`Canal de evento no permitido: ${String(channel)}`)
    }
    const wrapped = (_event: Electron.IpcRendererEvent, data: unknown): void => listener(data)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('No se pudo exponer la API del preload:', error)
  }
} else {
  // Fallback (no debería ocurrir: contextIsolation está activado).
  // @ts-expect-error definición dinámica en window
  window.api = api
}
