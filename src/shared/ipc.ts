/**
 * Contrato de IPC tipado entre renderer y main (SDD §10.1).
 *
 * `IpcRequestMap` define canales request/response (invoke/handle).
 * `IpcEventMap` define canales de eventos main→renderer (send/on).
 *
 * Esta tipificación se usa tanto en el preload (para exponer la API)
 * como en el renderer (para consumirla con seguridad de tipos).
 */
import type {
  AppSettings,
  AudioDevice,
  HardwareInfo,
  ProcessingProgress,
  AudioLevels,
  Project,
  Recording,
  RecordingDetail,
  RecordingMode,
  SpeakerSuggestion,
  SystemReadiness,
  TranscriptSegment
} from './types'

/** Canales request→response (renderer invoca, main responde). */
export interface IpcRequestMap {
  'recording:start': {
    request: { titulo?: string; modo: RecordingMode }
    response: { id: string }
  }
  'recording:stop': {
    request: { id: string }
    response: { ok: boolean }
  }
  'recording:delete': {
    request: { id: string }
    response: { ok: boolean }
  }
  'recordings:list': {
    request: { filtro?: string; projectId?: string | null }
    response: Recording[]
  }
  'recording:update': {
    request: { id: string; titulo?: string; descripcion?: string | null; projectId?: string | null }
    response: { ok: boolean }
  }
  'recording:importFile': {
    request: { filePath: string; projectId?: string | null; titulo?: string; descripcion?: string | null }
    response: { id: string }
  }
  'recording:importBytes': {
    request: {
      fileName: string
      dataBase64: string
      projectId?: string | null
      titulo?: string
      descripcion?: string | null
    }
    response: { id: string }
  }
  'dialog:pickAudio': {
    request: Record<string, never>
    response: { filePath: string | null }
  }
  'projects:list': {
    request: Record<string, never>
    response: Array<Project & { numReuniones: number }>
  }
  'projects:create': {
    request: { nombre: string; descripcion?: string | null }
    response: Project
  }
  'projects:update': {
    request: { id: string; nombre?: string; descripcion?: string | null }
    response: { ok: boolean }
  }
  'projects:delete': {
    request: { id: string }
    response: { ok: boolean }
  }
  'recording:get': {
    request: { id: string }
    response: RecordingDetail | null
  }
  'recording:retry': {
    request: { id: string }
    response: { ok: boolean }
  }
  'transcript:search': {
    request: { id: string; query: string }
    response: TranscriptSegment[]
  }
  'transcript:searchGlobal': {
    request: { query: string }
    response: Array<{ recordingId: string; titulo: string; segment: TranscriptSegment }>
  }
  'speaker:rename': {
    request: { recordingId: string; speakerId: number; nombre: string }
    response: { ok: boolean }
  }
  'speakers:suggestNames': {
    request: { recordingId: string }
    response: SpeakerSuggestion[]
  }
  'settings:get': {
    request: Record<string, never>
    response: AppSettings
  }
  'settings:set': {
    request: Partial<AppSettings>
    response: AppSettings
  }
  'settings:setHfToken': {
    request: { token: string }
    response: { ok: boolean }
  }
  'audio:listDevices': {
    request: Record<string, never>
    response: { inputs: AudioDevice[]; outputs: AudioDevice[] }
  }
  'hardware:detect': {
    request: { force?: boolean }
    response: HardwareInfo
  }
  'system:readiness': {
    request: Record<string, never>
    response: SystemReadiness
  }
  'system:openDataFolder': {
    request: Record<string, never>
    response: { ok: boolean }
  }
  'summary:regenerate': {
    request: { id: string }
    response: { ok: boolean }
  }
  'summary:setFeedback': {
    request: { recordingId: string; feedback: 'up' | 'down' | null }
    response: { ok: boolean }
  }
  /** Desde el widget: abrir la ventana principal en la grabación recién iniciada. */
  'ui:openRecording': {
    request: { recordingId: string }
    response: { ok: boolean }
  }
  /** Cerrar el widget flotante. */
  'widget:close': {
    request: Record<string, never>
    response: { ok: boolean }
  }
  /** Estado del entorno de IA (venv + modelos). */
  'env:status': {
    request: Record<string, never>
    response: { ready: boolean; device: string | null; preparing: boolean }
  }
  /** Prepara el entorno de IA (descarga/instala). El progreso va por `env:progress`. */
  'env:prepare': {
    request: { device: 'cuda' | 'cpu' }
    response: { ok: boolean }
  }
  /** Estado de Ollama (corriendo + modelo de resumen descargado). */
  'ollama:status': {
    request: Record<string, never>
    response: { running: boolean; modelReady: boolean; model: string }
  }
  /** Descarga el modelo de resumen vía Ollama. Progreso por `ollama:progress`. */
  'ollama:pull': {
    request: Record<string, never>
    response: { ok: boolean }
  }
  /** Valida un token de Hugging Face (válido + acceso a los modelos de pyannote). */
  'hf:validate': {
    request: { token: string }
    response: { validToken: boolean; user: string | null; accessOk: boolean }
  }
  /** Versión actual de la app. */
  'app:version': {
    request: Record<string, never>
    response: { version: string }
  }
  /** Busca actualizaciones (estado por `update:status`). */
  'update:check': {
    request: Record<string, never>
    response: { ok: boolean }
  }
  /** Reinicia e instala la actualización descargada. */
  'update:install': {
    request: Record<string, never>
    response: { ok: boolean }
  }
}

