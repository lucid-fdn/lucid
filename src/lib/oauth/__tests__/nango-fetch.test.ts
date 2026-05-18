import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
  },
}))

describe('createNangoSessionToken', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    process.env = {
      ...originalEnv,
      NANGO_SECRET_KEY: 'test-secret',
      NEXT_PUBLIC_OAUTH_API_URL: 'https://oauth.example.test',
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    process.env = originalEnv
  })

  it('retries one transient HTTP failure before returning a session token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockResolvedValueOnce(Response.json({
        data: {
          token: 'session-token',
          connect_link: 'https://oauth.example.test/nango?session_token=session-token',
          expires_at: '2026-05-01T12:00:00.000Z',
        },
      }, { status: 201 }))

    vi.stubGlobal('fetch', fetchMock)

    const { createNangoSessionToken } = await import('@/lib/oauth/nango-fetch')
    const promise = createNangoSessionToken({
      userId: 'user-1',
      provider: 'google',
    })

    await vi.advanceTimersByTimeAsync(250)

    await expect(promise).resolves.toMatchObject({
      ok: true,
      status: 201,
      data: {
        data: {
          token: 'session-token',
        },
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
