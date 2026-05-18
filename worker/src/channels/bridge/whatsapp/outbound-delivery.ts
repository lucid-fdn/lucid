import type { Config } from '../../../config.js'
import { resolveWhatsAppVoiceReplySettings, shouldSendVoiceReply } from '../media/voice-reply-policy.js'
import type { createWhatsAppPlugin } from './WhatsAppPlugin.js'

export interface WhatsAppOutboundEvent {
  id: string
  inbound_event_id: string | null
  message_text: string
}

export interface WhatsAppOutboundChannel {
  id: string
  external_channel_id: string | null
  channel_config?: Record<string, unknown> | null
}

function hasWhatsAppVoiceInput(messageData: Record<string, unknown> | null | undefined): boolean {
  if (messageData?.whatsapp_audio_input === true) return true
  const raw = messageData?.whatsapp_attachments
  if (!Array.isArray(raw)) return false
  return raw.some((item) => {
    if (!item || typeof item !== 'object') return false
    return (item as { kind?: unknown }).kind === 'audio'
  })
}

export async function handleWhatsAppOutbound(params: {
  config: Config
  channel: WhatsAppOutboundChannel
  event: WhatsAppOutboundEvent
  plugin: ReturnType<typeof createWhatsAppPlugin>
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
    mimeType: string
    fileName: string
  }>
  cleanupVoiceTempFile: (filePath: string | null) => Promise<void>
}): Promise<string | null> {
  const voiceSettings = resolveWhatsAppVoiceReplySettings({
    channelConfig:
      params.channel.channel_config && typeof params.channel.channel_config === 'object'
        ? params.channel.channel_config
        : null,
  })
  const inboundMessageData =
    voiceSettings.mode === 'auto' || !params.channel.external_channel_id
      ? await params.loadInboundMessageData(params.event.inbound_event_id)
      : null
  const chatId =
    typeof params.channel.external_channel_id === 'string' &&
    params.channel.external_channel_id.trim().length > 0
      ? params.channel.external_channel_id.trim()
      : typeof inboundMessageData?.whatsapp_chat_id === 'string' &&
          inboundMessageData.whatsapp_chat_id.trim().length > 0
        ? inboundMessageData.whatsapp_chat_id.trim()
        : null
  if (!chatId) {
    throw new Error('WhatsApp outbound recipient chat is missing')
  }
  const shouldSendWhatsAppVoiceReply = shouldSendVoiceReply({
    text: params.event.message_text,
    mode: voiceSettings.mode,
    hasVoiceInput: hasWhatsAppVoiceInput(inboundMessageData),
  })

  if (shouldSendWhatsAppVoiceReply && params.plugin.outbound.sendMedia) {
    let tempVoiceFilePath: string | null = null
    try {
      const voiceMedia = await params.prepareVoiceReplyMedia({
        config: params.config,
        text: params.event.message_text,
        voice: voiceSettings.voiceId ?? undefined,
        instructions: voiceSettings.instructions ?? undefined,
        fileBaseName: 'whatsapp-voice-reply',
        tempDirName: 'lucid-whatsapp-voice',
      })
      tempVoiceFilePath = voiceMedia.filePath

      const voiceResult = await params.plugin.outbound.sendMedia({
        to: chatId,
        text: '',
        mediaUrl: voiceMedia.mediaUrl,
        platformOptions: {
          mediaMimeType: voiceMedia.mimeType,
          mediaFileName: voiceMedia.fileName,
        },
      })
      if (!voiceResult.ok && voiceResult.error) {
        throw new Error(`WhatsApp voice send error: ${voiceResult.error}`)
      }
      return voiceResult.messageId ? String(voiceResult.messageId) : null
    } catch (error) {
      console.warn('[outbound] WhatsApp voice reply failed, falling back to text', {
        channelId: params.channel.id,
        outboundId: params.event.id,
        reason: error instanceof Error ? error.message : String(error),
      })
    } finally {
      await params.cleanupVoiceTempFile(tempVoiceFilePath)
    }
  }

  const chunks = params.plugin.outbound.chunker(
    params.event.message_text,
    params.plugin.outbound.textChunkLimit,
  ).filter((chunk) => chunk.trim().length > 0)

  let lastMessageId: string | null = null
  for (const chunk of chunks) {
    const result = await params.plugin.outbound.sendText({
      to: chatId,
      text: chunk,
    })
    if (!result.ok && result.error) {
      throw new Error(`WhatsApp bridge error: ${result.error}`)
    }
    lastMessageId = result.messageId ? String(result.messageId) : lastMessageId
  }
  return lastMessageId
}