/** Destino de navegación de la ventana principal (espejo de View del renderer). */
export type NavTarget =
  | { name: 'home' }
  | { name: 'settings' }
  | { name: 'recording'; recordingId: string }
  | { name: 'detail'; recordingId: string }

/** Canales de eventos main→renderer (push). */
export interface IpcEventMap {
  'processing:progress': ProcessingProgress
  'audio:levels': AudioLevels
  /** Pide a la ventana principal navegar a una vista. */
  'ui:navigate': NavTarget
  /** La reunión detectada terminó mientras se grababa → ofrecer detener. */
  'recording:autoStop': { recordingId: string }
  /** La grabación se detuvo (desde el widget de escritorio o donde sea). */
  'recording:ended': { recordingId: string }
  /** Línea de progreso de la preparación del entorno de IA. */
  'env:progress': { line: string }
  /** Línea de progreso de la descarga del modelo de Ollama. */
  'ollama:progress': { line: string }
  /** Estado de la búsqueda/descarga de actualizaciones. */
  'update:status': {
    state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'dev'
    version?: string
    percent?: number
    message?: string
  }
}

export type IpcRequestChannel = keyof IpcRequestMap
export type IpcEventChannel = keyof IpcEventMap

/** Lista en runtime de los canales request (para validación en preload/main). */
export const IPC_REQUEST_CHANNELS: IpcRequestChannel[] = [
  'recording:start',
  'recording:stop',
  'recording:delete',
  'recordings:list',
  'recording:update',
  'recording:importFile',
  'recording:importBytes',
  'dialog:pickAudio',
  'projects:list',
  'projects:create',
  'projects:update',
  'projects:delete',
  'recording:get',
  'recording:retry',
  'transcript:search',
  'transcript:searchGlobal',
  'speaker:rename',
  'speakers:suggestNames',
  'settings:get',
  'settings:set',
  'settings:setHfToken',
  'audio:listDevices',
  'hardware:detect',
  'system:readiness',
  'system:openDataFolder',
  'summary:regenerate',
  'summary:setFeedback',
  'ui:openRecording',
  'widget:close',
  'env:status',
  'env:prepare',
  'ollama:status',
  'ollama:pull',
  'hf:validate',
  'app:version',
  'update:check',
  'update:install'
]

export const IPC_EVENT_CHANNELS: IpcEventChannel[] = [
  'processing:progress',
  'audio:levels',
  'ui:navigate',
  'recording:autoStop',
  'recording:ended',
  'env:progress',
  'ollama:progress',
  'update:status'
]

/** Forma de la API que el preload expone en `window.api`. */
export interface RendererApi {
  invoke<C extends IpcRequestChannel>(
    channel: C,
    payload: IpcRequestMap[C]['request']
  ): Promise<IpcRequestMap[C]['response']>
  on<C extends IpcEventChannel>(channel: C, listener: (data: IpcEventMap[C]) => void): () => void
}
