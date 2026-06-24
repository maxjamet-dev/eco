import { describe, it, expect, vi } from 'vitest'
import { withRetry } from './retry'

const noSleep = () => Promise.resolve()

describe('withRetry', () => {
  it('devuelve el resultado sin reintentar si tiene éxito', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const r = await withRetry(fn, { retries: 3, baseDelayMs: 1, sleep: noSleep })
    expect(r).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('reintenta y termina teniendo éxito', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValue('ok')
    const r = await withRetry(fn, { retries: 3, baseDelayMs: 1, sleep: noSleep })
    expect(r).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('relanza tras agotar los reintentos', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(
      withRetry(fn, { retries: 2, baseDelayMs: 1, sleep: noSleep })
    ).rejects.toThrow('boom')
    expect(fn).toHaveBeenCalledTimes(3) // intento inicial + 2 reintentos
  })

  it('respeta shouldRetry=false (no reintenta)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'))
    await expect(
      withRetry(fn, { retries: 5, baseDelayMs: 1, sleep: noSleep, shouldRetry: () => false })
    ).rejects.toThrow('fatal')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('aplica backoff exponencial con tope', async () => {
    const delays: number[] = []
    const fn = vi.fn().mockRejectedValue(new Error('x'))
    await expect(
      withRetry(fn, {
        retries: 4,
        baseDelayMs: 10,
        maxDelayMs: 50,
        sleep: async (ms) => {
          delays.push(ms)
        }
      })
    ).rejects.toThrow()
    expect(delays).toEqual([10, 20, 40, 50]) // 10,20,40,80→tope 50
  })
})
