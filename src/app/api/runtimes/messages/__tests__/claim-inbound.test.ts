/**
 * Phase 1b: claim-inbound API route tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supportsRuntimeFlavor, supportsRuntimeConfiguration } from '@lucid/runtime-compat'

// Mock server-only (used by Pulse redis-client)
vi.mock('server-only', () => ({}))

// Mock authenticateRuntime
vi.mock('../../_auth', () => ({
  authenticateRuntime: vi.fn(),
}))

// Mock DB layer
vi.mock('@/lib/db/mission-control', () => ({
  claimInboundForRuntime: vi.fn(),
  buildRunPacketById: vi.fn(),
}))

// Mock Pulse modules
vi.mock('@/lib/pulse', () => ({
  claimForRuntime: vi.fn(),
  completeForRuntime: vi.fn(),
  failForRuntime: vi.fn(),
  isPulseAvailable: vi.fn().mockReturnValue(false),
}))

// Mock ErrorService
vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
    startSpan: vi.fn((_name: string, _op: string, cb: () => unknown) => cb()),
  },
}))

vi.mock('@/lib/engines/registry', () => ({
  ENGINE_OPTIONS: [{ key: 'openclaw' }, { key: 'hermes' }, { key: 'lucid' }],
  getEngineDefinition: vi.fn((engine: string) => ({
    label: engine === 'hermes' ? 'Hermes' : engine === 'lucid' ? 'Lucid' : 'OpenClaw',
  })),
}))

vi.mock('@lucid/runtime-compat', async () => {
  const actual = await vi.importActual<typeof import('@lucid/runtime-compat')>('@lucid/runtime-compat')
  return {
    ...actual,
    supportsRuntimeFlavor: vi.fn(() => true),
    supportsRuntimeConfiguration: vi.fn(() => true),
  }
})

describe('POST /api/runtimes/messages/claim-inbound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supportsRuntimeFlavor).mockReturnValue(true)
    vi.mocked(supportsRuntimeConfiguration).mockReturnValue(true)
  })

  it('returns 401 when not authenticated', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue(null)

    const { POST } = await import('../claim-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/claim-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize: 5 }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(401)
  })

  it('returns 400 on invalid body', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
    })

    const { POST } = await import('../claim-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/claim-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize: 999 }), // exceeds max of 50
    })

    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })

  it('returns 409 for runtimes using native Pulse transport', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
      dedicatedTransportMode: 'native_pulse',
    })

    const { POST } = await import('../claim-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/claim-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize: 5 }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: 'This runtime uses native Pulse and cannot claim work through relay APIs',
    })
  })

  it('returns packets on success', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
    })

    const { claimInboundForRuntime } = await import('@/lib/db/mission-control')
    const mockPackets = [{ eventId: 'evt-1', idempotencyToken: 'tok-1' }]
    vi.mocked(claimInboundForRuntime).mockResolvedValue(mockPackets as any)

    const { POST } = await import('../claim-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/claim-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize: 5 }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.packets).toHaveLength(1)
    expect(data.packets[0].eventId).toBe('evt-1')
  })

  it('bypasses Pulse and claims directly from DB for relay runtimes', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
      dedicatedTransportMode: 'relay',
    })

    const { isPulseAvailable, claimForRuntime } = await import('@/lib/pulse')
    vi.mocked(isPulseAvailable).mockReturnValue(true)

    const { claimInboundForRuntime } = await import('@/lib/db/mission-control')
    vi.mocked(claimInboundForRuntime).mockResolvedValue([{ eventId: 'evt-db-1' }] as any)

    const { POST } = await import('../claim-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/claim-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize: 1, waitMs: 0 }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      packets: [{ eventId: 'evt-db-1' }],
      source: 'db',
      degradedMode: true,
    })
    expect(claimForRuntime).not.toHaveBeenCalled()
  })

  it('returns 409 when engine does not support runtime flavor', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
      engine: 'lucid',
      runtimeFlavor: 'c1_managed',
    })

    const { supportsRuntimeFlavor } = await import('@lucid/runtime-compat')
    vi.mocked(supportsRuntimeFlavor).mockReturnValue(false)

    const { POST } = await import('../claim-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/claim-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize: 5 }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'Lucid does not support c1_managed' })
  })

  it('returns 409 when engine does not support runtime configuration', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
      engine: 'hermes',
      runtimeFlavor: 'c2a_autonomous',
    })

    const { supportsRuntimeConfiguration } = await import('@lucid/runtime-compat')
    vi.mocked(supportsRuntimeConfiguration).mockReturnValue(false)

    const { POST } = await import('../claim-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/claim-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize: 5 }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: 'Hermes does not support runtime_native for c2a_autonomous',
    })
  })

  it('returns empty packets array when no events', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
    })

    const { claimInboundForRuntime } = await import('@/lib/db/mission-control')
    vi.mocked(claimInboundForRuntime).mockResolvedValue([])

    const { POST } = await import('../claim-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/claim-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize: 10, waitMs: 0 }),
    })

    const res = await POST(req as any)
    const data = await res.json()
    expect(data.packets).toEqual([])
  })

  it('honors waitMs on the DB fallback path and retries before returning', async () => {
    vi.useFakeTimers()
    try {
      const { authenticateRuntime } = await import('../../_auth')
      vi.mocked(authenticateRuntime).mockResolvedValue({
        id: 'runtime-1',
        orgId: 'org-1',
        generation: 1,
        status: 'connected',
      })

      const { claimInboundForRuntime } = await import('@/lib/db/mission-control')
      vi.mocked(claimInboundForRuntime)
        .mockResolvedValueOnce([] as any)
        .mockResolvedValueOnce([{ eventId: 'evt-delayed-1' }] as any)

      const { POST } = await import('../claim-inbound/route')
      const req = new Request('http://localhost/api/runtimes/messages/claim-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 1, waitMs: 500 }),
      })

      const pending = POST(req as any)
      await vi.advanceTimersByTimeAsync(500)
      const res = await pending

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toMatchObject({
        packets: [{ eventId: 'evt-delayed-1' }],
        source: 'db',
      })
      expect(claimInboundForRuntime).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
