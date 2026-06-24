import type { ChatMessage, OllamaTransport } from './ollamaProvider'
import { withRetry } from '../../lib/retry'

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434'

/** Errores transitorios de conexión (servidor iniciando, modelo cargando). */
function isTransient(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /ECONNREFUSED|fetch failed|network|socket|timeout|503|502/i.test(msg)
}

interface OllamaChatResponse {
  message?: { content?: string }
  error?: string
}

/**
 * Transporte HTTP real hacia Ollama (SDD §10.2): POST /api/chat no-streaming.
 * 100% local (localhost); ninguna llamada sale del equipo.
 */
export class OllamaHttpTransport implements OllamaTransport {
  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {}

  async chat(opts: {
    model: string
    messages: ChatMessage[]
    format?: 'json'
    signal?: AbortSignal
  }): Promise<string> {
    return withRetry(
      async () => {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: opts.signal,
          body: JSON.stringify({
            model: opts.model,
            messages: opts.messages,
            stream: false,
            // Desactiva el "modo pensamiento" de modelos como Qwen3: sin él, el
            // razonamiento previo multiplica la latencia (~300s vs ~40s medidos)
            // sin mejorar el resumen. Ollama ignora este campo en modelos sin thinking.
            think: false,
            ...(opts.format ? { format: opts.format } : {}),
            options: { temperature: 0.2 }
          })
        })
        if (!res.ok) {
          throw new Error(`Ollama respondió ${res.status}: ${await res.text()}`)
        }
        const data = (await res.json()) as OllamaChatResponse
        if (data.error) throw new Error(`Ollama error: ${data.error}`)
        return data.message?.content ?? ''
      },
      { retries: 3, baseDelayMs: 1000, maxDelayMs: 8000, shouldRetry: isTransient }
    )
  }

  /** Verifica que el servidor Ollama esté accesible y el modelo disponible. */
  async healthCheck(): Promise<{ ok: boolean; models: string[] }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`)
      if (!res.ok) return { ok: false, models: [] }
      const data = (await res.json()) as { models?: Array<{ name: string }> }
      return { ok: true, models: (data.models ?? []).map((m) => m.name) }
    } catch {
      return { ok: false, models: [] }
    }
  }
}
