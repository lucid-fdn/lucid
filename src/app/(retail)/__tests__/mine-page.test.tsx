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
  getRetailFleetAssistantsSummaryMock,
  findUserOrgMock,
  notFoundMock,
  redirectMock,
} = vi.hoisted(() => ({
  getUserIdMock: vi.fn(),
  getRetailFleetAssistantsSummaryMock: vi.fn(),
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
  getAssistant: vi.fn(),
  getAssistants: vi.fn(),
  getRetailFleetAssistantsSummary: getRetailFleetAssistantsSummaryMock,
  findUserOrgByMetadataFlag: findUserOrgMock,
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}))

// RetailFleetList + PrivateRuntimeUpsell use server-rendered shadcn
// primitives; we stub them to tagged function components so the tree
// walk below can locate them by `element.type` without rendering.
const { RetailFleetListStub, PrivateRuntimeUpsellStub } = vi.hoisted(() => ({
  RetailFleetListStub: function RetailFleetListStub() {
    return null
  },
  PrivateRuntimeUpsellStub: function PrivateRuntimeUpsellStub() {
    return null
  },
}))
vi.mock('@/components/retail', () => ({
  RetailFleetList: RetailFleetListStub,
  PrivateRuntimeUpsell: PrivateRuntimeUpsellStub,
}))
vi.mock('@/components/retail/fleet/retail-fleet-list', () => ({
  RetailFleetList: RetailFleetListStub,
}))
vi.mock('@/components/retail/fleet/private-runtime-upsell', () => ({
  PrivateRuntimeUpsell: PrivateRuntimeUpsellStub,
}))

import RetailFleetPage from '../agents-preview/mine/page'

function call() {
  return RetailFleetPage()
}

beforeEach(() => {
  vi.clearAllMocks()
  featuresMock.retailFunnel = true
})

/**
 * Walk the returned React element tree to find the first child whose type
 * matches the stub. The page wraps the list in `<main>` → `<RetailFleetList />`,
 * and React.Children/flatten semantics can vary depending on sibling nodes,
 * so we recurse over arrays + single children rather than guessing a path.
 */
function findFleetListElement(node: unknown): {
  type: unknown
  props: { assistants: Array<{ id: string; name: string }> }
} | null {
  if (!node || typeof node !== 'object') return null
  const el = node as { type?: unknown; props?: { children?: unknown } }
  if (el.type === RetailFleetListStub) {
    return el as {
      type: unknown
      props: { assistants: Array<{ id: string; name: string }> }
    }
  }
  const children = el.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const hit = findFleetListElement(child)
      if (hit) return hit
    }
  } else if (children) {
    return findFleetListElement(children)
  }
  return null
}

function findUpsellElement(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const el = node as { type?: unknown; props?: { children?: unknown } }
  if (el.type === PrivateRuntimeUpsellStub) return true
  const children = el.props?.children
  if (Array.isArray(children)) {
    return children.some((child) => findUpsellElement(child))
  }
  if (children) return findUpsellElement(children)
  return false
}

describe('retail fleet page', () => {
  it('404s when the feature flag is off', async () => {
    featuresMock.retailFunnel = false
    await expect(call()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
    expect(getUserIdMock).not.toHaveBeenCalled()
    expect(findUserOrgMock).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated users to /login', async () => {
    getUserIdMock.mockResolvedValue(null)
    await expect(call()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
    expect(findUserOrgMock).not.toHaveBeenCalled()
  })

  it('renders an empty fleet when the user has no retail org', async () => {
    // Returning signup who never finished the wizard — we do NOT 404,
    // we show the empty state so they can get back into the funnel.
    getUserIdMock.mockResolvedValue('user-1')
    findUserOrgMock.mockResolvedValue(null)

    const element = await call()
    const list = findFleetListElement(element)
    expect(list).not.toBeNull()
    expect(list?.props.assistants).toEqual([])
    // Must not query agents for an org we don't have
    expect(getRetailFleetAssistantsSummaryMock).not.toHaveBeenCalled()
  })

  it('renders the fleet when ownership checks pass', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    findUserOrgMock.mockResolvedValue('org-retail-mine')
    getRetailFleetAssistantsSummaryMock.mockResolvedValue([
      {
        id: '11111111-2222-3333-4444-555555555555',
        name: 'My researcher',
        created_at: '2026-04-01T00:00:00Z',
        is_active: true,
      },
      {
        id: '22222222-3333-4444-5555-666666666666',
        name: 'Paused bot',
        created_at: '2026-03-15T00:00:00Z',
        is_active: false,
      },
    ])

    const element = await call()
    const list = findFleetListElement(element)
    expect(list).not.toBeNull()
    expect(list?.props.assistants).toHaveLength(2)
    expect(list?.props.assistants[0]).toMatchObject({
      id: '11111111-2222-3333-4444-555555555555',
      name: 'My researcher',
    })
    expect(getRetailFleetAssistantsSummaryMock).toHaveBeenCalledWith(
      'org-retail-mine',
      expect.any(Number),
    )
  })

  it('hides the private-runtime upsell for a fresh fleet', async () => {
    // Oldest agent is 5 days old — well under the 30-day threshold.
    getUserIdMock.mockResolvedValue('user-1')
    findUserOrgMock.mockResolvedValue('org-retail-mine')
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    getRetailFleetAssistantsSummaryMock.mockResolvedValue([
      {
        id: '11111111-2222-3333-4444-555555555555',
        name: 'Fresh agent',
        created_at: fiveDaysAgo,
        is_active: true,
      },
    ])

    const element = await call()
    expect(findFleetListElement(element)).not.toBeNull()
    expect(findUpsellElement(element)).toBe(false)
  })

  it('shows the private-runtime upsell once an agent crosses the 30-day threshold', async () => {
    // Oldest agent is 45 days old — past the stickiness threshold.
    getUserIdMock.mockResolvedValue('user-1')
    findUserOrgMock.mockResolvedValue('org-retail-mine')
    const fortyFiveDaysAgo = new Date(
      Date.now() - 45 * 24 * 60 * 60 * 1000,
    ).toISOString()
    getRetailFleetAssistantsSummaryMock.mockResolvedValue([
      {
        id: '11111111-2222-3333-4444-555555555555',
        name: 'Long-running agent',
        created_at: fortyFiveDaysAgo,
        is_active: true,
      },
    ])

    const element = await call()
    expect(findFleetListElement(element)).not.toBeNull()
    expect(findUpsellElement(element)).toBe(true)
  })
})
