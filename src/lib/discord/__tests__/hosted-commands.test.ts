import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListChannels = vi.fn()
const mockSetPrimary = vi.fn()
const mockUnbind = vi.fn()
const mockGetPrimary = vi.fn()
const mockGetDiscordStatusForGuild = vi.fn()
const mockGetDiscordVoiceSettingsForGuild = vi.fn()
const mockUpdateDiscordVoiceSettingsForGuild = vi.fn()
const mockGetAssistant = vi.fn()
const mockUpdateAssistant = vi.fn()
const mockFetchModels = vi.fn()
const mockDiscordWorkerFetch = vi.fn()
const mockRunChannelNativeAction = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', () => ({
  listDiscordChannelsForGuild: (...args: unknown[]) =>
    mockListChannels(...args),
  setPrimaryDiscordChannel: (...args: unknown[]) => mockSetPrimary(...args),
  unbindDiscordChannel: (...args: unknown[]) => mockUnbind(...args),
  getPrimaryDiscordChannelForGuild: (...args: unknown[]) =>
    mockGetPrimary(...args),
  getDiscordStatusForGuild: (...args: unknown[]) =>
    mockGetDiscordStatusForGuild(...args),
  getDiscordVoiceSettingsForGuild: (...args: unknown[]) =>
    mockGetDiscordVoiceSettingsForGuild(...args),
  updateDiscordVoiceSettingsForGuild: (...args: unknown[]) =>
    mockUpdateDiscordVoiceSettingsForGuild(...args),
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  updateAssistant: (...args: unknown[]) => mockUpdateAssistant(...args),
}))

vi.mock('@/lib/ai/models', () => ({
  fetchModels: (...args: unknown[]) => mockFetchModels(...args),
}))

vi.mock('@/lib/discord/worker-admin', () => ({
  discordWorkerFetch: (...args: unknown[]) => mockDiscordWorkerFetch(...args),
}))

vi.mock('@/lib/db/channel-native-actions', () => ({
  runChannelNativeAction: (...args: unknown[]) => mockRunChannelNativeAction(...args),
  runChannelNativeActionChunks: async (...args: unknown[]) => [await mockRunChannelNativeAction(...args)],
}))

process.env.DISCORD_HOSTED_INTERACTION_SECRET = 'a'.repeat(32)

import {
  handleAgentsCommand,
  handleAgentOpsCommand,
  handleSwitchCommand,
  handleWhoamiCommand,
  handleProbeCommand,
  handleStatusCommand,
  handleVoiceChannelCommand,
  handleVoiceCommand,
  handleModelsCommand,
  handleModelCommand,
  handleModelPage,
  handleModelSelect,
  handleLeaveCommand,
  handleLeaveConfirm,
  handleHelpCommand,
  TEXTS,
} from '../hosted-commands'

const UUID_A = '11111111-2222-3333-4444-555555555555'
const UUID_B = '99999999-8888-7777-6666-555555555555'
const ADMIN_PERMS = '8'

beforeEach(() => {
  mockListChannels.mockReset()
  mockSetPrimary.mockReset()
  mockUnbind.mockReset()
  mockGetPrimary.mockReset()
  mockGetDiscordStatusForGuild.mockReset()
  mockGetDiscordVoiceSettingsForGuild.mockReset()
  mockUpdateDiscordVoiceSettingsForGuild.mockReset()
  mockGetAssistant.mockReset()
  mockUpdateAssistant.mockReset()
  mockFetchModels.mockReset()
  mockDiscordWorkerFetch.mockReset()
  mockRunChannelNativeAction.mockReset()
})

describe('handleAgentsCommand', () => {
  it('rejects DM invocation', async () => {
    const reply = await handleAgentsCommand(null)
    expect(reply.content).toBe(TEXTS.guildOnly)
  })

  it('returns onboarding text when no bindings', async () => {
    mockListChannels.mockResolvedValue([])
    const reply = await handleAgentsCommand('g1', 'u1')
    expect(reply.content).toMatch(/No agent is connected/)
    expect(reply.components).toBeUndefined()
  })

  it('returns select menu when bindings exist', async () => {
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: null,
        is_primary: true,
      },
    ])
    const reply = await handleAgentsCommand('g1', 'u1')
    expect(reply.components).toHaveLength(1)
    expect(reply.flags).toBeDefined()
  })
})

