import {
  createInboundTraceId,
  createOutboundTraceId,
  type CanonicalAttachment,
  type InboundEnvelope,
  type OutboundEnvelope,
} from '../contracts/index.js'

export interface DiscordInboundSource {
  messageId: string
  authorId: string
  channelId: string
  parentChannelId?: string | null
  guildId?: string
  authorUsername: string
  rawContent: string
  normalizedText: string
  threadId?: string
  threadHistoryScope?: 'thread' | 'channel'
  threadInheritParent?: boolean
  initialHistoryLimit?: number | null
  messageReference?: {
    message_id?: string
    channel_id?: string
    guild_id?: string
  }
  rawPayload: Record<string, unknown>
  attachments?: CanonicalAttachment[]
}

export function buildDiscordInboundEnvelope(params: {
  inboundEventId: string
  channelId: string
  assistantId: string
  bindingScope: 'channel' | 'guild'
  boundGuildId?: string | null
  replyMode: 'direct' | 'mention' | 'prefix' | 'dedicated'
  source: DiscordInboundSource
}): InboundEnvelope<Record<string, unknown>> {
  const attachments = params.source.attachments ?? []
  return {
    traceId: createInboundTraceId('discord', params.inboundEventId),
    inboundEventId: params.inboundEventId,
    assistantId: params.assistantId,
    channelId: params.channelId,
    channelType: 'discord',
    externalMessageId: params.source.messageId,
    externalUserId: params.source.authorId,
    externalChatId: params.source.channelId,
    normalizedText: params.source.normalizedText,
    replyMode: params.replyMode,
    bindingScope: params.bindingScope,
    threadId: params.source.threadId ?? null,
    attachments,
    messageData: {
      guild_id: params.source.guildId,
      discord_guild_id: params.source.guildId,
      discord_channel_id: params.source.channelId,
      discord_parent_chat_id: params.source.parentChannelId ?? params.source.channelId,
      discord_binding_scope: params.bindingScope,
      discord_bound_guild_id:
        params.bindingScope === 'guild' ? params.boundGuildId ?? params.source.guildId : undefined,
      author_username: params.source.authorUsername,
      thread_id: params.source.threadId,
      discord_thread_history_scope: params.source.threadHistoryScope ?? 'thread',
      discord_thread_inherit_parent: params.source.threadInheritParent === true,
      ...(typeof params.source.initialHistoryLimit === 'number'
        ? { discord_thread_initial_history_limit: params.source.initialHistoryLimit }
        : {}),
      message_reference: params.source.messageReference,
      channel_type: 'discord',
      discord_audio_input: attachments.some((attachment) => attachment.kind === 'audio'),
      discord_attachments: attachments,
      discord_raw_payload: params.source.rawPayload,
    },
  }
}

export function normalizeDiscordRecipient(recipient: string): string {
  if (recipient.startsWith('channel:') || recipient.startsWith('user:')) {
    return recipient
  }
  return `channel:${recipient}`
}

export function buildDiscordOutboundEnvelope(params: {
  outboundEventId: string
  channelId: string
  conversationId: string | null
  inboundEventId: string | null
  text: string
  replyToExternalId: string | null
  recipient: string
}): OutboundEnvelope {
  const normalizedRecipient = normalizeDiscordRecipient(params.recipient)
  const recipientKind = normalizedRecipient.startsWith('user:') ? 'user' : 'channel'

  return {
    traceId: createOutboundTraceId('discord', params.outboundEventId),
    outboundEventId: params.outboundEventId,
    channelId: params.channelId,
    channelType: 'discord',
    conversationId: params.conversationId,
    inboundEventId: params.inboundEventId,
    recipient: {
      address: normalizedRecipient,
      kind: recipientKind,
    },
    text: params.text,
    replyToExternalId: params.replyToExternalId,
  }
}
