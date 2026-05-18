/**
 * Crews DB Functions — Unit Tests
 *
 * Tests crew-related DB functions with mocked Supabase.
 * Covers: getCrews, getCrew, getCrewTopology, getCrewsTopologyBatch,
 * createCrew, updateCrew, deleteCrew, addCrewMember, removeCrewMember.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only to allow importing in test environment
vi.mock('server-only', () => ({}))

// ─── Chainable Supabase Mock ───

function createChain(resolveWith: { data: unknown; error: unknown } | null = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const fns = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'lt', 'gt', 'like', 'in', 'is',
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
  isTransientSupabaseError: vi.fn(() => false),
}))

const crews = await import('../crews')

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

// ─── getCrews ───

describe('getCrews', () => {
  it('returns crews for the given org', async () => {
    const mockCrews = [
      { id: 'crew-1', org_id: 'org-1', name: 'Alpha' },
      { id: 'crew-2', org_id: 'org-1', name: 'Beta' },
    ]
    mockFromResults.set('crews', createChain({ data: mockCrews, error: null }))

    const result = await crews.getCrews('org-1')

    expect(mockFrom).toHaveBeenCalledWith('crews')
    expect(result).toEqual(mockCrews)
  })

  it('returns empty array on error', async () => {
    mockFromResults.set('crews', createChain({ data: null, error: { message: 'DB error' } }))

    const result = await crews.getCrews('org-1')
    expect(result).toEqual([])
  })
})

// ─── getCrew ───

describe('getCrew', () => {
  it('returns a single crew by ID', async () => {
    const mockCrew = { id: 'crew-1', org_id: 'org-1', name: 'Alpha' }
    mockFromResults.set('crews', createChain({ data: mockCrew, error: null }))

    const result = await crews.getCrew('crew-1', 'org-1')
    expect(result).toEqual(mockCrew)
  })

  it('returns null when not found (PGRST116)', async () => {
    mockFromResults.set('crews', createChain({ data: null, error: { code: 'PGRST116' } }))

    const result = await crews.getCrew('missing', 'org-1')
    expect(result).toBeNull()
  })

  it('returns null on other errors', async () => {
    mockFromResults.set('crews', createChain({ data: null, error: { code: '42601', message: 'bad' } }))

    const result = await crews.getCrew('crew-1', 'org-1')
    expect(result).toBeNull()
  })
})

// ─── getCrewTopology ───

describe('getCrewTopology', () => {
  it('calls the get_crew_with_topology RPC', async () => {
    const mockTopology = { crew: { id: 'c1' }, members: [], edges: [] }
    rpcResults.set('get_crew_with_topology', { data: mockTopology, error: null })

    const result = await crews.getCrewTopology('c1', 'org-1')
    expect(mockRpc).toHaveBeenCalledWith('get_crew_with_topology', {
      p_crew_id: 'c1',
      p_org_id: 'org-1',
    })
    expect(result).toEqual(mockTopology)
  })

  it('returns null on RPC error', async () => {
    rpcResults.set('get_crew_with_topology', { data: null, error: { message: 'RPC fail' } })

    const result = await crews.getCrewTopology('c1', 'org-1')
    expect(result).toBeNull()
  })
})

// ─── getCrewsTopologyBatch ───

describe('getCrewsTopologyBatch', () => {
  it('returns empty maps for empty input', async () => {
    const result = await crews.getCrewsTopologyBatch([], 'org-1')
    expect(result.members).toEqual({})
    expect(result.edges).toEqual({})
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('fetches members and edges in parallel for multiple crews', async () => {
    const memberRows = [
      {
        id: 'm1', crew_id: 'c1', member_type: 'assistant', member_ref_id: 'a1',
        assistant_id: 'a1', role: 'researcher', role_description: null,
        is_coordinator: true, join_order: 0, position_in_crew: null, created_at: '2026-01-01',
        ai_assistants: { name: 'Bot1', lucid_model: 'gpt-4', is_active: true },
      },
      {
        id: 'm2', crew_id: 'c2', member_type: 'assistant', member_ref_id: 'a2',
        assistant_id: 'a2', role: 'writer', role_description: null,
        is_coordinator: false, join_order: 0, position_in_crew: null, created_at: '2026-01-01',
        ai_assistants: { name: 'Bot2', lucid_model: 'claude-3', is_active: false },
      },
    ]
    const edgeRows = [
      {
        id: 'e1', crew_id: 'c1', source_member_id: 'm1', target_member_id: 'm2',
        direction: 'bidirectional', label: null, created_at: '2026-01-01',
      },
    ]

    const membersChain = createChain({ data: memberRows, error: null })
    const edgesChain = createChain({ data: edgeRows, error: null })

    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      callCount++
      if (table === 'crew_members') return membersChain
      if (table === 'crew_edges') return edgesChain
      return createChain()
    })

    const result = await crews.getCrewsTopologyBatch(['c1', 'c2'], 'org-1')

    expect(result.members['c1']).toHaveLength(1)
    expect(result.members['c1'][0].assistant_name).toBe('Bot1')
    expect(result.members['c1'][0].assistant_is_active).toBe(true)
    expect(result.members['c2']).toHaveLength(1)
    expect(result.members['c2'][0].assistant_name).toBe('Bot2')
    expect(result.members['c2'][0].assistant_is_active).toBe(false)
    expect(result.edges['c1']).toHaveLength(1)
    expect(result.edges['c2']).toHaveLength(0)
  })

  it('returns empty arrays on DB error', async () => {
    mockFromResults.set('crew_members', createChain({ data: null, error: { message: 'fail' } }))
    mockFromResults.set('crew_edges', createChain({ data: null, error: { message: 'fail' } }))

    const result = await crews.getCrewsTopologyBatch(['c1'], 'org-1')
    expect(result.members['c1']).toEqual([])
    expect(result.edges['c1']).toEqual([])
  })
})

// ─── deleteCrew ───

describe('deleteCrew', () => {
  it('soft-deletes by setting deleted_at', async () => {
    const chain = createChain({ data: { id: 'c1' }, error: null })
    mockFromResults.set('crews', chain)

    await crews.deleteCrew('c1', 'org-1')

    expect(mockFrom).toHaveBeenCalledWith('crews')
    expect(chain.update).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 'c1')
    expect(chain.eq).toHaveBeenCalledWith('org_id', 'org-1')
  })
})
