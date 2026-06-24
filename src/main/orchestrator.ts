import type { AppSettings, Device, ProcessingProgress, Recording } from '@shared/types'
import type { SummarizationProvider, TranscriptionProvider } from '@shared/providers'
import { isCombinedProvider } from '@shared/providers'
import type { Repositories } from './persistence'
import { mergeTracks, distinctSpeakers, type MergedSegment, type RawSegment } from './processing/trackMerger'
import { createLogger } from './logger'

const log = createLogger('orchestrator')

export interface OrchestratorDeps {
  repos: Repositories
  /**
   * Resuelve, al iniciar el trabajo, el backend y el proveedor de transcripción
   * correspondiente (whisperX en CUDA o whisper.cpp en CPU). Centraliza la
   * decisión de hardware tras la interfaz (SDD §7.2).
   */
  selectProviders: () => Promise<{ device: Device; transcription: TranscriptionProvider }>
  summarization: SummarizationProvider
  getSettings: () => AppSettings
  getHfToken: () => string | undefined
  emitProgress: (p: ProcessingProgress) => void
  /** Reloj inyectable (ISO 8601) para tests deterministas. */
  now: () => string
}

const NON_TERMINAL: Recording['estado'][] = [
  'queued',
  'processing',
  'merging',
  'summarizing'
]

/**
 * Orquestador y cola (SDD §9.2, §11.2, §11.3).
 *
 * - Procesa una grabación a la vez (cola FIFO sobre `recordings.estado`).
 * - Dirige la máquina de estados: queued→processing→merging→summarizing→completed.
 * - Reanuda tras reinicio: trabajos no terminales vuelven a `queued`.
 * - Reintenta grabaciones `failed` limpiando datos parciales (idempotente).
 */
export class Orchestrator {
  private running = false
  private draining = false
  private stopped = false

  constructor(private readonly deps: OrchestratorDeps) {}

  /** Encola una grabación capturada para su procesamiento. */
  enqueue(recordingId: string): void {
    const rec = this.deps.repos.recordings.get(recordingId)
    if (!rec) {
      log.warn('enqueue: grabación inexistente', { recordingId })
      return
    }
    this.deps.repos.recordings.setStatus(recordingId, 'queued')
    this.emit(recordingId, 'queued', 'transcribe')
    void this.drain()
  }

  /** Reintenta una grabación fallida. */
  retry(recordingId: string): void {
    const rec = this.deps.repos.recordings.get(recordingId)
    if (!rec) return
    this.clearDerivedData(recordingId)
    this.deps.repos.recordings.setStatus(recordingId, 'queued')
    this.emit(recordingId, 'queued', 'transcribe')
    void this.drain()
  }

  /** Reanuda trabajos interrumpidos al arrancar la app. */
  async resumePending(): Promise<void> {
    this.deps.repos.jobs.resetRunningToPending()
    const pendientes = this.deps.repos.recordings.listByStatus(NON_TERMINAL)
    for (const rec of pendientes) {
      this.deps.repos.recordings.setStatus(rec.id, 'queued')
    }
    if (pendientes.length > 0) {
      log.info(`Reanudando ${pendientes.length} grabación(es) pendientes`)
      await this.drain()
    }
  }

  async shutdown(): Promise<void> {
    this.stopped = true
    // Esperamos a que termine el trabajo en curso (cooperativo).
    let guard = 0
    while (this.running && guard < 600) {
      await sleep(50)
      guard++
    }
  }

