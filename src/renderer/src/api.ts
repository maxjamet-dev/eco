import type { IpcEventMap, IpcRequestChannel, IpcRequestMap } from '@shared/ipc'

/**
 * Wrapper tipado sobre `window.api` (expuesto por el preload).
 * Toda interacción con el sistema pasa por aquí (SDD §9.9).
 */
function invoke<C extends IpcRequestChannel>(
  channel: C,
  payload: IpcRequestMap[C]['request']
): Promise<IpcRequestMap[C]['response']> {
  return window.api.invoke(channel, payload)
}

export const api = {
  startRecording: (titulo: string | undefined, modo: 'online' | 'presencial') =>
    invoke('recording:start', { titulo, modo }),
  stopRecording: (id: string) => invoke('recording:stop', { id }),
  deleteRecording: (id: string) => invoke('recording:delete', { id }),
  listRecordings: (filtro?: string, projectId?: string | null) =>
    invoke('recordings:list', { filtro, projectId }),
  getRecording: (id: string) => invoke('recording:get', { id }),
  retryRecording: (id: string) => invoke('recording:retry', { id }),
  updateRecording: (
    id: string,
    patch: { titulo?: string; descripcion?: string | null; projectId?: string | null }
  ) => invoke('recording:update', { id, ...patch }),
  pickAudio: () => invoke('dialog:pickAudio', {}),
  importAudioFile: (filePath: string, projectId?: string | null) =>
    invoke('recording:importFile', { filePath, projectId }),
  importAudioBytes: (
    fileName: string,
    dataBase64: string,
    projectId?: string | null
  ) => invoke('recording:importBytes', { fileName, dataBase64, projectId }),
  listProjects: () => invoke('projects:list', {}),
  createProject: (nombre: string, descripcion?: string | null) =>
    invoke('projects:create', { nombre, descripcion }),
  updateProject: (id: string, patch: { nombre?: string; descripcion?: string | null }) =>
    invoke('projects:update', { id, ...patch }),
  deleteProject: (id: string) => invoke('projects:delete', { id }),
  searchTranscript: (id: string, query: string) => invoke('transcript:search', { id, query }),
  searchGlobal: (query: string) => invoke('transcript:searchGlobal', { query }),
  renameSpeaker: (recordingId: string, speakerId: number, nombre: string) =>
    invoke('speaker:rename', { recordingId, speakerId, nombre }),
  getSettings: () => invoke('settings:get', {}),
  setSettings: (patch: Partial<IpcRequestMap['settings:set']['request']>) =>
    invoke('settings:set', patch),
  setHfToken: (token: string) => invoke('settings:setHfToken', { token }),
  listDevices: () => invoke('audio:listDevices', {}),
  detectHardware: (force = false) => invoke('hardware:detect', { force }),
  readiness: () => invoke('system:readiness', {}),
  openDataFolder: () => invoke('system:openDataFolder', {})
}

/** Suscribe a un evento main→renderer. Devuelve función de limpieza. */
export function onEvent<C extends keyof IpcEventMap>(
  channel: C,
  listener: (data: IpcEventMap[C]) => void
): () => void {
  return window.api.on(channel, listener)
}