describe('handleSwitchCommand', () => {
  it('requires a guild', async () => {
    const reply = await handleSwitchCommand(null, 'alice')
    expect(reply.content).toBe(TEXTS.guildOnly)
  })

  it('rejects empty name', async () => {
    const reply = await handleSwitchCommand('g1', '  ')
    expect(reply.content).toMatch(/Usage/)
  })

  it('returns onboarding when no bindings', async () => {
    mockListChannels.mockResolvedValue([])
    const reply = await handleSwitchCommand('g1', 'alice', 'u1')
    expect(reply.content).toMatch(/No agent is connected/)
  })

  it('reports no match', async () => {
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: null,
        is_primary: true,
      },
    ])
    const reply = await handleSwitchCommand('g1', 'bob')
    expect(reply.content).toMatch(/No agent matching/)
  })

  it('prompts when multiple matches', async () => {
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice One',
        assistant_description: null,
        is_primary: true,
      },
      {
        id: 'c2',
        assistant_id: UUID_B,
        assistant_name: 'Alice Two',
        assistant_description: null,
        is_primary: false,
      },
    ])
    const reply = await handleSwitchCommand('g1', 'alice', 'u1')
    expect(reply.content).toMatch(/Multiple agents match/)
    expect(reply.components).toBeDefined()
  })

  it('switches on single match without requiring a share flag gate', async () => {
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: null,
        is_primary: false,
      },
    ])
    mockSetPrimary.mockResolvedValue({ ok: true })
    const reply = await handleSwitchCommand('g1', 'alice')
    expect(reply.content).toMatch(/Switched to/)
    expect(mockSetPrimary).toHaveBeenCalledWith('g1', UUID_A, false)
  })

  it('reports when the selected agent is already active', async () => {
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: null,
        is_primary: true,
      },
    ])
    const reply = await handleSwitchCommand('g1', 'alice')
    expect(reply.content).toMatch(/already active/)
    expect(mockSetPrimary).not.toHaveBeenCalled()
  })

  it('reports failure when set_primary fails', async () => {
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: null,
        is_primary: false,
      },
    ])
    mockSetPrimary.mockResolvedValue({ ok: false, error: 'missing_channel' })
    const reply = await handleSwitchCommand('g1', 'alice')
    expect(reply.content).toMatch(/Could not switch/)
  })
})

describe('handleWhoamiCommand', () => {
  it('requires a guild', async () => {
    const reply = await handleWhoamiCommand(null)
    expect(reply.content).toBe(TEXTS.guildOnly)
  })

  it('prompts for selection when no primary but bindings exist', async () => {
    mockGetPrimary.mockResolvedValue(null)
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: null,
        is_primary: false,
      },
    ])
    const reply = await handleWhoamiCommand('g1', 'u1')
    expect(reply.content).toMatch(/No active agent/)
    expect(reply.components).toBeDefined()
  })

  it('returns active agent info when primary exists', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: 'Portfolio manager',
        is_primary: true,
      },
    ])
    const reply = await handleWhoamiCommand('g1')
    expect(reply.content).toMatch(/Alice/)
    expect(reply.content).toMatch(/Portfolio manager/)
    expect(reply.content).toMatch(/No other agents are linked/)
  })

  it('reports how many other agents can be switched in', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: 'Portfolio manager',
        is_primary: true,
      },
      {
        id: 'c2',
        assistant_id: UUID_B,
        assistant_name: 'Bob',
        assistant_description: null,
        is_primary: false,
      },
    ])

    const reply = await handleWhoamiCommand('g1')
    expect(reply.content).toMatch(/1 more agent can be switched in/)
  })
})

