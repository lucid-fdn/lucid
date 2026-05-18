/**
 * PM External Refs DB — Unit Tests
 *
 * Covers upsertExternalRef, getExternalRefsForWorkItem,
 * findWorkItemByExternalRef, listStaleRefsForReconcile, touchLastSynced,
 * recordSyncFailure with mocked Supabase.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

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
const mockFrom = vi.fn((table: string) => mockFromResults.get(table) ?? createChain())

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...(args as [string])),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

const refs = await import('../pm-external-refs')

beforeEach(() => {
  vi.clearAllMocks()
  mockFromResults = new Map()
  mockFrom.mockImplementation((table: string) => mockFromResults.get(table) ?? createChain())
})

describe('upsertExternalRef', () => {
  it('returns parsed row on success', async () => {
    const row = {
      id: 'ref-1',
      work_item_id: 'wi-1',
      org_id: 'org-1',
      provider: 'linear',
      external_id: 'LIN-123',
      external_url: 'https://linear.app/issue/LIN-123',
      metadata: { team_id: 't1' },
      created_at: '2026-04-09T00:00:00Z',
      last_synced_at: '2026-04-09T00:00:00Z',
      last_sync_error: null,
      sync_attempts: 0,
    }
    mockFromResults.set(
      'work_item_external_refs',
      createChain({ data: row, error: null }),
    )
    const result = await refs.upsertExternalRef({
      work_item_id: 'wi-1',
      org_id: 'org-1',
      provider: 'linear',
      external_id: 'LIN-123',
      external_url: 'https://linear.app/issue/LIN-123',
      metadata: { team_id: 't1' },
    })
    expect(result).toEqual(row)
    expect(mockFrom).toHaveBeenCalledWith('work_item_external_refs')
  })

  it('returns null on DB error', async () => {
    mockFromResults.set(
      'work_item_external_refs',
      createChain({ data: null, error: { message: 'boom' } }),
    )
    const result = await refs.upsertExternalRef({
      work_item_id: 'wi-1',
      org_id: 'org-1',
      provider: 'asana',
      external_id: 'A-1',
      external_url: 'https://app.asana.com/0/1/1',
    })
    expect(result).toBeNull()
  })
})

describe('getExternalRefsForWorkItem', () => {
  it('returns empty array when none found', async () => {
    mockFromResults.set(
      'work_item_external_refs',
      createChain({ data: [], error: null }),
    )
    const result = await refs.getExternalRefsForWorkItem('wi-1')
    expect(result).toEqual([])
  })

  it('returns all rows across providers', async () => {
    const rows = [
      { id: 'r1', provider: 'linear', work_item_id: 'wi-1' },
      { id: 'r2', provider: 'asana', work_item_id: 'wi-1' },
    ]
    mockFromResults.set(
      'work_item_external_refs',
      createChain({ data: rows, error: null }),
    )
    const result = await refs.getExternalRefsForWorkItem('wi-1')
    expect(result).toHaveLength(2)
  })

  it('returns empty array on DB error (non-fatal)', async () => {
    mockFromResults.set(
      'work_item_external_refs',
      createChain({ data: null, error: { message: 'db down' } }),
    )
    const result = await refs.getExternalRefsForWorkItem('wi-1')
    expect(result).toEqual([])
  })
})

describe('findWorkItemByExternalRef', () => {
  it('returns row when found', async () => {
    const row = {
      id: 'r1',
      provider: 'trello',
      external_id: 'card-abc',
      work_item_id: 'wi-1',
      org_id: 'org-1',
    }
    mockFromResults.set(
      'work_item_external_refs',
      createChain({ data: row, error: null }),
    )
    const result = await refs.findWorkItemByExternalRef('trello', 'card-abc')
    expect(result?.work_item_id).toBe('wi-1')
  })

  it('returns null when not found', async () => {
    mockFromResults.set(
      'work_item_external_refs',
      createChain({ data: null, error: null }),
    )
    const result = await refs.findWorkItemByExternalRef('monday', 'item-999')
    expect(result).toBeNull()
  })
})

describe('listStaleRefsForReconcile', () => {
  it('defaults to 5-minute staleness cutoff and limit 50', async () => {
    const chain = createChain({ data: [], error: null })
    mockFromResults.set('work_item_external_refs', chain)
    await refs.listStaleRefsForReconcile({ provider: 'linear' })
    expect(chain.eq).toHaveBeenCalledWith('provider', 'linear')
    expect(chain.lt).toHaveBeenCalledWith('last_synced_at', expect.any(String))
    expect(chain.order).toHaveBeenCalledWith('last_synced_at', { ascending: true })
    expect(chain.limit).toHaveBeenCalledWith(50)
  })

  it('honors custom limit (e.g., 20 for Trello)', async () => {
    const chain = createChain({ data: [], error: null })
    mockFromResults.set('work_item_external_refs', chain)
    await refs.listStaleRefsForReconcile({ provider: 'trello', limit: 20 })
    expect(chain.limit).toHaveBeenCalledWith(20)
  })
})

describe('touchLastSynced', () => {
  it('returns true on success', async () => {
    mockFromResults.set(
      'work_item_external_refs',
      createChain({ data: null, error: null }),
    )
    const result = await refs.touchLastSynced('ref-1')
    expect(result).toBe(true)
  })

  it('returns false on error', async () => {
    mockFromResults.set(
      'work_item_external_refs',
      createChain({ data: null, error: { message: 'fail' } }),
    )
    const result = await refs.touchLastSynced('ref-1')
    expect(result).toBe(false)
  })
})

describe('recordSyncFailure', () => {
  it('truncates error message to 2000 chars', async () => {
    const longMsg = 'x'.repeat(3000)
    const chain = createChain({ data: { sync_attempts: 2 }, error: null })
    mockFromResults.set('work_item_external_refs', chain)
    const result = await refs.recordSyncFailure('ref-1', longMsg)
    expect(result).toBe(true)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_sync_error: 'x'.repeat(2000), sync_attempts: 3 }),
    )
  })
})
