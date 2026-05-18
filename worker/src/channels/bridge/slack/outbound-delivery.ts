import type { createSlackPlugin } from './SlackPlugin.js'
import { buildSlackOutboundEnvelope } from '../../../core/transports/slack-envelope.js'

export interface SlackOutboundEvent {
  id: string
  inbound_event_id: string | null
  conversation_id: string | null
  message_text: string
  reply_to_external_id: string | null
}

export interface SlackOutboundChannel {
  id: string
  external_channel_id: string | null
  channel_config?: Record<string, unknown> | null
}

export function getSlackReactionTargetTimestamp(
  event: Pick<SlackOutboundEvent, 'reply_to_external_id'>,
  inboundMessageData: Record<string, unknown> | null,
): string | null {
  if (
    typeof event.reply_to_external_id === 'string' &&
    event.reply_to_external_id.trim().length > 0
  ) {
    return event.reply_to_external_id.trim()
  }

  const rawPayload =
    inboundMessageData?.slack_raw_payload &&
    typeof inboundMessageData.slack_raw_payload === 'object'
      ? (inboundMessageData.slack_raw_payload as Record<string, unknown>)
      : null
  const timestamp = rawPayload?.ts
  return typeof timestamp === 'string' && timestamp.trim().length > 0 ? timestamp.trim() : null
}

export async function clearSlackProcessingReaction(params: {
  plugin: ReturnType<typeof createSlackPlugin>
  channelId: string
  outboundId: string
  timestamp: string | null
  reactionName: string | null
}): Promise<void> {
  if (!params.timestamp || !params.reactionName) return

  const clearReaction = await params.plugin.reactions.remove({
    channel: params.channelId,
    timestamp: params.timestamp,
    name: params.reactionName,
  })
  if (!clearReaction.ok) {
    console.warn('[outbound] Slack processing reaction cleanup failed', {
      channelId: params.channelId,
      outboundId: params.outboundId,
      timestamp: params.timestamp,
      reason: clearReaction.error || 'unknown',
    })
  }
}

export async function handleSlackOutbound(params: {
  channel: SlackOutboundChannel
  event: SlackOutboundEvent
  plugin: ReturnType<typeof createSlackPlugin>
  loadInboundMessageData: (inboundEventId: string | null) => Promise<Record<string, unknown> | null>
}): Promise<{
  externalMessageId: string | null
}> {
  const inboundMessageData = await params.loadInboundMessageData(params.event.inbound_event_id)
  const recipientChannelId =
    typeof params.channel.external_channel_id === 'string' &&
    params.channel.external_channel_id.trim().length > 0
      ? params.channel.external_channel_id.trim()
      : typeof inboundMessageData?.slack_parent_chat_id === 'string' &&
          inboundMessageData.slack_parent_chat_id.trim().length > 0
        ? inboundMessageData.slack_parent_chat_id.trim()
        : null
  if (!recipientChannelId) {
    throw new Error('Slack outbound recipient channel is missing')
  }
  const threadTs =
    typeof inboundMessageData?.thread_ts === 'string' && inboundMessageData.thread_ts.trim().length > 0
      ? inboundMessageData.thread_ts.trim()
      : undefined
  const reactionTargetTs = getSlackReactionTargetTimestamp(params.event, inboundMessageData)
  const reactionName =
    params.channel.channel_config &&
    typeof params.channel.channel_config === 'object' &&
    Object.prototype.hasOwnProperty.call(
      params.channel.channel_config,
      'slack_typing_reaction',
    )
      ? typeof params.channel.channel_config.slack_typing_reaction === 'string' &&
        params.channel.channel_config.slack_typing_reaction.trim().length > 0
        ? params.channel.channel_config.slack_typing_reaction.trim()
        : null
      : 'hourglass_flowing_sand'
  const outboundEnvelope = buildSlackOutboundEnvelope({
    outboundEventId: params.event.id,
    channelId: params.channel.id,
    conversationId: params.event.conversation_id,
    inboundEventId: params.event.inbound_event_id,
    text: params.event.message_text,
    replyToExternalId: params.event.reply_to_external_id,
    recipient: recipientChannelId,
    threadTs,
  })

  const cleanup = {
    plugin: params.plugin,
    channelId: outboundEnvelope.recipient.address,
    timestamp: reactionTargetTs,
    reactionName,
  }

  try {
    const result = await params.plugin.outbound.sendText({
      to: outboundEnvelope.recipient.address,
      text: outboundEnvelope.text,
      ...(threadTs ? { threadId: threadTs } : {}),
      ...(threadTs ? { platformOptions: { threadTs } } : {}),
    })
    if (!result.ok && result.error) {
      throw new Error(`Slack bridge error: ${result.error}`)
    }

    return {
      externalMessageId: result.messageId ? String(result.messageId) : null,
    }
  } finally {
    await clearSlackProcessingReaction({
      plugin: cleanup.plugin,
      channelId: cleanup.channelId,
      outboundId: params.event.id,
      timestamp: cleanup.timestamp,
      reactionName: cleanup.reactionName,
    })
  }
}
