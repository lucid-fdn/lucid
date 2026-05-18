import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListChannels = vi.fn()
const mockListWorkspaces = vi.fn()
const mockSetPrimary = vi.fn()
const mockSwitchWorkspace = vi.fn()
const mockUnbind = vi.fn()
const mockGetPrimary = vi.fn()
const mockPersistScope = vi.fn()
const mockGetAssistant = vi.fn()
const mockStartAgentOpsRunFromChannelCommand = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', () => ({
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  listTelegramChannelsForChat: (...args: unknown[]) => mockListChannels(...args),
  listTelegramWorkspacesForChat: (...args: unknown[]) => mockListWorkspaces(...args),
  persistTelegramChatScope: (...args: unknown[]) => mockPersistScope(...args),
  setPrimaryTelegramChannel: (...args: unknown[]) => mockSetPrimary(...args),
  switchTelegramChatWorkspace: (...args: unknown[]) => mockSwitchWorkspace(...args),
  unbindTelegramChannel: (...args: unknown[]) => mockUnbind(...args),
  getPrimaryTelegramChannelForChat: (...args: unknown[]) => mockGetPrimary(...args),
}))

vi.mock('@/lib/db/agent-ops-channel-launch', () => ({
  startAgentOpsRunFromChannelCommand: (...args: unknown[]) => mockStartAgentOpsRunFromChannelCommand(...args),
}))

import {
  handleAgentsCommand,
  handleAgentOpsCommand,
  handleHelpCommand,
  handleLeaveCommand,
  handleSwitchCommand,
  handleWhoamiCommand,
  handleWorkspaceCommand,
} from '../hosted-commands'

const UUID_A = '11111111-2222-3333-4444-555555555555'
const UUID_B = '99999999-8888-7777-6666-555555555555'

beforeEach(() => {
  mockListChannels.mockReset()
  mockListWorkspaces.mockReset()
  mockSetPrimary.mockReset()
  mockSwitchWorkspace.mockReset()
  mockUnbind.mockReset()
  mockGetPrimary.mockReset()
  mockPersistScope.mockReset()
  mockGetAssistant.mockReset()
  mockStartAgentOpsRunFromChannelCommand.mockReset()
})

describe('handleAgentsCommand', () => {
  it('returns onboarding text when no bindings', async () => {
    mockListChannels.mockResolvedValue([])
    const reply = await handleAgentsCommand('chat1')
    expect(reply.text).toMatch(/edge of Lucid/i)
    expect(reply.reply_markup).toBeDefined()
  })

  it('returns keyboard when bindings exist', async () => {
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', is_primary: true },
    ])
    const reply = await handleAgentsCommand('chat1')
    expect(reply.text).toContain('<b>Agents in this chat</b>')
    expect(reply.text).toContain('<b>Active now</b>: Alice')
    expect(reply.reply_markup?.inline_keyboard).toHaveLength(1)
  })
})

