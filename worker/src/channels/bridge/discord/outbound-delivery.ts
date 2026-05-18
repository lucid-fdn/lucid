import type { Config } from '../../../config.js'
import type { createDiscordPlugin } from './DiscordPlugin.js'
import { shouldSendVoiceReply } from '../media/voice-reply-policy.js'
import { resolveDiscordDeliveryConfig } from './config.js'
import { buildDiscordOutboundEnvelope } from '../../../core/transports/discord-envelope.js'

export interface DiscordOutboundEvent {
  id: string
  inbound_event_id: string | null
  conversation_id: string | null
  message_text: string
  reply_to_external_id: string | null
}

export interface DiscordOutboundChannel {
  id: string
  external_channel_id: string | null
  channel_config?: Record<string, unknown> | null
}

function hasDiscordVoiceInput(messageData: Record<string, unknown> | null | undefined): boolean {
  if (messageData?.discord_audio_input === true) return true
  const raw = messageData?.discord_attachments
  if (!Array.isArray(raw)) return false
  return raw.some((item) => {
    if (!item || typeof item !== 'object') return false
    return (item as { kind?: unknown }).kind === 'audio'
  })
}

export async function sendDiscordTextInChunks(params: {
  plugin: ReturnType<typeof createDiscordPlugin>
  recipient: string
  text: string
  replyToExternalId?: string | null
  replyToMode: 'off' | 'first' | 'all'
}): Promise<string | null> {
  const chunks = params.plugin.outbound.chunker(
    params.text,
    params.plugin.outbound.textChunkLimit,
  )
  const nonEmptyChunks = chunks.filter((chunk) => chunk.trim().length > 0)
  if (nonEmptyChunks.length === 0) {
    return null
  }

  let lastMessageId: string | null = null
  for (const [index, chunk] of nonEmptyChunks.entries()) {
    const result = await params.plugin.outbound.sendText({
      to: params.recipient,
      text: chunk,
      replyToId:
        params.replyToMode === 'off'
          ? undefined
          : params.replyToMode === 'all'
            ? params.replyToExternalId || undefined
            : index === 0
              ? params.replyToExternalId || undefined
              : undefined,
    })
    if (!result.ok && result.error) {
      throw new Error(`Discord bridge error: ${result.error}`)
    }
    lastMessageId = result.messageId ? String(result.messageId) : lastMessageId
  }

  return lastMessageId
}

export async function handleDiscordOutbound(params: {
  config: Config
  channel: DiscordOutboundChannel
  event: DiscordOutboundEvent
  plugin: ReturnType<typeof createDiscordPlugin>
  hosted: boolean
  loadInboundMessageData: (inboundEventId: string | null) => Promise<Record<string, unknown> | null>
  prepareVoiceReplyMedia: (params: {
    config: Config
    text: string
    voice?: string
    instructions?: string
    fileBaseName: string
    tempDirName: string
  }) => Promise<{
    filePath: string
    mediaUrl: string
    localRoot: string
  }>
  cleanupVoiceTempFile: (filePath: string | null) => Promise<void>
}): Promise<string | null> {
  const deliveryConfig = resolveDiscordDeliveryConfig(
    params.channel.channel_config && typeof params.channel.channel_config === 'object'
      ? params.channel.channel_config
      : null,
  )
  const voiceSettings = deliveryConfig.voice
  const inboundMessageData =
    voiceSettings.mode === 'auto'
      ? await params.loadInboundMessageData(params.event.inbound_event_id)
      : null
  const hostedDiscordChannelId =
    params.hosted &&
    typeof inboundMessageData?.discord_channel_id === 'string' &&
    inboundMessageData.discord_channel_id.trim().length > 0
      ? inboundMessageData.discord_channel_id.trim()
      : null
  const outboundEnvelope = buildDiscordOutboundEnvelope({
    outboundEventId: params.event.id,
    channelId: params.channel.id,
    conversationId: params.event.conversation_id,
    inboundEventId: params.event.inbound_event_id,
    text: params.event.message_text,
    replyToExternalId: params.event.reply_to_external_id,
    recipient: hostedDiscordChannelId ?? params.channel.external_channel_id!,
  })
  const shouldSendDiscordVoiceReply = shouldSendVoiceReply({
    text: params.event.message_text,
    mode: voiceSettings.mode,
    hasVoiceInput: hasDiscordVoiceInput(inboundMessageData),
  })

  if (shouldSendDiscordVoiceReply && params.plugin.outbound.sendMedia) {
    let tempVoiceFilePath: string | null = null
    try {
      const voiceMedia = await params.prepareVoiceReplyMedia({
        config: params.config,
        text: params.event.message_text,
        voice: voiceSettings.voiceId ?? undefined,
        instructions: voiceSettings.instructions ?? undefined,
        fileBaseName: 'discord-voice-reply',
        tempDirName: 'lucid-discord-voice',
      })
      tempVoiceFilePath = voiceMedia.filePath
      const voiceResult = await params.plugin.outbound.sendMedia({
        to: outboundEnvelope.recipient.address,
        text: '',
        mediaUrl: voiceMedia.mediaUrl,
        replyToId: params.event.reply_to_external_id || undefined,
        platformOptions: {
          audioAsVoice: true,
          mediaLocalRoots: [voiceMedia.localRoot],
        },
      })
      if (!voiceResult.ok && voiceResult.error) {
        throw new Error(`Discord voice send error: ${voiceResult.error}`)
      }
      return voiceResult.messageId ? String(voiceResult.messageId) : null
    } catch (error) {
      console.warn('[outbound] Discord voice reply failed, falling back to text', {
        channelId: params.channel.id,
        outboundId: params.event.id,
        reason: error instanceof Error ? error.message : String(error),
      })
    } finally {
      await params.cleanupVoiceTempFile(tempVoiceFilePath)
    }
  }

  return sendDiscordTextInChunks({
    plugin: params.plugin,
    recipient: outboundEnvelope.recipient.address,
    text: outboundEnvelope.text,
    replyToExternalId: outboundEnvelope.replyToExternalId,
    replyToMode: deliveryConfig.replyToMode,
  })
}
