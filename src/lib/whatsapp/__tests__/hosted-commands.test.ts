import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConsumeWhatsAppConnectToken = vi.fn()
const mockGetAssistant = vi.fn()
const mockGetPrimaryWhatsAppChannelForChat = vi.fn()
const mockGetWhatsAppVoiceSettingsForChat = vi.fn()
const mockListWhatsAppChannelsForChat = vi.fn()
const mockSetPrimaryWhatsAppChannel = vi.fn()
const mockUnbindWhatsAppChannel = vi.fn()
const mockUpdateWhatsAppVoiceSettingsForChat = vi.fn()
const mockUpsertHostedWhatsAppChannel = vi.fn()
const mockStartAgentOpsRunFromChannelCommand = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', () => ({
  consumeWhatsAppConnectToken: (...args: unknown[]) => mockConsumeWhatsAppConnectToken(...args),
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  getPrimaryWhatsAppChannelForChat: (...args: unknown[]) => mockGetPrimaryWhatsAppChannelForChat(...args),
  getWhatsAppVoiceSettingsForChat: (...args: unknown[]) => mockGetWhatsAppVoiceSettingsForChat(...args),
  listWhatsAppChannelsForChat: (...args: unknown[]) => mockListWhatsAppChannelsForChat(...args),
  setPrimaryWhatsAppChannel: (...args: unknown[]) => mockSetPrimaryWhatsAppChannel(...args),
  unbindWhatsAppChannel: (...args: unknown[]) => mockUnbindWhatsAppChannel(...args),
  updateWhatsAppVoiceSettingsForChat: (...args: unknown[]) => mockUpdateWhatsAppVoiceSettingsForChat(...args),
  upsertHostedWhatsAppChannel: (...args: unknown[]) => mockUpsertHostedWhatsAppChannel(...args),
}))

vi.mock('@/lib/db/agent-ops-channel-launch', () => ({
  startAgentOpsRunFromChannelCommand: (...args: unknown[]) => mockStartAgentOpsRunFromChannelCommand(...args),
}))

import { resolveHostedWhatsAppInbound } from '../hosted-commands'