describe('handleStatusCommand', () => {
  it('requires a guild', async () => {
    const reply = await handleStatusCommand(null)
    expect(reply.content).toBe(TEXTS.guildOnly)
  })

  it('returns onboarding when nothing is bound', async () => {
    mockGetDiscordStatusForGuild.mockResolvedValue(null)
    mockListChannels.mockResolvedValue([])

    const reply = await handleStatusCommand('g1')
    expect(reply.content).toMatch(/No agent is connected/)
  })

  it('returns the active delivery, routing, and voice status', async () => {
    mockGetDiscordStatusForGuild.mockResolvedValue({
      channelId: 'c1',
      assistantId: UUID_A,
      assistantName: 'Alice',
      assistantDescription: 'Portfolio manager\nSecond line',
      model: 'gpt-4.1-mini',
      guildName: 'Lucid Guild',
      dedicatedChannelIds: ['chan-1', 'chan-2'],
      replyToMode: 'first',
      maxLinesPerMessage: 24,
      chunkMode: 'newline',
      voiceMode: 'always',
      voiceId: 'onyx',
    })
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: 'Portfolio manager',
        is_primary: true,
      },
      {
        id: 'c2',
        assistant_id: UUID_B,
        assistant_name: 'Bob',
        assistant_description: null,
        is_primary: false,
      },
    ])

    const reply = await handleStatusCommand('g1')
    expect(reply.content).toMatch(/Alice/)
    expect(reply.content).toMatch(/Model: `gpt-4.1-mini`/)
    expect(reply.content).toMatch(/2 dedicated channels always reply/)
    expect(reply.content).toMatch(/Reply on first chunk only/)
    expect(reply.content).toMatch(/newline-aware/)
    expect(reply.content).toMatch(/24/)
    expect(reply.content).toMatch(/always/)
    expect(reply.content).toMatch(/Lucid Guild/)
  })
})

describe('handleVoiceCommand', () => {
  it('requires a guild', async () => {
    const reply = await handleVoiceCommand({ guildId: null, memberPermissions: ADMIN_PERMS })
    expect(reply.content).toBe(TEXTS.guildOnly)
  })

  it('reports current voice settings for the active agent', async () => {
    mockGetDiscordVoiceSettingsForGuild.mockResolvedValue({
      assistantId: UUID_A,
      assistantName: 'Alice',
      mode: 'auto',
      voiceId: 'coral',
      instructions: null,
    })

    const reply = await handleVoiceCommand({ guildId: 'g1', memberPermissions: ADMIN_PERMS })
    expect(reply.content).toMatch(/Alice/)
    expect(reply.content).toMatch(/Mode: `auto`/)
    expect(reply.content).toMatch(/Voice: `coral`/)
  })

  it('rejects non-admin voice mutations', async () => {
    mockGetDiscordVoiceSettingsForGuild.mockResolvedValue({
      assistantId: UUID_A,
      assistantName: 'Alice',
      mode: 'off',
      voiceId: null,
      instructions: null,
    })

    const reply = await handleVoiceCommand({
      guildId: 'g1',
      memberPermissions: '0',
      rawMode: 'always',
    })
    expect(reply.content).toMatch(/administrators/)
    expect(mockUpdateDiscordVoiceSettingsForGuild).not.toHaveBeenCalled()
  })

  it('updates voice mode and voice id for admins', async () => {
    mockGetDiscordVoiceSettingsForGuild.mockResolvedValue({
      assistantId: UUID_A,
      assistantName: 'Alice',
      mode: 'off',
      voiceId: null,
      instructions: null,
    })
    mockUpdateDiscordVoiceSettingsForGuild.mockResolvedValue({
      assistantId: UUID_A,
      assistantName: 'Alice',
      mode: 'always',
      voiceId: 'onyx',
      instructions: null,
    })

    const reply = await handleVoiceCommand({
      guildId: 'g1',
      memberPermissions: ADMIN_PERMS,
      rawMode: 'always',
      rawVoice: 'onyx',
    })
    expect(mockUpdateDiscordVoiceSettingsForGuild).toHaveBeenCalledWith({
      guildId: 'g1',
      assistantId: UUID_A,
      mode: 'always',
      voiceId: 'onyx',
    })
    expect(reply.content).toMatch(/Updated \*\*Alice\*\*/)
    expect(reply.content).toMatch(/Mode: `always`/)
    expect(reply.content).toMatch(/Voice: `onyx`/)
  })
})

