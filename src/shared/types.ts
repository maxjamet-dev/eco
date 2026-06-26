/**
 * Contratos de dominio compartidos entre main, preload y renderer.
 * Fuente de verdad de los tipos del SDD §8.4.
 *
 * IMPORTANTE: este archivo NO debe importar nada de Electron ni de Node;
 * se consume tanto en el proceso main como en el renderer (navegador).
 */

/** Estados del ciclo de vida de una grabación (SDD §11.3). */
export type RecordingStatus =
  | 'recording'
  | 'captured'
  | 'queued'
  | 'processing'
  | 'merging'
  | 'summarizing'
  | 'completed'
  | 'failed'

/** Modo de la reunión: online (truco "yo vs los demás") o presencial. */
export type RecordingMode = 'online' | 'presencial'

/** Dispositivo de cómputo resuelto por el BackendSelector. */
export type Device = 'cuda' | 'cpu'

/** Origen de un hablante: pista del micrófono ("yo") o diarización. */
export type SpeakerOrigin = 'mic' | 'diar'

/** Etapas de procesamiento que registran trabajos en la cola. */
export type JobStage = 'transcribe' | 'diarize' | 'merge' | 'summarize'

/** Estado de un trabajo de la cola. */
export type JobStatus = 'pending' | 'running' | 'done' | 'failed'

/** Origen de la grabación: capturada por la app o importada (audio externo). */
export type RecordingTipo = 'grabada' | 'importada'

/** Un proyecto que agrupa reuniones. */
export interface Project {
  id: string
  nombre: string
  descripcion: string | null
  creadoEn: string
}

/** Una grabación tal como vive en la base de datos. */
export interface Recording {
  id: string
  titulo: string
  descripcion: string | null
  fechaInicio: string // ISO 8601
  duracionMs: number
  rutaAudioMic: string | null
  rutaAudioSys: string | null
  offsetSysMs: number
  modo: RecordingMode
  estado: RecordingStatus
  backendUsado: Device | null
  projectId: string | null
  tipo: RecordingTipo
}

/** Un hablante identificado dentro de una grabación. */
export interface Speaker {
  id: number
  recordingId: string
  etiqueta: string // "SPEAKER_00", "MIC", ...
  nombre: string | null // editable por el usuario
  origen: SpeakerOrigin
}

/** Un segmento de transcripción con tiempos y hablante. */
export interface TranscriptSegment {
  inicioMs: number
  finMs: number
  speaker: string // "Yo" | "Participante 1" | nombre real
  texto: string
}

/** Segmento tal como se persiste (referencia a speaker por id). */
export interface StoredTranscriptSegment {
  id: number
  recordingId: string
  inicioMs: number
  finMs: number
  speakerId: number | null
  texto: string
}

/** Una tarea/action item extraída del resumen. */
export interface ActionItem {
  descripcion: string
  responsable?: string
}

/** Resumen generado por el LLM. */
export interface MeetingSummary {
  resumen: string
  puntosClave: string[]
  actionItems: ActionItem[]
  modeloUsado: string
  /** Valoración del usuario sobre el resumen (null = sin valorar). */
  feedback?: 'up' | 'down' | null
}

/** Un trabajo de la cola de procesamiento. */
export interface ProcessingJob {
  id: number
  recordingId: string
  etapa: JobStage
  estado: JobStatus
  intentos: number
  error: string | null
}

/** Vista de detalle: grabación + todo lo asociado. */
export interface RecordingDetail {
  recording: Recording
  speakers: Speaker[]
  segments: TranscriptSegment[]
  summary: MeetingSummary | null
  project: Project | null
}

/** Información de un dispositivo de audio del sistema. */
export interface AudioDevice {
  id: string
  nombre: string
  tipo: 'input' | 'output'
  esPredeterminado: boolean
}

/** Resultado de la detección de hardware (SDD §9.7). */
export interface HardwareInfo {
  tieneCuda: boolean
  gpuNombre: string | null
  vramMb: number | null
  device: Device
  driverVersion: string | null
}

/** Configuración de la aplicación (SDD §9.8). */
export interface AppSettings {
  modeloAsr: string // p.ej. "large-v3-turbo"
  modeloLlm: string // p.ej. "qwen3:8b"
  micDeviceId: string | null
  sysDeviceId: string | null
  carpetaDatos: string
  modoPorDefecto: RecordingMode
  backend: 'auto' | 'cuda' | 'cpu'
  tieneTokenHf: boolean // si hay token guardado (el token nunca viaja al renderer)
  usarNube: boolean // futuro
  idiomaTranscripcion: string // "es"
  /** Si es true, el resumen se genera solo al terminar; si no, a petición (botón). */
  resumenAutomatico: boolean
  /** Al cerrar la ventana, mantener eco corriendo en la bandeja del sistema. */
  minimizarABandejaAlCerrar: boolean
  /** Iniciar eco automáticamente con Windows (oculto en la bandeja). */
  iniciarConWindows: boolean
  /** Detectar reuniones automáticamente por el uso del micrófono. */
  detectarReuniones: boolean
  /** Interno: ya se preguntó por el inicio con Windows en el primer arranque. */
  preguntoInicioConWindows: boolean
}

/** Progreso publicado main→renderer durante el procesamiento. */
export interface ProcessingProgress {
  recordingId: string
  etapa: JobStage | 'idle'
  estado: RecordingStatus
  porcentaje?: number
  mensaje?: string
}

/** Niveles de audio en vivo durante la grabación. */
export interface AudioLevels {
  recordingId: string
  micLevel: number // 0..1
  sysLevel: number // 0..1
}

/** Estado de preparación del sistema (asistente de primer arranque, SDD §14). */
export interface SystemReadiness {
  gpu: HardwareInfo
  pythonReady: boolean // existe el venv + worker.py
  whisperBinReady: boolean // binario de captura Rust compilado
  ollamaReady: boolean // servidor Ollama accesible
  ollamaModels: string[] // modelos descargados en Ollama
  modeloLlmDisponible: boolean // el modelo configurado está en Ollama
  hasHfToken: boolean
  /** ¿Está todo lo mínimo para grabar y procesar? */
  listoParaUsar: boolean
}

/** Resultado genérico de operaciones que pueden fallar. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
