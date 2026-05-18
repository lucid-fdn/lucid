import { describe, expect, it } from 'vitest'

import {
  buildDiscordInboundEnvelope,
  buildDiscordOutboundEnvelope,
} from '../discord-envelope.js'
import {
  expectCanonicalInboundEnvelope,
  expectCanonicalOutboundEnvelope,
} from './transport-contract.js'

describe('discord transport envelope', () => {
  it('builds a canonical inbound envelope for hosted guild traffic', () => {
    const envelope = buildDiscordInboundEnvelope({
      inboundEventId: 'in-1',
      channelId: 'assistant-channel-1',
      assistantId: 'assistant-1',
      bindingScope: 'guild',
      boundGuildId: 'guild-1',
      replyMode: 'mention',
      source: {
        messageId: 'msg-1',
        authorId: 'user-1',
        channelId: 'discord-channel-1',
        parentChannelId: 'discord-parent-1',
        guildId: 'guild-1',
        authorUsername: 'quentin',
        rawContent: '<@bot> hi',
        normalizedText: 'hi',
        threadId: 'thread-1',
        threadHistoryScope: 'channel',
        threadInheritParent: true,
        initialHistoryLimit: 12,
        rawPayload: { id: 'msg-1' },
        attachments: [
          {
            kind: 'audio',
            id: 'att-1',
            fileName: 'voice.ogg',
            url: 'https://example.com/voice.ogg',
            mimeType: 'audio/ogg',
          },
        ],
      },
    })

    expectCanonicalInboundEnvelope(envelope, {
      channelType: 'discord',
      traceId: 'discord:in-1',
      assistantId: 'assistant-1',
      channelId: 'assistant-channel-1',
      externalMessageId: 'msg-1',
      externalUserId: 'user-1',
      externalChatId: 'discord-channel-1',
      normalizedText: 'hi',
      replyMode: 'mention',
    })
    expect(envelope.messageData.discord_channel_id).toBe('discord-channel-1')
    expect(envelope.messageData.discord_parent_chat_id).toBe('discord-parent-1')
    expect(envelope.messageData.discord_binding_scope).toBe('guild')
    expect(envelope.messageData.discord_thread_history_scope).toBe('channel')
    expect(envelope.messageData.discord_thread_inherit_parent).toBe(true)
    expect(envelope.messageData.discord_thread_initial_history_limit).toBe(12)
    expect(envelope.messageData.discord_audio_input).toBe(true)
  })

  it('normalizes discord outbound recipients into canonical channel addresses', () => {
    const envelope = buildDiscordOutboundEnvelope({
      outboundEventId: 'out-1',
      channelId: 'assistant-channel-1',
      conversationId: 'conv-1',
      inboundEventId: 'in-1',
      text: 'hi back',
      replyToExternalId: 'msg-1',
      recipient: '1419760739522056213',
    })

    expectCanonicalOutboundEnvelope(envelope, {
      channelType: 'discord',
      traceId: 'discord:out-1',
      channelId: 'assistant-channel-1',
      text: 'hi back',
      recipientAddress: 'channel:1419760739522056213',
      recipientKind: 'channel',
    })
  })
})
