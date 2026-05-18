/**
 * Telegram OpenClaw Plugin — implements OpenClawChannelPluginBridgeContract
 * using OpenClaw's native sendMessageTelegram/editMessageTelegram.
 *
 * Passes bot_token explicitly via opts.token so OpenClaw bypasses its
 * global YAML config (resolveToken returns explicit token first).
 * This gives us grammy, retry, HTML rendering, chat ID resolution,
 * thread/forum handling — all maintained by OpenClaw upstream.
 */

import type { OpenClawChannelPluginBridgeContract } from '../OpenClawBridgeContract.js'
import {
  sendMessageTelegram,
  editMessageTelegram,
  reactMessageTelegram,
  sendStickerTelegram,
} from '../openclaw-channel-shim.js'

const TELEGRAM_MESSAGE_LIMIT = 4096

/**
 * Plain-text chunker for Telegram messages.
 *
 * IMPORTANT: chunkerMode MUST be 'plain' (not 'markdown') because the
 * OpenClawChannelAdapter.canStream getter rejects markdown mode to avoid
 * broken partial markdown during streaming edits. Using 'plain' here
 * preserves the live-typing UX (placeholder → edits → finalize).
 */
function telegramChunker(text: string, limit: number): string[] {
  if (text.length <= limit) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining)
      break
    }

    let splitAt = remaining.lastIndexOf('\n\n', limit)
    if (splitAt <= 0) splitAt = remaining.lastIndexOf('\n', limit)
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(' ', limit)
    if (splitAt <= 0) splitAt = limit

    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }

  return chunks
}

/**
 * Create a Telegram plugin backed by OpenClaw's native send functions.
 *
 * @param secrets - Decrypted channel secrets (must include bot_token)
 */
export function createTelegramPlugin(
  secrets: Record<string, string>,
): OpenClawChannelPluginBridgeContract & {
  outbound: OpenClawChannelPluginBridgeContract['outbound'] & {
    sendMedia: (params: {
      to: string
      text: string
      mediaUrl: string
      replyToId?: string
      platformOptions?: Record<string, unknown>
    }) => Promise<{ channel: string; messageId?: string; chatId?: string; ok: boolean; error?: string }>
  }
  reactMessage: (params: {
    to: string
    messageId: string
    emoji: string
  }) => Promise<{ channel: string; ok: boolean; warning?: string; error?: string }>
  sendSticker: (params: {
    to: string
    fileId: string
    replyToId?: string
  }) => Promise<{ channel: string; messageId?: string; chatId?: string; ok: boolean; error?: string }>
} {
  const { bot_token } = secrets

  if (!bot_token) {
    throw new Error('[telegram-plugin] bot_token is required')
  }

  const mergePlatformOptions = (platformOptions?: Record<string, unknown>): Record<string, unknown> => ({
    textMode: 'plain',
    ...(platformOptions || {}),
  })

  return {
    id: 'telegram',
    outbound: {
      deliveryMode: 'streamed',
      chunker: telegramChunker,
      chunkerMode: 'plain',
      textChunkLimit: TELEGRAM_MESSAGE_LIMIT,

      sendText: async (params) => {
        try {
          const result = await sendMessageTelegram(params.to, params.text, {
            token: bot_token,
            ...(params.replyToId && { replyToMessageId: parseInt(params.replyToId, 10) }),
            ...mergePlatformOptions(params.platformOptions),
          })
          console.log('[telegram-plugin] sendText ok', {
            chatId: result.chatId ?? params.to,
            messageId: result.messageId ?? null,
          })
          return {
            channel: 'telegram',
            messageId: result.messageId,
            chatId: result.chatId,
            ok: true,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown Telegram error'
          console.warn('[telegram-plugin] sendText failed', {
            chatId: params.to,
            error: msg,
          })
          return { channel: 'telegram', ok: false, error: msg }
        }
      },

      sendMedia: async (params) => {
        try {
          const platformOptions = mergePlatformOptions(params.platformOptions)
          if (platformOptions['audioAsVoice'] === true) {
            delete platformOptions['audioAsVoice']
            platformOptions['asVoice'] = true
          }
          const result = await sendMessageTelegram(params.to, params.text, {
            token: bot_token,
            mediaUrl: params.mediaUrl,
            ...(params.replyToId && { replyToMessageId: parseInt(params.replyToId, 10) }),
            ...platformOptions,
          })
          console.log('[telegram-plugin] sendMedia ok', {
            chatId: result.chatId ?? params.to,
            messageId: result.messageId ?? null,
          })
          return {
            channel: 'telegram',
            messageId: result.messageId,
            chatId: result.chatId,
            ok: true,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown Telegram error'
          console.warn('[telegram-plugin] sendMedia failed', {
            chatId: params.to,
            error: msg,
          })
          return { channel: 'telegram', ok: false, error: msg }
        }
      },

      editText: async (params) => {
        try {
          const result = await editMessageTelegram(params.to, params.messageId, params.text, {
            token: bot_token,
            ...mergePlatformOptions(params.platformOptions),
          })
          console.log('[telegram-plugin] editText ok', {
            chatId: result.chatId ?? params.to,
            messageId: result.messageId ?? params.messageId,
          })
          return {
            channel: 'telegram',
            messageId: result.messageId,
            chatId: result.chatId,
            ok: true,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown Telegram error'
          console.warn('[telegram-plugin] editText failed', {
            chatId: params.to,
            messageId: params.messageId,
            error: msg,
          })
          return { channel: 'telegram', ok: false, error: msg }
        }
      },
    },
    reactMessage: async (params) => {
      try {
        const result = await reactMessageTelegram(params.to, params.messageId, params.emoji, {
          token: bot_token,
        })
        if (result.ok === false) {
          return { channel: 'telegram', ok: false, warning: result.warning }
        }
        return { channel: 'telegram', ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown Telegram error'
        return { channel: 'telegram', ok: false, error: msg }
      }
    },
    sendSticker: async (params) => {
      try {
        const result = await sendStickerTelegram(params.to, params.fileId, {
          token: bot_token,
          ...(params.replyToId && { replyToMessageId: parseInt(params.replyToId, 10) }),
        })
        return {
          channel: 'telegram',
          messageId: result.messageId,
          chatId: result.chatId,
          ok: true,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown Telegram error'
        return { channel: 'telegram', ok: false, error: msg }
      }
    },
  }
}
