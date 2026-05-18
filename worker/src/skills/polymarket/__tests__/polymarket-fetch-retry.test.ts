/**
 * Unit tests for fetchWithRetry — retry logic, timeouts, error classification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry } from '../services/fetch-retry.js'
import { PolymarketApiError, PolymarketRateLimitError } from '../services/errors.js'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function errorResponse(status: number, body = ''): Response {
  return new Response(body, { status, statusText: `Error ${status}` })
}

describe('fetchWithRetry', () => {
  it('returns response on 200', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ ok: true }))
    const res = await fetchWithRetry('https://example.com/test')
    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('retries on 500 and succeeds on second attempt', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'))
      .mockResolvedValueOnce(okResponse({ ok: true }))

    const res = await fetchWithRetry('https://example.com/test', undefined, { maxRetries: 2 })
    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('retries on 503', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse({ ok: true }))

    const res = await fetchWithRetry('https://example.com/test', undefined, { maxRetries: 3 })
    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('throws PolymarketApiError after max retries on 500', async () => {
    mockFetch.mockResolvedValue(errorResponse(500, 'down'))

    await expect(
      fetchWithRetry('https://example.com/test', undefined, { maxRetries: 1 }),
    ).rejects.toThrow(PolymarketApiError)
    expect(mockFetch).toHaveBeenCalledTimes(2) // initial + 1 retry
  })

  it('throws PolymarketRateLimitError on 429 after max retries', async () => {
    mockFetch.mockResolvedValue(errorResponse(429, 'rate limited'))

    await expect(
      fetchWithRetry('https://example.com/test', undefined, { maxRetries: 1 }),
    ).rejects.toThrow(PolymarketRateLimitError)
  })

  it('does NOT retry on 400 client error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(400, 'Bad Request'))

    await expect(
      fetchWithRetry('https://example.com/test', undefined, { maxRetries: 3 }),
    ).rejects.toThrow(PolymarketApiError)
    // 400 is not retryable — should only be called once
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on 404', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404, 'Not Found'))

    await expect(
      fetchWithRetry('https://example.com/test', undefined, { maxRetries: 3 }),
    ).rejects.toThrow(PolymarketApiError)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('retries on network error (fetch throws)', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(okResponse({ ok: true }))

    const res = await fetchWithRetry('https://example.com/test', undefined, { maxRetries: 2 })
    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws on AbortError (simulated timeout)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    mockFetch.mockRejectedValue(abortError)

    await expect(
      fetchWithRetry('https://example.com/test', undefined, { maxRetries: 0 }),
    ).rejects.toThrow(/timed out|aborted/)
  })

  it('passes through request init (method, headers, body)', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ ok: true }))

    await fetchWithRetry('https://example.com/test', {
      method: 'POST',
      headers: { 'X-Custom': 'value' },
      body: '{"data":1}',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/test',
      expect.objectContaining({
        method: 'POST',
        body: '{"data":1}',
      }),
    )
  })

  it('PolymarketApiError has correct statusCode and endpoint', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(422, 'Unprocessable'))

    try {
      await fetchWithRetry('https://example.com/test', undefined, { maxRetries: 0 })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PolymarketApiError)
      const apiErr = err as PolymarketApiError
      expect(apiErr.statusCode).toBe(422)
      expect(apiErr.endpoint).toBe('https://example.com/test')
      expect(apiErr.retryable).toBe(false)
    }
  })
})
