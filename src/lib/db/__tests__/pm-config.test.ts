/**
 * Org PM Config DB — Unit Tests
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

const cfg = await import('../pm-config')

beforeEach(() => {
  vi.clearAllMocks()
  mockFromResults = new Map()
  mockFrom.mockImplementation((table: string) => mockFromResults.get(table) ?? createChain())
})

const sampleRow = {
  id: 'c1',
  org_id: 'org-1',
  provider: 'linear',
  enabled: true,
  is_primary: true,
  nango_connection_id: 'nango-conn-1',
  config: { team_id: 't1' },
  webhook_secret: 'hunter2',
  created_by: 'user-1',
  created_at: '2026-04-09T00:00:00Z',
  updated_at: '2026-04-09T00:00:00Z',
}

describe('getOrgPmConfig', () => {
  it('returns null when not configured', async () => {
    mockFromResults.set('org_pm_config', createChain({ data: null, error: null }))
    const result = await cfg.getOrgPmConfig('org-1', 'linear')
    expect(result).toBeNull()
  })

  it('strips webhookSecret by default', async () => {
    mockFromResults.set('org_pm_config', createChain({ data: sampleRow, error: null }))
    const result = await cfg.getOrgPmConfig('org-1', 'linear')
    expect(result?.webhookSecret).toBeUndefined()
    expect(result?.isPrimary).toBe(true)
    expect(result?.nangoConnectionId).toBe('nango-conn-1')
  })

  it('includes webhookSecret when explicitly requested', async () => {
    mockFromResults.set('org_pm_config', createChain({ data: sampleRow, error: null }))
    const result = await cfg.getOrgPmConfig('org-1', 'linear', { includeSecret: true })
    expect(result?.webhookSecret).toBe('hunter2')
  })
})

describe('listOrgPmConfigs', () => {
  it('returns all configs without secrets', async () => {
    const rows = [sampleRow, { ...sampleRow, id: 'c2', provider: 'asana', is_primary: false }]
    mockFromResults.set('org_pm_config', createChain({ data: rows, error: null }))
    const result = await cfg.listOrgPmConfigs('org-1')
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.webhookSecret === undefined)).toBe(true)
  })

  it('returns empty array on error', async () => {
    mockFromResults.set('org_pm_config', createChain({ data: null, error: { message: 'db down' } }))
    const result = await cfg.listOrgPmConfigs('org-1')
    expect(result).toEqual([])
  })
})

describe('setOrgPmConfig', () => {
  it('clears existing primary when setting isPrimary=true', async () => {
    const chain = createChain({ data: sampleRow, error: null })
    mockFromResults.set('org_pm_config', chain)
    await cfg.setOrgPmConfig({
      orgId: 'org-1',
      provider: 'linear',
      enabled: true,
      isPrimary: true,
      nangoConnectionId: 'nango-conn-1',
      config: { team_id: 't1' },
      webhookSecret: 'hunter2',
    })
    // Two writes: clear primary UPDATE + upsert
    expect(chain.update).toHaveBeenCalledWith({ is_primary: false })
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'org-1',
        provider: 'linear',
        is_primary: true,
        webhook_secret: 'hunter2',
      }),
      { onConflict: 'org_id,provider' },
    )
  })

  it('does not clear primary when isPrimary=false', async () => {
    const chain = createChain({ data: sampleRow, error: null })
    mockFromResults.set('org_pm_config', chain)
    await cfg.setOrgPmConfig({
      orgId: 'org-1',
      provider: 'trello',
      enabled: true,
      isPrimary: false,
      nangoConnectionId: 'nango-2',
      config: {},
    })
    expect(chain.update).not.toHaveBeenCalled()
  })

  it('never returns the webhook secret', async () => {
    mockFromResults.set('org_pm_config', createChain({ data: sampleRow, error: null }))
    const result = await cfg.setOrgPmConfig({
      orgId: 'org-1',
      provider: 'linear',
      enabled: true,
      isPrimary: false,
      nangoConnectionId: 'nango-conn-1',
      config: {},
      webhookSecret: 'should-not-leak',
    })
    expect(result?.webhookSecret).toBeUndefined()
  })
})

describe('disableOrgPmConfig', () => {
  it('sets enabled=false and clears is_primary', async () => {
    const chain = createChain({ data: null, error: null })
    mockFromResults.set('org_pm_config', chain)
    const result = await cfg.disableOrgPmConfig('org-1', 'linear')
    expect(result).toBe(true)
    expect(chain.update).toHaveBeenCalledWith({ enabled: false, is_primary: false })
  })

  it('returns false on error', async () => {
    mockFromResults.set('org_pm_config', createChain({ data: null, error: { message: 'fail' } }))
    const result = await cfg.disableOrgPmConfig('org-1', 'linear')
    expect(result).toBe(false)
  })
})

describe('listEnabledConfigsForProvider', () => {
  it('includes webhook secrets (trusted worker path)', async () => {
    mockFromResults.set('org_pm_config', createChain({ data: [sampleRow], error: null }))
    const result = await cfg.listEnabledConfigsForProvider('linear')
    expect(result[0]?.webhookSecret).toBe('hunter2')
  })
})
