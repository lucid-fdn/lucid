import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const originalEnv = { ...process.env }

describe('triggerInboundWorker', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    process.env.WORKER_URL = 'https://worker.example.com/'
    process.env.WORKER_TRIGGER_SECRET = 'worker-secret'
  })

  it('triggers the worker with auth and a bounded abort signal', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const { triggerInboundWorker } = await import('../worker-trigger')
    await triggerInboundWorker('[test]')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://worker.example.com/trigger',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer worker-secret',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ event_type: 'inbound' }),
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('does not call fetch when the worker URL is missing', async () => {
    delete process.env.WORKER_URL
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { triggerInboundWorker } = await import('../worker-trigger')
    await triggerInboundWorker('[test]')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
