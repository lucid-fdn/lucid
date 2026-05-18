import { beforeEach, describe, expect, it, vi } from 'vitest'

const startSpanMock = vi.fn(() => ({
  setStatus: vi.fn(),
  end: vi.fn(),
}))

vi.mock('../../../observability/tracing.js', () => ({
  getTracer: () => ({ startSpan: (...args: unknown[]) => startSpanMock(...args) }),
  safeSetAttribute: vi.fn(),
  SpanStatusCode: { OK: 'ok', ERROR: 'error' },
}))

import { DiscordGatewayManager } from '../DiscordGatewayManager.js'

describe('DiscordGatewayManager.handleMessage', () => {
  const insertPayloadMock = vi.fn()
  const singleMock = vi.fn()
  const selectMock = vi.fn(() => ({ single: (...args: unknown[]) => singleMock(...args) }))
  const insertMock = vi.fn((payload: unknown) => {
    insertPayloadMock(payload)
    return { select: (...args: unknown[]) => selectMock(...args) }
  })
  const fromMock = vi.fn(() => ({ insert: (...args: unknown[]) => insertMock(...args) }))
  const supabase = { from: fromMock } as any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: vi.fn(),
    }))
    singleMock.mockResolvedValue({
      data: {
        id: 'evt-1',
        assistant_id: 'assistant-1',
        org_id: 'org-1',
        external_message_id: 'msg-1',
      },
      error: null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('queues audio-only messages with attachment metadata instead of dropping them', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64))
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['discord-channel-1', {
          internalChannelId: 'internal-1',
          assistantId: 'assistant-1',
          externalChannelId: 'discord-channel-1',
          routingConfig: { dedicated_channel: true },
          bindingScope: 'channel',
          dedicatedChannelIds: [],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-1',
        channel_id: 'discord-channel-1',
        author: { id: 'user-1', username: 'Ada' },
        content: '',
        timestamp: '2026-04-16T00:00:00Z',
        attachments: [
          {
            id: 'att-1',
            filename: 'voice-note.ogg',
            url: 'https://cdn.discordapp.com/voice-note.ogg',
            content_type: 'audio/ogg',
          },
        ],
      },
      client,
    )

    expect(insertPayloadMock).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String),
      channel_id: 'internal-1',
      assistant_id: 'assistant-1',
      external_message_id: 'msg-1',
      external_user_id: 'user-1',
      external_chat_id: 'discord-channel-1',
      message_text: '',
      message_data: expect.objectContaining({
        author_username: 'Ada',
        channel_type: 'discord',
        discord_audio_input: true,
        discord_binding_scope: 'channel',
        discord_channel_id: 'discord-channel-1',
        discord_raw_payload: expect.any(Object),
        discord_attachments: [
          {
            kind: 'audio',
            id: 'att-1',
            fileName: 'voice-note.ogg',
            url: 'https://cdn.discordapp.com/voice-note.ogg',
            mimeType: 'audio/ogg',
          },
        ],
      }),
      status: 'pending',
    }))
  })

  it('does not inject Discord image filenames into message_text when attachments are present', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64))
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['discord-channel-1', {
          internalChannelId: 'internal-1',
          assistantId: 'assistant-1',
          externalChannelId: 'discord-channel-1',
          routingConfig: { dedicated_channel: true },
          bindingScope: 'channel',
          dedicatedChannelIds: [],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-image-1',
        channel_id: 'discord-channel-1',
        author: { id: 'user-1', username: 'Ada' },
        content: '<@bot-1> what is in this image?',
        mentions: [{ id: 'bot-1' }],
        timestamp: '2026-04-16T00:00:00Z',
        attachments: [
          {
            id: 'att-img-1',
            filename: '1_1.png',
            url: 'https://cdn.discordapp.com/1_1.png',
            content_type: 'image/png',
          },
        ],
      },
      client,
    )

    expect(insertPayloadMock).toHaveBeenCalledWith(expect.objectContaining({
      message_text: '<@bot-1> what is in this image?',
      message_data: expect.objectContaining({
        discord_attachments: [
          expect.objectContaining({
            kind: 'image',
            fileName: '1_1.png',
            url: 'https://cdn.discordapp.com/1_1.png',
            mimeType: 'image/png',
          }),
        ],
      }),
    }))
  })

  it('routes hosted guild bindings by guild id while preserving the actual message channel id', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['guild:guild-1', {
          internalChannelId: 'internal-hosted-1',
          assistantId: 'assistant-hosted-1',
          orgId: 'org-hosted-1',
          externalChannelId: 'guild-1',
          routingConfig: { respond_on_mention: true, ignore_bots: true },
          bindingScope: 'guild',
          dedicatedChannelIds: [],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-hosted-1',
        guild_id: 'guild-1',
        channel_id: 'discord-channel-9',
        author: { id: 'user-1', username: 'Ada' },
        content: '<@bot-1> hey there',
        mentions: [{ id: 'bot-1' }],
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(insertPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'internal-hosted-1',
        assistant_id: 'assistant-hosted-1',
        external_chat_id: 'discord-channel-9',
        message_data: expect.objectContaining({
          discord_channel_id: 'discord-channel-9',
          discord_guild_id: 'guild-1',
          discord_binding_scope: 'guild',
          discord_bound_guild_id: 'guild-1',
        }),
      }),
    )
  })

  it('adds the configured ack reaction and typing indicator after queueing inbound work', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64))
    const client = {
      botToken: 'discord-token',
      botUserId: 'bot-1',
      channels: new Map([
        ['discord-channel-1', {
          internalChannelId: 'internal-1',
          assistantId: 'assistant-1',
          externalChannelId: 'discord-channel-1',
          routingConfig: { dedicated_channel: true },
          allowedUserIds: [],
          ackReaction: 'eyes',
          typingReaction: 'hourglass_flowing_sand',
          threadHistoryScope: 'thread',
          threadInheritParent: false,
          threadInitialHistoryLimit: null,
          bindingScope: 'channel',
          dedicatedChannelIds: [],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-react-1',
        channel_id: 'discord-channel-1',
        author: { id: 'user-1', username: 'Ada' },
        content: 'hello there',
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/reactions/%F0%9F%91%80/@me'),
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/typing'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('routes explicit hosted guild agent targets through the shared resolver', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['guild:guild-1', {
          internalChannelId: 'internal-hosted-default',
          assistantId: 'assistant-default',
          externalChannelId: 'guild-1',
          routingConfig: { respond_on_mention: true, ignore_bots: true },
          bindingScope: 'guild',
          dedicatedChannelIds: [],
        }],
      ]),
      hostedGuildCandidates: new Map([
        ['guild-1', [
          {
            id: 'internal-hosted-default',
            internalChannelId: 'internal-hosted-default',
            assistantId: 'assistant-default',
            assistantName: 'General',
            aliases: ['general'],
            orgId: 'org-1',
            externalChannelId: 'guild-1',
            routingConfig: { respond_on_mention: true, ignore_bots: true },
            bindingScope: 'guild',
            dedicatedChannelIds: [],
            token: 'discord-hosted-token',
            isPrimary: true,
          },
          {
            id: 'internal-hosted-sales',
            internalChannelId: 'internal-hosted-sales',
            assistantId: 'assistant-sales',
            assistantName: 'Sales',
            aliases: ['sales'],
            orgId: 'org-1',
            externalChannelId: 'guild-1',
            routingConfig: { respond_on_mention: true, ignore_bots: true },
            bindingScope: 'guild',
            dedicatedChannelIds: [],
            token: 'discord-hosted-token',
            isPrimary: false,
          },
        ]],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-hosted-explicit-1',
        guild_id: 'guild-1',
        channel_id: 'discord-channel-9',
        author: { id: 'user-1', username: 'Ada' },
        content: '<@bot-1> sales help me close this deal',
        mentions: [{ id: 'bot-1' }],
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(insertPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'internal-hosted-sales',
        assistant_id: 'assistant-sales',
        message_text: 'help me close this deal',
        external_chat_id: 'discord-channel-9',
      }),
    )
  })

  it('applies the targeted agent allowlist after explicit hosted routing resolves', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botToken: 'discord-token',
      botUserId: 'bot-1',
      channels: new Map([
        ['guild:guild-1', {
          internalChannelId: 'internal-hosted-default',
          assistantId: 'assistant-default',
          externalChannelId: 'guild-1',
          routingConfig: { respond_on_mention: true, ignore_bots: true },
          allowedUserIds: [],
          ackReaction: 'eyes',
          typingReaction: 'hourglass_flowing_sand',
          threadHistoryScope: 'thread',
          threadInheritParent: false,
          threadInitialHistoryLimit: null,
          bindingScope: 'guild',
          dedicatedChannelIds: [],
        }],
      ]),
      hostedGuildCandidates: new Map([
        ['guild-1', [
          {
            id: 'internal-hosted-default',
            internalChannelId: 'internal-hosted-default',
            assistantId: 'assistant-default',
            assistantName: 'General',
            aliases: ['general'],
            orgId: 'org-1',
            externalChannelId: 'guild-1',
            routingConfig: { respond_on_mention: true, ignore_bots: true },
            allowedUserIds: [],
            ackReaction: 'eyes',
            typingReaction: 'hourglass_flowing_sand',
            threadHistoryScope: 'thread',
            threadInheritParent: false,
            threadInitialHistoryLimit: null,
            bindingScope: 'guild',
            dedicatedChannelIds: [],
            token: 'discord-hosted-token',
            isPrimary: true,
          },
          {
            id: 'internal-hosted-sales',
            internalChannelId: 'internal-hosted-sales',
            assistantId: 'assistant-sales',
            assistantName: 'Sales',
            aliases: ['sales'],
            orgId: 'org-1',
            externalChannelId: 'guild-1',
            routingConfig: { respond_on_mention: true, ignore_bots: true },
            allowedUserIds: ['user-allow'],
            ackReaction: 'eyes',
            typingReaction: 'hourglass_flowing_sand',
            threadHistoryScope: 'thread',
            threadInheritParent: false,
            threadInitialHistoryLimit: null,
            bindingScope: 'guild',
            dedicatedChannelIds: [],
            token: 'discord-hosted-token',
            isPrimary: false,
          },
        ]],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-hosted-explicit-denied',
        guild_id: 'guild-1',
        channel_id: 'discord-channel-9',
        author: { id: 'user-deny', username: 'Ada' },
        content: '<@bot-1> sales help me close this deal',
        mentions: [{ id: 'bot-1' }],
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(insertPayloadMock).not.toHaveBeenCalled()
  })

  it('does not route plain dedicated hosted guild text through explicit targeting', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['guild:guild-1', {
          internalChannelId: 'internal-hosted-default',
          assistantId: 'assistant-default',
          externalChannelId: 'guild-1',
          routingConfig: { dedicated_channel: true, respond_on_mention: true, ignore_bots: true },
          bindingScope: 'guild',
          dedicatedChannelIds: ['discord-channel-9'],
        }],
      ]),
      hostedGuildCandidates: new Map([
        ['guild-1', [
          {
            id: 'internal-hosted-default',
            internalChannelId: 'internal-hosted-default',
            assistantId: 'assistant-default',
            assistantName: 'General',
            aliases: ['general'],
            orgId: 'org-1',
            externalChannelId: 'guild-1',
            routingConfig: { dedicated_channel: true, respond_on_mention: true, ignore_bots: true },
            bindingScope: 'guild',
            dedicatedChannelIds: ['discord-channel-9'],
            token: 'discord-hosted-token',
            isPrimary: true,
          },
          {
            id: 'internal-hosted-sales',
            internalChannelId: 'internal-hosted-sales',
            assistantId: 'assistant-sales',
            assistantName: 'Sales',
            aliases: ['sales'],
            orgId: 'org-1',
            externalChannelId: 'guild-1',
            routingConfig: { dedicated_channel: true, respond_on_mention: true, ignore_bots: true },
            bindingScope: 'guild',
            dedicatedChannelIds: ['discord-channel-9'],
            token: 'discord-hosted-token',
            isPrimary: false,
          },
        ]],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-hosted-plain-1',
        guild_id: 'guild-1',
        channel_id: 'discord-channel-9',
        author: { id: 'user-1', username: 'Ada' },
        content: 'sales are down',
        mentions: [],
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(insertPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'internal-hosted-default',
        assistant_id: 'assistant-default',
        message_text: 'sales are down',
      }),
    )
  })

  it('fires the inbound-queued callback with inserted event metadata', async () => {
    const onInboundQueued = vi.fn()
    const manager = new DiscordGatewayManager(
      supabase,
      'a'.repeat(64),
      'discord-hosted-token',
      onInboundQueued,
    )
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['guild:guild-1', {
          internalChannelId: 'internal-hosted-1',
          assistantId: 'assistant-hosted-1',
          orgId: 'org-hosted-1',
          externalChannelId: 'guild-1',
          routingConfig: { respond_on_mention: true, ignore_bots: true },
          bindingScope: 'guild',
          dedicatedChannelIds: [],
        }],
      ]),
    } as any

    singleMock.mockResolvedValueOnce({
      data: {
        id: 'evt-hosted-1',
        assistant_id: 'assistant-hosted-1',
        org_id: 'org-hosted-1',
        external_message_id: 'msg-hosted-1',
      },
      error: null,
    })

    await (manager as any).handleMessage(
      {
        id: 'msg-hosted-1',
        guild_id: 'guild-1',
        channel_id: 'discord-channel-9',
        author: { id: 'user-1', username: 'Ada' },
        content: '<@bot-1> hey there',
        mentions: [{ id: 'bot-1' }],
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(onInboundQueued).toHaveBeenCalledWith({
      id: 'evt-hosted-1',
      assistant_id: 'assistant-hosted-1',
      org_id: 'org-hosted-1',
      external_message_id: 'msg-hosted-1',
    })
  })

  it('treats raw bot mention syntax in content as a mention match even when mentions[] is absent', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: '1487888463176142958',
      channels: new Map([
        ['guild:guild-1', {
          internalChannelId: 'internal-hosted-1',
          assistantId: 'assistant-hosted-1',
          externalChannelId: 'guild-1',
          routingConfig: { respond_on_mention: true, ignore_bots: true },
          bindingScope: 'guild',
          dedicatedChannelIds: [],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-hosted-raw-mention',
        guild_id: 'guild-1',
        channel_id: 'discord-channel-raw',
        author: { id: 'user-5', username: 'Turing' },
        content: '<@1487888463176142958> hi',
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        external_message_id: 'msg-hosted-raw-mention',
        external_chat_id: 'discord-channel-raw',
        message_text: 'hi',
      }),
    )
  })

  it('routes Discord thread messages through the parent channel owner when thread support is enabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          type: 11,
          parent_id: 'discord-parent-1',
        }),
      }),
    )

    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['discord-parent-1', {
          internalChannelId: 'internal-parent-1',
          assistantId: 'assistant-parent-1',
          externalChannelId: 'discord-parent-1',
          routingConfig: { thread_support: true, respond_on_mention: false, ignore_bots: true },
          allowedUserIds: [],
          bindingScope: 'channel',
          dedicatedChannelIds: [],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-thread-1',
        guild_id: 'guild-1',
        channel_id: 'thread-1',
        author: { id: 'user-7', username: 'Threader' },
        content: 'follow up inside the thread',
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(insertPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'internal-parent-1',
        assistant_id: 'assistant-parent-1',
        external_chat_id: 'thread-1',
        message_text: 'follow up inside the thread',
        message_data: expect.objectContaining({
          thread_id: 'thread-1',
          discord_channel_id: 'thread-1',
        }),
      }),
    )
  })

  it('ignores Discord thread messages for parent channel owners when thread support is disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          type: 11,
          parent_id: 'discord-parent-1',
        }),
      }),
    )

    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['discord-parent-1', {
          internalChannelId: 'internal-parent-1',
          assistantId: 'assistant-parent-1',
          externalChannelId: 'discord-parent-1',
          routingConfig: { thread_support: false, respond_on_mention: false, ignore_bots: true },
          allowedUserIds: [],
          bindingScope: 'channel',
          dedicatedChannelIds: [],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-thread-ignore',
        guild_id: 'guild-1',
        channel_id: 'thread-1',
        author: { id: 'user-8', username: 'Threader' },
        content: 'follow up inside the thread',
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(insertMock).not.toHaveBeenCalled()
  })

  it('ignores Discord messages from authors outside the configured allowlist', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64))
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['discord-channel-1', {
          internalChannelId: 'internal-1',
          assistantId: 'assistant-1',
          externalChannelId: 'discord-channel-1',
          routingConfig: { dedicated_channel: true },
          allowedUserIds: ['user-allow'],
          bindingScope: 'channel',
          dedicatedChannelIds: [],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-allowlist-ignore',
        channel_id: 'discord-channel-1',
        author: { id: 'user-deny', username: 'Ada' },
        content: 'hello there',
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(insertMock).not.toHaveBeenCalled()
  })

  it('processes plain messages in hosted dedicated channels without requiring mentions', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['guild:guild-1', {
          internalChannelId: 'internal-hosted-1',
          assistantId: 'assistant-hosted-1',
          externalChannelId: 'guild-1',
          routingConfig: { respond_on_mention: true, ignore_bots: true },
          bindingScope: 'guild',
          dedicatedChannelIds: ['discord-channel-dedicated'],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-hosted-dedicated',
        guild_id: 'guild-1',
        channel_id: 'discord-channel-dedicated',
        author: { id: 'user-2', username: 'Grace' },
        content: 'plain hello',
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        external_message_id: 'msg-hosted-dedicated',
        external_chat_id: 'discord-channel-dedicated',
        message_text: 'plain hello',
      }),
    )
  })

  it('processes audio-only replies to Lucid in hosted guild channels without requiring mentions', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['guild:guild-1', {
          internalChannelId: 'internal-hosted-1',
          assistantId: 'assistant-hosted-1',
          externalChannelId: 'guild-1',
          routingConfig: { respond_on_mention: true, ignore_bots: true },
          bindingScope: 'guild',
          dedicatedChannelIds: [],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-hosted-audio-reply',
        guild_id: 'guild-1',
        channel_id: 'discord-channel-random',
        author: { id: 'user-6', username: 'Claude' },
        content: '',
        timestamp: '2026-04-16T00:00:00Z',
        message_reference: {
          message_id: 'msg-bot-1',
          channel_id: 'discord-channel-random',
          guild_id: 'guild-1',
        },
        referenced_message: {
          id: 'msg-bot-1',
          content: 'How can I help?',
          author: { id: 'bot-1', bot: true },
        },
        attachments: [
          {
            id: 'att-audio-reply-1',
            filename: 'voice-note.ogg',
            url: 'https://cdn.discordapp.com/voice-note-reply.ogg',
            content_type: 'audio/ogg',
          },
        ],
      },
      client,
    )

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        external_message_id: 'msg-hosted-audio-reply',
        external_chat_id: 'discord-channel-random',
        message_text: '',
        message_data: expect.objectContaining({
          discord_audio_input: true,
          message_reference: {
            message_id: 'msg-bot-1',
            channel_id: 'discord-channel-random',
            guild_id: 'guild-1',
          },
          discord_attachments: [
            expect.objectContaining({
              kind: 'audio',
              fileName: 'voice-note.ogg',
            }),
          ],
        }),
      }),
    )
  })

  it('ignores plain hosted guild messages outside dedicated channels when there is no mention', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['guild:guild-1', {
          internalChannelId: 'internal-hosted-1',
          assistantId: 'assistant-hosted-1',
          externalChannelId: 'guild-1',
          routingConfig: { respond_on_mention: true, ignore_bots: true },
          bindingScope: 'guild',
          dedicatedChannelIds: ['discord-channel-dedicated'],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-hosted-ignore',
        guild_id: 'guild-1',
        channel_id: 'discord-channel-random',
        author: { id: 'user-3', username: 'Linus' },
        content: 'plain hello',
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(insertMock).not.toHaveBeenCalled()
  })

  it('does not treat stale hosted dedicated_channel flags as server-wide always-on routing', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['guild:guild-1', {
          internalChannelId: 'internal-hosted-1',
          assistantId: 'assistant-hosted-1',
          externalChannelId: 'guild-1',
          routingConfig: { dedicated_channel: true, ignore_bots: true },
          bindingScope: 'guild',
          dedicatedChannelIds: [],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-hosted-stale-dedicated',
        guild_id: 'guild-1',
        channel_id: 'discord-channel-random',
        author: { id: 'user-4', username: 'Margaret' },
        content: 'plain hello',
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(insertMock).not.toHaveBeenCalled()
  })

  it('defaults hosted bindings without routing config to mention-only behavior', () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')

    const config = (manager as any).getDefaultRoutingConfig({
      inboundRoutingConfig: null,
    })

    expect(config).toEqual({
      respond_on_mention: true,
      ignore_bots: true,
    })
  })

  it('preserves existing Discord clients when a transient DB refresh fails', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const destroy = vi.fn()
    const queryBuilder = {
      eq: vi.fn(),
    } as any
    queryBuilder.eq
      .mockReturnValueOnce(queryBuilder)
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'upstream request timeout' },
      })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue(queryBuilder),
    } as any)
    const clients = (manager as any).clients as Map<string, { botToken: string; channels: Map<string, unknown>; destroy: () => void }>
    clients.set('token-hash', {
      botToken: 'discord-existing-token',
      channels: new Map([['guild:guild-1', {}]]),
      destroy,
    })

    await manager.refresh()

    expect(clients.has('token-hash')).toBe(true)
    expect(destroy).not.toHaveBeenCalled()
  })

  it('uses discord_guild_id from channel_config for hosted bindings when external_channel_id drifted', async () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')

    const queryBuilder = {
      eq: vi.fn(),
    } as any
    queryBuilder.eq
      .mockReturnValueOnce(queryBuilder)
      .mockResolvedValueOnce({
      data: [
        {
          id: 'internal-hosted-drift',
          assistant_id: 'assistant-hosted-drift',
          channel_type: 'discord',
          external_channel_id: 'stale-channel-like-id',
          connection_mode: 'byob',
          channel_config: {
            hosted: true,
            discord_guild_id: 'real-guild-id',
          },
          inbound_routing_config: {},
          encrypted_secrets: {
            encrypted_data: null,
          },
        },
      ],
      error: null,
    })

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue(queryBuilder),
    } as any)

    const grouped = await (manager as any).loadChannelsGroupedByToken()
    const entry = grouped.get('discord-hosted-token')
    const channels = entry?.channels

    expect(entry).toBeDefined()
    expect(channels?.has('guild:real-guild-id')).toBe(true)
    expect(channels?.get('guild:real-guild-id')).toMatchObject({
      externalChannelId: 'real-guild-id',
      bindingScope: 'guild',
      dedicatedChannelIds: ['stale-channel-like-id'],
    })
  })

  it('treats a legacy hosted external_channel_id as a dedicated text channel fallback', async () => {
    vi.mocked(supabase.from).mockImplementation(
      () => ({ insert: (...args: unknown[]) => insertMock(...args) }) as any,
    )
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['guild:guild-1', {
          internalChannelId: 'internal-hosted-legacy',
          assistantId: 'assistant-hosted-legacy',
          externalChannelId: 'guild-1',
          routingConfig: { respond_on_mention: true, ignore_bots: true },
          bindingScope: 'guild',
          dedicatedChannelIds: ['discord-channel-legacy'],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-hosted-legacy-channel',
        guild_id: 'guild-1',
        channel_id: 'discord-channel-legacy',
        author: { id: 'user-9', username: 'Jordan' },
        content: 'plain hello from the legacy bound channel',
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(insertPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'internal-hosted-legacy',
        assistant_id: 'assistant-hosted-legacy',
        external_chat_id: 'discord-channel-legacy',
        message_text: 'plain hello from the legacy bound channel',
      }),
    )
  })

  it('refreshes the bot mention identity from Discord READY payloads', () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: 'stale-bot-id',
    } as any

    const sessionId = (manager as any).applyReadyIdentity(client, {
      session_id: 'session-1',
      user: { id: 'ready-bot-id' },
    })

    expect(sessionId).toBe('session-1')
    expect(client.botUserId).toBe('ready-bot-id')
    expect((manager as any).isBotMentioned({
      content: '<@ready-bot-id> hello',
      mentions: [{ id: 'ready-bot-id' }],
    }, client.botUserId)).toBe(true)
  })

  it('treats duplicate inbound inserts as benign dedupe instead of noisy gateway errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    singleMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "ux_inbound_webhook_dedupe"',
      },
    })

    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')
    const client = {
      botUserId: 'bot-1',
      channels: new Map([
        ['discord-channel-1', {
          internalChannelId: 'internal-1',
          assistantId: 'assistant-1',
          externalChannelId: 'discord-channel-1',
          routingConfig: { dedicated_channel: true, ignore_bots: true },
          bindingScope: 'channel',
          dedicatedChannelIds: [],
        }],
      ]),
    } as any

    await (manager as any).handleMessage(
      {
        id: 'msg-duplicate',
        channel_id: 'discord-channel-1',
        author: { id: 'user-1', username: 'Ada' },
        content: 'hello',
        timestamp: '2026-04-16T00:00:00Z',
      },
      client,
    )

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('exposes desired presence through the admin status contract before a client connects', () => {
    const manager = new DiscordGatewayManager(supabase, 'a'.repeat(64), 'discord-hosted-token')

    manager.setPresence({
      status: 'online',
      activity: 'Lucid agents',
      activityType: 3,
    })

    expect(manager.getAdminStatus()).toMatchObject({
      configured: true,
      running: false,
      presence: {
        status: 'online',
        activity: {
          name: 'Lucid agents',
          type: 3,
        },
      },
    })
  })
})
