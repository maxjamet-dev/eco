/** Utilidad de reintentos con backoff exponencial (SDD §12). */

export interface RetryOptions {
  retries: number
  baseDelayMs: number
  maxDelayMs?: number
  /** Devuelve true si el error es reintentable (por defecto, todos). */
  shouldRetry?: (error: unknown) => boolean
  /** Espera inyectable (para tests deterministas). */
  sleep?: (ms: number) => Promise<void>
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Ejecuta `fn`, reintentando hasta `retries` veces con backoff exponencial
 * (baseDelay * 2^intento, con tope opcional). Relanza el último error.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep
  const shouldRetry = opts.shouldRetry ?? (() => true)
  const maxDelay = opts.maxDelayMs ?? Number.POSITIVE_INFINITY

  let lastError: unknown
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === opts.retries || !shouldRetry(error)) break
      const delay = Math.min(maxDelay, opts.baseDelayMs * 2 ** attempt)
      opts.onRetry?.(attempt + 1, error, delay)
      await sleep(delay)
    }
  }
  throw lastError
}
