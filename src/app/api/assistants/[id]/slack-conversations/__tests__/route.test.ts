import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserId = vi.fn()
const mockGetAssistant = vi.fn()
const mockIsUserOrgMember = vi.fn()
const mockGetHostedSlackInstallForAssistant = vi.fn()
const mockListHostedSlackBindingsForAssistant = vi.fn()
const mockGetHostedSlackActivitySnapshot = vi.fn()
const mockListSlackHostedConversations = vi.fn()
const mockListSlackHostedUsers = vi.fn()
const mockListHostedSlackWorkspaceAgents = vi.fn()
const mockBindHostedSlackAssistantToConversation = vi.fn()
const mockUnbindHostedSlackAssistantFromConversation = vi.fn()
const mockNormalizeHostedSlackRoutingConfig = vi.fn()
const mockNormalizeHostedSlackAllowedUserIds = vi.fn()
const mockNormalizeHostedSlackStreamingPreview = vi.fn()
const mockNormalizeHostedSlackStreamingMode = vi.fn()
const mockNormalizeHostedSlackNativeStreaming = vi.fn()
const mockNormalizeHostedSlackReplyToMode = vi.fn()
const mockNormalizeHostedSlackAckReaction = vi.fn()
const mockNormalizeHostedSlackThreadHistoryScope = vi.fn()
const mockNormalizeHostedSlackThreadInheritParent = vi.fn()
const mockNormalizeHostedSlackThreadInitialHistoryLimit = vi.fn()
const mockNormalizeHostedSlackTypingReaction = vi.fn()
const mockNormalizeHostedSlackWorkspaceWideEnabled = vi.fn()
const mockUpdateHostedSlackRoutingConfig = vi.fn()
const mockCreateServiceClient = vi.fn()
const mockGetChannelSurfaceDefaultBinding = vi.fn()
const mockSetChannelSurfaceDefault = vi.fn()
const mockClearChannelSurfaceDefault = vi.fn()

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}))

vi.mock('@/lib/db', () => ({
  getAssistant: (...args: unknown[]) => mockGetAssistant(...args),
  isUserOrgMember: (...args: unknown[]) => mockIsUserOrgMember(...args),
}))

vi.mock('@/lib/slack/hosted-bindings', () => ({
  getHostedSlackInstallForAssistant: (...args: unknown[]) =>
    mockGetHostedSlackInstallForAssistant(...args),
  listHostedSlackBindingsForAssistant: (...args: unknown[]) =>
    mockListHostedSlackBindingsForAssistant(...args),
  getHostedSlackActivitySnapshot: (...args: unknown[]) =>
    mockGetHostedSlackActivitySnapshot(...args),
  listSlackHostedConversations: (...args: unknown[]) =>
    mockListSlackHostedConversations(...args),
  listSlackHostedUsers: (...args: unknown[]) =>
    mockListSlackHostedUsers(...args),
  listHostedSlackWorkspaceAgents: (...args: unknown[]) =>
    mockListHostedSlackWorkspaceAgents(...args),
  bindHostedSlackAssistantToConversation: (...args: unknown[]) =>
    mockBindHostedSlackAssistantToConversation(...args),
  unbindHostedSlackAssistantFromConversation: (...args: unknown[]) =>
    mockUnbindHostedSlackAssistantFromConversation(...args),
  normalizeHostedSlackRoutingConfig: (...args: unknown[]) =>
    mockNormalizeHostedSlackRoutingConfig(...args),
  normalizeHostedSlackAllowedUserIds: (...args: unknown[]) =>
    mockNormalizeHostedSlackAllowedUserIds(...args),
  normalizeHostedSlackStreamingPreview: (...args: unknown[]) =>
    mockNormalizeHostedSlackStreamingPreview(...args),
  normalizeHostedSlackStreamingMode: (...args: unknown[]) =>
    mockNormalizeHostedSlackStreamingMode(...args),
  normalizeHostedSlackNativeStreaming: (...args: unknown[]) =>
    mockNormalizeHostedSlackNativeStreaming(...args),
  normalizeHostedSlackReplyToMode: (...args: unknown[]) =>
    mockNormalizeHostedSlackReplyToMode(...args),
  normalizeHostedSlackAckReaction: (...args: unknown[]) =>
    mockNormalizeHostedSlackAckReaction(...args),
  normalizeHostedSlackThreadHistoryScope: (...args: unknown[]) =>
    mockNormalizeHostedSlackThreadHistoryScope(...args),
  normalizeHostedSlackThreadInheritParent: (...args: unknown[]) =>
    mockNormalizeHostedSlackThreadInheritParent(...args),
  normalizeHostedSlackThreadInitialHistoryLimit: (...args: unknown[]) =>
    mockNormalizeHostedSlackThreadInitialHistoryLimit(...args),
  normalizeHostedSlackTypingReaction: (...args: unknown[]) =>
    mockNormalizeHostedSlackTypingReaction(...args),
  normalizeHostedSlackWorkspaceWideEnabled: (...args: unknown[]) =>
    mockNormalizeHostedSlackWorkspaceWideEnabled(...args),
  updateHostedSlackRoutingConfig: (...args: unknown[]) =>
    mockUpdateHostedSlackRoutingConfig(...args),
  DEFAULT_HOSTED_SLACK_TYPING_REACTION: 'hourglass_flowing_sand',
  DEFAULT_HOSTED_SLACK_ACK_REACTION: 'eyes',
}))

