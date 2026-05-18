import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { featuresMock } = vi.hoisted(() => ({
  featuresMock: { retailFunnel: true },
}))
vi.mock('@/lib/features', () => ({
  FEATURES: featuresMock,
}))

const {
  getUserIdMock,
  findUserOrgMock,
  getBoardMemoriesMock,
  notFoundMock,
  redirectMock,
} = vi.hoisted(() => ({
  getUserIdMock: vi.fn(),
  findUserOrgMock: vi.fn(),
  getBoardMemoriesMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: getUserIdMock,
}))

vi.mock('@/lib/db', () => ({
  getBoardMemories: getBoardMemoriesMock,
  findUserOrgByMetadataFlag: findUserOrgMock,
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}))

// KnowledgeEditor is a client component. Stub as a tagged function
// component so tests can find it by element.type.
const { KnowledgeEditorStub } = vi.hoisted(() => ({
  KnowledgeEditorStub: function KnowledgeEditorStub() {
    return null
  },
}))
vi.mock('@/components/retail', () => ({
  KnowledgeEditor: KnowledgeEditorStub,
}))
vi.mock('@/components/retail/knowledge/knowledge-editor', () => ({
  KnowledgeEditor: KnowledgeEditorStub,
}))

import RetailKnowledgePage from '../agents-preview/knowledge/page'

function call() {
  return RetailKnowledgePage()
}

interface ReactLike {
  type: unknown
  props: Record<string, unknown>
}

function isReactLike(value: unknown): value is ReactLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'props' in value
  )
}

function findEditor(node: unknown): ReactLike | null {
  if (!isReactLike(node)) return null
  if (node.type === KnowledgeEditorStub) return node
  const children = node.props.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const hit = findEditor(child)
      if (hit) return hit
    }
  } else if (children !== undefined && children !== null) {
    return findEditor(children)
  }
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  featuresMock.retailFunnel = true
})

describe('retail knowledge page', () => {
  it('404s when the feature flag is off', async () => {
    featuresMock.retailFunnel = false
    await expect(call()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getUserIdMock).not.toHaveBeenCalled()
    expect(findUserOrgMock).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated users to /login', async () => {
    getUserIdMock.mockResolvedValue(null)
    await expect(call()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(findUserOrgMock).not.toHaveBeenCalled()
  })

  it('redirects to the template gallery when the user has no retail org', async () => {
    // Half-funneled signups should land on templates, not on a broken
    // knowledge editor bound to a placeholder org id.
    getUserIdMock.mockResolvedValue('user-1')
    findUserOrgMock.mockResolvedValue(null)
    await expect(call()).rejects.toThrow('NEXT_REDIRECT:/agents-preview')
    expect(getBoardMemoriesMock).not.toHaveBeenCalled()
  })

  it('renders the editor with SSR-fetched entries when the user has a retail org', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    findUserOrgMock.mockResolvedValue('org-retail-mine')
    getBoardMemoriesMock.mockResolvedValue([
      {
        id: 'mem-1',
        org_id: 'org-retail-mine',
        content: 'We ship on Mondays.',
        category: 'insight',
        importance: 0.7,
        source: 'operator',
        source_agent_id: null,
        created_by: 'user-1',
        is_archived: false,
        created_at: '2026-04-07T00:00:00Z',
        updated_at: '2026-04-07T00:00:00Z',
      },
    ])

    const tree = await call()
    const editor = findEditor(tree)

    expect(editor).not.toBeNull()
    expect(editor!.props.orgId).toBe('org-retail-mine')
    expect(editor!.props.initialEntries).toEqual([
      {
        id: 'mem-1',
        content: 'We ship on Mondays.',
        createdAt: '2026-04-07T00:00:00Z',
      },
    ])
    expect(getBoardMemoriesMock).toHaveBeenCalledWith('org-retail-mine', {
      limit: 100,
    })
  })
})
