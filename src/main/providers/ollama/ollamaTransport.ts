import type { ChatMessage, OllamaTransport } from './ollamaProvider'

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434'

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
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: opts.signal,
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: false,
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
