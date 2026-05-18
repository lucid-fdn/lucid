import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const verifyInternalAuthMock = vi.fn()
const captureExceptionMock = vi.fn()
const syncHostedTelegramSurfaceMock = vi.fn()
const fetchMock = vi.fn()

vi.mock('@/lib/trading/internal-auth', () => ({
  verifyInternalAuth: (...args: unknown[]) => verifyInternalAuthMock(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: (...args: unknown[]) => captureExceptionMock(...args) },
}))

vi.mock('@/lib/telegram/bot-commands', () => ({
  syncHostedTelegramSurface: (...args: unknown[]) => syncHostedTelegramSurfaceMock(...args),
}))

describe('POST /api/internal/telegram/hosted/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TELEGRAM_HOSTED_BOT_TOKEN = 'test-bot-token'
    process.env.TELEGRAM_HOSTED_WEBHOOK_SECRET = 'test-secret'
    process.env.TELEGRAM_HOSTED_WEBHOOK_BASE_URL = 'https://www.lucid.foundation'
    vi.stubGlobal('fetch', fetchMock)
  })

  it('rejects unauthenticated requests', async () => {
    verifyInternalAuthMock.mockResolvedValue({ valid: false, error: 'Authentication failed' })

    const { POST } = await import('../sync/route')
    const res = await POST(new Request('http://localhost/api/internal/telegram/hosted/sync', {
      method: 'POST',
      body: '{}',
    }) as never)

    expect(res.status).toBe(401)
  })

  it('syncs commands and webhook', async () => {
    verifyInternalAuthMock.mockResolvedValue({ valid: true, body: '{}', requestId: 'req-1' })
    syncHostedTelegramSurfaceMock.mockResolvedValue({
      commands: { ok: true },
      shortDescription: { ok: true },
      description: { ok: true },
      menuButton: { ok: true, url: 'https://www.lucid.foundation/telegram/mini-app' },
    })
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })

    const { POST } = await import('../sync/route')
    const res = await POST(new Request('http://localhost/api/internal/telegram/hosted/sync', {
      method: 'POST',
      body: '{}',
    }) as never)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      surface: {
        commands: { ok: true },
        shortDescription: { ok: true },
        description: { ok: true },
        menuButton: {
          ok: true,
          url: 'https://www.lucid.foundation/telegram/mini-app',
        },
      },
      webhook: {
        ok: true,
        webhookUrl: 'https://www.lucid.foundation/api/webhooks/telegram/hosted',
      },
    })
    expect(syncHostedTelegramSurfaceMock).toHaveBeenCalledWith(
      'test-bot-token',
      'https://www.lucid.foundation',
    )
  })
}, 20_000)
