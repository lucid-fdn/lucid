import { expect } from 'vitest'

import type { CanonicalChannelType, InboundEnvelope, OutboundEnvelope } from '../../contracts/index.js'

export function expectCanonicalInboundEnvelope(
  envelope: InboundEnvelope<Record<string, unknown>>,
  expected: {
    channelType: CanonicalChannelType
    traceId: string
    assistantId: string
    channelId: string
    externalMessageId: string
    externalUserId: string
    externalChatId: string
    normalizedText: string
    replyMode: 'direct' | 'mention' | 'prefix' | 'dedicated'
  },
): void {
  expect(envelope).toMatchObject({
    traceId: expected.traceId,
    assistantId: expected.assistantId,
    channelId: expected.channelId,
    channelType: expected.channelType,
    externalMessageId: expected.externalMessageId,
    externalUserId: expected.externalUserId,
    externalChatId: expected.externalChatId,
    normalizedText: expected.normalizedText,
    replyMode: expected.replyMode,
  })
  expect(Array.isArray(envelope.attachments)).toBe(true)
  expect(envelope.messageData).toBeTruthy()
}

export function expectCanonicalOutboundEnvelope(
  envelope: OutboundEnvelope,
  expected: {
    channelType: CanonicalChannelType
    traceId: string
    channelId: string
    text: string
    recipientAddress: string
    recipientKind: 'channel' | 'user' | 'chat' | 'conversation'
  },
): void {
  expect(envelope).toMatchObject({
    traceId: expected.traceId,
    channelId: expected.channelId,
    channelType: expected.channelType,
    text: expected.text,
    recipient: {
      address: expected.recipientAddress,
      kind: expected.recipientKind,
    },
  })
}
