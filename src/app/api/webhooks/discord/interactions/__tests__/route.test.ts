import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockVerifyDiscordSignature = vi.fn()
const mockParseInteractionPayload = vi.fn()
const mockGetPulseRedis = vi.fn()
const mockHandleAgentsCommand = vi.fn()
const mockHandleAgentOpsCommand = vi.fn()
const mockHandleSwitchCommand = vi.fn()
const mockHandleWhoamiCommand = vi.fn()
const mockHandleProbeCommand = vi.fn()
const mockHandleStatusCommand = vi.fn()
const mockHandleVoiceChannelCommand = vi.fn()
const mockHandleVoiceCommand = vi.fn()
const mockHandleModelsCommand = vi.fn()
const mockHandleModelCommand = vi.fn()
const mockHandleModelSelect = vi.fn()
const mockHandleModelPage = vi.fn()
const mockHandleLeaveCommand = vi.fn()
const mockHandleLeaveConfirm = vi.fn()
const mockHandleHelpCommand = vi.fn()
const mockListDiscordChannelsForGuild = vi.fn()
const mockSetPrimaryDiscordChannel = vi.fn()
const mockFetchModels = vi.fn()
const mockVerifyCustomId = vi.fn()
const mockAgentsComponents = vi.fn()

vi.mock('@/lib/discord/signature-verify', () => ({
  verifyDiscordSignature: (...args: unknown[]) => mockVerifyDiscordSignature(...args),
}))

vi.mock('@/lib/pulse/redis-client', () => ({
  getPulseRedis: (...args: unknown[]) => mockGetPulseRedis(...args),
}))

vi.mock('@/lib/discord/hosted-commands', () => ({
  handleAgentsCommand: (...args: unknown[]) => mockHandleAgentsCommand(...args),
  handleAgentOpsCommand: (...args: unknown[]) => mockHandleAgentOpsCommand(...args),
  handleSwitchCommand: (...args: unknown[]) => mockHandleSwitchCommand(...args),
  handleWhoamiCommand: (...args: unknown[]) => mockHandleWhoamiCommand(...args),
  handleProbeCommand: (...args: unknown[]) => mockHandleProbeCommand(...args),
  handleStatusCommand: (...args: unknown[]) => mockHandleStatusCommand(...args),
  handleVoiceChannelCommand: (...args: unknown[]) => mockHandleVoiceChannelCommand(...args),
  handleVoiceCommand: (...args: unknown[]) => mockHandleVoiceCommand(...args),
  handleModelsCommand: (...args: unknown[]) => mockHandleModelsCommand(...args),
  handleModelCommand: (...args: unknown[]) => mockHandleModelCommand(...args),
  handleModelSelect: (...args: unknown[]) => mockHandleModelSelect(...args),
  handleModelPage: (...args: unknown[]) => mockHandleModelPage(...args),
  handleLeaveCommand: (...args: unknown[]) => mockHandleLeaveCommand(...args),
  handleLeaveConfirm: (...args: unknown[]) => mockHandleLeaveConfirm(...args),
  handleHelpCommand: (...args: unknown[]) => mockHandleHelpCommand(...args),
  TEXTS: {
    guildOnly: 'This command only works inside a server, not in DMs.',
  },
}))

vi.mock('@/lib/discord/hosted-router', () => ({
  INTERACTION_RESPONSE_TYPE: {
    PONG: 1,
    CHANNEL_MESSAGE_WITH_SOURCE: 4,
    UPDATE_MESSAGE: 7,
    AUTOCOMPLETE_RESULT: 8,
  },
  MESSAGE_FLAGS: {
    EPHEMERAL: 64,
  },
  parseInteractionPayload: (...args: unknown[]) => mockParseInteractionPayload(...args),
}))

vi.mock('@/lib/db', () => ({
  listDiscordChannelsForGuild: (...args: unknown[]) => mockListDiscordChannelsForGuild(...args),
  setPrimaryDiscordChannel: (...args: unknown[]) => mockSetPrimaryDiscordChannel(...args),
}))