describe('resolveHostedWhatsAppInbound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles help with the full WhatsApp command list', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: 'Sales closer', is_primary: true },
    ])
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'help',
      hostedSurfaceId: 'phone-id',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('whoami'))
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('leave'))
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('ops <workflow> <target>'))
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('check <url>'))
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('buy <request>'))
  })

  it('launches Agent Ops from the active WhatsApp binding', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', org_id: 'org-1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    mockGetPrimaryWhatsAppChannelForChat.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    mockStartAgentOpsRunFromChannelCommand.mockResolvedValue('WhatsApp Agent Ops run started')
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'ops qa https://preview.example.com',
      hostedSurfaceId: 'phone-id',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      channelType: 'whatsapp',
      channelLabel: 'WhatsApp',
      surfaceId: 'chat-1',
      command: expect.objectContaining({ workflowId: 'qa', target: 'https://preview.example.com' }),
      binding: expect.objectContaining({ id: 'c1', assistant_id: 'a1', org_id: 'org-1', assistant_name: 'Closer', assistant_description: null, is_primary: true }),
    }))
    expect(sendText).toHaveBeenCalledWith('WhatsApp Agent Ops run started')
  })

  it('launches Browser Operator workflows from natural WhatsApp commands', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', org_id: 'org-1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    mockGetPrimaryWhatsAppChannelForChat.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    mockStartAgentOpsRunFromChannelCommand.mockResolvedValue('WhatsApp Agent Ops run started')
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'check https://www.example.com',
      hostedSurfaceId: 'phone-id',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({ workflowId: 'check-page', target: 'https://www.example.com' }),
    }))
  })

  it('launches governed buying workflows from natural WhatsApp commands', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', org_id: 'org-1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    mockGetPrimaryWhatsAppChannelForChat.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    mockStartAgentOpsRunFromChannelCommand.mockResolvedValue('WhatsApp Agent Ops run started')
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'buy weekly groceries under $120 from Carrefour',
      hostedSurfaceId: 'phone-id',
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

  it('launches Browser Operator workflows from a WhatsApp surface default', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([])
    mockStartAgentOpsRunFromChannelCommand.mockResolvedValue('WhatsApp Agent Ops run started')
    const resolveSurfaceDefault = vi.fn().mockResolvedValue({ channelId: 'surface-channel', assistantId: 'a-default' })
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-default',
      text: 'research https://www.example.com',
      hostedSurfaceId: 'phone-id',
      resolveSurfaceDefault,
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      channelType: 'whatsapp',
      surfaceId: 'chat-default',
      command: expect.objectContaining({ workflowId: 'research-site', target: 'https://www.example.com' }),
      binding: expect.objectContaining({ assistant_id: 'a-default' }),
    }))
    expect(sendText).toHaveBeenCalledWith('WhatsApp Agent Ops run started')
  })

  it('handles whoami with the active assistant description', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: 'Sales closer\nExtra', is_primary: true },
    ])
    mockGetPrimaryWhatsAppChannelForChat.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'whoami',
      hostedSurfaceId: 'phone-id',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(sendText).toHaveBeenCalledWith(
      'Currently chatting with Closer\nSales closer\n\nNo other agents are linked to this chat yet.',
    )
  })

  it('handles status with switchable agent count', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: 'Sales closer', is_primary: true },
      { id: 'c2', assistant_id: 'a2', assistant_name: 'Support', assistant_description: 'Ops helper', is_primary: false },
    ])
    mockGetPrimaryWhatsAppChannelForChat.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'status',
      hostedSurfaceId: 'phone-id',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(sendText).toHaveBeenCalledWith(
      'Currently chatting with Closer\nSales closer\n\n1 more agent can be switched in with "switch <agent name>".',
    )
  })

  it('handles leave by unbinding the active assistant', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
      { id: 'c2', assistant_id: 'a2', assistant_name: 'Support', assistant_description: null, is_primary: false },
    ])
    mockGetPrimaryWhatsAppChannelForChat.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'leave',
      hostedSurfaceId: 'phone-id',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockUnbindWhatsAppChannel).toHaveBeenCalledWith('chat-1', 'a1')
    expect(sendText).toHaveBeenCalledWith('Closer stepped out of this chat. Reply "agents" to bring another one in.')
  })

  it('reports WhatsApp voice settings', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    mockGetWhatsAppVoiceSettingsForChat.mockResolvedValue({
      channelId: 'c1',
      assistantId: 'a1',
      assistantName: 'Closer',
      mode: 'auto',
      voiceId: 'coral',
      instructions: null,
    })
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'voice',
      hostedSurfaceId: 'phone-id',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('Mode: auto'))
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('Voice: coral'))
  })

  it('updates WhatsApp voice mode from chat commands', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    mockUpdateWhatsAppVoiceSettingsForChat.mockResolvedValue({
      channelId: 'c1',
      assistantId: 'a1',
      assistantName: 'Closer',
      mode: 'always',
      voiceId: null,
      instructions: null,
    })
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'voice always',
      hostedSurfaceId: 'phone-id',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockUpdateWhatsAppVoiceSettingsForChat).toHaveBeenCalledWith({
      chatId: 'chat-1',
      mode: 'always',
    })
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('Mode: always'))
  })

  it('updates WhatsApp voice selection from chat commands', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    mockUpdateWhatsAppVoiceSettingsForChat.mockResolvedValue({
      channelId: 'c1',
      assistantId: 'a1',
      assistantName: 'Closer',
      mode: 'auto',
      voiceId: 'onyx',
      instructions: null,
    })
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'voice set onyx',
      hostedSurfaceId: 'phone-id',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockUpdateWhatsAppVoiceSettingsForChat).toHaveBeenCalledWith({
      chatId: 'chat-1',
      voiceId: 'onyx',
    })
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('Voice: onyx'))
  })

  it('switches by unique partial agent name', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
      { id: 'c2', assistant_id: 'a2', assistant_name: 'Support', assistant_description: null, is_primary: false },
    ])
    mockSetPrimaryWhatsAppChannel.mockResolvedValue(true)
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'switch supp',
      hostedSurfaceId: 'phone-id',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockSetPrimaryWhatsAppChannel).toHaveBeenCalledWith({
      whatsappChatId: 'chat-1',
      channelId: 'c2',
    })
    expect(sendText).toHaveBeenCalledWith('Support is now active in this chat.')
  })

  it('reports when the requested agent is already active', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Closer', assistant_description: null, is_primary: true },
    ])
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'switch closer',
      hostedSurfaceId: 'phone-id',
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockSetPrimaryWhatsAppChannel).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith('Closer is already active in this chat.')
  })

  it('routes plain inbound to a hosted surface default when no chat binding exists yet', async () => {
    mockListWhatsAppChannelsForChat.mockResolvedValue([])
    const sendText = vi.fn()

    const result = await resolveHostedWhatsAppInbound({
      chatId: 'chat-1',
      text: 'hello there',
      hostedSurfaceId: 'phone-id',
      resolveSurfaceDefault: vi.fn().mockResolvedValue({
        channelId: 'default-channel-1',
        assistantId: 'assistant-default-1',
      }),
      sendText,
    })

    expect(result).toEqual({
      kind: 'route',
      channelId: 'default-channel-1',
      assistantId: 'assistant-default-1',
    })
    expect(sendText).not.toHaveBeenCalled()
  })
})
