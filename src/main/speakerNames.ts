import type { OllamaTransport } from './providers/ollama/ollamaProvider'
import { OllamaHttpTransport } from './providers/ollama/ollamaTransport'
import { getRepositories } from './persistence/db'
import { speakerDisplayName } from '@shared/speakers'
import type { SpeakerSuggestion } from '@shared/types'
import { createLogger } from './logger'

const log = createLogger('speaker-names')

export type { SpeakerSuggestion }

const SYSTEM = `Analizas la transcripción de una reunión en español. Para cada
participante, determina su NOMBRE PROPIO solo si se presenta o alguien lo nombra
de forma clara (p.ej. "hola, soy Ana", "mi nombre es Juan", "te escuchamos, Pedro").
Devuelves SIEMPRE un único objeto JSON que mapea la etiqueta del participante a su
nombre, incluyendo SOLO a quienes tengan un nombre claro. No inventes. Ejemplo:
{ "Participante 1": "Ana", "Participante 3": "Pedro" }`

/** Parser tolerante: devuelve { etiquetaVisible: nombre }. */
export function parseSpeakerNames(content: string): Record<string, string> {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start < 0 || end <= start) return {}
  try {
    const obj = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) {
      const name = String(v ?? '').trim()
      if (name && name.toLowerCase() !== 'null' && name.length <= 60) out[k] = name
    }
    return out
  } catch {
    return {}
  }
}

/** Construye el texto de la transcripción agrupado por hablante visible. */
export function buildSpeakerTranscript(
  segments: Array<{ speaker: string; texto: string }>,
  maxChars = 12_000
): string {
  const text = segments.map((s) => `${s.speaker}: ${s.texto}`).join('\n')
  return text.length > maxChars ? text.slice(0, maxChars) : text
}

/**
 * Sugiere nombres de participantes a partir de la transcripción (SDD: trabajo
 * futuro "asignar nombres reales"). Solo sugiere si la conversación lo revela;
 * el usuario confirma/edita. No modifica nada en la base de datos.
 */
export async function suggestSpeakerNames(
  recordingId: string,
  transport: OllamaTransport = new OllamaHttpTransport()
): Promise<SpeakerSuggestion[]> {
  const repos = getRepositories()
  const segments = repos.transcripts.listByRecording(recordingId)
  if (segments.length === 0) return []
  const speakers = repos.recordings.listSpeakers(recordingId)
  const model = repos.settings.getAll().modeloLlm

  const content = await transport.chat({
    model,
    format: 'json',
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Transcripción:\n\n${buildSpeakerTranscript(segments)}` }
    ]
  })
  const byLabel = parseSpeakerNames(content)
  log.info('Nombres sugeridos', byLabel)

  const suggestions: SpeakerSuggestion[] = []
  for (const sp of speakers) {
    if (sp.etiqueta === 'MIC') continue // "Yo" lo conoce el usuario
    const actual = speakerDisplayName(sp.etiqueta, null)
    const sugerido = byLabel[actual]
    // Solo sugiere si hay nombre y el hablante aún no fue renombrado.
    if (sugerido && !sp.nombre) {
      suggestions.push({ speakerId: sp.id, etiqueta: sp.etiqueta, actual, sugerido })
    }
  }
  return suggestions
}
