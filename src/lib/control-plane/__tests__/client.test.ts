import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const originalEnv = { ...process.env }

describe('control-plane client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    process.env.CONTROL_PLANE_URL = 'https://control.example.com/'
    process.env.ENTITLEMENTS_API_KEY = 'entitlements-key'
  })

  it('falls back without error-level logging when entitlements upstream returns 5xx', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => new Response('{"error":"Internal Server Error"}', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const { getEntitlements } = await import('../client')

    await expect(getEntitlements('org-1')).resolves.toBeNull()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://control.example.com/v1/entitlements/org-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer entitlements-key',
          'Content-Type': 'application/json',
        }),
        signal: expect.any(AbortSignal),
      }),
    )
    expect(warn).toHaveBeenCalledWith(
      '[control-plane] GET /v1/entitlements/org-1 returned 500; falling back to local entitlements',
      { body: '{"error":"Internal Server Error"}' },
    )
    expect(error).not.toHaveBeenCalled()
  })

  it('throttles repeated fallback warnings for the same upstream failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 502 })))

    const { getEntitlements } = await import('../client')

    await getEntitlements('org-1')
    await getEntitlements('org-1')

    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does not call fetch when control-plane is not configured', async () => {
    delete process.env.CONTROL_PLANE_URL
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { getEntitlements } = await import('../client')

    await expect(getEntitlements('org-1')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
