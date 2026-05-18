import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { insertAssistantInboundEvent } from '@/lib/db'
import { getChannelSurfaceDefaultBinding } from '@/lib/db/channel-routing'
import { verifyChannelProviderSurfaceToken } from '@/lib/db/channel-provider'
import { resolveHostedIMessageInbound } from '@/lib/imessage/hosted-commands'
import { ErrorService } from '@/lib/errors/error-service'
import { publishWakeForChannel } from '@/lib/realtime/broadcast'
import { verifyInternalAuth } from '@/lib/trading/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const payloadSchema = z.object({
  surfaceId: z.string().uuid(),
  surfaceToken: z.string().min(1),
  message: z.object({
    messageId: z.string().min(1),
    chatId: z.string().min(1),
    chatGuid: z.string().optional().nullable(),
    chatIdentifier: z.string().optional().nullable(),
    senderId: z.string().min(1),
    senderName: z.string().optional().nullable(),
    text: z.string().optional().nullable(),
    timestamp: z.union([z.string(), z.number()]).optional().nullable(),
    service: z.string().optional().nullable(),
    replyToId: z.string().optional().nullable(),
    attachments: z.array(
      z.object({
        kind: z.string().optional(),
        url: z.string().optional(),
        mimeType: z.string().optional(),
        fileName: z.string().optional(),
      }),
    ).optional().nullable(),
  }),
})

function normalizeTarget(message: z.infer<typeof payloadSchema>['message']): string {
  if (message.chatId.trim().length > 0) return message.chatId.trim()
  if (message.chatGuid?.trim()) return `chat_guid:${message.chatGuid.trim()}`
  if (message.chatIdentifier?.trim()) return `chat_identifier:${message.chatIdentifier.trim()}`
  return message.senderId.trim()
}

function buildMessageText(message: z.infer<typeof payloadSchema>['message']): string {
  const text = message.text?.trim() || ''
  if (text) return text
  const attachments = Array.isArray(message.attachments) ? message.attachments : []
  if (attachments.length === 0) return ''
  const labels = attachments
    .map((attachment) => attachment.kind?.trim().toLowerCase() || 'attachment')
    .slice(0, 4)
  return labels.length > 0 ? `<media:${labels.join(',')}>` : '<media:attachment>'
}

async function triggerWorker(payload?: { eventId?: string | null; assistantId?: string | null }) {
  const workerUrl = process.env.WORKER_URL
  const workerSecret = process.env.WORKER_TRIGGER_SECRET
  if (!workerUrl) return

  void fetch(`${workerUrl}/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(workerSecret ? { Authorization: `Bearer ${workerSecret}` } : {}),
    },
    body: JSON.stringify({
      event_type: 'inbound',
      event_id: payload?.eventId ?? undefined,
      assistant_id: payload?.assistantId ?? undefined,
    }),
  }).catch(() => {})
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyInternalAuth(request)
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error || 'Authentication failed' }, { status: 401 })
    }

    const parsed = payloadSchema.safeParse(auth.body ? JSON.parse(auth.body) : null)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 },
      )
    }

    const surface = await verifyChannelProviderSurfaceToken({
      channelType: 'imessage',
      surfaceId: parsed.data.surfaceId,
      token: parsed.data.surfaceToken,
    })
    if (!surface) {
      return NextResponse.json({ error: 'Invalid hosted iMessage surface token' }, { status: 401 })
    }

    const chatId = normalizeTarget(parsed.data.message)
    let immediateReply: string | null = null

    const resolution = await resolveHostedIMessageInbound({
      chatId,
      text: parsed.data.message.text?.trim() || '',
      hostedSurfaceId: surface.id,
      resolveSurfaceDefault: async () => {
        const surfaceDefault = await getChannelSurfaceDefaultBinding({
          channelType: 'imessage',
          surfaceOwnerKind: 'imessage_surface',
          surfaceOwnerId: surface.id,
        })
        if (!surfaceDefault?.channel || surfaceDefault.channel.connection_mode !== 'hosted') {
          return null
        }
        return {
          channelId: surfaceDefault.channel.id,
          assistantId: surfaceDefault.assistantId,
        }
      },
      sendText: async (text) => {
        immediateReply = text
      },
    })

    if (resolution.kind === 'handled') {
      return NextResponse.json({ ok: true, action: immediateReply ? 'reply' : 'noop', text: immediateReply })
    }

    const messageText = buildMessageText(parsed.data.message)
    if (!messageText) {
      return NextResponse.json({ ok: true, action: 'noop' })
    }

    const insertedEvent = await insertAssistantInboundEvent({
      channel_id: resolution.channelId,
      assistant_id: resolution.assistantId,
      external_message_id: parsed.data.message.messageId.trim(),
      external_user_id: parsed.data.message.senderId.trim(),
      external_chat_id: chatId,
      message_text: messageText,
      message_data: {
        imessage_target: chatId,
        imessage_surface_id: surface.id,
        sender_name: parsed.data.message.senderName?.trim() || null,
        timestamp: parsed.data.message.timestamp ?? null,
        service: parsed.data.message.service?.trim() || null,
        reply_to_id: parsed.data.message.replyToId?.trim() || null,
        imessage_attachments: Array.isArray(parsed.data.message.attachments) ? parsed.data.message.attachments : [],
      },
    })

    await triggerWorker({
      eventId: insertedEvent?.id ?? null,
      assistantId: insertedEvent?.assistant_id ?? resolution.assistantId,
    })
    void publishWakeForChannel(resolution.channelId)

    return NextResponse.json({ ok: true, action: 'route', eventId: insertedEvent?.id ?? null })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/internal/imessage/hosted', method: 'POST' },
      tags: { layer: 'api', route: 'internal-imessage-hosted' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
