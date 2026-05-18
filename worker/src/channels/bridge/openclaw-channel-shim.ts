/**
 * OpenClaw Channel Shim — runtime-safe bridge over @lucid/openclaw-runtime.
 *
 * The installed runtime package can legitimately lag on optional channel exports
 * during deploy rollouts. Importing named exports directly would crash module
 * instantiation for the whole worker. A namespace import keeps startup resilient
 * and lets us provide narrow fallbacks for optional operations.
 */
import * as OpenClawRuntime from '@lucid/openclaw-runtime'

// Types (kept for channel plugin consumers)
export type {
  TelegramSendResult,
  TelegramEditResult,
  TelegramReactionResult,
  DiscordSendResult,
  DiscordAPIMessage,
  IMessageSendResult,
} from '@lucid/openclaw-runtime'

type TelegramSendResult = Awaited<ReturnType<typeof OpenClawRuntime.sendMessageTelegram>>
type DiscordSendResult = Awaited<ReturnType<typeof OpenClawRuntime.sendMessageDiscord>>

export const sendMessageTelegram = OpenClawRuntime.sendMessageTelegram
export const editMessageTelegram = OpenClawRuntime.editMessageTelegram
export const sendMessageDiscord = OpenClawRuntime.sendMessageDiscord
export const sendMessageIMessage = OpenClawRuntime.sendMessageIMessage
export const editMessageDiscord = OpenClawRuntime.editMessageDiscord
export const setRuntimeConfigSnapshot = OpenClawRuntime.setRuntimeConfigSnapshot

export async function reactMessageTelegram(
  chatId: string | number,
  messageId: string | number,
  emoji: string,
  opts?: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; warning: string }> {
  if (typeof OpenClawRuntime.reactMessageTelegram === 'function') {
    return OpenClawRuntime.reactMessageTelegram(chatId, messageId, emoji, opts)
  }
  return { ok: false, warning: 'telegram reactions are unavailable in this runtime build' }
}

export async function sendStickerTelegram(
  to: string,
  fileId: string,
  opts?: Record<string, unknown>,
): Promise<TelegramSendResult> {
  if (typeof OpenClawRuntime.sendStickerTelegram === 'function') {
    return OpenClawRuntime.sendStickerTelegram(to, fileId, opts)
  }
  throw new Error('telegram stickers are unavailable in this runtime build')
}

export async function sendVoiceMessageDiscord(
  to: string,
  audioPath: string,
  opts?: Record<string, unknown>,
): Promise<DiscordSendResult> {
  if (typeof OpenClawRuntime.sendVoiceMessageDiscord === 'function') {
    return OpenClawRuntime.sendVoiceMessageDiscord(to, audioPath, opts)
  }
  return OpenClawRuntime.sendMessageDiscord(to, audioPath, opts)
}
