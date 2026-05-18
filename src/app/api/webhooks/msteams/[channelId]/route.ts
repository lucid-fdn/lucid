/**
 * Microsoft Teams Webhook Handler
 *
 * Receives Bot Framework activity callbacks from Teams, validates the
 * request, inserts inbound events into the database, and triggers the worker.
 *
 * URL: POST /api/webhooks/msteams/[channelId]
 *
 * Teams sends activities via HTTP POST. The bot must respond quickly (within
 * ~15 seconds) or Teams will retry. We return 200 immediately after inserting
 * the event and let the worker process it asynchronously.
 *
 * Security:
 *  - JWT validation (Bot Framework token via JWKS)
 *  - Per-channel rate limiting (120 req/min)
 *  - channelId is a hard-to-guess UUID
 */

import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getAssistantChannelForWebhook, insertAssistantInboundEvent } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { publishWakeForChannel } from '@/lib/realtime/broadcast'
import { summarizeTeamsInboundAttachments } from '@/lib/channels/msteams/inbound-attachments'
import { validateBotFrameworkJwt } from '@/lib/channels/msteams/jwt-validator'
import { createRateLimiter } from '@/lib/utils/rate-limiter'

export const dynamic = 'force-dynamic'

// Rate limiter: 120 requests per minute per channel (generous — Teams retries on timeout)
const rateLimiter = createRateLimiter({ maxPerWindow: 120, windowMs: 60_000 })

interface TeamsActivity {
  type: string
  id: string
  timestamp?: string
  serviceUrl?: string
  channelId?: string
  from?: {
    id: string
    name?: string
    aadObjectId?: string
  }
  conversation?: {
    id: string
    conversationType?: string
    tenantId?: string
    isGroup?: boolean
  }
  recipient?: {
    id: string
    name?: string
  }
  text?: string
  textFormat?: string
  entities?: Array<{
    type: string
    mentioned?: { id: string; name?: string }
    text?: string
  }>
  membersAdded?: Array<{ id: string; name?: string }>
  membersRemoved?: Array<{ id: string; name?: string }>
  attachments?: Array<{
    contentType?: string
    contentUrl?: string
    name?: string
  }>
}

/**
 * Strip `<at>BotName</at>` mention tags from the message text.
 * Teams wraps bot mentions in XML tags — the agent should see clean text.
 */
function stripMentionTags(text: string): string {
  let cleaned = text.replace(/<at>[^<]*<\/at>/gi, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  return cleaned
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const { channelId } = await params

    // Rate limiting
    if (!rateLimiter.check(channelId)) {
      return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429 })
    }

    // JWT validation — get app_id from channel config for audience check
    const authHeader = request.headers.get('authorization')
    const teamsAppId = process.env.TEAMS_APP_ID || null
    const jwtResult = await validateBotFrameworkJwt(authHeader, teamsAppId)
    if (!jwtResult.valid) {
      console.warn(`[teams-webhook] JWT validation failed for ${channelId}: ${jwtResult.error}`)
      // Return 401 so Bot Framework knows auth failed (not 200)
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json() as TeamsActivity

    // Handle conversationUpdate — detect bot removal
    if (body.type === 'conversationUpdate') {
      const botId = body.recipient?.id
      if (botId && body.membersRemoved?.some(m => m.id === botId)) {
        console.warn(`[teams-webhook] Bot removed from conversation for channel ${channelId}`)
        try {
          const { supabase } = await import('@/lib/db/client')
          await supabase
            .from('assistant_channels')
            .update({ is_active: false })
            .eq('id', channelId)
        } catch (deactivateErr) {
          ErrorService.captureException(deactivateErr as Error, {
            severity: 'warning',
            context: { endpoint: '/api/webhooks/msteams', operation: 'deactivateChannel', channelId },
            tags: { layer: 'api', route: 'teams-webhook' },
          })
        }
      } else {
        console.log(`[teams-webhook] conversationUpdate for channel ${channelId}`)
      }
      return NextResponse.json({ ok: true })
    }

    // Ignore non-message activities (typing, etc.)
    if (body.type !== 'message') {
      return NextResponse.json({ ok: true })
    }

    // Validate channel exists
    const channel = await getAssistantChannelForWebhook(channelId, 'msteams')

    if (!channel) {
      console.warn(`[teams-webhook] Unknown channel: ${channelId}`)
      return NextResponse.json({ ok: true })
    }

    // Extract message text, stripping bot mention tags
    const rawText = body.text || ''
    const cleanText = stripMentionTags(rawText)
    const attachmentSummary = summarizeTeamsInboundAttachments(body.attachments)
    const messageText = [cleanText, ...attachmentSummary.notes].filter((part) => part.trim().length > 0).join('\n\n')

    if (!messageText) {
      return NextResponse.json({ ok: true })
    }

    const fromId = body.from?.id || 'unknown'
    const conversationId = body.conversation?.id || ''
    const activityId = body.id

    // Persist serviceUrl in channel_config for outbound delivery
    if (body.serviceUrl) {
      persistServiceUrl(channelId, body.serviceUrl)
    }

    // Dedup via (external_chat_id, external_message_id) — activity.id is unique per message
    try {
      await insertAssistantInboundEvent({
        channel_id: channelId,
        assistant_id: channel.assistant_id,
        external_message_id: activityId,
        external_user_id: fromId,
        external_chat_id: conversationId,
        message_text: messageText,
        message_data: {
          from: body.from,
          conversation: body.conversation,
          serviceUrl: body.serviceUrl,
          timestamp: body.timestamp,
          teams_audio_input: attachmentSummary.hasAudio,
          teams_attachments: attachmentSummary.attachments,
        },
      })
    } catch (insertError) {
      ErrorService.captureException(insertError as Error, {
        severity: 'error',
        context: { endpoint: '/api/webhooks/msteams', operation: 'insertInboundEvent', channelId },
        tags: { layer: 'api', route: 'teams-webhook' },
      })
      return NextResponse.json({ ok: true })
    }

    // Trigger worker (fire-and-forget)
    triggerWorker()
    void publishWakeForChannel(channelId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/webhooks/msteams', method: 'POST' },
      tags: { layer: 'api', route: 'teams-webhook' },
    })
    // Return 200 to prevent Teams from retrying
    return NextResponse.json({ ok: true })
  }
}

/**
 * Persist the latest serviceUrl from Teams into channel_config JSONB.
 * This is fire-and-forget — failure is non-fatal.
 */
function persistServiceUrl(channelId: string, serviceUrl: string): void {
  import('@/lib/db/client')
    .then(({ supabase }) =>
      supabase.rpc('jsonb_set_channel_config', {
        p_channel_id: channelId,
        p_key: 'teams_service_url',
        p_value: JSON.stringify(serviceUrl),
      }),
    )
    .catch((err) => {
      console.warn('[teams-webhook] Failed to persist serviceUrl:', err instanceof Error ? err.message : err)
    })
}

function triggerWorker(): void {
  const workerUrl = process.env.WORKER_URL
  const workerSecret = process.env.WORKER_TRIGGER_SECRET

  if (!workerUrl) return

  fetch(`${workerUrl}/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(workerSecret && { Authorization: `Bearer ${workerSecret}` }),
    },
    body: JSON.stringify({ event_type: 'inbound' }),
  }).catch((err) => {
    ErrorService.captureException(err as Error, {
      severity: 'warning',
      context: { endpoint: '/api/webhooks/msteams', operation: 'triggerWorker' },
      tags: { layer: 'api', route: 'teams-webhook' },
    })
  })
}

// Teams may send GET to verify the webhook endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'msteams-webhook' })
}
