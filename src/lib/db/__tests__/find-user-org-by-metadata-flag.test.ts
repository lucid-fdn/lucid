/**
 * findUserOrgByMetadataFlag — Unit tests
 *
 * Exercises the real Supabase query builder chain (via a chainable mock),
 * not a higher-level mock. Codex rescue flagged the retail-org tests as
 * not exercising the query shape; this file plugs that gap.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

type ChainResult = { data: unknown; error: unknown }

function createChain(resolveWith: ChainResult = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const fns = ['select', 'eq', 'limit', 'order', 'filter', 'neq']
  for (const fn of fns) {
    chain[fn] = vi.fn().mockReturnValue(chain)
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith)
  chain.single = vi.fn().mockResolvedValue(resolveWith)
  return chain
}

let mockFromResults: Map<string, ReturnType<typeof createChain>>
const mockFrom = vi.fn((table: string) => {
  return mockFromResults.get(table) ?? createChain()
})
const captureException = vi.fn()

vi.mock('../client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...(args as [string])),
  },
  ErrorService: {
    captureException: (...args: unknown[]) => captureException(...args),
  },
}))

const { findUserOrgByMetadataFlag } = await import('../organizations')

beforeEach(() => {
  vi.clearAllMocks()
  mockFromResults = new Map()
  mockFrom.mockImplementation((table: string) => {
    return mockFromResults.get(table) ?? createChain()
  })
})

describe('findUserOrgByMetadataFlag', () => {
  it('builds the PostgREST query chain with inner join and metadata filter', async () => {
    const chain = createChain({ data: { id: 'org-1' }, error: null })
    mockFromResults.set('organizations', chain)

    const result = await findUserOrgByMetadataFlag('user-1', 'retail_personal_org')

    expect(result).toBe('org-1')
    expect(mockFrom).toHaveBeenCalledWith('organizations')
    // Inner-join embed so the filter applies to top-level rows, not hidden embeds.
    // The explicit FK avoids PostgREST ambiguity when multiple org/member
    // relationships exist.
    expect(chain.select).toHaveBeenCalledWith('id, member:organization_members!organization_members_organization_id_fkey!inner(user_id)')
    // Scopes rows to this user
    expect(chain.eq).toHaveBeenCalledWith('member.user_id', 'user-1')
    // Server-side JSONB filter — the literal flag key is interpolated into the path
    expect(chain.eq).toHaveBeenCalledWith('metadata->>retail_personal_org', 'true')
    expect(chain.limit).toHaveBeenCalledWith(1)
    expect(chain.maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('returns null when no matching org exists', async () => {
    const chain = createChain({ data: null, error: null })
    mockFromResults.set('organizations', chain)

    const result = await findUserOrgByMetadataFlag('user-2', 'retail_personal_org')
    expect(result).toBeNull()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('throws and captures on DB error instead of silently returning null', async () => {
    // Fail-loud behavior — a broken read must NOT be mistaken for "org missing"
    // by ensureRetailOrg, which would race into createOrganization.
    const chain = createChain({
      data: null,
      error: { message: 'relation missing', code: '42P01' },
    })
    mockFromResults.set('organizations', chain)

    await expect(
      findUserOrgByMetadataFlag('user-3', 'retail_personal_org'),
    ).rejects.toThrow(/findUserOrgByMetadataFlag failed: relation missing/)
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('rejects injection attempts on the flag key', async () => {
    await expect(
      findUserOrgByMetadataFlag('user-4', "retail'; DROP TABLE orgs;--"),
    ).rejects.toThrow(/Invalid metadata flag key/)
    // Must fail before touching the DB
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects empty flag key', async () => {
    await expect(findUserOrgByMetadataFlag('user-5', '')).rejects.toThrow(
      /Invalid metadata flag key/,
    )
  })
})
