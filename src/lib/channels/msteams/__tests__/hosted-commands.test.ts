import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetPrimaryTeamsChannelForConversation = vi.fn()
const mockListTeamsChannelsForConversation = vi.fn()
const mockListPendingTeamsChannelsForTenant = vi.fn()
const mockBindHostedTeamsChannel = vi.fn()
const mockSetPrimaryTeamsChannel = vi.fn()
const mockUnbindTeamsChannel = vi.fn()
const mockStartAgentOpsRunFromChannelCommand = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', () => ({
  bindHostedTeamsChannel: (...args: unknown[]) => mockBindHostedTeamsChannel(...args),
  getPrimaryTeamsChannelForConversation: (...args: unknown[]) =>
    mockGetPrimaryTeamsChannelForConversation(...args),
  listTeamsChannelsForConversation: (...args: unknown[]) =>
    mockListTeamsChannelsForConversation(...args),
  listPendingTeamsChannelsForTenant: (...args: unknown[]) =>
    mockListPendingTeamsChannelsForTenant(...args),
  setPrimaryTeamsChannel: (...args: unknown[]) => mockSetPrimaryTeamsChannel(...args),
  unbindTeamsChannel: (...args: unknown[]) => mockUnbindTeamsChannel(...args),
}))

vi.mock('@/lib/db/agent-ops-channel-launch', () => ({
  startAgentOpsRunFromChannelCommand: (...args: unknown[]) =>
    mockStartAgentOpsRunFromChannelCommand(...args),
}))

import { resolveHostedTeamsInbound } from '../hosted-commands'