describe('handleVoiceChannelCommand', () => {
  it('returns status when no session is active', async () => {
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: null,
        is_primary: true,
      },
    ])
    mockDiscordWorkerFetch.mockResolvedValue({ sessions: [] })

    const reply = await handleVoiceChannelCommand({
      guildId: 'g1',
      memberPermissions: ADMIN_PERMS,
      rawAction: 'status',
    })

    expect(reply.content).toMatch(/No hosted Discord voice session is active/)
    expect(mockDiscordWorkerFetch).toHaveBeenCalledWith('/discord/voice', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('joins a hosted voice session for admins', async () => {
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: null,
        is_primary: true,
      },
    ])
    mockDiscordWorkerFetch.mockResolvedValue({ ok: true, message: 'Joined voice channel 42.' })

    const reply = await handleVoiceChannelCommand({
      guildId: 'g1',
      memberPermissions: ADMIN_PERMS,
      rawAction: 'join',
      rawChannelId: '42',
    })

    expect(reply.content).toMatch(/Joined voice channel 42/)
    expect(mockDiscordWorkerFetch).toHaveBeenCalledWith('/discord/voice', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        action: 'join',
        guildId: 'g1',
        channelId: '42',
      }),
    }))
  })
})

describe('handleModelsCommand', () => {
  it('requires a guild', async () => {
    const reply = await handleModelsCommand(null)
    expect(reply.content).toBe(TEXTS.guildOnly)
  })

  it('requires an active agent', async () => {
    mockGetPrimary.mockResolvedValue(null)
    const reply = await handleModelsCommand('g1')
    expect(reply.content).toBe(TEXTS.noPrimaryHasBindings)
  })

  it('returns the current model with suggestions', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockGetAssistant.mockResolvedValue({
      id: UUID_A,
      org_id: 'org-1',
      name: 'Alice',
      lucid_model: 'gpt-4.1-mini',
    })
    mockFetchModels.mockResolvedValue([
      { id: 'm1', modelId: 'gpt-4.1-mini', name: 'GPT 4.1 Mini', provider: 'openai' },
      { id: 'm2', modelId: 'claude-sonnet', name: 'Claude Sonnet', provider: 'anthropic' },
    ])

    const reply = await handleModelsCommand('g1')
    expect(reply.content).toMatch(/Current model: `gpt-4.1-mini`/)
    expect(reply.content).toMatch(/openai: GPT 4.1 Mini/)
    expect(reply.content).toMatch(/Use `\/model name:<model>` to switch/)
  })
})

describe('handleModelCommand', () => {
  it('requires a guild', async () => {
    const reply = await handleModelCommand(null, 'gpt-4.1-mini', ADMIN_PERMS)
    expect(reply.content).toBe(TEXTS.guildOnly)
  })

  it('rejects non-admins', async () => {
    const reply = await handleModelCommand('g1', 'gpt-4.1-mini', '0')
    expect(reply.content).toMatch(/administrators/)
  })

  it('requires an active agent', async () => {
    mockGetPrimary.mockResolvedValue(null)
    const reply = await handleModelCommand('g1', 'gpt-4.1-mini', ADMIN_PERMS)
    expect(reply.content).toBe(TEXTS.noPrimaryHasBindings)
  })

  it('requires a requested model name', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockGetAssistant.mockResolvedValue({
      id: UUID_A,
      org_id: 'org-1',
      name: 'Alice',
      lucid_model: 'gpt-4.1-mini',
    })
    const reply = await handleModelCommand('g1', '   ', ADMIN_PERMS)
    expect(reply.content).toMatch(/Usage: `\/model name:<model>`/)
  })

  it('reports no matches', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockGetAssistant.mockResolvedValue({
      id: UUID_A,
      org_id: 'org-1',
      name: 'Alice',
      lucid_model: 'gpt-4.1-mini',
    })
    mockFetchModels.mockResolvedValue([
      { id: 'm1', modelId: 'gpt-4.1-mini', name: 'GPT 4.1 Mini', provider: 'openai' },
    ])

    const reply = await handleModelCommand('g1', 'not-a-model', ADMIN_PERMS)
    expect(reply.content).toMatch(/No model matched/)
  })

  it('reports ambiguous matches', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockGetAssistant.mockResolvedValue({
      id: UUID_A,
      org_id: 'org-1',
      name: 'Alice',
      lucid_model: 'gpt-4.1-mini',
    })
    mockFetchModels.mockResolvedValue([
      { id: 'm1', modelId: 'gpt-4.1-mini', name: 'GPT 4.1 Mini', provider: 'openai' },
      { id: 'm2', modelId: 'gpt-4.1', name: 'GPT 4.1', provider: 'openai' },
    ])

    const reply = await handleModelCommand('g1', 'gpt', ADMIN_PERMS)
    expect(reply.content).toMatch(/Multiple models match/)
  })

  it('updates the active agent model on an exact match', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockGetAssistant.mockResolvedValue({
      id: UUID_A,
      org_id: 'org-1',
      name: 'Alice',
      lucid_model: 'gpt-4.1-mini',
    })
    mockFetchModels.mockResolvedValue([
      { id: 'm1', modelId: 'gpt-4.1-mini', name: 'GPT 4.1 Mini', provider: 'openai' },
    ])
    mockUpdateAssistant.mockResolvedValue(undefined)

    const reply = await handleModelCommand('g1', 'gpt-4.1-mini', ADMIN_PERMS)
    expect(mockUpdateAssistant).toHaveBeenCalledWith(
      UUID_A,
      { lucid_model: 'gpt-4.1-mini' },
      'org-1',
    )
    expect(reply.content).toMatch(/Switched \*\*Alice\*\* to `gpt-4.1-mini`\./)
  })
})