describe('handleSwitchCommand', () => {
  it('opens the picker when called bare', async () => {
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', is_primary: false },
    ])
    const reply = await handleSwitchCommand('chat1', '')
    expect(reply.text).toMatch(/Choose the next active agent/i)
    expect(reply.reply_markup).toBeDefined()
  })

  it('returns onboarding when no bindings', async () => {
    mockListChannels.mockResolvedValue([])
    const reply = await handleSwitchCommand('chat1', 'alice')
    expect(reply.text).toMatch(/edge of Lucid/i)
  })

  it('reports no match when name is unknown', async () => {
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', is_primary: false },
    ])
    const reply = await handleSwitchCommand('chat1', 'zoidberg')
    expect(reply.text).toMatch(/No Lucid entity matching/)
  })

  it('disambiguates multiple matches with a keyboard', async () => {
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice One', is_primary: false },
      { id: 'c2', assistant_id: UUID_B, assistant_name: 'Alice Two', is_primary: false },
    ])
    const reply = await handleSwitchCommand('chat1', 'alice')
    expect(reply.text).toMatch(/More than one agent answers/)
    expect(reply.reply_markup?.inline_keyboard).toHaveLength(2)
    expect(mockSetPrimary).not.toHaveBeenCalled()
  })

  it('switches when exactly one match', async () => {
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', is_primary: false },
      { id: 'c2', assistant_id: UUID_B, assistant_name: 'Bob', is_primary: true },
    ])
    mockSetPrimary.mockResolvedValue({ ok: true })
    const reply = await handleSwitchCommand('chat1', 'alice')
    expect(mockSetPrimary).toHaveBeenCalledWith('chat1', UUID_A)
    expect(mockPersistScope).not.toHaveBeenCalled()
    expect(reply.text).toContain('<b>Active now</b>: Alice')
    expect(reply.reply_markup).toMatchObject({ keyboard: expect.any(Array) })
  })

  it('persists workspace scope when the switched agent includes an org', async () => {
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', org_id: 'org-a', is_primary: false },
    ])
    mockSetPrimary.mockResolvedValue({ ok: true })
    await handleSwitchCommand('chat1', 'alice')
    expect(mockPersistScope).toHaveBeenCalledWith('chat1', 'org-a')
  })

  it('reports failure when DB swap fails', async () => {
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', is_primary: false },
    ])
    mockSetPrimary.mockResolvedValue({ ok: false, error: 'not_bound' })
    const reply = await handleSwitchCommand('chat1', 'alice')
    expect(reply.text).toMatch(/could not step in/i)
  })
})

describe('handleWhoamiCommand', () => {
  it('returns onboarding when no primary AND no bindings', async () => {
    mockGetPrimary.mockResolvedValue(null)
    mockListChannels.mockResolvedValue([])
    const reply = await handleWhoamiCommand('chat1')
    expect(reply.text).toMatch(/edge of Lucid/i)
  })

  it('shows keyboard when bindings but no primary', async () => {
    mockGetPrimary.mockResolvedValue(null)
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', is_primary: false },
    ])
    const reply = await handleWhoamiCommand('chat1')
    expect(reply.text).toMatch(/Choose who should step in/)
    expect(reply.reply_markup).toBeDefined()
  })

  it('names the active agent when primary is set', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', is_primary: true },
    ])
    const reply = await handleWhoamiCommand('chat1')
    expect(reply.text).toContain('<b>Active now</b>: Alice')
    expect(reply.reply_markup).toMatchObject({ keyboard: expect.any(Array) })
  })

  it('includes a one-line description when the agent has one', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: 'Prediction markets analyst\nSecond line should be dropped',
        is_primary: true,
      },
    ])
    const reply = await handleWhoamiCommand('chat1')
    expect(reply.text).toContain('<b>Active now</b>: Alice')
    expect(reply.text).toContain('Prediction markets analyst')
  })
})

describe('handleLeaveCommand', () => {
  it('reports nothing to leave when no primary', async () => {
    mockGetPrimary.mockResolvedValue(null)
    const reply = await handleLeaveCommand('chat1')
    expect(reply.text).toMatch(/No agent is active right now/)
    expect(mockUnbind).not.toHaveBeenCalled()
  })

  it('unbinds the active agent', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', org_id: 'org-a', is_primary: true },
    ])
    const reply = await handleLeaveCommand('chat1')
    expect(mockPersistScope).toHaveBeenCalledWith('chat1', 'org-a')
    expect(mockUnbind).toHaveBeenCalledWith('chat1', UUID_A)
    expect(reply.text).toMatch(/Alice stepped out/)
    expect(reply.reply_markup).toMatchObject({ keyboard: expect.any(Array) })
  })
})

