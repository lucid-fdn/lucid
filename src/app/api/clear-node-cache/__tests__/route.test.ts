import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const clearNodesCache = vi.fn()

vi.mock('@/lib/lucid-l2/node-service', () => ({
  clearNodesCache: () => clearNodesCache(),
}))

describe('/api/clear-node-cache', () => {
  let previousWorkerSecret: string | undefined
  let previousInternalSecret: string | undefined

  beforeEach(() => {
    previousWorkerSecret = process.env.WORKER_TRIGGER_SECRET
    previousInternalSecret = process.env.INTERNAL_SERVICE_SECRET
    process.env.WORKER_TRIGGER_SECRET = 'worker-secret'
    delete process.env.INTERNAL_SERVICE_SECRET
    clearNodesCache.mockReset()
  })

  afterEach(() => {
    if (previousWorkerSecret == null) delete process.env.WORKER_TRIGGER_SECRET
    else process.env.WORKER_TRIGGER_SECRET = previousWorkerSecret
    if (previousInternalSecret == null) delete process.env.INTERNAL_SERVICE_SECRET
    else process.env.INTERNAL_SERVICE_SECRET = previousInternalSecret
  })

  it('rejects unauthenticated cache clears', async () => {
    const { POST } = await import('../route')

    const response = await POST(new Request('https://lucid.test/api/clear-node-cache', { method: 'POST' }))

    expect(response.status).toBe(401)
    expect(clearNodesCache).not.toHaveBeenCalled()
  })

  it('clears the cache with internal bearer auth', async () => {
    const { POST } = await import('../route')

    const response = await POST(new Request('https://lucid.test/api/clear-node-cache', {
      method: 'POST',
      headers: { authorization: 'Bearer worker-secret' },
    }))

    expect(response.status).toBe(200)
    expect(clearNodesCache).toHaveBeenCalledOnce()
  })

  it('accepts the internal service secret when both internal secrets are configured', async () => {
    process.env.INTERNAL_SERVICE_SECRET = 'internal-secret'
    const { POST } = await import('../route')

    const response = await POST(new Request('https://lucid.test/api/clear-node-cache', {
      method: 'POST',
      headers: { authorization: 'Bearer internal-secret' },
    }))

    expect(response.status).toBe(200)
    expect(clearNodesCache).toHaveBeenCalledOnce()
  })
})