describe('handleModelSelect', () => {
  it('rejects non-admin component replays', async () => {
    const reply = await handleModelSelect('g1', 'gpt-4.1-mini', '0', 'u1')
    expect(reply.content).toMatch(/administrators/)
  })

  it('updates and re-renders the model picker', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockGetAssistant.mockResolvedValue({
      id: UUID_A,
      org_id: 'org-1',
      name: 'Alice',
      lucid_model: 'gpt-4.1-mini',
    })
    mockFetchModels.mockResolvedValue([
      { id: 'gpt-4.1-mini', modelId: 'gpt-4.1-mini', name: 'GPT 4.1 Mini', provider: 'openai' },
      { id: 'claude-sonnet', modelId: 'claude-sonnet', name: 'Claude Sonnet', provider: 'anthropic' },
    ])
    mockUpdateAssistant.mockResolvedValue(undefined)

    const reply = await handleModelSelect('g1', 'claude-sonnet', ADMIN_PERMS, 'u1', 0)
    expect(mockUpdateAssistant).toHaveBeenCalledWith(
      UUID_A,
      { lucid_model: 'claude-sonnet' },
      'org-1',
    )
    expect(reply.content).toMatch(/Current model: `claude-sonnet`/)
    expect(reply.components).toBeDefined()
  })
})

describe('handleModelPage', () => {
  it('re-renders the current model page', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockGetAssistant.mockResolvedValue({
      id: UUID_A,
      org_id: 'org-1',
      name: 'Alice',
      lucid_model: 'gpt-4.1-mini',
    })
    mockFetchModels.mockResolvedValue([
      { id: 'gpt-4.1-mini', modelId: 'gpt-4.1-mini', name: 'GPT 4.1 Mini', provider: 'openai' },
      { id: 'claude-sonnet', modelId: 'claude-sonnet', name: 'Claude Sonnet', provider: 'anthropic' },
    ])

    const reply = await handleModelPage('g1', 0, ADMIN_PERMS, 'u1')
    expect(reply.content).toMatch(/Current model: `gpt-4.1-mini`/)
    expect(reply.components).toBeDefined()
  })
})

describe('handleLeaveCommand', () => {
  it('requires a guild', async () => {
    const reply = await handleLeaveCommand(null, ADMIN_PERMS)
    expect(reply.content).toBe(TEXTS.guildOnly)
  })

  it('rejects non-admins', async () => {
    const reply = await handleLeaveCommand('g1', '0')
    expect(reply.content).toMatch(/administrators/)
  })

  it('reports when nothing to unbind', async () => {
    mockGetPrimary.mockResolvedValue(null)
    const reply = await handleLeaveCommand('g1', ADMIN_PERMS, 'u1')
    expect(reply.content).toMatch(/No active agent/)
  })

  it('prompts for confirmation when primary exists', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    const reply = await handleLeaveCommand('g1', ADMIN_PERMS, 'u1')
    expect(reply.content).toMatch(/Are you sure/)
    expect(reply.components).toBeDefined()
  })
})

