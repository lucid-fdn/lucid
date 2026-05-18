/**
 * Phase 1b: complete-inbound API route tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only (used by Pulse redis-client)
vi.mock('server-only', () => ({}))

// Mock authenticateRuntime
vi.mock('../../_auth', () => ({
  authenticateRuntime: vi.fn(),
}))

// Typed error classes (must match the ones in mission-control.ts)
class RelayNotFoundError extends Error {
  constructor(message: string) { super(message); this.name = 'RelayNotFoundError' }
}
class RelayOwnershipError extends Error {
  constructor(message: string) { super(message); this.name = 'RelayOwnershipError' }
}

// Mock DB layer — include typed error classes for instanceof checks in route
vi.mock('@/lib/db/mission-control', () => ({
  completeInboundForRuntime: vi.fn(),
  RelayNotFoundError,
  RelayOwnershipError,
}))

// Mock Pulse modules
vi.mock('@/lib/pulse', () => ({
  completeForRuntime: vi.fn(),
  isPulseAvailable: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/pulse/redis-client', () => ({
  getPulseRedis: vi.fn().mockReturnValue(null),
}))

vi.mock('@contracts/pulse', () => ({
  PulseKeys: {
    lease: (runId: string) => `pulse:lease:${runId}`,
  },
}))

// Mock ErrorService
vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
    startSpan: vi.fn((_name: string, _op: string, cb: () => unknown) => cb()),
  },
}))

// Valid v4 UUIDs for test fixtures
const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const RUN_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'
const PULSE_RUN_ID = `${EVENT_ID}:1`

describe('POST /api/runtimes/messages/complete-inbound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue(null)

    const { POST } = await import('../complete-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/complete-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(401)
  })

  it('returns 400 on invalid body (missing eventId)', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
    })

    const { POST } = await import('../complete-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/complete-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responseText: 'Hello' }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })

  it('returns ok on successful completion with delivery', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
    })

    const { completeInboundForRuntime } = await import('@/lib/db/mission-control')
    vi.mocked(completeInboundForRuntime).mockResolvedValue({
      alreadyApplied: false,
      delivered: true,
      externalMessageId: 'ext_msg_42',
      channelType: 'telegram',
    })

    const { POST } = await import('../complete-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/complete-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: EVENT_ID,
        runId: RUN_ID,
        responseText: 'Hello from agent',
      }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('ok')
    expect(data.delivered).toBe(true)
    expect(data.externalMessageId).toBe('ext_msg_42')
  })

  it('returns already_applied for idempotent replay', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
    })

    const { completeInboundForRuntime } = await import('@/lib/db/mission-control')
    vi.mocked(completeInboundForRuntime).mockResolvedValue({
      alreadyApplied: true,
      delivered: true,
    })

    const { POST } = await import('../complete-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/complete-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: EVENT_ID,
        runId: RUN_ID,
        responseText: 'Hello from agent',
      }),
    })

    const res = await POST(req as any)
    const data = await res.json()
    expect(data.status).toBe('already_applied')
  })

  it('returns 404 when event not found', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
    })

    const { completeInboundForRuntime } = await import('@/lib/db/mission-control')
    vi.mocked(completeInboundForRuntime).mockRejectedValue(new RelayNotFoundError('Event abc not found'))

    const { POST } = await import('../complete-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/complete-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: EVENT_ID,
        runId: RUN_ID,
        responseText: 'Hello',
      }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(404)
  })

  it('returns 403 when event does not belong to runtime', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
    })

    const { completeInboundForRuntime } = await import('@/lib/db/mission-control')
    vi.mocked(completeInboundForRuntime).mockRejectedValue(
      new RelayOwnershipError('Event abc does not belong to runtime runtime-1')
    )

    const { POST } = await import('../complete-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/complete-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: EVENT_ID,
        runId: RUN_ID,
        responseText: 'Hello',
      }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(403)
  })

  it('includes tokenUsage when provided', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
    })

    const { completeInboundForRuntime } = await import('@/lib/db/mission-control')
    vi.mocked(completeInboundForRuntime).mockResolvedValue({
      alreadyApplied: false,
      delivered: true,
    })

    const { POST } = await import('../complete-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/complete-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: EVENT_ID,
        runId: RUN_ID,
        responseText: 'Hello',
        tokenUsage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
      }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(200)

    // Verify the payload was passed through
    expect(completeInboundForRuntime).toHaveBeenCalledWith(
      'runtime-1',
      'org-1',
      expect.objectContaining({
        tokenUsage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
      })
    )
  })

  it('accepts Pulse runIds and releases the matching retry attempt', async () => {
    const { authenticateRuntime } = await import('../../_auth')
    vi.mocked(authenticateRuntime).mockResolvedValue({
      id: 'runtime-1',
      orgId: 'org-1',
      generation: 1,
      status: 'connected',
    })

    const { completeInboundForRuntime } = await import('@/lib/db/mission-control')
    vi.mocked(completeInboundForRuntime).mockResolvedValue({
      alreadyApplied: false,
      delivered: true,
    })

    const { isPulseAvailable, completeForRuntime } = await import('@/lib/pulse')
    vi.mocked(isPulseAvailable).mockReturnValue(true)

    const { getPulseRedis } = await import('@/lib/pulse/redis-client')
    vi.mocked(getPulseRedis).mockReturnValue({
      get: vi.fn().mockResolvedValue(JSON.stringify({
        workerId: 'relay-runtime-1',
        agentId: '33333333-3333-3333-3333-333333333333',
      })),
    } as any)

    const { POST } = await import('../complete-inbound/route')
    const req = new Request('http://localhost/api/runtimes/messages/complete-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: EVENT_ID,
        runId: PULSE_RUN_ID,
        responseText: 'Hello from retry',
      }),
    })

    const res = await POST(req as any)
    expect(res.status).toBe(200)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(completeForRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: PULSE_RUN_ID,
        attempt: 1,
      }),
      'relay-runtime-1'
    )
  })
})
