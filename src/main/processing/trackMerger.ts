import type { RecordingMode } from '@shared/types'

/** Segmento intermedio antes de persistir (referencia a hablante por etiqueta). */
export interface MergedSegment {
  inicioMs: number
  finMs: number
  etiqueta: string // 'MIC' | 'SPEAKER_00' | ...
  texto: string
}

export interface RawSegment {
  inicioMs: number
  finMs: number
  texto: string
  /** etiqueta de hablante; en la pista del sistema viene de la diarización */
  etiqueta?: string
}

export interface MergeInput {
  /** Segmentos de la pista del micrófono ("Yo"). */
  micSegments: RawSegment[]
  /** Segmentos ya diarizados de la pista del sistema ("los demás"). */
  systemSegments: RawSegment[]
  /** Offset del reloj de la pista del sistema respecto del micrófono (ms). */
  offsetSysMs: number
  modo: RecordingMode
}

/**
 * Fusionador de pistas (SDD §9.4).
 *
 * - Modo online: la pista del micrófono es siempre "MIC" (Yo); la del sistema
 *   trae hablantes ya diarizados. Se desplaza la pista del sistema por el offset
 *   y se intercalan ambos flujos por tiempo en un único guion ordenado.
 * - Modo presencial: solo se usa la pista del micrófono (ya diarizada); la del
 *   sistema se ignora.
 */
export function mergeTracks(input: MergeInput): MergedSegment[] {
  const { micSegments, systemSegments, offsetSysMs, modo } = input

  if (modo === 'presencial') {
    // La diarización se aplicó sobre el micrófono; conservamos sus etiquetas.
    return [...micSegments]
      .map((s) => ({
        inicioMs: s.inicioMs,
        finMs: s.finMs,
        etiqueta: s.etiqueta ?? 'SPEAKER_00',
        texto: s.texto
      }))
      .sort(bySegmentTime)
  }

  // Modo online: micrófono = "MIC"; sistema diarizado y desplazado por offset.
  const mic: MergedSegment[] = micSegments.map((s) => ({
    inicioMs: s.inicioMs,
    finMs: s.finMs,
    etiqueta: 'MIC',
    texto: s.texto
  }))

  const sys: MergedSegment[] = systemSegments.map((s) => ({
    inicioMs: Math.max(0, s.inicioMs + offsetSysMs),
    finMs: Math.max(0, s.finMs + offsetSysMs),
    // Sin diarización (fallback CPU): todo "los demás" cae en un hablante genérico.
    etiqueta: s.etiqueta && s.etiqueta.trim() ? s.etiqueta : 'SPEAKER_00',
    texto: s.texto
  }))

  return [...mic, ...sys].sort(bySegmentTime)
}

/** Orden estable por inicio, desempatando por fin y luego por texto. */
function bySegmentTime(a: MergedSegment, b: MergedSegment): number {
  if (a.inicioMs !== b.inicioMs) return a.inicioMs - b.inicioMs
  if (a.finMs !== b.finMs) return a.finMs - b.finMs
  return a.texto.localeCompare(b.texto)
}

/** Conjunto ordenado de etiquetas de hablante presentes en los segmentos. */
export function distinctSpeakers(segments: MergedSegment[]): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const s of segments) {
    if (!seen.has(s.etiqueta)) {
      seen.add(s.etiqueta)
      order.push(s.etiqueta)
    }
  }
  return order
}
