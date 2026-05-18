/**
 * Runtime Tier — DB Layer Tests
 *
 * Verifies that createRuntime correctly persists runtimeTier to the DB,
 * and that getRuntimes maps runtime_tier from the RPC response.
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
let rpcResults: Map<string, { data: unknown; error: unknown }>

const mockFrom = vi.fn((table: string) => {
  return mockFromResults.get(table) ?? createChain()
})
const mockRpc = vi.fn((fn: string) => {
  return Promise.resolve(rpcResults.get(fn) ?? { data: null, error: null })
})

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...(args as [string])),
    rpc: (...args: unknown[]) => mockRpc(...(args as [string])),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

const mc = await import('../../db/mission-control')

beforeEach(() => {
  vi.clearAllMocks()
  mockFromResults = new Map()
  rpcResults = new Map()
  mockFrom.mockImplementation((table: string) => {
    return mockFromResults.get(table) ?? createChain()
  })
  mockRpc.mockImplementation((fn: string) => {
    return Promise.resolve(rpcResults.get(fn) ?? { data: null, error: null })
  })
})

// ─── createRuntime with runtimeTier ───

describe('createRuntime — runtimeTier', () => {
  it('passes runtimeTier to insert when provided', async () => {
    const chain = createChain({ data: { id: 'rt-dedicated' }, error: null })
    mockFromResults.set('dedicated_runtimes', chain)

    await mc.createRuntime({
      orgId: 'org-1',
      displayName: 'dedicated-runtime',
      provider: 'railway',
      apiKeyHash: 'hash',
      runtimeTier: 'dedicated',
    })

    expect(mockFrom).toHaveBeenCalledWith('dedicated_runtimes')
    // Verify the insert was called (chain.insert is the mock)
    expect(chain.insert).toHaveBeenCalledTimes(1)
    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.runtime_tier).toBe('dedicated')
  })

  it('passes byo runtimeTier to insert', async () => {
    const chain = createChain({ data: { id: 'rt-byo' }, error: null })
    mockFromResults.set('dedicated_runtimes', chain)

    await mc.createRuntime({
      orgId: 'org-1',
      displayName: 'byo-runtime',
      provider: 'docker',
      apiKeyHash: 'hash',
      runtimeTier: 'byo',
    })

    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.runtime_tier).toBe('byo')
  })

  it('passes null runtime_tier when runtimeTier omitted', async () => {
    const chain = createChain({ data: { id: 'rt-legacy' }, error: null })
    mockFromResults.set('dedicated_runtimes', chain)

    await mc.createRuntime({
      orgId: 'org-1',
      displayName: 'legacy-runtime',
      provider: 'railway',
      apiKeyHash: 'hash',
    })

    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.runtime_tier).toBeNull()
  })

  it('passes null runtime_tier when runtimeTier is explicitly null', async () => {
    const chain = createChain({ data: { id: 'rt-null' }, error: null })
    mockFromResults.set('dedicated_runtimes', chain)

    await mc.createRuntime({
      orgId: 'org-1',
      displayName: 'null-tier',
      provider: 'railway',
      apiKeyHash: 'hash',
      runtimeTier: null,
    })

    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.runtime_tier).toBeNull()
  })

  it('includes pendingAgentName fields alongside runtimeTier', async () => {
    const chain = createChain({ data: { id: 'rt-with-agent' }, error: null })
    mockFromResults.set('dedicated_runtimes', chain)

    await mc.createRuntime({
      orgId: 'org-1',
      displayName: 'with-agent',
      provider: 'railway',
      apiKeyHash: 'hash',
      runtimeTier: 'dedicated',
      pendingAgentName: 'My Agent',
      pendingAgentUserId: 'user-1',
    })

    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg.runtime_tier).toBe('dedicated')
    expect(insertArg.pending_agent_name).toBe('My Agent')
    expect(insertArg.pending_agent_user_id).toBe('user-1')
    expect(insertArg.intent_status).toBe('pending')
  })
})

// ─── getRuntimes maps runtime_tier ───

describe('getRuntimes — runtime_tier mapping', () => {
  it('maps runtime_tier from RPC response', async () => {
    mockFromResults.set('dedicated_runtimes', createChain({
      data: [
        {
          id: 'rt-1',
          display_name: 'dedicated-prod',
          description: null,
          provider: 'railway',
          status: 'connected',
          runtime_tier: 'dedicated',
          last_seen_at: '2026-03-29T12:00:00Z',
          openclaw_version: '2.4',
          cpu_percent: 45,
          ram_percent: 60,
          disk_percent: 30,
          gpu_percent: null,
          worker_pending_events: 0,
          worker_dead_letters: 0,
          agent_count: 1,
          deployment_url: 'https://railway.app/xxx',
          l2_deployment_id: 'l2-1',
          created_at: '2026-03-29T10:00:00Z',
        },
        {
          id: 'rt-2',
          display_name: 'byo-docker',
          description: 'User Docker runtime',
          provider: 'docker',
          status: 'pending',
          runtime_tier: 'byo',
          last_seen_at: null,
          openclaw_version: null,
          cpu_percent: null,
          ram_percent: null,
          disk_percent: null,
          gpu_percent: null,
          worker_pending_events: 0,
          worker_dead_letters: 0,
          agent_count: 0,
          deployment_url: null,
          l2_deployment_id: null,
          created_at: '2026-03-29T11:00:00Z',
        },
        {
          id: 'rt-3',
          display_name: 'legacy-no-tier',
          description: null,
          provider: 'railway',
          status: 'connected',
          runtime_tier: null,
          last_seen_at: '2026-03-29T12:00:00Z',
          openclaw_version: '2.3',
          cpu_percent: 30,
          ram_percent: 40,
          disk_percent: 20,
          gpu_percent: null,
          worker_pending_events: 0,
          worker_dead_letters: 0,
          agent_count: 2,
          deployment_url: 'https://railway.app/yyy',
          l2_deployment_id: 'l2-2',
          created_at: '2026-03-20T10:00:00Z',
        },
      ],
      error: null,
    }))

    const result = await mc.getRuntimes('org-1')
    expect(result).toHaveLength(3)

    // Dedicated runtime
    expect(result[0].runtimeTier).toBe('dedicated')
    expect(result[0].displayName).toBe('dedicated-prod')

    // BYO runtime
    expect(result[1].runtimeTier).toBe('byo')
    expect(result[1].provider).toBe('docker')

    // Legacy runtime (null tier)
    expect(result[2].runtimeTier).toBeNull()
  })
})