describe('handleLeaveConfirm', () => {
  it('rejects non-admin replays', async () => {
    const reply = await handleLeaveConfirm('g1', UUID_A, '0')
    expect(reply.content).toMatch(/administrators/)
    expect(mockUnbind).not.toHaveBeenCalled()
  })

  it('unbinds when admin confirms', async () => {
    mockUnbind.mockResolvedValue(undefined)
    const reply = await handleLeaveConfirm('g1', UUID_A, ADMIN_PERMS)
    expect(mockUnbind).toHaveBeenCalledWith('g1', UUID_A)
    expect(reply.content).toMatch(/Unbound/)
  })
})

describe('handleProbeCommand', () => {
  it('requires a guild', async () => {
    const reply = await handleProbeCommand(null)
    expect(reply.content).toBe(TEXTS.guildOnly)
  })

  it('returns onboarding when no bindings exist', async () => {
    mockListChannels.mockResolvedValue([])
    const reply = await handleProbeCommand('g1')
    expect(reply.content).toMatch(/No agent is connected/)
  })

  it('returns the worker-backed probe summary', async () => {
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        assistant_name: 'Alice',
        assistant_description: null,
        is_primary: true,
      },
    ])
    mockDiscordWorkerFetch.mockResolvedValue({
      configured: true,
      running: true,
      presence: {
        status: 'online',
        activity: { name: 'Custom Status', state: 'Lucid agents' },
      },
      probe: {
        ok: true,
        status: 200,
        elapsedMs: 123,
        bot: { username: 'Lucid' },
      },
      lastError: null,
    })

    const reply = await handleProbeCommand('g1')
    expect(reply.content).toMatch(/Hosted Discord bot probe/)
    expect(reply.content).toMatch(/Running: Yes/)
    expect(reply.content).toMatch(/Lucid agents/)
    expect(reply.content).toMatch(/HTTP 200/)
    expect(reply.content).toMatch(/Bot: Lucid/)
  })
})

describe('handleAgentOpsCommand', () => {
  it('requires a guild', async () => {
    const reply = await handleAgentOpsCommand({ guildId: null, workflow: 'review' })
    expect(reply.content).toBe(TEXTS.guildOnly)
  })

  it('launches Agent Ops from the active Discord binding', async () => {
    mockGetPrimary.mockResolvedValue({ id: 'c1', assistant_id: UUID_A })
    mockListChannels.mockResolvedValue([
      {
        id: 'c1',
        assistant_id: UUID_A,
        org_id: 'org-a',
        assistant_name: 'Alice',
        assistant_description: null,
        is_primary: true,
      },
    ])
    mockRunChannelNativeAction.mockResolvedValue('Discord Agent Ops run started')

    const reply = await handleAgentOpsCommand({
      guildId: 'g1',
      workflow: 'review',
      target: 'https://example.com/pr/1',
      userId: 'u1',
    })

    expect(mockRunChannelNativeAction).toHaveBeenCalledWith(expect.objectContaining({
      channelType: 'discord',
      channelLabel: 'Discord',
      surfaceId: 'g1',
      externalUserId: 'u1',
      rawCommandArg: 'review https://example.com/pr/1',
      binding: expect.objectContaining({
        id: 'c1',
        assistant_id: UUID_A,
        org_id: 'org-a',
        assistant_name: 'Alice',
        assistant_description: null,
        is_primary: true,
      }),
    }))
    expect(reply.content).toBe('Discord Agent Ops run started')
  })
})

describe('handleHelpCommand', () => {
  it('returns static help text', () => {
    const reply = handleHelpCommand()
    expect(reply.content).toMatch(/\/agents/)
    expect(reply.content).toMatch(/\/switch/)
    expect(reply.content).toMatch(/\/status/)
    expect(reply.content).toMatch(/\/ops/)
    expect(reply.content).toMatch(/\/probe/)
    expect(reply.content).toMatch(/\/models/)
    expect(reply.content).toMatch(/\/model/)
    expect(reply.flags).toBeDefined()
  })
})
