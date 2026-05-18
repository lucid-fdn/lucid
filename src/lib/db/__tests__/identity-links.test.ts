import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  ;(chain as Record<string, unknown>).then = (resolve: (value: unknown) => void) => {
    resolve(asPromise)
    return chain
  }
  return chain
}

let mockFromResults: Map<string, ReturnType<typeof createChain>>
const mockFrom = vi.fn((table: string) => mockFromResults.get(table) ?? createChain())
const mockCaptureException = vi.fn()

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...(args as [string])),
  },
  ErrorService: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  },
}))

const db = await import('../index')

beforeEach(() => {
  vi.clearAllMocks()
  mockFromResults = new Map()
  mockFrom.mockImplementation((table: string) => mockFromResults.get(table) ?? createChain())
})

describe('addIdentityLink', () => {
  it('treats a duplicate provider/external link for the same user as a no-op', async () => {
    const duplicateError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "unique_provider_external_id"',
    }
    const chain = createChain({ data: null, error: duplicateError })
    chain.single.mockResolvedValue({ data: { user_id: 'user-1' }, error: null })
    mockFromResults.set('identity_links', chain)

    await expect(db.addIdentityLink('user-1', 'privy', 'external-1')).resolves.toBeUndefined()

    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('still throws when the duplicate link belongs to another user', async () => {
    const duplicateError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "unique_provider_external_id"',
    }
    const chain = createChain({ data: null, error: duplicateError })
    chain.single.mockResolvedValue({ data: { user_id: 'user-2' }, error: null })
    mockFromResults.set('identity_links', chain)

    await expect(db.addIdentityLink('user-1', 'privy', 'external-1')).rejects.toEqual(duplicateError)

    expect(mockCaptureException).toHaveBeenCalledTimes(1)
  })
})
