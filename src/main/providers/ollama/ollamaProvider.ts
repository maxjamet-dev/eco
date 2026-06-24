import type {
  SummarizationProvider,
  SummarizeOptions
} from '@shared/providers'
import type { MeetingSummary, TranscriptSegment } from '@shared/types'
import { createLogger } from '../../logger'

const log = createLogger('ollama')

const SUMMARY_THRESHOLD_CHARS = 12_000

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Transporte de chat hacia Ollama (HTTP en producción, fake en tests). */
export interface OllamaTransport {
  chat(opts: {
    model: string
    messages: ChatMessage[]
    format?: 'json'
    signal?: AbortSignal
  }): Promise<string>
}

const SYSTEM_PROMPT = `Eres un asistente que resume reuniones en español de Chile.
Devuelves SIEMPRE un único objeto JSON válido, sin texto adicional, con esta forma exacta:
{
  "resumen": "string — 1 a 3 párrafos con lo esencial de la reunión",
  "puntos_clave": ["string", "..."],
  "action_items": [{ "descripcion": "string", "responsable": "string o null" }]
}
No inventes responsables: si no se menciona quién, usa null.`

/** Formatea la transcripción como diálogo legible para el LLM. */
export function formatTranscript(segments: TranscriptSegment[]): string {
  return segments.map((s) => `${s.speaker}: ${s.texto}`).join('\n')
}

/** Parser tolerante del JSON de resumen (acepta snake_case y variantes). */
export function parseSummaryResponse(content: string, modeloUsado: string): MeetingSummary {
  const json = extractJson(content)
  const obj = JSON.parse(json) as Record<string, unknown>

  const resumen = typeof obj.resumen === 'string' ? obj.resumen : ''
  const puntos = Array.isArray(obj.puntos_clave)
    ? obj.puntos_clave
    : Array.isArray((obj as Record<string, unknown>).puntosClave)
      ? ((obj as Record<string, unknown>).puntosClave as unknown[])
      : []
  const itemsRaw = Array.isArray(obj.action_items)
    ? obj.action_items
    : Array.isArray((obj as Record<string, unknown>).actionItems)
      ? ((obj as Record<string, unknown>).actionItems as unknown[])
      : []

  return {
    resumen: resumen.trim(),
    puntosClave: puntos.map((p) => String(p)).filter((p) => p.trim().length > 0),
    actionItems: itemsRaw
      .map((it) => {
        const o = (it ?? {}) as Record<string, unknown>
        const descripcion = String(o.descripcion ?? o.description ?? o.tarea ?? '').trim()
        const respRaw = o.responsable ?? o.responsible ?? o.owner ?? null
        const responsable =
          respRaw && String(respRaw).trim() && String(respRaw).toLowerCase() !== 'null'
            ? String(respRaw).trim()
            : undefined
        return { descripcion, responsable }
      })
      .filter((it) => it.descripcion.length > 0),
    modeloUsado
  }
}

/** Extrae el primer objeto JSON balanceado de un texto. */
function extractJson(text: string): string {
  const start = text.indexOf('{')
  if (start < 0) throw new Error('No se encontró JSON en la respuesta del LLM')
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') inString = !inString
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  throw new Error('JSON incompleto en la respuesta del LLM')
}

/** Divide un texto largo en trozos por líneas, respetando un máximo de chars. */
export function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const lines = text.split('\n')
  const chunks: string[] = []
  let current = ''
  for (const line of lines) {
    if (current.length + line.length + 1 > maxChars && current.length > 0) {
      chunks.push(current)
      current = ''
    }
    current += (current ? '\n' : '') + line
  }
  if (current) chunks.push(current)
  return chunks
}

/**
 * Proveedor de resúmenes vía Ollama (SDD §6.2, §9.5).
 * Salida estructurada (JSON); para transcripciones largas, chunking +
 * resumen jerárquico.
 */
export class OllamaProvider implements SummarizationProvider {
  readonly name = 'ollama'

  constructor(private readonly transport: OllamaTransport) {}

  async summarize(transcript: TranscriptSegment[], opts: SummarizeOptions): Promise<MeetingSummary> {
    const full = formatTranscript(transcript)

    if (full.length <= SUMMARY_THRESHOLD_CHARS) {
      return this.summarizeChunk(full, opts)
    }

    // Resumen jerárquico: resumir cada trozo en prosa, luego estructurar.
    log.info('Transcripción larga: resumen jerárquico', { chars: full.length })
    const chunks = chunkText(full, SUMMARY_THRESHOLD_CHARS)
    const partials: string[] = []
    for (let i = 0; i < chunks.length; i++) {
      const content = await this.transport.chat({
        model: opts.model,
        signal: opts.signal,
        messages: [
          {
            role: 'system',
            content:
              'Resume en español, en prosa breve, el siguiente fragmento de una reunión. ' +
              'Conserva decisiones, datos y tareas mencionadas.'
          },
          { role: 'user', content: `Fragmento ${i + 1}/${chunks.length}:\n${chunks[i]}` }
        ]
      })
      partials.push(content.trim())
    }
    return this.summarizeChunk(partials.join('\n\n'), opts)
  }

  private async summarizeChunk(text: string, opts: SummarizeOptions): Promise<MeetingSummary> {
    const content = await this.transport.chat({
      model: opts.model,
      format: 'json',
      signal: opts.signal,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Transcripción de la reunión:\n\n${text}` }
      ]
    })
    return parseSummaryResponse(content, opts.model)
  }
}
