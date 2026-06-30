/**
 * Nombre mostrable de un hablante — ÚNICA fuente de verdad para la etiqueta
 * visible, usada tanto en main (transcripción) como en el renderer (panel de
 * participantes). Garantiza que "Participante 1" sea el mismo en ambos lados.
 *
 * - Si el usuario le puso nombre, ese manda.
 * - La pista del micrófono ("MIC") es "Yo".
 * - "SPEAKER_00" → "Participante 1", "SPEAKER_01" → "Participante 2", …
 */
export function speakerDisplayName(
  etiqueta: string | null | undefined,
  nombre?: string | null
): string {
  if (nombre && nombre.trim()) return nombre.trim()
  if (etiqueta === 'MIC') return 'Yo'
  if (etiqueta && etiqueta.startsWith('SPEAKER_')) {
    const n = parseInt(etiqueta.slice('SPEAKER_'.length), 10)
    if (!Number.isNaN(n)) return `Participante ${n + 1}`
  }
  return etiqueta ?? 'Desconocido'
}
