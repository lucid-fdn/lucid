import 'server-only'

import { classifyTeamsError } from '../shared/errors'
import { loadOpenClawRuntime } from '../shared/runtime'
import type { ShimDeliveryResult } from '../shared/types'

/**
 * Managed Teams shim — wraps `sendMessageMSTeams` from
 * `@lucid/openclaw-runtime` with Lucid's outbound-delivery parameter shape.
 *
 * Mirrors the Slack/Discord shim pattern. Permanent failures (revoked
 * credentials, bot not in roster, conversation gone) are re-thrown as
 * `PermanentChannelError` via `classifyTeamsError`; transient failures
 * bubble up for retry.
 */

export async function sendTeamsViaShim(
  secrets: Record<string, string>,
  conversationId: string,
  text: string,
  replyToActivityId: string | null,
  channelConfig?: Record<string, unknown> | null,
): Promise<ShimDeliveryResult> {
  const appId = secrets.app_id
  const appPassword = secrets.app_password
  if (!appId || !appPassword) {
    throw new Error('Teams app credentials not configured (app_id + app_password required)')
  }

  const runtime = await loadOpenClawRuntime()

  try {
    // sendMessageMSTeams is not yet exported from @lucid/openclaw-runtime.
    // This shim is behind FEATURE_OPENCLAW_CHANNELS_TEAMS_MANAGED (default off).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendFn = (runtime as any).sendMessageMSTeams as ((
      conversationId: string,
      text: string,
      opts: Record<string, unknown>,
    ) => Promise<{ messageId?: string }>) | undefined
    if (!sendFn) {
      throw new Error('sendMessageMSTeams is not available in the current openclaw-runtime version')
    }
    const serviceUrl = secrets.service_url
      || (channelConfig?.teams_service_url as string | undefined)
      || undefined
    const result = await sendFn(conversationId, text, {
      appId,
      appPassword,
      tenantId: secrets.tenant_id || 'common',
      replyToActivityId: replyToActivityId ?? undefined,
      ...(serviceUrl && { serviceUrl }),
    })
    return {
      delivered: true,
      externalMessageId: result.messageId && result.messageId !== 'unknown'
        ? result.messageId
        : null,
    }
  } catch (err) {
    const permanent = classifyTeamsError(err)
    if (permanent) throw permanent
    throw err
  }
}
