import { describe, expect, it } from 'vitest'

import {
  buildSlackInboundEnvelope,
  buildSlackOutboundEnvelope,
} from '../slack-envelope.js'
import {
  expectCanonicalInboundEnvelope,
  expectCanonicalOutboundEnvelope,
} from './transport-contract.js'

describe('slack transport envelope', () => {
  it('builds a canonical inbound envelope for Slack messages', () => {
    const envelope = buildSlackInboundEnvelope({
      inboundEventId: 'in-1',
      channelId: 'assistant-channel-1',
      assistantId: 'assistant-1',
      replyMode: 'mention',
      source: {
        messageId: '171.0001',
        userId: 'U123',
        channelId: 'C123',
        rawText: '<@bot> hi',
        normalizedText: 'hi',
        threadTs: '171.0000',
        rawPayload: { ts: '171.0001' },
        attachments: [
          {
            kind: 'audio',
            id: 'F123',
            fileName: 'note.m4a',
            mimeType: 'audio/m4a',
          },
        ],
      },
    })

    expectCanonicalInboundEnvelope(envelope, {
      channelType: 'slack',
      traceId: 'slack:in-1',
      assistantId: 'assistant-1',
      channelId: 'assistant-channel-1',
      externalMessageId: '171.0001',
      externalUserId: 'U123',
      externalChatId: 'C123',
      normalizedText: 'hi',
      replyMode: 'mention',
    })
    expect(envelope.threadId).toBe('171.0000')
    expect(envelope.messageData.slack_raw_text).toBe('<@bot> hi')
    expect(envelope.messageData.slack_files).toEqual([
      {
        kind: 'audio',
        id: 'F123',
        fileName: 'note.m4a',
        mimeType: 'audio/m4a',
      },
    ])
  })

  it('builds a canonical outbound envelope for Slack thread replies', () => {
    const envelope = buildSlackOutboundEnvelope({
      outboundEventId: 'out-1',
      channelId: 'assistant-channel-1',
      conversationId: 'conv-1',
      inboundEventId: 'in-1',
      text: 'hello back',
      replyToExternalId: '171.0001',
      recipient: 'C123',
      threadTs: '171.0000',
    })

    expectCanonicalOutboundEnvelope(envelope, {
      channelType: 'slack',
      traceId: 'slack:out-1',
      channelId: 'assistant-channel-1',
      text: 'hello back',
      recipientAddress: 'C123',
      recipientKind: 'channel',
    })
    expect(envelope.replyToExternalId).toBe('171.0000')
  })
})
