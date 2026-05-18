import 'server-only'

import type { ManagedDeliveryIdentity } from '@/lib/channels/contracts/types'
import { classifySlackError } from '../shared/errors'
import { loadOpenClawRuntime } from '../shared/runtime'
import type { ShimDeliveryResult } from '../shared/types'

/**
 * Managed Slack shim — wraps `sendMessageSlack` from
 * `@lucid/openclaw-runtime` with Lucid's outbound-delivery parameter shape.
 *
 * Mirrors the Discord/Telegram shim pattern. Permanent failures (revoked
 * token, invalid auth, channel not found) are re-thrown as
 * `PermanentChannelError` via `classifySlackError`; transient failures
 * bubble up for retry.
 *
 * OpenClaw's `sendMessageSlack` handles chunking, threading, mrkdwn
 * conversion, file upload, Block Kit, and custom identity — we get all of
 * that for free by wrapping it.
 */

export async function sendSlackViaShim(
  secrets: Record<string, string>,
  channelId: string,
  text: string,
  replyToId: string | null,
  identity?: ManagedDeliveryIdentity,
): Promise<ShimDeliveryResult> {
  const token = secrets.bot_token
  if (!token) {
    throw new Error('Slack bot token not configured')
  }

  const runtime = await loadOpenClawRuntime()

  try {
    const result = await runtime.sendMessageSlack(channelId, text, {
      token,
      threadTs: replyToId ?? undefined,
      ...(identity ? { identity } : {}),
    })
    return {
      delivered: true,
      externalMessageId: result.messageId && result.messageId !== 'unknown'
        ? result.messageId
        : null,
    }
  } catch (err) {
    const permanent = classifySlackError(err)
    if (permanent) throw permanent
    throw err
  }
}
