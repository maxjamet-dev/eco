import type { TranscriptSegment } from '@shared/types'
import type { DiarizationSegment } from '@shared/providers'

/**
 * Protocolo del worker whisperX (SDD §10.2).
 * Petición y respuesta JSON sobre socket TCP local.
 */

export interface WhisperXRequest {
  id: string
  audioPath: string
  lang: string
  model: string
  device: 'cuda' | 'cpu'
  diarize: boolean
  minSpeakers?: number
  maxSpeakers?: number
  hfToken?: string
}

/** Segmento crudo tal como lo emite el worker (tiempos en segundos). */
export interface WhisperXRawSegment {
  start: number // segundos
  end: number // segundos
  text: string
  speaker?: string
}

export interface WhisperXResponse {
  id?: string
  ok: boolean
  segments?: WhisperXRawSegment[]
  error?: string
}

/** Convierte la respuesta cruda del worker en TranscriptSegment[] (ms). */
export function parseWhisperXResponse(raw: unknown): TranscriptSegment[] {
  const resp = raw as WhisperXResponse
  if (!resp || resp.ok === false) {
    throw new Error(resp?.error ?? 'whisperX devolvió un error desconocido')
  }
  if (!Array.isArray(resp.segments)) {
    throw new Error('Respuesta de whisperX sin campo segments[]')
  }
  return resp.segments
    .filter((s) => typeof s.text === 'string' && s.text.trim().length > 0)
    .map((s) => ({
      inicioMs: Math.round((s.start ?? 0) * 1000),
      finMs: Math.round((s.end ?? s.start ?? 0) * 1000),
      speaker: s.speaker && s.speaker.trim() ? s.speaker : 'SPEAKER_00',
      texto: s.text.trim()
    }))
}

/** Extrae solo la información de diarización (sin texto). */
export function parseWhisperXDiarization(raw: unknown): DiarizationSegment[] {
  return parseWhisperXResponse(raw).map((s) => ({
    inicioMs: s.inicioMs,
    finMs: s.finMs,
    speaker: s.speaker
  }))
}
