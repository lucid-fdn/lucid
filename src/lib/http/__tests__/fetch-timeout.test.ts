import { describe, expect, it, vi } from 'vitest'
import { composeAbortSignal, fetchWithTimeout, readPositiveIntEnv } from '../fetch-timeout'

describe('fetch timeout helpers', () => {
  it('falls back when an env timeout is missing or invalid', () => {
    vi.stubEnv('TEST_TIMEOUT_MS', '')
    expect(readPositiveIntEnv('TEST_TIMEOUT_MS', 1234)).toBe(1234)

    vi.stubEnv('TEST_TIMEOUT_MS', '-1')
    expect(readPositiveIntEnv('TEST_TIMEOUT_MS', 1234)).toBe(1234)

    vi.stubEnv('TEST_TIMEOUT_MS', '2500')
    expect(readPositiveIntEnv('TEST_TIMEOUT_MS', 1234)).toBe(2500)
  })

  it('composes caller cancellation with timeout cancellation', () => {
    const controller = new AbortController()
    const signal = composeAbortSignal(controller.signal, 10_000)

    expect(signal.aborted).toBe(false)
    controller.abort()
    expect(signal.aborted).toBe(true)
  })

  it('passes a bounded abort signal to fetch', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchWithTimeout('https://example.com/test', { method: 'POST' }, 1_000),
    ).resolves.toBeInstanceOf(Response)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/test',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    )
  })
})
