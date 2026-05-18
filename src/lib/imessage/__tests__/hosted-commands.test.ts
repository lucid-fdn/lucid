import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetPrimaryHostedIMessageChannelForChat = vi.fn()
const mockListHostedIMessageChannelsForChat = vi.fn()
const mockSetPrimaryHostedIMessageChannel = vi.fn()
const mockUpsertHostedIMessageChannel = vi.fn()
const mockStartAgentOpsRunFromChannelCommand = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', () => ({
  getPrimaryHostedIMessageChannelForChat: (...args: unknown[]) =>
    mockGetPrimaryHostedIMessageChannelForChat(...args),
  listHostedIMessageChannelsForChat: (...args: unknown[]) =>
    mockListHostedIMessageChannelsForChat(...args),
  setPrimaryHostedIMessageChannel: (...args: unknown[]) =>
    mockSetPrimaryHostedIMessageChannel(...args),
  upsertHostedIMessageChannel: (...args: unknown[]) =>
    mockUpsertHostedIMessageChannel(...args),
}))

vi.mock('@/lib/db/agent-ops-channel-launch', () => ({
  startAgentOpsRunFromChannelCommand: (...args: unknown[]) =>
    mockStartAgentOpsRunFromChannelCommand(...args),
}))

import { resolveHostedIMessageInbound } from '../hosted-commands'

describe('resolveHostedIMessageInbound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListHostedIMessageChannelsForChat.mockResolvedValue([])
    mockGetPrimaryHostedIMessageChannelForChat.mockResolvedValue(null)
    mockSetPrimaryHostedIMessageChannel.mockResolvedValue(true)
    mockUpsertHostedIMessageChannel.mockResolvedValue({ channelId: 'channel-1' })
    mockStartAgentOpsRunFromChannelCommand.mockResolvedValue('iMessage Agent Ops run started')
  })

  it('shows Agent Ops in help for bound chats', async () => {
    mockListHostedIMessageChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Guide', assistant_description: null, is_primary: true },
    ])
    const sendText = vi.fn()

    const result = await resolveHostedIMessageInbound({
      chatId: 'chat-1',
      text: 'help',
      hostedSurfaceId: 'surface-1',
      resolveSurfaceDefault: vi.fn(),
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('ops <workflow> <target>'))
    expect(sendText).toHaveBeenCalledWith(expect.stringContaining('check <url>'))
  })

  it('launches Agent Ops from the active iMessage binding', async () => {
    mockListHostedIMessageChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Guide', assistant_description: null, is_primary: true },
    ])
    mockGetPrimaryHostedIMessageChannelForChat.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    const sendText = vi.fn()

    const result = await resolveHostedIMessageInbound({
      chatId: 'chat-ops',
      text: 'ops qa https://preview.example.com',
      hostedSurfaceId: 'surface-1',
      resolveSurfaceDefault: vi.fn(),
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      channelType: 'imessage',
      channelLabel: 'iMessage',
      surfaceId: 'chat-ops',
      command: expect.objectContaining({
        workflowId: 'qa',
        target: 'https://preview.example.com',
      }),
      binding: expect.objectContaining({ assistant_id: 'a1' }),
    }))
    expect(sendText).toHaveBeenCalledWith('iMessage Agent Ops run started')
  })

  it('launches Browser Operator workflows from natural iMessage commands', async () => {
    mockListHostedIMessageChannelsForChat.mockResolvedValue([
      { id: 'c1', assistant_id: 'a1', assistant_name: 'Guide', assistant_description: null, is_primary: true },
    ])
    mockGetPrimaryHostedIMessageChannelForChat.mockResolvedValue({ id: 'c1', assistant_id: 'a1' })
    const sendText = vi.fn()

    const result = await resolveHostedIMessageInbound({
      chatId: 'chat-browser',
      text: 'extract pricing from https://www.example.com/pricing',
      hostedSurfaceId: 'surface-1',
      resolveSurfaceDefault: vi.fn(),
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({
        workflowId: 'extract-data',
        target: 'pricing from https://www.example.com/pricing',
      }),
    }))
  })

  it('launches Browser Operator workflows from an iMessage surface default', async () => {
    mockListHostedIMessageChannelsForChat.mockResolvedValue([])
    const resolveSurfaceDefault = vi.fn().mockResolvedValue({ channelId: 'surface-channel', assistantId: 'a-default' })
    const sendText = vi.fn()

    const result = await resolveHostedIMessageInbound({
      chatId: 'chat-default',
      text: 'check https://www.example.com',
      hostedSurfaceId: 'surface-1',
      resolveSurfaceDefault,
      sendText,
    })

    expect(result).toEqual({ kind: 'handled' })
    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      channelType: 'imessage',
      surfaceId: 'chat-default',
      command: expect.objectContaining({ workflowId: 'check-page', target: 'https://www.example.com' }),
      binding: expect.objectContaining({ assistant_id: 'a-default' }),
    }))
  })
})
