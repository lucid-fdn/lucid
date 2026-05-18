import { beforeEach, describe, expect, it, vi } from 'vitest'

const canPerformActionMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/access-control/server', () => ({
  canPerformAction: (...args: unknown[]) => canPerformActionMock(...args),
}))

type ChainResult = { data: unknown; error: unknown }

function createChain(resolveWith: ChainResult) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const fn of ['select', 'eq']) {
    chain[fn] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(resolveWith)
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith)
  return chain
}

function createSupabase(results: Record<string, ReturnType<typeof createChain>>) {
  return {
    from: vi.fn((table: string) => results[table] ?? createChain({ data: null, error: null })),
  }
}

const { checkWorkflowAccess } = await import('../access')

beforeEach(() => {
  vi.clearAllMocks()
  canPerformActionMock.mockResolvedValue(true)
})

describe('checkWorkflowAccess', () => {
  it('denies organization workflows when the user is not a member', async () => {
    const workflows = createChain({
      data: {
        id: 'workflow-1',
        user_id: 'owner-user',
        organization_id: 'org-1',
      },
      error: null,
    })
    const memberships = createChain({ data: null, error: null })
    const supabase = createSupabase({
      workflows,
      organization_members: memberships,
    })

    const result = await checkWorkflowAccess(supabase as any, 'workflow-1', 'outsider-user', false)

    expect(result.allowed).toBe(false)
    expect(result.status).toBe(403)
    expect(canPerformActionMock).not.toHaveBeenCalled()
    expect(memberships.eq).toHaveBeenCalledWith('user_id', 'outsider-user')
    expect(memberships.eq).toHaveBeenCalledWith('organization_id', 'org-1')
  })

  it('allows organization workflow reads for real members with permission', async () => {
    const workflows = createChain({
      data: {
        id: 'workflow-1',
        user_id: 'owner-user',
        organization_id: 'org-1',
      },
      error: null,
    })
    const memberships = createChain({ data: { role: 'guest' }, error: null })
    const supabase = createSupabase({
      workflows,
      organization_members: memberships,
    })

    const result = await checkWorkflowAccess(supabase as any, 'workflow-1', 'member-user', false)

    expect(result.allowed).toBe(true)
    expect(canPerformActionMock).toHaveBeenCalledWith('member-user', 'org-1', 'viewSettings')
  })
})
