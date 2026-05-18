/**
 * Microsoft Teams Hosted Webhook Handler
 *
 * Receives Bot Framework activities for the Lucid-owned Teams app and resolves
 * an active hosted channel by conversation id. Unbound conversations stay
 * unbound until a user runs the explicit hosted `bind` command.
 */

import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { insertAssistantInboundEvent } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { getChannelSurfaceDefaultBinding } from '@/lib/db/channel-routing'
import { ErrorService } from '@/lib/errors/error-service'
import { publishWakeForChannel } from '@/lib/realtime/broadcast'
import { validateBotFrameworkJwt } from '@/lib/channels/msteams/jwt-validator'
import { summarizeTeamsInboundAttachments } from '@/lib/channels/msteams/inbound-attachments'
import { sendTeamsText } from '@/lib/channels/msteams/send'
import { resolveHostedTeamsInbound } from '@/lib/channels/msteams/hosted-commands'
import { createRateLimiter } from '@/lib/utils/rate-limiter'

export const dynamic = 'force-dynamic'

const rateLimiter = createRateLimiter({ maxPerWindow: 120, windowMs: 60_000 })

interface TeamsActivity {
  type: string
  id: string
  timestamp?: string
  serviceUrl?: string
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
  attachments?: Array<{
    contentType?: string
    contentUrl?: string
    name?: string
  }>
  membersRemoved?: Array<{ id: string; name?: string }>
}

interface HostedTeamsChannelRow {
  id: string
  assistant_id: string
  channel_config: Record<string, unknown> | null
}

function stripMentionTags(text: string): string {
  let cleaned = text.replace(/<at>[^<]*<\/at>/gi, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  return cleaned
}

async function findActiveHostedChannel(conversationId: string): Promise<HostedTeamsChannelRow | null> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, channel_config')
    .eq('channel_type', 'msteams')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', conversationId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as HostedTeamsChannelRow | null) || null
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
      context: { endpoint: '/api/webhooks/msteams/hosted', operation: 'triggerWorker' },
      tags: { layer: 'api', route: 'teams-hosted-webhook' },
    })
  })
}

function getHostedTeamsReplyCredentials(activity: TeamsActivity): {
  appId: string
  appPassword: string
  tenantId: string
  serviceUrl: string
} | null {
  const appId = process.env.MSTEAMS_HOSTED_APP_ID || process.env.TEAMS_APP_ID
  const appPassword = process.env.MSTEAMS_HOSTED_APP_PASSWORD
  const tenantId = activity.conversation?.tenantId || process.env.MSTEAMS_HOSTED_TENANT_ID || 'common'
  const serviceUrl = activity.serviceUrl || 'https://smba.trafficmanager.net/teams'

  if (!appId || !appPassword) {
    return null
  }

  return { appId, appPassword, tenantId, serviceUrl }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const teamsAppId = process.env.TEAMS_APP_ID || process.env.MSTEAMS_HOSTED_APP_ID || null
    const jwtResult = await validateBotFrameworkJwt(authHeader, teamsAppId)
    if (!jwtResult.valid) {
      console.warn(`[teams-hosted] JWT validation failed: ${jwtResult.error}`)
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as TeamsActivity
    const conversationId = body.conversation?.id || 'unknown'

    if (!rateLimiter.check(`hosted:${conversationId}`)) {
      return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429 })
    }

    if (body.type === 'conversationUpdate') {
      const botId = body.recipient?.id
      if (botId && body.membersRemoved?.some((member) => member.id === botId)) {
        await supabase
          .from('assistant_channels')
          .update({ is_active: false })
          .eq('channel_type', 'msteams')
          .eq('connection_mode', 'hosted')
          .eq('external_channel_id', conversationId)
      }
      return NextResponse.json({ ok: true })
    }

    if (body.type !== 'message') {
      return NextResponse.json({ ok: true })
    }

    const rawText = body.text || ''
    const cleanText = stripMentionTags(rawText)
    const attachmentSummary = summarizeTeamsInboundAttachments(body.attachments)
    const messageText = [cleanText, ...attachmentSummary.notes].filter((part) => part.trim().length > 0).join('\n\n')
    if (!messageText) {
      return NextResponse.json({ ok: true })
    }

    let channel = await findActiveHostedChannel(conversationId)
    if (channel && body.serviceUrl) {
      const nextConfig = {
        ...(channel.channel_config || {}),
        teams_service_url: body.serviceUrl,
      }
      await supabase
        .from('assistant_channels')
        .update({ channel_config: nextConfig })
        .eq('id', channel.id)
      channel = {
        ...channel,
        channel_config: nextConfig,
      }
    }

    let resolution: { kind: 'handled' } | { kind: 'route'; channelId: string; assistantId: string }
    if (cleanText) {
      const replyCredentials = getHostedTeamsReplyCredentials(body)
      resolution = await resolveHostedTeamsInbound({
        conversationId,
        tenantId: body.conversation?.tenantId || null,
        text: cleanText,
        serviceUrl: body.serviceUrl,
        resolveSurfaceDefault: body.conversation?.tenantId
          ? async () => {
              const surfaceDefault = await getChannelSurfaceDefaultBinding({
                channelType: 'msteams',
                surfaceOwnerKind: 'tenant',
                surfaceOwnerId: body.conversation?.tenantId || '',
              })
              if (!surfaceDefault?.channel) return null
              return {
                channelId: surfaceDefault.channel.id,
                assistantId: surfaceDefault.assistantId,
              }
            }
          : undefined,
        sendText: async (text) => {
          if (!replyCredentials) {
            throw new Error('Hosted Teams app credentials are not configured')
          }

          await sendTeamsText({
            appId: replyCredentials.appId,
            appPassword: replyCredentials.appPassword,
            tenantId: replyCredentials.tenantId,
            serviceUrl: replyCredentials.serviceUrl,
            conversationId,
            text,
          })
        },
      })

      if (resolution.kind === 'handled') {
        return NextResponse.json({ ok: true })
      }
    } else {
      if (!channel) {
        console.warn(
          `[teams-hosted] Dropping inbound ${body.id}: no active hosted channel for conversation ${conversationId}`,
        )
        return NextResponse.json({ ok: true })
      }
      resolution = { kind: 'route', channelId: channel.id, assistantId: channel.assistant_id }
    }

    await insertAssistantInboundEvent({
      channel_id: resolution.channelId,
      assistant_id: resolution.assistantId,
      external_message_id: body.id,
      external_user_id: body.from?.id || 'unknown',
      external_chat_id: conversationId,
      message_text: messageText,
      message_data: {
        from: body.from,
        conversation: body.conversation,
        teams_conversation_id: conversationId,
        teams_tenant_id: body.conversation?.tenantId || null,
        serviceUrl: body.serviceUrl,
        timestamp: body.timestamp,
        teams_audio_input: attachmentSummary.hasAudio,
        teams_attachments: attachmentSummary.attachments,
      },
    })

    triggerWorker()
    void publishWakeForChannel(resolution.channelId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/webhooks/msteams/hosted', method: 'POST' },
      tags: { layer: 'api', route: 'teams-hosted-webhook' },
    })
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'msteams-hosted-webhook' })
}
