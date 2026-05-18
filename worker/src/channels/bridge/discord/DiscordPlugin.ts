/**
 * Discord OpenClaw Plugin - implements OpenClawChannelPluginBridgeContract
 * using OpenClaw's native sendMessageDiscord/editMessageDiscord.
 *
 * Passes bot_token explicitly via opts.token so OpenClaw bypasses its
 * global YAML config (resolveToken returns explicit token first).
 * This gives us @discordjs/rest, retry, mention rewriting, embed support,
 * forum/media channel handling - all maintained by OpenClaw upstream.
 */

import type { OpenClawChannelPluginBridgeContract } from '../OpenClawBridgeContract.js'
import { editMessageDiscord, sendMessageDiscord, sendVoiceMessageDiscord } from '../openclaw-channel-shim.js'
import { chunkDiscordText } from './chunk.js'

const DISCORD_MESSAGE_LIMIT = 2000
const DISCORD_DEFAULT_MAX_LINES = 17

export interface DiscordPluginOptions {
  maxLinesPerMessage?: number
  chunkMode?: 'length' | 'newline'
}

/**
 * Discord-native chunker for outbound messages.
 * Splits by both character count and soft line count while keeping
 * fenced code blocks balanced across chunks.
 */
function discordChunker(
  text: string,
  limit: number,
  maxLinesPerMessage: number,
  chunkMode: 'length' | 'newline',
): string[] {
  return chunkDiscordText(text, {
    maxChars: limit,
    maxLines: maxLinesPerMessage,
    chunkMode,
  })
}

/**
 * Create a Discord plugin backed by OpenClaw's native send functions.
 *
 * @param secrets - Decrypted channel secrets (must include bot_token)
 */
export function createDiscordPlugin(
  secrets: Record<string, string>,
  options: DiscordPluginOptions = {},
): OpenClawChannelPluginBridgeContract {
  const { bot_token } = secrets
  const maxLinesPerMessage =
    typeof options.maxLinesPerMessage === 'number' &&
    Number.isFinite(options.maxLinesPerMessage) &&
    options.maxLinesPerMessage >= 4
      ? Math.floor(options.maxLinesPerMessage)
      : DISCORD_DEFAULT_MAX_LINES
  const chunkMode = options.chunkMode === 'newline' ? 'newline' : 'length'

  if (!bot_token) {
    throw new Error('[discord-plugin] bot_token is required')
  }

  return {
    id: 'discord',
    outbound: {
      // We expose Discord as streamed/plain to let the shared ChannelAdapter
      // drive preview → edit → finalize UX. The content itself still remains
      // regular Discord markdown/plain text — "plain" here is only the adapter
      // policy that allows incremental edits.
      deliveryMode: 'streamed',
      chunker: (text, limit) => discordChunker(text, limit, maxLinesPerMessage, chunkMode),
      chunkerMode: 'plain',
      textChunkLimit: DISCORD_MESSAGE_LIMIT,

      sendText: async (params) => {
        try {
          const result = await sendMessageDiscord(params.to, params.text, {
            token: bot_token,
            ...(params.replyToId ? { replyTo: params.replyToId } : {}),
          })
          return {
            channel: 'discord',
            messageId: result.messageId,
            chatId: result.channelId,
            ok: true,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown Discord error'
          return { channel: 'discord', ok: false, error: msg }
        }
      },

      sendMedia: async (params) => {
        try {
          const asVoice = params.platformOptions?.audioAsVoice === true
          const result = asVoice
            ? await sendVoiceMessageDiscord(params.to, params.mediaUrl, {
                token: bot_token,
                ...(params.replyToId ? { replyTo: params.replyToId } : {}),
                ...(params.platformOptions?.mediaLocalRoots
                  ? { mediaLocalRoots: params.platformOptions.mediaLocalRoots }
                  : {}),
              })
            : await sendMessageDiscord(params.to, params.text, {
                token: bot_token,
                mediaUrl: params.mediaUrl,
                ...(params.replyToId ? { replyTo: params.replyToId } : {}),
                ...(params.platformOptions?.mediaLocalRoots
                  ? { mediaLocalRoots: params.platformOptions.mediaLocalRoots }
                  : {}),
              })
          return {
            channel: 'discord',
            messageId: result.messageId,
            chatId: result.channelId,
            ok: true,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown Discord error'
          return { channel: 'discord', ok: false, error: msg }
        }
      },

      editText: async (params) => {
        try {
          const result = await editMessageDiscord(
            params.to,
            params.messageId,
            { content: params.text },
            { token: bot_token },
          )
          return {
            channel: 'discord',
            messageId: result.id || params.messageId,
            chatId: params.to,
            ok: true,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown Discord error'
          return { channel: 'discord', ok: false, error: msg }
        }
      },
    },
  }
}
