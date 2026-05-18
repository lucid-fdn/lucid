import {
  resolveDiscordVoiceReplySettings,
  type VoiceReplySettings,
} from '../media/voice-reply-policy.js'

export type DiscordReplyToMode = 'off' | 'first' | 'all'
export type DiscordChunkMode = 'length' | 'newline'
export type DiscordStreamingMode = 'off' | 'partial' | 'block' | 'progress'

export interface DiscordDeliveryConfig {
  replyToMode: DiscordReplyToMode
  maxLinesPerMessage: number
  chunkMode: DiscordChunkMode
  streamingPreview: boolean
  streamingMode: DiscordStreamingMode
  typingReaction: string | null
  voice: VoiceReplySettings
}

export function resolveDiscordDeliveryConfig(
  channelConfig: Record<string, unknown> | null | undefined,
): DiscordDeliveryConfig {
  const replyToMode = (() => {
    const configuredMode = channelConfig?.discord_reply_to_mode
    return configuredMode === 'off' || configuredMode === 'all' || configuredMode === 'first'
      ? configuredMode
      : 'first'
  })()

  const maxLinesPerMessage = (() => {
    const raw = channelConfig?.discord_max_lines_per_message
    const parsed =
      typeof raw === 'number' ? raw : Number.parseInt(typeof raw === 'string' ? raw : '', 10)
    return Number.isFinite(parsed) && parsed >= 4 && parsed <= 40 ? parsed : 17
  })()

  const chunkMode: DiscordChunkMode =
    channelConfig?.discord_chunk_mode === 'newline' ? 'newline' : 'length'
  const streamingPreview = channelConfig?.discord_streaming_preview !== false
  const streamingMode: DiscordStreamingMode =
    channelConfig?.discord_streaming_mode === 'off' ||
    channelConfig?.discord_streaming_mode === 'block' ||
    channelConfig?.discord_streaming_mode === 'progress'
      ? channelConfig.discord_streaming_mode
      : streamingPreview
        ? 'partial'
        : 'off'
  const typingReaction = (() => {
    if (!channelConfig || typeof channelConfig !== 'object') {
      return 'hourglass_flowing_sand'
    }
    if (!Object.prototype.hasOwnProperty.call(channelConfig, 'discord_typing_reaction')) {
      return 'hourglass_flowing_sand'
    }
    const raw = channelConfig.discord_typing_reaction
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
  })()

  return {
    replyToMode,
    maxLinesPerMessage,
    chunkMode,
    streamingPreview,
    streamingMode,
    typingReaction,
    voice: resolveDiscordVoiceReplySettings({ channelConfig }),
  }
}
