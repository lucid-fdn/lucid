import {
  createInboundTraceId,
  createOutboundTraceId,
  type CanonicalAttachment,
  type InboundEnvelope,
  type OutboundEnvelope,
} from '../contracts/index.js'

export interface SlackInboundSource {
  messageId: string
  userId: string
  channelId: string
  parentChannelId?: string
  rawText: string
  normalizedText: string
  threadTs?: string
  threadHistoryScope?: 'thread' | 'channel'
  threadInheritParent?: boolean
  initialHistoryLimit?: number
  rawPayload: Record<string, unknown>
  attachments?: CanonicalAttachment[]
  source?: 'message' | 'slash_command' | 'system_event'
}

export function buildSlackInboundEnvelope(params: {
  inboundEventId: string
  channelId: string
  assistantId: string
  replyMode: 'direct' | 'mention' | 'prefix' | 'dedicated'
  source: SlackInboundSource
}): InboundEnvelope<Record<string, unknown>> {
  const attachments = params.source.attachments ?? []

  return {
    traceId: createInboundTraceId('slack', params.inboundEventId),
    inboundEventId: params.inboundEventId,
    assistantId: params.assistantId,
    channelId: params.channelId,
    channelType: 'slack',
    externalMessageId: params.source.messageId,
    externalUserId: params.source.userId,
    externalChatId: params.source.channelId,
    normalizedText: params.source.normalizedText,
    replyMode: params.replyMode,
    bindingScope: params.source.threadTs ? 'conversation' : 'channel',
    threadId: params.source.threadTs ?? null,
    attachments,
    messageData: {
      channel_type: 'slack',
      thread_ts: params.source.threadTs,
      source: params.source.source ?? 'message',
      attachments,
      slack_files: attachments,
      slack_raw_payload: params.source.rawPayload,
      slack_raw_text: params.source.rawText,
      slack_parent_chat_id: params.source.parentChannelId ?? params.source.channelId,
      slack_thread_history_scope: params.source.threadHistoryScope ?? 'thread',
      slack_thread_inherit_parent: params.source.threadInheritParent === true,
      ...(typeof params.source.initialHistoryLimit === 'number'
        ? { slack_thread_initial_history_limit: params.source.initialHistoryLimit }
        : {}),
    },
  }
}

export function buildSlackOutboundEnvelope(params: {
  outboundEventId: string
  channelId: string
  conversationId: string | null
  inboundEventId: string | null
  text: string
  replyToExternalId: string | null
  recipient: string
  threadTs?: string | null
}): OutboundEnvelope {
  return {
    traceId: createOutboundTraceId('slack', params.outboundEventId),
    outboundEventId: params.outboundEventId,
    channelId: params.channelId,
    channelType: 'slack',
    conversationId: params.conversationId,
    inboundEventId: params.inboundEventId,
    recipient: {
      address: params.recipient,
      kind: 'channel',
    },
    text: params.text,
    replyToExternalId: params.threadTs ?? params.replyToExternalId,
  }
}
