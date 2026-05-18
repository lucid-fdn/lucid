import 'server-only'

import { splitTelegramMessage } from '@/lib/telegram/chunking'
import { classifyTelegramError } from '../shared/errors'
import { loadOpenClawRuntime } from '../shared/runtime'
import type { ShimDeliveryResult } from '../shared/types'

/**
 * Managed Telegram shim — wraps `sendMessageTelegram` from
 * `@lucid/openclaw-runtime` with Lucid's outbound-delivery parameter shape.
 *
 * Mirrors the Discord shim. Permanent failures (revoked token, bot blocked,
 * chat gone) are re-thrown as `PermanentChannelError` via
 * `classifyTelegramError`; transient failures bubble up.
 *
 * OpenClaw's `sendMessageTelegram` sends exactly one message per call, so we
 * preserve Lucid's existing chunking + reply-threading semantics
 * (`splitTelegramMessage`): reply to the parent on the first chunk, thread
 * subsequent chunks under the first one without re-quoting. This keeps
 * behaviour byte-equivalent with the legacy REST sender so the feature flag
 * is a clean swap.
 */

export async function sendTelegramViaShim(
  secrets: Record<string, string>,
  chatId: string,
  text: string,
  replyToId: string | null,
): Promise<ShimDeliveryResult> {
  const token = secrets.bot_token
  if (!token) {
    throw new Error('Telegram bot token not configured')
  }

  const chunks = splitTelegramMessage(text)
  if (chunks.length === 0) {
    return { delivered: true, externalMessageId: null }
  }

  const runtime = await loadOpenClawRuntime()

  let firstMessageId: string | null = null
  try {
    for (let i = 0; i < chunks.length; i++) {
      const opts: Record<string, unknown> = {
        token,
        textMode: 'markdown',
      }
      if (i === 0 && replyToId) {
        const parsed = Number(replyToId)
        if (Number.isFinite(parsed)) {
          opts.replyToMessageId = parsed
        }
      }

      const result = await runtime.sendMessageTelegram(chatId, chunks[i]!, opts)
      if (i === 0 && result.messageId && result.messageId !== 'unknown') {
        firstMessageId = result.messageId
      }
    }
  } catch (err) {
    const permanent = classifyTelegramError(err)
    if (permanent) throw permanent
    throw err
  }

  return { delivered: true, externalMessageId: firstMessageId }
}