describe('resolveHostedTeamsInbound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListPendingTeamsChannelsForTenant.mockResolvedValue([])
    mockBindHostedTeamsChannel.mockResolvedValue(true)
    mockStartAgentOpsRunFromChannelCommand.mockResolvedValue('Teams Agent Ops run started')
  })

  it('handles help with the full Teams command list', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: 'Sales closer', is_primary: true },
    ])
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-1',
      tenantId: 'tenant-1',
      text: 'help',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('whoami'))
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('leave'))
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('ops <workflow> <target>'))
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('check <url>'))
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('buy <request>'))
  })

  it('launches Agent Ops from the active Teams binding', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    mockGetPrimaryTeamsChannelForConversation.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-ops',
      tenantId: 'tenant-1',
      text: 'ops qa https://preview.example.com',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      channelType: 'msteams',
      channelLabel: 'Teams',
      surfaceId: 'conv-ops',
      command: expect.objectContaining({
        workflowId: 'qa',
        target: 'https://preview.example.com',
      }),
      binding: expect.objectContaining({ assistant_id: 'a1' }),
    }))
    expect(sendText).toHaveBeenCalledWith('Teams Agent Ops run started')
  })

  it('launches Browser Operator workflows from natural Teams commands', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    mockGetPrimaryTeamsChannelForConversation.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-browser',
      tenantId: 'tenant-1',
      text: 'monitor https://status.example.com',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({
        workflowId: 'monitor-page',
        target: 'https://status.example.com',
      }),
    }))
  })

  it('launches governed buying workflows from natural Teams commands', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    mockGetPrimaryTeamsChannelForConversation.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-commerce',
      tenantId: 'tenant-1',
      text: 'buy weekly groceries under $120 from Carrefour',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({
        workflowId: 'buy-stuff',
        target: 'weekly groceries under $120 from Carrefour',
      }),
    }))
  })

  it('launches Browser Operator workflows from a Teams surface default', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([])
    const resolveSurfaceDefault = vi.fn().mockResolvedValue({ channelId: 'surface-channel', assistantId: 'a-default' })
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-default',
      tenantId: 'tenant-1',
      text: 'check https://www.example.com',
      resolveSurfaceDefault,
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      channelType: 'msteams',
      surfaceId: 'conv-default',
      command: expect.objectContaining({ workflowId: 'check-page', target: 'https://www.example.com' }),
      binding: expect.objectContaining({ assistant_id: 'a-default' }),
    }))
  })

  it('handles whoami with the active assistant description', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: 'Sales closer\nExtra', is_primary: true },
    ])
    mockGetPrimaryTeamsChannelForConversation.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-1',
      tenantId: 'tenant-1',
      text: 'whoami',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(sendText).toHaveBeenCalledWith('Currently chatting with Closer\nSales closer')
  })

  it('handles status with active assistant details plus pending switch count', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: 'Sales closer', is_primary: true },
    ])
    mockGetPrimaryTeamsChannelForConversation.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    mockListPendingTeamsChannelsForTenant.mockResolvedValue([
      { id: 'pending-2', assistant_id: 'a2', assistant_name: 'Support', assistant_description: 'Ops helper' },
    ])
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-1',
      tenantId: 'tenant-1',
      text: 'status',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(sendText).toHaveBeenCalledWith(
      'Currently chatting with Closer\nSales closer\n\n1 more installed agent can be switched into this conversation.',
    )
  })

  it('handles leave by unbinding the active assistant', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
      { id: 'c2', assistant_id: 'a2', assistant_name: 'Support', assistant_description: null, is_primary: false },
    ])
    mockGetPrimaryTeamsChannelForConversation.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-1',
      tenantId: 'tenant-1',
      text: 'leave',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockUnbindTeamsChannel).toHaveBeenCalledWith('conv-1', 'a1')
    expect(sendText).toHaveBeenCalledWith(
      'Closer stepped out of this Teams conversation. Type "agents" to bring another one in.',
    )
  })

  it('binds the only pending hosted Teams install into the current conversation', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([])
    mockListPendingTeamsChannelsForTenant.mockResolvedValue([
      { id: 'pending-1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: 'Sales closer' },
    ])
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-bind',
      tenantId: 'tenant-bind',
      text: 'bind',
      serviceUrl: 'https://smba.trafficmanager.net/teams',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockBindHostedTeamsChannel).toHaveBeenCalledWith({
      conversationId: 'conv-bind',
      channelId: 'pending-1',
      serviceUrl: 'https://smba.trafficmanager.net/teams',
    })
    expect(sendText).toHaveBeenCalledWith('Closer is now active in this Teams conversation.')
  })

  it('asks the user to pick an agent name when multiple pending installs exist', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([])
    mockListPendingTeamsChannelsForTenant.mockResolvedValue([
      { id: 'pending-1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: 'Sales closer' },
      { id: 'pending-2', assistant_id: 'a2', assistant_name: 'Support', assistant_description: 'Ops helper' },
    ])
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-bind',
      tenantId: 'tenant-bind',
      text: 'bind',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockBindHostedTeamsChannel).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(
      'Multiple Lucid agents are installed for this Teams tenant. Type "bind <agent name>" to choose one.',
    )
  })

  it('matches bind targets by partial agent name when only one match exists', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([])
    mockListPendingTeamsChannelsForTenant.mockResolvedValue([
      { id: 'pending-1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: 'Sales closer' },
    ])
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-bind',
      tenantId: 'tenant-bind',
      text: 'bind clos',
      serviceUrl: 'https://smba.trafficmanager.net/teams',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockBindHostedTeamsChannel).toHaveBeenCalledWith({
      conversationId: 'conv-bind',
      channelId: 'pending-1',
      serviceUrl: 'https://smba.trafficmanager.net/teams',
    })
  })

  it('lists active and pending agents when agents is called on a bound conversation', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: 'Sales closer', is_primary: true },
    ])
    mockGetPrimaryTeamsChannelForConversation.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    mockListPendingTeamsChannelsForTenant.mockResolvedValue([
      { id: 'pending-2', assistant_id: 'a2', assistant_name: 'Support', assistant_description: 'Ops helper' },
    ])
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-1',
      tenantId: 'tenant-1',
      text: 'agents',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(sendText).toHaveBeenCalledWith(
      'Agents available for this Teams conversation:\n* Closer (active here)\n- Support (ready to bind here)\n\nType "switch <agent name>" to swap the active agent, or "bind <agent name>" if nothing is active yet.',
    )
  })

  it('switches to a pending installed agent by binding it into the conversation', async () => {
    mockListTeamsChannelsForConversation.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    mockGetPrimaryTeamsChannelForConversation.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    mockListPendingTeamsChannelsForTenant.mockResolvedValue([
      { id: 'pending-2', assistant_id: 'a2', assistant_name: 'Support', assistant_description: 'Ops helper' },
    ])
    const sendText = vi.fn()

    const result = await resolveHostedTeamsInbound({
      conversationId: 'conv-1',
      tenantId: 'tenant-1',
      text: 'switch support',
      serviceUrl: 'https://smba.trafficmanager.net/teams',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockBindHostedTeamsChannel).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      channelId: 'pending-2',
      serviceUrl: 'https://smba.trafficmanager.net/teams',
    })
    expect(sendText).toHaveBeenCalledWith('Support is now active in this Teams conversation.')
  })
})
