/**
 * checkRuntimeOfflineEvents — Redis-first offline detection
 *
 * Tests that when Redis has fresh heartbeat data, runtimes are NOT falsely
 * marked stale (preventing false positives from the 5s Postgres drain lag).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only to allow importing in test environment
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

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...(args as [string])),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

// ─── Redis Mock ───

let mockRedisAvailable = false
let mockRedisMetrics = new Map<string, { lastSeenAt: string; cpuPercent: number; ramPercent: number; diskPercent: number; gpuPercent: null; generation: number }>()
let mockRedisThrows = false

vi.mock('@/lib/redis/streams', () => ({
  isRedisAvailable: () => mockRedisAvailable,
  getLiveMetrics: async (ids: string[]) => {
    if (mockRedisThrows) throw new Error('Redis connection refused')
    const result = new Map<string, unknown>()
    for (const id of ids) {
      const m = mockRedisMetrics.get(id)
      if (m) result.set(id, m)
    }
    return result
  },
}))

// Import AFTER mocks
const mc = await import('../../db/mission-control')

beforeEach(() => {
  mockFromResults = new Map()
  mockRedisAvailable = false
  mockRedisMetrics = new Map()
  mockRedisThrows = false
  vi.clearAllMocks()
})

// ─── Helpers ───

const now = new Date()
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000).toISOString()

function makeRuntime(id: string, lastSeenAt: string) {
  return { id, org_id: 'org-1', display_name: `Runtime ${id}`, last_seen_at: lastSeenAt }
}

function setupConnectedRuntimes(runtimes: ReturnType<typeof makeRuntime>[]) {
  const selectChain = createChain({ data: runtimes, error: null })
  const updateStaleChain = createChain({ data: [], error: null })
  const updateOfflineChain = createChain({ data: [], error: null })
  const insertChain = createChain({ data: null, error: null })

  let runtimeCallCount = 0
  mockFrom.mockImplementation((table: string) => {
    if (table === 'runtime_events') return insertChain
    if (table === 'dedicated_runtimes') {
      runtimeCallCount++
      // When no connected runtimes, stale update is skipped so call 2 is offline
      if (runtimeCallCount === 1) return selectChain   // Step 1: select connected
      if (runtimes.length === 0) {
        // No connected runtimes → no stale update → call 2 is offline transition
        if (runtimeCallCount === 2) return updateOfflineChain
      } else {
        if (runtimeCallCount === 2) return updateStaleChain  // Step 4: update stale
        if (runtimeCallCount === 3) return updateOfflineChain // Step 5: update offline
      }
    }
    return createChain()
  })

  return { selectChain, updateStaleChain, updateOfflineChain, insertChain }
}

// ─── Tests ───

describe('checkRuntimeOfflineEvents — Redis-first detection', () => {
  it('skips runtime when Redis has fresh lastSeenAt (prevents false positive)', async () => {
    // Postgres says 6 min ago (stale), but Redis says 10 seconds ago (fresh)
    const rt = makeRuntime('rt-1', minutesAgo(6))
    const { updateStaleChain } = setupConnectedRuntimes([rt])

    mockRedisAvailable = true
    mockRedisMetrics.set('rt-1', {
      lastSeenAt: minutesAgo(0.16), // ~10 seconds ago
      cpuPercent: 20,
      ramPercent: 40,
      diskPercent: 30,
      gpuPercent: null,
      generation: 1,
    })

    const result = await mc.checkRuntimeOfflineEvents()

    // Should NOT have called update with rt-1 since Redis shows it's alive
    expect(updateStaleChain.in).not.toHaveBeenCalled()
    expect(result.updated).toBe(0)
  })

  it('marks runtime stale when both Redis and Postgres are stale', async () => {
    const rt = makeRuntime('rt-2', minutesAgo(10))
    const { updateStaleChain } = setupConnectedRuntimes([rt])

    // Simulate update returning the stale runtime
    ;(updateStaleChain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
      resolve({ data: [{ id: 'rt-2' }], error: null })
      return updateStaleChain
    }

    mockRedisAvailable = true
    mockRedisMetrics.set('rt-2', {
      lastSeenAt: minutesAgo(8), // Also stale in Redis
      cpuPercent: 20,
      ramPercent: 40,
      diskPercent: 30,
      gpuPercent: null,
      generation: 1,
    })

    const result = await mc.checkRuntimeOfflineEvents()

    // Should have called .in('id', ['rt-2']) to mark stale
    expect(updateStaleChain.in).toHaveBeenCalledWith('id', ['rt-2'])
    expect(result.updated).toBe(1)
  })

  it('marks runtime stale when Redis has no data for it (missing key)', async () => {
    const rt = makeRuntime('rt-3', minutesAgo(7))
    const { updateStaleChain } = setupConnectedRuntimes([rt])

    ;(updateStaleChain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
      resolve({ data: [{ id: 'rt-3' }], error: null })
      return updateStaleChain
    }

    mockRedisAvailable = true
    // No Redis entry for rt-3 — falls back to Postgres only

    const result = await mc.checkRuntimeOfflineEvents()

    expect(updateStaleChain.in).toHaveBeenCalledWith('id', ['rt-3'])
    expect(result.updated).toBe(1)
  })

  it('falls back to Postgres-only when Redis is unavailable', async () => {
    const rt = makeRuntime('rt-4', minutesAgo(7))
    const { updateStaleChain } = setupConnectedRuntimes([rt])

    ;(updateStaleChain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
      resolve({ data: [{ id: 'rt-4' }], error: null })
      return updateStaleChain
    }

    mockRedisAvailable = false

    const result = await mc.checkRuntimeOfflineEvents()

    // Should still mark stale based on Postgres alone
    expect(updateStaleChain.in).toHaveBeenCalledWith('id', ['rt-4'])
    expect(result.updated).toBe(1)
  })

  it('falls back to Postgres-only when Redis throws', async () => {
    const rt = makeRuntime('rt-5', minutesAgo(7))
    const { updateStaleChain } = setupConnectedRuntimes([rt])

    ;(updateStaleChain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
      resolve({ data: [{ id: 'rt-5' }], error: null })
      return updateStaleChain
    }

    mockRedisAvailable = true
    mockRedisThrows = true

    const result = await mc.checkRuntimeOfflineEvents()

    // Should still mark stale based on Postgres alone despite Redis error
    expect(updateStaleChain.in).toHaveBeenCalledWith('id', ['rt-5'])
    expect(result.updated).toBe(1)
  })

  it('stale to offline transition still works (Postgres-only, 1hr threshold)', async () => {
    // No connected runtimes — just testing stale → offline
    const { updateOfflineChain, insertChain } = setupConnectedRuntimes([])

    const offlineRt = { id: 'rt-6', org_id: 'org-1', display_name: 'Old Runtime' }
    ;(updateOfflineChain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
      resolve({ data: [offlineRt], error: null })
      return updateOfflineChain
    }

    const result = await mc.checkRuntimeOfflineEvents()

    // Should have transitioned stale → offline
    expect(updateOfflineChain.eq).toHaveBeenCalledWith('status', 'stale')
    expect(result.updated).toBe(1)
  })

  it('emits feed events for newly offline runtimes', async () => {
    const { updateOfflineChain, insertChain } = setupConnectedRuntimes([])

    const offlineRt = { id: 'rt-7', org_id: 'org-1', display_name: 'Dead Runtime' }
    ;(updateOfflineChain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
      resolve({ data: [offlineRt], error: null })
      return updateOfflineChain
    }
    ;(insertChain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
      resolve({ error: null })
      return insertChain
    }

    const result = await mc.checkRuntimeOfflineEvents()

    expect(insertChain.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        runtime_id: 'rt-7',
        org_id: 'org-1',
        event_type: 'error',
        severity: 'warning',
        payload: expect.objectContaining({
          type: 'runtime_offline',
          runtimeName: 'Dead Runtime',
        }),
      }),
    ])
    expect(result.eventsInserted).toBe(1)
  })

  it('uses fresher of Redis vs Postgres when both available', async () => {
    // Postgres says 6 min ago (stale), Redis says 3 min ago (within 5 min threshold = not stale)
    const rt = makeRuntime('rt-8', minutesAgo(6))
    const { updateStaleChain } = setupConnectedRuntimes([rt])

    mockRedisAvailable = true
    mockRedisMetrics.set('rt-8', {
      lastSeenAt: minutesAgo(3), // 3 min ago — within 5 min threshold
      cpuPercent: 20,
      ramPercent: 40,
      diskPercent: 30,
      gpuPercent: null,
      generation: 1,
    })

    const result = await mc.checkRuntimeOfflineEvents()

    // Redis shows 3 min ago (fresh), so should NOT be marked stale
    expect(updateStaleChain.in).not.toHaveBeenCalled()
    expect(result.updated).toBe(0)
  })

  it('returns zero counts when no connected runtimes exist', async () => {
    const { updateOfflineChain } = setupConnectedRuntimes([])

    ;(updateOfflineChain as Record<string, unknown>).then = (resolve: (v: unknown) => void) => {
      resolve({ data: null, error: null })
      return updateOfflineChain
    }

    const result = await mc.checkRuntimeOfflineEvents()

    expect(result.updated).toBe(0)
    expect(result.eventsInserted).toBe(0)
  })
})
