import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({ authenticated: false, ready: true, user: null }),
}))

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

import RetailCreatedPage from '../agents-preview/created/[id]/page'

const VALID_ID = '11111111-2222-3333-4444-555555555555'
const OTHER_ID = '99999999-8888-7777-6666-555555555555'

function call(id: string, from?: string) {
  return RetailCreatedPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(from ? { from } : {}),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  featuresMock.retailFunnel = true
})

describe('retail created page', () => {
  it('404s when the feature flag is off', async () => {
    featuresMock.retailFunnel = false
    await expect(call(VALID_ID)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
    // Must short-circuit before touching auth or DB
    expect(getUserIdMock).not.toHaveBeenCalled()
    expect(getAssistantMock).not.toHaveBeenCalled()
  })

  it('404s on a non-UUID id (parameter injection guard)', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    await expect(call('../../evil')).rejects.toThrow('NEXT_NOT_FOUND')
    // Helper short-circuits on non-UUID before touching the DB
    expect(getAssistantMock).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated users to /login', async () => {
    getUserIdMock.mockResolvedValue(null)
    await expect(call(VALID_ID)).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
    expect(getAssistantMock).not.toHaveBeenCalled()
  })

  it('404s when the assistant does not exist', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    getAssistantMock.mockResolvedValue(null)
    findUserOrgMock.mockResolvedValue('org-retail-mine')
    // Note: assistant + retail org are fetched in parallel for latency,
    // so findUserOrg may run regardless. We only assert the page 404s.
    await expect(call(VALID_ID)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('404s when the user has no retail org', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    getAssistantMock.mockResolvedValue({
      id: VALID_ID,
      org_id: 'org-retail-a',
      name: 'Agent',
    })
    findUserOrgMock.mockResolvedValue(null)
    await expect(call(VALID_ID)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('404s when the assistant belongs to a different org (cross-user guard)', async () => {
    // Critical: a user who knows/guesses another user's assistant id must
    // NOT see it. The assistant belongs to someone else's retail org.
    getUserIdMock.mockResolvedValue('user-1')
    getAssistantMock.mockResolvedValue({
      id: OTHER_ID,
      org_id: 'org-retail-OTHER',
      name: 'Someone else agent',
    })
    findUserOrgMock.mockResolvedValue('org-retail-mine')
    await expect(call(OTHER_ID)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the tutorial when ownership checks pass (with template)', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    getAssistantMock.mockResolvedValue({
      id: VALID_ID,
      org_id: 'org-retail-mine',
      name: 'My researcher',
    })
    findUserOrgMock.mockResolvedValue('org-retail-mine')

    const element = (await call(VALID_ID, 'personal-research-assistant')) as {
      type: string
      props: { children: { type: { name?: string }; props: Record<string, unknown> } }
    }

    expect(element.type).toBe('main')
    expect(element.props.children.type?.name).toBe('ActivationTutorial')
    const tutorialProps = element.props.children.props as {
      assistant: { id: string; name: string }
      template: { slug: string } | null
    }
    expect(tutorialProps.assistant.id).toBe(VALID_ID)
    expect(tutorialProps.assistant.name).toBe('My researcher')
    expect(tutorialProps.template?.slug).toBe('personal-research-assistant')
  })

  it('renders the tutorial with null template when `from` is missing/unknown', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    getAssistantMock.mockResolvedValue({
      id: VALID_ID,
      org_id: 'org-retail-mine',
      name: 'My agent',
    })
    findUserOrgMock.mockResolvedValue('org-retail-mine')

    const noFrom = (await call(VALID_ID)) as {
      props: { children: { props: { template: unknown } } }
    }
    expect(noFrom.props.children.props.template).toBeNull()

    const unknown = (await call(VALID_ID, 'does-not-exist')) as {
      props: { children: { props: { template: unknown } } }
    }
    expect(unknown.props.children.props.template).toBeNull()
  })
})
