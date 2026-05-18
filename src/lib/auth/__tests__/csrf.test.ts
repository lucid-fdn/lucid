import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks -- use inline factory style compatible with vitest 4 hoisting
// ---------------------------------------------------------------------------
const mockCookieGet = vi.fn()

vi.mock('next/headers', () => {
  return {
    cookies: vi.fn().mockResolvedValue({
      get: (...args: unknown[]) => mockCookieGet(...args),
    }),
  }
})

vi.mock('next/server', () => {
  class MockNextResponse {
    body: unknown
    status: number
    cookies: { set: (...args: unknown[]) => void }
    _setCalls: unknown[][]
    constructor(body?: unknown, init?: { status?: number }) {
      this.body = body
      this.status = init?.status ?? 200
      this._setCalls = []
      this.cookies = {
        set: (...args: unknown[]) => {
          this._setCalls.push(args)
        },
      }
    }
    static json(data: unknown, init?: { status?: number }) {
      return new MockNextResponse(data, init)
    }
  }
  return {
    NextRequest: class {},
    NextResponse: MockNextResponse,
  }
})

import {
  getCSRFToken,
  setCSRFToken,
  validateCSRFToken,
  requireCSRF,
  getCSRFTokenFromCookie,
  withCSRF,
} from '../csrf'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Helpers to build fake NextRequest objects
// ---------------------------------------------------------------------------
function makeRequest(
  method: string,
  cookieToken?: string,
  headerToken?: string,
): unknown {
  const cookieMap = new Map<string, { name: string; value: string }>()
  if (cookieToken !== undefined) {
    cookieMap.set('csrf-token', { name: 'csrf-token', value: cookieToken })
  }
  return {
    method,
    cookies: {
      get(name: string) {
        return cookieMap.get(name)
      },
    },
    headers: {
      get(name: string) {
        if (name === 'x-csrf-token') return headerToken ?? null
        return null
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('CSRF module', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockCookieGet.mockReset()
    // Suppress verbose CSRF diagnostics during tests
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  // -----------------------------------------------------------------------
  // generateCSRFToken (tested indirectly via getCSRFToken)
  // -----------------------------------------------------------------------
  describe('generateCSRFToken (via getCSRFToken)', () => {
    it('produces a 64-char hex string when no cookie exists', async () => {
      mockCookieGet.mockReturnValue(undefined)

      const token = await getCSRFToken()

      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('returns the existing cookie value when one exists', async () => {
      const existing = 'a'.repeat(64)
      mockCookieGet.mockReturnValue({ value: existing })

      const token = await getCSRFToken()
      expect(token).toBe(existing)
    })
  })

  // -----------------------------------------------------------------------
  // validateCSRFToken
  // -----------------------------------------------------------------------
  describe('validateCSRFToken', () => {
    it('returns true for matching cookie + header tokens', async () => {
      const token = 'abc123'
      const req = makeRequest('POST', token, token)
      expect(await validateCSRFToken(req)).toBe(true)
    })

    it('returns false for mismatched tokens', async () => {
      const req = makeRequest('POST', 'token-a', 'token-b')
      expect(await validateCSRFToken(req)).toBe(false)
    })

    it.each(['GET', 'HEAD', 'OPTIONS'])(
      'returns true for safe method %s regardless of tokens',
      async (method) => {
        // No cookie, no header -- still passes because method is safe
        const req = makeRequest(method)
        expect(await validateCSRFToken(req)).toBe(true)
      },
    )

    it('returns false when cookie token is missing', async () => {
      const req = makeRequest('POST', undefined, 'header-token')
      expect(await validateCSRFToken(req)).toBe(false)
    })

    it('returns false when header token is missing', async () => {
      const req = makeRequest('POST', 'cookie-token', undefined)
      expect(await validateCSRFToken(req)).toBe(false)
    })

    it('returns false when both tokens are missing', async () => {
      const req = makeRequest('POST')
      expect(await validateCSRFToken(req)).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // setCSRFToken
  // -----------------------------------------------------------------------
  describe('setCSRFToken', () => {
    it('sets cookie with correct name and options', () => {
      const response = NextResponse.json({}) as unknown as { _setCalls: unknown[][] }
      setCSRFToken(response as unknown as InstanceType<typeof NextResponse>, 'my-token')

      expect(response._setCalls).toHaveLength(1)
      expect((response._setCalls[0] as unknown[])[0]).toBe('csrf-token')
      expect((response._setCalls[0] as unknown[])[1]).toBe('my-token')
      expect((response._setCalls[0] as unknown[])[2]).toMatchObject({
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
      })
    })
  })

  // -----------------------------------------------------------------------
  // requireCSRF
  // -----------------------------------------------------------------------
  describe('requireCSRF', () => {
    it('returns null when CSRF is valid', async () => {
      const req = makeRequest('POST', 'tok', 'tok')
      const result = await requireCSRF(req)
      expect(result).toBeNull()
    })

    it('returns a 403 response when CSRF is invalid', async () => {
      const req = makeRequest('POST', 'a', 'b')
      const result = await requireCSRF(req)
      expect(result).not.toBeNull()
      expect((result as unknown as { status: number }).status).toBe(403)
    })
  })

  // -----------------------------------------------------------------------
  // withCSRF wrapper
  // -----------------------------------------------------------------------
  describe('withCSRF', () => {
    it('skips validation for GET requests and calls handler', async () => {
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }))
      const wrapped = withCSRF(handler)

      const req = makeRequest('GET')
      await wrapped(req)

      expect(handler).toHaveBeenCalledWith(req)
    })

    it('skips validation for HEAD requests', async () => {
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }))
      const wrapped = withCSRF(handler)

      const req = makeRequest('HEAD')
      await wrapped(req)

      expect(handler).toHaveBeenCalledWith(req)
    })

    it('skips validation for OPTIONS requests', async () => {
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }))
      const wrapped = withCSRF(handler)

      const req = makeRequest('OPTIONS')
      await wrapped(req)

      expect(handler).toHaveBeenCalledWith(req)
    })

    it('blocks POST requests with invalid CSRF and returns 403', async () => {
      const handler = vi.fn()
      const wrapped = withCSRF(handler)

      const req = makeRequest('POST', 'a', 'b')
      const result = await wrapped(req)

      expect(handler).not.toHaveBeenCalled()
      expect((result as unknown as { status: number }).status).toBe(403)
    })

    it('calls handler for POST requests with valid CSRF', async () => {
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }))
      const wrapped = withCSRF(handler)

      const req = makeRequest('POST', 'valid', 'valid')
      await wrapped(req)

      expect(handler).toHaveBeenCalledWith(req)
    })

    it('passes context to handler', async () => {
      const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }))
      const wrapped = withCSRF(handler)

      const req = makeRequest('POST', 'tok', 'tok')
      const ctx = { params: { id: '123' } }
      await wrapped(req, ctx)

      expect(handler).toHaveBeenCalledWith(req, ctx)
    })
  })

  // -----------------------------------------------------------------------
  // getCSRFTokenFromCookie (client-side)
  // -----------------------------------------------------------------------
  describe('getCSRFTokenFromCookie', () => {
    const originalDocument = globalThis.document

    afterEach(() => {
      // Restore document after each test
      if (originalDocument) {
        Object.defineProperty(globalThis, 'document', {
          value: originalDocument,
          configurable: true,
          writable: true,
        })
      }
    })

    it('returns null when document is undefined (SSR)', () => {
      const saved = globalThis.document
      // @ts-expect-error - simulate SSR
      delete globalThis.document
      expect(getCSRFTokenFromCookie()).toBeNull()
      Object.defineProperty(globalThis, 'document', {
        value: saved,
        configurable: true,
        writable: true,
      })
    })

    it('extracts token from document.cookie string', () => {
      Object.defineProperty(globalThis, 'document', {
        value: { cookie: 'other=123; csrf-token=abcdef1234567890; another=xyz' },
        configurable: true,
        writable: true,
      })

      expect(getCSRFTokenFromCookie()).toBe('abcdef1234567890')
    })

    it('extracts token when it is the first cookie', () => {
      Object.defineProperty(globalThis, 'document', {
        value: { cookie: 'csrf-token=firstvalue; other=abc' },
        configurable: true,
        writable: true,
      })

      expect(getCSRFTokenFromCookie()).toBe('firstvalue')
    })

    it('returns null when csrf-token cookie is not present', () => {
      Object.defineProperty(globalThis, 'document', {
        value: { cookie: 'session=abc; theme=dark' },
        configurable: true,
        writable: true,
      })

      expect(getCSRFTokenFromCookie()).toBeNull()
    })

    it('returns null for empty cookie string', () => {
      Object.defineProperty(globalThis, 'document', {
        value: { cookie: '' },
        configurable: true,
        writable: true,
      })

      expect(getCSRFTokenFromCookie()).toBeNull()
    })
  })
})