vi.mock('@/lib/ai/models', () => ({
  fetchModels: (...args: unknown[]) => mockFetchModels(...args),
}))

vi.mock('@/lib/discord/inline-keyboards', () => ({
  verifyCustomId: (...args: unknown[]) => mockVerifyCustomId(...args),
  agentsComponents: (...args: unknown[]) => mockAgentsComponents(...args),
}))

import { GET, POST } from '../route'

function signedRequest(body: unknown): Request {
  return new Request('https://lucid.foundation/api/webhooks/discord/interactions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature-ed25519': 'sig',
      'x-signature-timestamp': '123',
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env.DISCORD_HOSTED_PUBLIC_KEY = 'a'.repeat(64)

  mockVerifyDiscordSignature.mockReset()
  mockParseInteractionPayload.mockReset()
  mockGetPulseRedis.mockReset()
  mockHandleAgentsCommand.mockReset()
  mockHandleAgentOpsCommand.mockReset()
  mockHandleSwitchCommand.mockReset()
  mockHandleWhoamiCommand.mockReset()
  mockHandleProbeCommand.mockReset()
  mockHandleStatusCommand.mockReset()
  mockHandleVoiceChannelCommand.mockReset()
  mockHandleVoiceCommand.mockReset()
  mockHandleModelsCommand.mockReset()
  mockHandleModelCommand.mockReset()
  mockHandleModelSelect.mockReset()
  mockHandleModelPage.mockReset()
  mockHandleLeaveCommand.mockReset()
  mockHandleLeaveConfirm.mockReset()
  mockHandleHelpCommand.mockReset()
  mockListDiscordChannelsForGuild.mockReset()
  mockSetPrimaryDiscordChannel.mockReset()
  mockFetchModels.mockReset()
  mockVerifyCustomId.mockReset()
  mockAgentsComponents.mockReset()

  mockVerifyDiscordSignature.mockReturnValue(true)
  mockGetPulseRedis.mockResolvedValue(null)
  vi.unstubAllGlobals()
})

