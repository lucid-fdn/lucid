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

// The chat shell is a client component that imports `AgentTestChat`, which
// pulls in @ai-sdk/react and a lot of browser-only deps. We stub it with a
// tagged function component so assertions can identify it via element.type.
const { RetailChatShellStub } = vi.hoisted(() => ({
  RetailChatShellStub: function RetailChatShellStub() {
    return null
  },
}))
vi.mock('@/components/retail', () => ({
  RetailChatShell: RetailChatShellStub,
}))
vi.mock('@/components/retail/chat/retail-chat-shell', () => ({
  RetailChatShell: RetailChatShellStub,
}))

import RetailChatPage from '../agents-preview/chat/[id]/page'

const VALID_ID = '11111111-2222-3333-4444-555555555555'
const OTHER_ID = '99999999-8888-7777-6666-555555555555'

function call(id: string) {
  return RetailChatPage({
    params: Promise.resolve({ id }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  featuresMock.retailFunnel = true
})

describe('retail chat page', () => {
  it('404s when the feature flag is off', async () => {
    featuresMock.retailFunnel = false
    await expect(call(VALID_ID)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
    expect(getUserIdMock).not.toHaveBeenCalled()
    expect(getAssistantMock).not.toHaveBeenCalled()
  })

  it('404s on a non-UUID id (parameter injection guard)', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    await expect(call('../../evil')).rejects.toThrow('NEXT_NOT_FOUND')
    // Helper rejects before touching the DB
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
    // Critical IDOR guard: someone who guesses another user's agent id must
    // never be able to chat as them.
    getUserIdMock.mockResolvedValue('user-1')
    getAssistantMock.mockResolvedValue({
      id: OTHER_ID,
      org_id: 'org-retail-OTHER',
      name: 'Someone else agent',
    })
    findUserOrgMock.mockResolvedValue('org-retail-mine')
    await expect(call(OTHER_ID)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the chat shell when ownership checks pass', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    getAssistantMock.mockResolvedValue({
      id: VALID_ID,
      org_id: 'org-retail-mine',
      name: 'My researcher',
      lucid_model: 'gpt-4o-mini',
    })
    findUserOrgMock.mockResolvedValue('org-retail-mine')

    const element = (await call(VALID_ID)) as {
      type: unknown
      props: {
        assistant: { id: string; name: string; lucidModel?: string }
        orgId: string
      }
    }

    expect(element.type).toBe(RetailChatShellStub)
    expect(element.props.assistant.id).toBe(VALID_ID)
    expect(element.props.assistant.name).toBe('My researcher')
    expect(element.props.assistant.lucidModel).toBe('gpt-4o-mini')
    expect(element.props.orgId).toBe('org-retail-mine')
  })
})
