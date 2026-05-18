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
  getAssistantMock,
  findUserOrgMock,
  notFoundMock,
  redirectMock,
} = vi.hoisted(() => ({
  getUserIdMock: vi.fn(),
  getAssistantMock: vi.fn(),
  findUserOrgMock: vi.fn(),
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
  getAssistant: getAssistantMock,
  findUserOrgByMetadataFlag: findUserOrgMock,
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}))

// PersonalityEditor is a client component with router hooks; stub as
// a tagged function component so tests can find it by element.type.
const { PersonalityEditorStub } = vi.hoisted(() => ({
  PersonalityEditorStub: function PersonalityEditorStub() {
    return null
  },
}))
vi.mock('@/components/retail', () => ({
  PersonalityEditor: PersonalityEditorStub,
}))
vi.mock('@/components/retail/personality/personality-editor', () => ({
  PersonalityEditor: PersonalityEditorStub,
}))

import RetailPersonalityPage from '../agents-preview/personality/[id]/page'

const VALID_ID = '11111111-2222-3333-4444-555555555555'
const OTHER_ID = '99999999-8888-7777-6666-555555555555'

function call(id: string) {
  return RetailPersonalityPage({
    params: Promise.resolve({ id }),
  })
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

/**
 * Walks the returned server element tree looking for the stubbed
 * PersonalityEditor. The page wraps it in a <main> with a back link,
 * so we can't just inspect the root.
 */
function findEditor(node: unknown): ReactLike | null {
  if (!isReactLike(node)) return null
  if (node.type === PersonalityEditorStub) return node
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

describe('retail personality page', () => {
  it('404s when the feature flag is off', async () => {
    featuresMock.retailFunnel = false
    await expect(call(VALID_ID)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getUserIdMock).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated users to /login', async () => {
    getUserIdMock.mockResolvedValue(null)
    await expect(call(VALID_ID)).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(getAssistantMock).not.toHaveBeenCalled()
  })

  it('404s on a non-UUID id', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    await expect(call('../../evil')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getAssistantMock).not.toHaveBeenCalled()
  })

  it('404s when the assistant belongs to a different org (IDOR guard)', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    getAssistantMock.mockResolvedValue({
      id: OTHER_ID,
      org_id: 'org-retail-OTHER',
      name: 'Someone else',
    })
    findUserOrgMock.mockResolvedValue('org-retail-mine')
    await expect(call(OTHER_ID)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the personality editor when ownership checks pass', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    getAssistantMock.mockResolvedValue({
      id: VALID_ID,
      org_id: 'org-retail-mine',
      name: 'My agent',
    })
    findUserOrgMock.mockResolvedValue('org-retail-mine')

    const tree = await call(VALID_ID)
    const editor = findEditor(tree)

    expect(editor).not.toBeNull()
    expect(editor!.props.assistant).toEqual({
      id: VALID_ID,
      name: 'My agent',
    })
    expect(editor!.props.initialContent).toBeNull()
  })
})