describe('discord hosted interactions route', () => {
  it('serves a health payload on GET', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'discord-hosted-interactions',
    })
  })

  it('dispatches /models through the slash command handler', async () => {
    mockParseInteractionPayload.mockReturnValue({
      kind: 'slash_command',
      interactionId: 'i1',
      commandName: 'models',
      guildId: 'g1',
      userId: 'u1',
      memberPermissions: '8',
    })
    mockHandleModelsCommand.mockResolvedValue({
      content: 'models reply',
      flags: 64,
    })

    const response = await POST(signedRequest({ type: 2 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      type: 4,
      data: { content: 'models reply', components: undefined, flags: 64 },
    })
    expect(mockHandleModelsCommand).toHaveBeenCalledWith('g1', '8', 'u1')
  })

  it('dispatches /voice through the slash command handler', async () => {
    mockParseInteractionPayload.mockReturnValue({
      kind: 'slash_command',
      interactionId: 'i1',
      commandName: 'voice',
      guildId: 'g1',
      userId: 'u1',
      memberPermissions: '8',
      options: [
        { name: 'mode', value: 'always' },
        { name: 'name', value: 'onyx' },
      ],
    })
    mockHandleVoiceCommand.mockResolvedValue({
      content: 'voice reply',
      flags: 64,
    })

    const response = await POST(signedRequest({ type: 2 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      type: 4,
      data: { content: 'voice reply', components: undefined, flags: 64 },
    })
    expect(mockHandleVoiceCommand).toHaveBeenCalledWith({
      guildId: 'g1',
      memberPermissions: '8',
      rawMode: 'always',
      rawVoice: 'onyx',
    })
  })

  it('dispatches /vc through the slash command handler', async () => {
    mockParseInteractionPayload.mockReturnValue({
      kind: 'slash_command',
      interactionId: 'i1',
      commandName: 'vc',
      guildId: 'g1',
      userId: 'u1',
      memberPermissions: '8',
      options: [
        { name: 'action', value: 'join' },
        { name: 'channel', value: '1234' },
      ],
    })
    mockHandleVoiceChannelCommand.mockResolvedValue({
      content: 'vc reply',
      flags: 64,
    })

    const response = await POST(signedRequest({ type: 2 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      type: 4,
      data: { content: 'vc reply', components: undefined, flags: 64 },
    })
    expect(mockHandleVoiceChannelCommand).toHaveBeenCalledWith({
      guildId: 'g1',
      memberPermissions: '8',
      rawAction: 'join',
      rawChannelId: '1234',
    })
  })

  it('dispatches /status through the dedicated status handler', async () => {
    mockParseInteractionPayload.mockReturnValue({
      kind: 'slash_command',
      interactionId: 'i1',
      commandName: 'status',
      guildId: 'g1',
      userId: 'u1',
      memberPermissions: '8',
      options: [],
    })
    mockHandleStatusCommand.mockResolvedValue({
      content: 'status reply',
      flags: 64,
    })

    const response = await POST(signedRequest({ type: 2 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      type: 4,
      data: { content: 'status reply', components: undefined, flags: 64 },
    })
    expect(mockHandleStatusCommand).toHaveBeenCalledWith('g1')
    expect(mockHandleWhoamiCommand).not.toHaveBeenCalled()
  })

  it('dispatches /ops through the Agent Ops channel handler', async () => {
    mockParseInteractionPayload.mockReturnValue({
      kind: 'slash_command',
      interactionId: 'i1',
      commandName: 'ops',
      guildId: 'g1',
      userId: 'u1',
      memberPermissions: '8',
      options: [
        { name: 'workflow', value: 'review' },
        { name: 'target', value: 'https://github.com/lucid/pr/1' },
      ],
    })
    mockHandleAgentOpsCommand.mockResolvedValue({
      content: 'ops reply',
      flags: 64,
    })

    const response = await POST(signedRequest({ type: 2 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      type: 4,
      data: { content: 'ops reply', components: undefined, flags: 64 },
    })
    expect(mockHandleAgentOpsCommand).toHaveBeenCalledWith({
      guildId: 'g1',
      workflow: 'review',
      target: 'https://github.com/lucid/pr/1',
      userId: 'u1',
    })
  })

  it('sends Discord follow-up chunks for long Agent Ops reports', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    mockParseInteractionPayload.mockReturnValue({
      kind: 'slash_command',
      interactionId: 'i1',
      interactionToken: 'token-1',
      applicationId: 'app-1',
      commandName: 'ops',
      guildId: 'g1',
      userId: 'u1',
      memberPermissions: '8',
      options: [
        { name: 'workflow', value: 'whales' },
        { name: 'target', value: 'wallet moved' },
      ],
    })
    mockHandleAgentOpsCommand.mockResolvedValue({
      content: 'ops reply 1',
      followupMessages: ['ops reply 2', 'ops reply 3'],
      flags: 64,
    })

    const response = await POST(signedRequest({ type: 2 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      type: 4,
      data: { content: 'ops reply 1', flags: 64 },
    })
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://discord.com/api/v10/webhooks/app-1/token-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'ops reply 2', flags: 64 }),
      }),
    )
  })

  it('dispatches /probe through the probe handler', async () => {
    mockParseInteractionPayload.mockReturnValue({
      kind: 'slash_command',
      interactionId: 'i1',
      commandName: 'probe',
      guildId: 'g1',
      userId: 'u1',
      memberPermissions: '8',
      options: [],
    })
    mockHandleProbeCommand.mockResolvedValue({
      content: 'probe reply',
      flags: 64,
    })

    const response = await POST(signedRequest({ type: 2 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      type: 4,
      data: { content: 'probe reply', components: undefined, flags: 64 },
    })
    expect(mockHandleProbeCommand).toHaveBeenCalledWith('g1')
  })

  it('returns model autocomplete choices from fetchModels', async () => {
    mockParseInteractionPayload.mockReturnValue({
      kind: 'autocomplete',
      interactionId: 'i1',
      commandName: 'model',
      guildId: 'g1',
      focusedOption: { name: 'name', value: 'gpt' },
    })
    mockFetchModels.mockResolvedValue([
      { modelId: 'gpt-4.1-mini', name: 'GPT 4.1 Mini', provider: 'openai' },
      { modelId: 'claude-sonnet', name: 'Claude Sonnet', provider: 'anthropic' },
    ])

    const response = await POST(signedRequest({ type: 4 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      type: 8,
      data: {
        choices: [{ name: 'openai: GPT 4.1 Mini', value: 'gpt-4.1-mini' }],
      },
    })
  })

  it('returns voice autocomplete choices', async () => {
    mockParseInteractionPayload.mockReturnValue({
      kind: 'autocomplete',
      interactionId: 'i1',
      commandName: 'voice',
      guildId: 'g1',
      focusedOption: { name: 'name', value: 'on' },
    })

    const response = await POST(signedRequest({ type: 4 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      type: 8,
      data: {
        choices: [{ name: 'onyx', value: 'onyx' }],
      },
    })
  })

  it('returns vc autocomplete choices', async () => {
    mockParseInteractionPayload.mockReturnValue({
      kind: 'autocomplete',
      interactionId: 'i1',
      commandName: 'vc',
      guildId: 'g1',
      focusedOption: { name: 'action', value: 'jo' },
    })

    const response = await POST(signedRequest({ type: 4 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      type: 8,
      data: {
        choices: [{ name: 'join', value: 'join' }],
      },
    })
  })

  it('returns Agent Ops workflow autocomplete choices', async () => {
    mockParseInteractionPayload.mockReturnValue({
      kind: 'autocomplete',
      interactionId: 'i1',
      commandName: 'ops',
      guildId: 'g1',
      focusedOption: { name: 'workflow', value: 'sec' },
    })

    const response = await POST(signedRequest({ type: 4 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      type: 8,
      data: {
        choices: [{ name: 'Security audit', value: 'security-audit' }],
      },
    })
  })

  it('dispatches model selection components to the model picker handler', async () => {
    mockParseInteractionPayload.mockReturnValue({
      kind: 'component',
      interactionId: 'i1',
      guildId: 'g1',
      userId: 'u1',
      memberPermissions: '8',
      customId: 'signed',
      values: ['gpt-4.1-mini'],
    })
    mockVerifyCustomId.mockReturnValue({
      action: 'model_select',
      args: ['g1', 'u1', '0'],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    })
    mockHandleModelSelect.mockResolvedValue({
      content: 'model switched',
      components: [{ type: 1, components: [] }],
    })

    const response = await POST(signedRequest({ type: 3 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      type: 7,
      data: { content: 'model switched', components: [{ type: 1, components: [] }] },
    })
    expect(mockHandleModelSelect).toHaveBeenCalledWith('g1', 'gpt-4.1-mini', '8', 'u1', 0)
  })

  it('rejects component replays from a different user', async () => {
    mockParseInteractionPayload.mockReturnValue({
      kind: 'component',
      interactionId: 'i1',
      guildId: 'g1',
      userId: 'intruder',
      memberPermissions: '8',
      customId: 'signed',
      values: ['gpt-4.1-mini'],
    })
    mockVerifyCustomId.mockReturnValue({
      action: 'model_select',
      args: ['g1', 'u1', '0'],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    })

    const response = await POST(signedRequest({ type: 3 }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      type: 4,
      data: {
        content: 'This selector belongs to a different user. Run `/models` yourself.',
        flags: 64,
      },
    })
    expect(mockHandleModelSelect).not.toHaveBeenCalled()
  })
})
