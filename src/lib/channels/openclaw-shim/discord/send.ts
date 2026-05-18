import 'server-only'

import { classifyDiscordError } from '../shared/errors'
import { loadOpenClawRuntime } from '../shared/runtime'
import type { ShimDeliveryResult } from '../shared/types'

/**
 * Managed Discord shim — wraps `sendMessageDiscord` from
 * `@lucid/openclaw-runtime` with Lucid's outbound-delivery parameter shape.
 *
 * Runtime is loaded lazily via `loadOpenClawRuntime()` (see shared/runtime.ts
 * for the rationale). The shim threads the bot token through `opts.token`
 * per call, so no account lookup or YAML load is needed.
 *
 * Errors thrown by OpenClaw are filtered through `classifyDiscordError` —
 * permanent failures (revoked tokens, missing perms, 404s) are re-thrown as
 * `PermanentChannelError` so the outbound-delivery retry layer knows not to
 * retry. Transient failures bubble up unchanged.
 */

export async function sendDiscordViaShim(
  secrets: Record<string, string>,
  channelId: string,
  text: string,
  replyToId: string | null,
): Promise<ShimDeliveryResult> {
  const token = secrets.bot_token
  if (!token) {
    throw new Error('Discord bot token not configured')
  }

  const runtime = await loadOpenClawRuntime()

  try {
    const result = await runtime.sendMessageDiscord(channelId, text, {
      token,
      replyTo: replyToId ?? undefined,
    })
    return {
      delivered: true,
      externalMessageId: result.messageId && result.messageId !== 'unknown'
        ? result.messageId
        : null,
    }
  } catch (err) {
    const permanent = classifyDiscordError(err)
    if (permanent) throw permanent
    throw err
  }
}
