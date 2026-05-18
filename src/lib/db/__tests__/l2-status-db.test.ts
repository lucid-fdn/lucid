/**
 * L2 Status DB Functions — Unit Tests
 *
 * Tests updateRuntimeL2Deployment (passport_id param) and updateRuntimeL2Status
 * with mocked Supabase. Pattern mirrors runtime-db.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// ─── Chainable Supabase Mock ───

function createChain(resolveWith: { data: unknown; error: unknown } | null = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const fns = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'lt', 'gt', 'like', 'in',
    'order', 'limit', 'match', 'filter',
  ]
  for (const fn of fns) {
    chain[fn] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(resolveWith ?? { data: null, error: null })
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith ?? { data: null, error: null })
  const asPromise = resolveWith ?? { data: null, error: null }
  ;(chain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
    resolve(asPromise)
    return chain
  }
  return chain
}

let mockFromResults: Map<string, ReturnType<typeof createChain>>

const mockFrom = vi.fn((table: string) => {
  return mockFromResults.get(table) ?? createChain()
})

const mockCaptureException = vi.fn()

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...(args as [string])),
    rpc: vi.fn(),
  },
  ErrorService: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  },
}))

const mc = await import('../mission-control')

beforeEach(() => {
  vi.clearAllMocks()
  mockFromResults = new Map()
  mockFrom.mockImplementation((table: string) => {
    return mockFromResults.get(table) ?? createChain()
  })
})

// ─── updateRuntimeL2Deployment — passport_id ───

describe('updateRuntimeL2Deployment', () => {
  it('stores l2_passport_id when provided', async () => {
    const chain = createChain({ data: null, error: null })
    mockFromResults.set('dedicated_runtimes', chain)

    await mc.updateRuntimeL2Deployment('rt-1', 'org-1', 'l2-dep-1', 'https://railway.app/xxx', 'passport-abc')

    expect(mockFrom).toHaveBeenCalledWith('dedicated_runtimes')
    expect(chain.update).toHaveBeenCalledWith({
      l2_deployment_id: 'l2-dep-1',
      deployment_url: 'https://railway.app/xxx',
      managed_by_lucid: true,
      l2_passport_id: 'passport-abc',
    })
  })

  it('omits l2_passport_id when undefined (backward compat)', async () => {
    const chain = createChain({ data: null, error: null })
    mockFromResults.set('dedicated_runtimes', chain)

    await mc.updateRuntimeL2Deployment('rt-1', 'org-1', 'l2-dep-1', null)

    expect(chain.update).toHaveBeenCalledWith({
      l2_deployment_id: 'l2-dep-1',
      deployment_url: null,
      managed_by_lucid: true,
    })
  })

  it('stores null l2_passport_id when explicitly passed null', async () => {
    const chain = createChain({ data: null, error: null })
    mockFromResults.set('dedicated_runtimes', chain)

    await mc.updateRuntimeL2Deployment('rt-1', 'org-1', 'l2-dep-1', null, null)

    expect(chain.update).toHaveBeenCalledWith({
      l2_deployment_id: 'l2-dep-1',
      deployment_url: null,
      managed_by_lucid: true,
      l2_passport_id: null,
    })
  })

  it('logs error via ErrorService on failure', async () => {
    const chain = createChain({ data: null, error: { message: 'DB write failed' } })
    mockFromResults.set('dedicated_runtimes', chain)

    await mc.updateRuntimeL2Deployment('rt-1', 'org-1', 'l2-dep-1', null, 'passport-abc')

    expect(mockCaptureException).toHaveBeenCalledTimes(1)
    expect(mockCaptureException).toHaveBeenCalledWith(
      { message: 'DB write failed' },
      expect.objectContaining({
        context: expect.objectContaining({ l2PassportId: 'passport-abc' }),
      })
    )
  })
})

// ─── updateRuntimeL2Status ───

describe('updateRuntimeL2Status', () => {
  it('persists status snapshot with timestamp', async () => {
    const chain = createChain({ data: null, error: null })
    mockFromResults.set('dedicated_runtimes', chain)

    const before = new Date().toISOString()
    await mc.updateRuntimeL2Status('rt-1', 'running')

    expect(chain.update).toHaveBeenCalledTimes(1)
    const updateArg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(updateArg.last_l2_status).toBe('running')
    expect(updateArg.last_l2_error).toBeNull()
    expect(new Date(updateArg.last_l2_checked_at).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime())
  })

  it('persists error message when provided', async () => {
    const chain = createChain({ data: null, error: null })
    mockFromResults.set('dedicated_runtimes', chain)

    await mc.updateRuntimeL2Status('rt-1', 'failed', 'Build timeout')

    const updateArg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(updateArg.last_l2_status).toBe('failed')
    expect(updateArg.last_l2_error).toBe('Build timeout')
  })

  it('logs error via ErrorService on DB failure', async () => {
    const chain = createChain({ data: null, error: { message: 'Connection lost' } })
    mockFromResults.set('dedicated_runtimes', chain)

    await mc.updateRuntimeL2Status('rt-1', 'deploying')

    expect(mockCaptureException).toHaveBeenCalledTimes(1)
  })
})

// ─── getRuntimeById — new columns ───

describe('getRuntimeById maps L2 passport columns', () => {
  it('maps l2_passport_id and last_l2_* columns to camelCase', async () => {
    const chain = createChain({
      data: {
        id: 'rt-1', display_name: 'prod', description: null, provider: 'railway',
        status: 'connected', last_seen_at: '2026-03-22T12:00:00Z', openclaw_version: '2.4',
        cpu_percent: 45, ram_percent: 60, disk_percent: 30, gpu_percent: null,
        worker_pending_events: 0, worker_dead_letters: 0, agent_count: 3,
        deployment_url: null, l2_deployment_id: 'l2-dep-1',
        l2_passport_id: 'passport-abc',
        last_l2_status: 'running',
        last_l2_error: null,
        last_l2_checked_at: '2026-03-28T10:00:00Z',
        created_at: '2026-03-20T10:00:00Z',
      },
      error: null,
    })
    mockFromResults.set('dedicated_runtimes', chain)

    const result = await mc.getRuntimeById('rt-1', 'org-123')
    expect(result).not.toBeNull()
    expect(result!.engine).toBe('openclaw')
    expect(result!.runtimeFlavor).toBe('c1_managed')
    expect(result!.runtimeProtocol).toBe('lucid-runtime-v1')
    expect(result!.l2PassportId).toBe('passport-abc')
    expect(result!.lastL2Status).toBe('running')
    expect(result!.lastL2Error).toBeNull()
    expect(result!.lastL2CheckedAt).toBe('2026-03-28T10:00:00Z')
  })

  it('defaults new columns to null when absent', async () => {
    const chain = createChain({
      data: {
        id: 'rt-2', display_name: 'old-worker', description: null, provider: 'manual',
        status: 'connected', last_seen_at: null, openclaw_version: null,
        cpu_percent: null, ram_percent: null, disk_percent: null, gpu_percent: null,
        worker_pending_events: 0, worker_dead_letters: 0, agent_count: 0,
        deployment_url: null, l2_deployment_id: null,
        // No l2_passport_id or last_l2_* columns (old runtime)
        created_at: '2026-03-20T10:00:00Z',
      },
      error: null,
    })
    mockFromResults.set('dedicated_runtimes', chain)

    const result = await mc.getRuntimeById('rt-2', 'org-123')
    expect(result).not.toBeNull()
    expect(result!.engine).toBe('openclaw')
    expect(result!.runtimeFlavor).toBe('c1_managed')
    expect(result!.runtimeProtocol).toBe('lucid-runtime-v1')
    expect(result!.l2PassportId).toBeNull()
    expect(result!.lastL2Status).toBeNull()
    expect(result!.lastL2Error).toBeNull()
    expect(result!.lastL2CheckedAt).toBeNull()
  })
})
