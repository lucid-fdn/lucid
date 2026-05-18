export type CanonicalChannelType =
  | 'discord'
  | 'telegram'
  | 'whatsapp'
  | 'slack'
  | 'web'
  | 'msteams'
  | string

export type CanonicalBindingScope = 'channel' | 'guild' | 'dm' | 'conversation'

export type CanonicalReplyMode = 'direct' | 'mention' | 'prefix' | 'dedicated'

export interface CanonicalAttachment {
  kind: 'audio' | 'file' | 'image' | string
  id?: string | null
  fileName?: string | null
  url?: string | null
  mimeType?: string | null
}

export interface InboundEnvelope<TMessageData extends Record<string, unknown> | null = Record<string, unknown> | null> {
  traceId: string
  inboundEventId: string
  assistantId?: string | null
  channelId: string
  channelType: CanonicalChannelType
  externalMessageId: string | null
  externalUserId: string | null
  externalChatId: string | null
  normalizedText: string
  replyMode: CanonicalReplyMode
  bindingScope?: CanonicalBindingScope | null
  threadId?: string | null
  attachments: CanonicalAttachment[]
  messageData: TMessageData
}

export interface OutboundEnvelope {
  traceId: string
  outboundEventId: string
  channelId: string
  channelType: CanonicalChannelType
  conversationId: string | null
  inboundEventId: string | null
  recipient: {
    address: string
    kind: 'channel' | 'user' | 'chat' | 'conversation'
  }
  text: string
  replyToExternalId: string | null
}

export function createInboundTraceId(channelType: CanonicalChannelType, inboundEventId: string): string {
  return `${channelType}:${inboundEventId}`
}

export function createOutboundTraceId(channelType: CanonicalChannelType, outboundEventId: string): string {
  return `${channelType}:${outboundEventId}`
}

