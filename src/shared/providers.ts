/**
 * Interfaces de proveedor (SDD §9.3, §9.5).
 *
 * Patrón transversal: cada motor de IA se accede tras una interfaz, lo que
 * permite intercambiar local↔nube y CUDA↔(AMD/CPU) sin tocar el orquestador.
 */
import type { Device, MeetingSummary, TranscriptSegment } from './types'

/** Referencia a una pista de audio en disco. */
export interface AudioTrackRef {
  path: string
  /** etiqueta lógica: "mic" | "system" */
  label: 'mic' | 'system'
}

export interface TranscribeOptions {
  lang: string // "es"
  model: string
  device: Device
}

export interface DiarizeOptions {
  device: Device
  minSpeakers?: number
  maxSpeakers?: number
  hfToken?: string
}

/** Segmento de diarización (quién habló y cuándo), sin texto. */
export interface DiarizationSegment {
  inicioMs: number
  finMs: number
  speaker: string // "SPEAKER_00", ...
}

/** Transcripción de voz a texto. */
export interface TranscriptionProvider {
  readonly name: string
  transcribe(track: AudioTrackRef, opts: TranscribeOptions): Promise<TranscriptSegment[]>
}

/** Diarización: determinar quién habló y cuándo. */
export interface DiarizationProvider {
  readonly name: string
  diarize(track: AudioTrackRef, opts: DiarizeOptions): Promise<DiarizationSegment[]>
}

/**
 * Algunos motores (whisperX) hacen ASR + diarización en una sola pasada.
 * Implementan esta interfaz combinada y devuelven segmentos ya etiquetados.
 */
export interface CombinedAsrDiarizationProvider extends TranscriptionProvider {
  transcribeAndDiarize(
    track: AudioTrackRef,
    opts: TranscribeOptions & DiarizeOptions
  ): Promise<TranscriptSegment[]>
}

export interface SummarizeOptions {
  model: string
  /** Señal opcional de cancelación. */
  signal?: AbortSignal
}

/** Generación de resúmenes con LLM. */
export interface SummarizationProvider {
  readonly name: string
  summarize(transcript: TranscriptSegment[], opts: SummarizeOptions): Promise<MeetingSummary>
}

/** Capacidades declaradas por un proveedor combinado. */
export function isCombinedProvider(
  p: TranscriptionProvider
): p is CombinedAsrDiarizationProvider {
  return typeof (p as CombinedAsrDiarizationProvider).transcribeAndDiarize === 'function'
}
