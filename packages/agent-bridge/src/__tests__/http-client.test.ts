import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RestClient, BridgeError } from '../http-client.js'
import { defaultLogger } from '../logger.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function jsonResponse(data: unknown, status = 200): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

function errorResponse(status: number, body = '', headers: Record<string, string> = {}): Partial<Response> {
  return {
    ok: false,
    status,
    headers: new Headers(headers),
    text: async () => body,
  }
}

describe('RestClient', () => {
  let client: RestClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new RestClient('https://lucid.test', 'test-key', defaultLogger)
  })

  describe('post', () => {
    it('sends POST with auth header and JSON body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))

      const result = await client.post('/api/test', { foo: 'bar' })
      expect(result).toEqual({ success: true })

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('https://lucid.test/api/test')
      expect(opts.method).toBe('POST')
      expect(opts.headers.Authorization).toBe('Bearer test-key')
      expect(opts.headers['Content-Type']).toBe('application/json')
      expect(JSON.parse(opts.body)).toEqual({ foo: 'bar' })
    })

    it('throws BridgeError with status on HTTP 4xx', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'))

      try {
        await client.post('/api/fail', {})
        expect.unreachable('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(BridgeError)
        const be = err as BridgeError
        expect(be.status).toBe(401)
        expect(be.endpoint).toBe('/api/fail')
        expect(be.isTransient).toBe(false)
      }
    })

    it('classifies 5xx as transient', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(503, 'Service Unavailable'))

      try {
        await client.post('/api/fail', {})
        expect.unreachable('Should have thrown')
      } catch (err) {
        expect((err as BridgeError).isTransient).toBe(true)
      }
    })

    it('classifies 429 as transient with retryAfterMs', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(429, 'Too Many Requests', { 'Retry-After': '5' }))

      try {
        await client.post('/api/fail', {})
        expect.unreachable('Should have thrown')
      } catch (err) {
        const be = err as BridgeError
        expect(be.isTransient).toBe(true)
        expect(be.retryAfterMs).toBe(5000)
      }
    })

    it('wraps network errors as transient (status 0)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      try {
        await client.post('/api/fail', {})
        expect.unreachable('Should have thrown')
      } catch (err) {
        const be = err as BridgeError
        expect(be.status).toBe(0)
        expect(be.isTransient).toBe(true)
        expect(be.message).toContain('ECONNREFUSED')
      }
    })
  })

  describe('get', () => {
    it('sends GET with auth header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: 'test' }))

      const result = await client.get('/api/query')
      expect(result).toEqual({ data: 'test' })

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('https://lucid.test/api/query')
      expect(opts.headers.Authorization).toBe('Bearer test-key')
    })

    it('throws BridgeError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404, 'Not found'))

      await expect(client.get('/api/missing')).rejects.toThrow(BridgeError)
    })
  })
})