  /** Procesa la cola hasta vaciarla. Reentrante-seguro. */
  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      // eslint-disable-next-line no-constant-condition
      while (!this.stopped) {
        const next = this.deps.repos.recordings
          .listByStatus(['queued'])
          .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))[0]
        if (!next) break
        await this.process(next.id)
      }
    } finally {
      this.draining = false
    }
  }

  /** Pipeline de procesamiento de una grabación (SDD §11.2). */
  private async process(recordingId: string): Promise<void> {
    this.running = true
    const rec = this.deps.repos.recordings.get(recordingId)
    if (!rec) {
      this.running = false
      return
    }
    const settings = this.deps.getSettings()
    try {
      const { device, transcription } = await this.deps.selectProviders()
      this.deps.repos.recordings.setBackend(recordingId, device)

      // --- Etapa 1: transcripción + diarización ---
      this.deps.repos.recordings.setStatus(recordingId, 'processing')
      this.emit(recordingId, 'processing', 'transcribe')
      const job = this.deps.repos.jobs.enqueue(recordingId, 'transcribe', this.deps.now())
      this.deps.repos.jobs.markRunning(job.id)

      const { micSegments, systemSegments } = await this.transcribeTracks(
        rec,
        settings,
        device,
        transcription
      )
      this.deps.repos.jobs.markDone(job.id)

      // --- Etapa 2: fusión ---
      this.deps.repos.recordings.setStatus(recordingId, 'merging')
      this.emit(recordingId, 'merging', 'merge')
      const merged = mergeTracks({
        micSegments,
        systemSegments,
        offsetSysMs: rec.offsetSysMs,
        modo: rec.modo
      })
      this.persistTranscript(recordingId, merged)

      // --- Etapa 3: resumen ---
      this.deps.repos.recordings.setStatus(recordingId, 'summarizing')
      this.emit(recordingId, 'summarizing', 'summarize')
      const sumJob = this.deps.repos.jobs.enqueue(recordingId, 'summarize', this.deps.now())
      this.deps.repos.jobs.markRunning(sumJob.id)
      const transcript = this.deps.repos.transcripts.listByRecording(recordingId)
      if (transcript.length > 0) {
        const summary = await this.deps.summarization.summarize(transcript, {
          model: settings.modeloLlm
        })
        this.deps.repos.summaries.upsert(recordingId, summary)
      }
      this.deps.repos.jobs.markDone(sumJob.id)

      // --- Completado ---
      this.deps.repos.recordings.setStatus(recordingId, 'completed')
      this.emit(recordingId, 'completed', 'summarize', 100)
      log.info('Grabación procesada', { recordingId })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      log.error('Fallo procesando grabación', { recordingId, error: msg })
      this.deps.repos.recordings.setStatus(recordingId, 'failed')
      const jobs = this.deps.repos.jobs.listByRecording(recordingId)
      const last = jobs[jobs.length - 1]
      if (last) this.deps.repos.jobs.markFailed(last.id, msg)
      this.emit(recordingId, 'failed', 'transcribe', undefined, msg)
    } finally {
      this.running = false
    }
  }

  /** Transcribe ambas pistas según el modo (online vs presencial). */
  private async transcribeTracks(
    rec: Recording,
    settings: AppSettings,
    device: Device,
    provider: TranscriptionProvider
  ): Promise<{ micSegments: RawSegment[]; systemSegments: RawSegment[] }> {
    const transcribeOpts = {
      lang: settings.idiomaTranscripcion,
      model: settings.modeloAsr,
      device
    }
    const diarizeOpts = {
      device,
      hfToken: this.deps.getHfToken()
    }
    const combined = isCombinedProvider(provider)

    if (rec.modo === 'presencial') {
      // Diarizar la pista del micrófono; ignorar la del sistema.
      if (!rec.rutaAudioMic) return { micSegments: [], systemSegments: [] }
      const track = { path: rec.rutaAudioMic, label: 'mic' as const }
      const segs = combined
        ? await provider.transcribeAndDiarize(track, { ...transcribeOpts, ...diarizeOpts })
        : await provider.transcribe(track, transcribeOpts)
      return {
        micSegments: segs.map((s) => ({
          inicioMs: s.inicioMs,
          finMs: s.finMs,
          texto: s.texto,
          etiqueta: s.speaker
        })),
        systemSegments: []
      }
    }

    // Modo online: micrófono = "Yo" (sin diarización), sistema diarizado.
    const micSegments: RawSegment[] = rec.rutaAudioMic
      ? (await provider.transcribe({ path: rec.rutaAudioMic, label: 'mic' }, transcribeOpts)).map(
          (s) => ({ inicioMs: s.inicioMs, finMs: s.finMs, texto: s.texto })
        )
      : []

    let systemSegments: RawSegment[] = []
    if (rec.rutaAudioSys) {
      const track = { path: rec.rutaAudioSys, label: 'system' as const }
      const segs = combined
        ? await provider.transcribeAndDiarize(track, { ...transcribeOpts, ...diarizeOpts })
        : await provider.transcribe(track, transcribeOpts)
      systemSegments = segs.map((s) => ({
        inicioMs: s.inicioMs,
        finMs: s.finMs,
        texto: s.texto,
        etiqueta: s.speaker
      }))
    }

    return { micSegments, systemSegments }
  }

  /** Crea hablantes y guarda los segmentos fusionados. */
  private persistTranscript(recordingId: string, merged: MergedSegment[]): void {
    const labels = distinctSpeakers(merged)
    const idByLabel = new Map<string, number>()
    for (const etiqueta of labels) {
      const speaker = this.deps.repos.recordings.upsertSpeaker({
        recordingId,
        etiqueta,
        origen: etiqueta === 'MIC' ? 'mic' : 'diar'
      })
      idByLabel.set(etiqueta, speaker.id)
    }
    this.deps.repos.transcripts.insertSegments(recordingId, merged, idByLabel)
  }

  /** Limpia datos derivados para reprocesar de forma idempotente. */
  private clearDerivedData(recordingId: string): void {
    // El borrado de segmentos limpia FTS por trigger; los speakers se recrean.
    this.deps.repos.recordings.clearTranscriptAndSummary(recordingId)
  }

  private emit(
    recordingId: string,
    estado: ProcessingProgress['estado'],
    etapa: ProcessingProgress['etapa'],
    porcentaje?: number,
    mensaje?: string
  ): void {
    this.deps.emitProgress({ recordingId, estado, etapa, porcentaje, mensaje })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --- Singleton de producción ---

let instance: Orchestrator | null = null

export function getOrchestrator(): Orchestrator {
  if (!instance) {
    throw new Error('Orchestrator no inicializado: usar initOrchestrator(deps) en bootstrap')
  }
  return instance
}

export function initOrchestrator(deps: OrchestratorDeps): Orchestrator {
  instance = new Orchestrator(deps)
  return instance
}