describe('handleWorkspaceCommand', () => {
  it('shows onboarding when no workspace is linked', async () => {
    mockListWorkspaces.mockResolvedValue([])
    const reply = await handleWorkspaceCommand('chat1')
    expect(reply.text).toMatch(/edge of Lucid/i)
  })

  it('shows the workspace picker when called bare', async () => {
    mockListWorkspaces.mockResolvedValue([
      { org_id: 'org-a', org_name: 'Alpha', agent_count: 2, is_current: true },
      { org_id: 'org-b', org_name: 'Beta', agent_count: 1, is_current: false },
    ])
    const reply = await handleWorkspaceCommand('chat1')
    expect(reply.text).toContain('<b>Current workspace</b>: Alpha')
    expect(reply.reply_markup?.inline_keyboard).toHaveLength(2)
  })

  it('switches when exactly one workspace matches', async () => {
    mockListWorkspaces.mockResolvedValue([
      { org_id: 'org-a', org_name: 'Alpha', agent_count: 2, is_current: true },
      { org_id: 'org-b', org_name: 'Beta', agent_count: 1, is_current: false },
    ])
    mockSwitchWorkspace.mockResolvedValue({ ok: true, assistantId: UUID_B })
    mockGetAssistant.mockResolvedValue({ id: UUID_B, name: 'Bob', telegram_display_name: 'Lead Hunter' })
    const reply = await handleWorkspaceCommand('chat1', 'beta')
    expect(mockSwitchWorkspace).toHaveBeenCalledWith('chat1', 'org-b')
    expect(reply.text).toContain('<b>Current workspace</b>: Beta')
    expect(reply.text).toContain('<b>Active now</b>: Lead Hunter')
  })
})

describe('handleHelpCommand', () => {
  it('returns the static help text', () => {
    const reply = handleHelpCommand()
    expect(reply.text).toContain('/agents')
    expect(reply.text).toContain('/switch')
    expect(reply.text).toContain('<b>/switch</b>: open the agent picker')
    expect(reply.text).toContain('/workspace')
    expect(reply.text).toContain('/whoami')
    expect(reply.text).toContain('/leave')
    expect(reply.reply_markup).toMatchObject({ keyboard: expect.any(Array) })
  })
})

describe('handleAgentOpsCommand', () => {
  it('launches Agent Ops from the active Telegram binding', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', org_id: 'org-a', is_primary: true },
    ])
    mockStartAgentOpsRunFromChannelCommand.mockResolvedValue('Telegram Agent Ops run started')

    const reply = await handleAgentOpsCommand('chat1', 'review https://example.com', 'user-1')

    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      channelType: 'telegram',
      channelLabel: 'Telegram',
      surfaceId: 'chat1',
      externalUserId: 'user-1',
      command: expect.objectContaining({ workflowId: 'review', target: 'https://example.com' }),
      binding: expect.objectContaining({ id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', org_id: 'org-a', is_primary: true }),
    }))
    expect(reply.text).toBe('Telegram Agent Ops run started')
  })

  it('launches Browser Operator workflows from Telegram command aliases', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', org_id: 'org-a', is_primary: true },
    ])
    mockStartAgentOpsRunFromChannelCommand.mockResolvedValue('Telegram Agent Ops run started')

    const reply = await handleAgentOpsCommand('chat1', 'check https://www.example.com', 'user-1')

    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({ workflowId: 'check-page', target: 'https://www.example.com' }),
    }))
    expect(reply.text).toBe('Telegram Agent Ops run started')
  })

  it('launches governed buying workflows from Telegram command aliases', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockListChannels.mockResolvedValue([
      { id: 'c1', assistant_id: UUID_A, assistant_name: 'Alice', org_id: 'org-a', is_primary: true },
    ])
    mockStartAgentOpsRunFromChannelCommand.mockResolvedValue('Telegram Agent Ops run started')

    const reply = await handleAgentOpsCommand('chat1', 'buy weekly groceries under $120 from Carrefour', 'user-1')

    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.objectContaining({
        workflowId: 'buy-stuff',
        target: 'weekly groceries under $120 from Carrefour',
      }),
    }))
    expect(reply.text).toBe('Telegram Agent Ops run started')
  })

  it('returns usage when the workflow is missing', async () => {
    const reply = await handleAgentOpsCommand('chat1', '')
    expect(reply.text).toContain('Telegram Agent Ops')
    expect(mockStartAgentOpsRunFromChannelCommand).not.toHaveBeenCalled()
  })
})