vi.mock('@/lib/db/channel-routing', () => ({
  getChannelSurfaceDefaultBinding: (...args: unknown[]) =>
    mockGetChannelSurfaceDefaultBinding(...args),
  setChannelSurfaceDefault: (...args: unknown[]) =>
    mockSetChannelSurfaceDefault(...args),
  clearChannelSurfaceDefault: (...args: unknown[]) =>
    mockClearChannelSurfaceDefault(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

import { DELETE, GET, PATCH, POST } from '../route'

beforeEach(() => {
  mockGetUserId.mockReset()
  mockGetAssistant.mockReset()
  mockIsUserOrgMember.mockReset()
  mockGetHostedSlackInstallForAssistant.mockReset()
  mockListHostedSlackBindingsForAssistant.mockReset()
  mockGetHostedSlackActivitySnapshot.mockReset()
  mockListSlackHostedConversations.mockReset()
  mockListSlackHostedUsers.mockReset()
  mockListHostedSlackWorkspaceAgents.mockReset()
  mockBindHostedSlackAssistantToConversation.mockReset()
  mockUnbindHostedSlackAssistantFromConversation.mockReset()
  mockNormalizeHostedSlackRoutingConfig.mockReset()
  mockNormalizeHostedSlackAllowedUserIds.mockReset()
  mockNormalizeHostedSlackStreamingPreview.mockReset()
  mockNormalizeHostedSlackStreamingMode.mockReset()
  mockNormalizeHostedSlackNativeStreaming.mockReset()
  mockNormalizeHostedSlackReplyToMode.mockReset()
  mockNormalizeHostedSlackAckReaction.mockReset()
  mockNormalizeHostedSlackThreadHistoryScope.mockReset()
  mockNormalizeHostedSlackThreadInheritParent.mockReset()
  mockNormalizeHostedSlackThreadInitialHistoryLimit.mockReset()
  mockNormalizeHostedSlackTypingReaction.mockReset()
  mockNormalizeHostedSlackWorkspaceWideEnabled.mockReset()
  mockUpdateHostedSlackRoutingConfig.mockReset()
  mockCreateServiceClient.mockReset()
  mockGetChannelSurfaceDefaultBinding.mockReset()
  mockSetChannelSurfaceDefault.mockReset()
  mockClearChannelSurfaceDefault.mockReset()
  mockNormalizeHostedSlackRoutingConfig.mockImplementation((value) => value)
  mockNormalizeHostedSlackAllowedUserIds.mockImplementation((value) =>
    value && typeof value === 'object' && Array.isArray((value as { slack_allowed_user_ids?: unknown[] }).slack_allowed_user_ids)
      ? ((value as { slack_allowed_user_ids?: unknown[] }).slack_allowed_user_ids as unknown[])
          .filter((entry): entry is string => typeof entry === 'string')
      : [],
  )
  mockNormalizeHostedSlackStreamingPreview.mockImplementation((value) =>
    value && typeof value === 'object' && 'slack_streaming_preview' in value
      ? (value as { slack_streaming_preview?: boolean }).slack_streaming_preview !== false
      : true,
  )
  mockNormalizeHostedSlackStreamingMode.mockImplementation((value) =>
    value &&
    typeof value === 'object' &&
    ((value as { slack_streaming_mode?: string }).slack_streaming_mode === 'off' ||
      (value as { slack_streaming_mode?: string }).slack_streaming_mode === 'block' ||
      (value as { slack_streaming_mode?: string }).slack_streaming_mode === 'progress')
      ? ((value as { slack_streaming_mode?: 'off' | 'block' | 'progress' }).slack_streaming_mode as
          | 'off'
          | 'block'
          | 'progress')
      : 'partial',
  )
  mockNormalizeHostedSlackNativeStreaming.mockImplementation((value) =>
    value && typeof value === 'object' && (value as { slack_native_streaming?: boolean }).slack_native_streaming === true,
  )
  mockNormalizeHostedSlackReplyToMode.mockImplementation((value) =>
    value &&
    typeof value === 'object' &&
    ((value as { slack_reply_to_mode?: string }).slack_reply_to_mode === 'first' ||
      (value as { slack_reply_to_mode?: string }).slack_reply_to_mode === 'all')
      ? ((value as { slack_reply_to_mode?: 'first' | 'all' }).slack_reply_to_mode as
          | 'first'
          | 'all')
      : 'off',
  )
  mockNormalizeHostedSlackAckReaction.mockImplementation((value) =>
    value && typeof value === 'object' && 'slack_ack_reaction' in value
      ? ((value as { slack_ack_reaction?: string | null }).slack_ack_reaction ?? null)
      : 'eyes',
  )
  mockNormalizeHostedSlackThreadHistoryScope.mockImplementation((value) =>
    value && typeof value === 'object' && (value as { slack_thread_history_scope?: string }).slack_thread_history_scope === 'channel'
      ? 'channel'
      : 'thread',
  )
  mockNormalizeHostedSlackThreadInheritParent.mockImplementation((value) =>
    value && typeof value === 'object' && (value as { slack_thread_inherit_parent?: boolean }).slack_thread_inherit_parent === true,
  )
  mockNormalizeHostedSlackThreadInitialHistoryLimit.mockImplementation((value) =>
    value &&
    typeof value === 'object' &&
    typeof (value as { slack_thread_initial_history_limit?: number }).slack_thread_initial_history_limit === 'number'
      ? (value as { slack_thread_initial_history_limit?: number }).slack_thread_initial_history_limit ?? null
      : null,
  )
  mockNormalizeHostedSlackTypingReaction.mockImplementation((value) =>
    value && typeof value === 'object' && 'slack_typing_reaction' in value
      ? (value as { slack_typing_reaction?: string | null }).slack_typing_reaction ?? null
      : 'hourglass_flowing_sand',
  )
  mockNormalizeHostedSlackWorkspaceWideEnabled.mockImplementation((value) =>
    value && typeof value === 'object' && (value as { slack_workspace_wide_enabled?: boolean }).slack_workspace_wide_enabled === true,
  )
  mockListHostedSlackWorkspaceAgents.mockResolvedValue([])
  mockGetChannelSurfaceDefaultBinding.mockResolvedValue(null)
  mockSetChannelSurfaceDefault.mockResolvedValue(null)
  mockClearChannelSurfaceDefault.mockResolvedValue(undefined)
})

describe('assistant slack conversations route', () => {
  it('lists hosted Slack conversations for an installed assistant', async () => {
    mockGetUserId.mockResolvedValue('user-1')
    mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' })
    mockIsUserOrgMember.mockResolvedValue(true)
    mockCreateServiceClient.mockReturnValue({ supabase: true })
    mockGetHostedSlackInstallForAssistant.mockResolvedValue({
      id: 'channel-1',
      teamId: 'T123',
      teamName: 'Raijin Labs',
      botToken: 'xoxb-test',
      channelConfig: {},
      inboundRoutingConfig: {
        dedicated_channel: true,
        respond_on_mention: true,
        thread_support: false,
        ignore_bots: true,
        prefix: null,
      },
    })
    mockListHostedSlackBindingsForAssistant.mockResolvedValue([
      {
        id: 'binding-1',
        externalChannelId: 'C123',
        channelConfig: {},
        inboundRoutingConfig: {
          dedicated_channel: true,
          respond_on_mention: true,
          thread_support: false,
          ignore_bots: true,
          prefix: null,
        },
      },
    ])
    mockGetHostedSlackActivitySnapshot.mockResolvedValue({
      lastInboundAt: '2026-04-24T16:27:19Z',
      lastInboundStatus: 'done',
      lastOutboundAt: '2026-04-24T16:27:36Z',
      lastOutboundStatus: 'sent',
      lastOutboundError: null,
      lastReplyLatencyMs: 17000,
    })
    mockListSlackHostedConversations.mockResolvedValue([
      { id: 'C123', name: 'general', label: '# general', type: 'public', isPrivate: false },
      {
        id: 'D123',
        name: 'Direct message with @U999',
        label: 'Direct message with @U999 (DM)',
        type: 'im',
        isPrivate: true,
      },
    ])
    mockListSlackHostedUsers.mockResolvedValue([])

    const request = new NextRequest(
      'https://www.lucid.foundation/api/assistants/assistant-1/slack-conversations',
    )
    const response = await GET(request, {
      params: Promise.resolve({ id: 'assistant-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      workspace: {
        id: 'T123',
        name: 'Raijin Labs',
      },
      installChannelId: 'channel-1',
      connectedChannelId: 'C123',
      bindings: [
        {
          channelId: 'binding-1',
          externalChannelId: 'C123',
          conversationLabel: 'C123',
          conversationType: null,
          routingConfig: {
            dedicated_channel: true,
            respond_on_mention: true,
            thread_support: false,
            ignore_bots: true,
            prefix: null,
          },
          allowedUsers: [],
          streamingPreview: true,
          streamingMode: 'partial',
          nativeStreaming: false,
          threadHistoryScope: 'thread',
          threadInheritParent: false,
          threadInitialHistoryLimit: null,
          replyToMode: 'off',
          workspaceWideEnabled: false,
          ackReaction: 'eyes',
          typingReaction: 'hourglass_flowing_sand',
          activity: {
            lastInboundAt: '2026-04-24T16:27:19Z',
            lastInboundStatus: 'done',
            lastOutboundAt: '2026-04-24T16:27:36Z',
            lastOutboundStatus: 'sent',
            lastOutboundError: null,
            lastReplyLatencyMs: 17000,
          },
        },
      ],
      routingConfig: {
        dedicated_channel: true,
        respond_on_mention: true,
        thread_support: false,
        ignore_bots: true,
        prefix: null,
      },
      allowedUsers: [],
      streamingPreview: true,
      streamingMode: 'partial',
      nativeStreaming: false,
      replyToMode: 'off',
      ackReaction: 'eyes',
      threadHistoryScope: 'thread',
      threadInheritParent: false,
      threadInitialHistoryLimit: null,
      typingReaction: 'hourglass_flowing_sand',
      workspaceWideEnabled: false,
      activity: {
        lastInboundAt: '2026-04-24T16:27:19Z',
        lastInboundStatus: 'done',
        lastOutboundAt: '2026-04-24T16:27:36Z',
        lastOutboundStatus: 'sent',
        lastOutboundError: null,
        lastReplyLatencyMs: 17000,
      },
      conversations: [
        { id: 'C123', name: 'general', label: '# general', type: 'public', isPrivate: false },
        {
          id: 'D123',
          name: 'Direct message with @U999',
          label: 'Direct message with @U999 (DM)',
          type: 'im',
          isPrivate: true,
        },
      ],
      users: [],
      userDirectoryAvailable: true,
      userDirectoryError: null,
      workspaceAgents: [],
      surfaceDefault: null,
    })
  })

  it('binds a selected hosted Slack conversation from the web UI', async () => {
    mockGetUserId.mockResolvedValue('user-1')
    mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' })
    mockIsUserOrgMember.mockResolvedValue(true)
    mockCreateServiceClient.mockReturnValue({ supabase: true })
    mockGetHostedSlackInstallForAssistant.mockResolvedValue({
      id: 'channel-1',
      teamId: 'T123',
    })
    mockBindHostedSlackAssistantToConversation.mockResolvedValue({
      id: 'channel-1',
      externalChannelId: 'C999',
    })

    const request = new NextRequest(
      'https://www.lucid.foundation/api/assistants/assistant-1/slack-conversations',
      {
        method: 'POST',
        body: JSON.stringify({
          conversationId: 'C999',
          conversationLabel: '# product',
          conversationType: 'private',
        }),
        headers: { 'content-type': 'application/json' },
      },
    )
    const response = await POST(request, {
      params: Promise.resolve({ id: 'assistant-1' }),
    })

    expect(response.status).toBe(200)
    expect(mockBindHostedSlackAssistantToConversation).toHaveBeenCalledWith({
      supabase: { supabase: true },
      assistantId: 'assistant-1',
      teamId: 'T123',
      slackChannelId: 'C999',
      conversationLabel: '# product',
      conversationType: 'private',
      boundVia: 'web_bind',
    })
    await expect(response.json()).resolves.toEqual({
      ok: true,
      binding: {
        channelId: 'channel-1',
        externalChannelId: 'C999',
      },
    })
  })

  it('updates hosted Slack routing settings from the web UI', async () => {
    mockGetUserId.mockResolvedValue('user-1')
    mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' })
    mockIsUserOrgMember.mockResolvedValue(true)
    mockCreateServiceClient.mockReturnValue({ supabase: true })
    mockGetHostedSlackInstallForAssistant.mockResolvedValue({
      id: 'channel-1',
      teamId: 'T123',
    })
    mockUpdateHostedSlackRoutingConfig.mockResolvedValue({
      id: 'channel-1',
      channelConfig: {
        slack_ack_reaction: 'wave',
        slack_typing_reaction: 'thinking_face',
        slack_streaming_preview: false,
        slack_streaming_mode: 'progress',
        slack_native_streaming: true,
        slack_reply_to_mode: 'first',
        slack_thread_history_scope: 'channel',
        slack_thread_inherit_parent: true,
        slack_thread_initial_history_limit: 12,
        slack_allowed_user_ids: ['U123', 'U456'],
      },
      inboundRoutingConfig: {
        dedicated_channel: false,
        respond_on_mention: true,
        thread_support: true,
        ignore_bots: true,
        prefix: '!lucid',
      },
    })

    const request = new NextRequest(
      'https://www.lucid.foundation/api/assistants/assistant-1/slack-conversations',
      {
        method: 'PATCH',
        body: JSON.stringify({
          dedicated_channel: false,
          respond_on_mention: true,
          thread_support: true,
          prefix: ' !lucid ',
          streamingPreview: false,
          streamingMode: 'progress',
          nativeStreaming: true,
          threadHistoryScope: 'channel',
          threadInheritParent: true,
          threadInitialHistoryLimit: 12,
          replyToMode: 'first',
          ackReaction: 'wave',
          allowedUsers: '<@U123>, U456',
          typingReaction: 'thinking_face',
        }),
        headers: { 'content-type': 'application/json' },
      },
    )
    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'assistant-1' }),
    })

    expect(response.status).toBe(200)
    expect(mockUpdateHostedSlackRoutingConfig).toHaveBeenCalledWith({
      supabase: { supabase: true },
      assistantChannelId: 'channel-1',
      teamId: 'T123',
      inboundRoutingConfig: {
        dedicated_channel: false,
        respond_on_mention: true,
        thread_support: true,
        prefix: '!lucid',
      },
      allowedUserIds: ['U123', 'U456'],
      streamingPreview: false,
      streamingMode: 'progress',
      nativeStreaming: true,
      threadHistoryScope: 'channel',
      threadInheritParent: true,
      threadInitialHistoryLimit: 12,
      replyToMode: 'first',
      ackReaction: 'wave',
      typingReaction: 'thinking_face',
    })
    await expect(response.json()).resolves.toEqual({
      ok: true,
      routingConfig: {
        dedicated_channel: false,
        respond_on_mention: true,
        thread_support: true,
        ignore_bots: true,
        prefix: '!lucid',
      },
      allowedUsers: ['U123', 'U456'],
      streamingPreview: false,
      streamingMode: 'progress',
      nativeStreaming: true,
      replyToMode: 'first',
      ackReaction: 'wave',
      threadHistoryScope: 'channel',
      threadInheritParent: true,
      threadInitialHistoryLimit: 12,
      typingReaction: 'thinking_face',
      workspaceWideEnabled: false,
    })
  })

  it('unbinds a hosted Slack conversation from the web UI', async () => {
    mockGetUserId.mockResolvedValue('user-1')
    mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' })
    mockIsUserOrgMember.mockResolvedValue(true)
    mockCreateServiceClient.mockReturnValue({ supabase: true })
    mockGetHostedSlackInstallForAssistant.mockResolvedValue({
      id: 'channel-1',
      teamId: 'T123',
    })
    mockUnbindHostedSlackAssistantFromConversation.mockResolvedValue({
      id: 'channel-1',
      externalChannelId: null,
    })

    const request = new NextRequest(
      'https://www.lucid.foundation/api/assistants/assistant-1/slack-conversations',
      { method: 'DELETE' },
    )
    const response = await DELETE(request, {
      params: Promise.resolve({ id: 'assistant-1' }),
    })

    expect(response.status).toBe(200)
    expect(mockUnbindHostedSlackAssistantFromConversation).toHaveBeenCalledWith({
      supabase: { supabase: true },
      assistantChannelId: 'channel-1',
      teamId: 'T123',
    })
    await expect(response.json()).resolves.toEqual({
      ok: true,
      binding: {
        channelId: 'channel-1',
        externalChannelId: null,
      },
    })
  })
})
