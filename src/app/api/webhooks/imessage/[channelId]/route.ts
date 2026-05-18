import 'server-only'

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  getAssistantChannelForWebhook,
  insertAssistantInboundEvent,
} from '@/lib/db'
import { publishWakeForChannel } from '@/lib/realtime/broadcast'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type IMessageInboundAttachment = {
  kind?: string
  url?: string
  mimeType?: string
  fileName?: string
}

type IMessageInboundPayload = {
  messageId?: string
  chatId?: string
  chatGuid?: string
  chatIdentifier?: string
  target?: string
  senderId?: string
  senderName?: string
  text?: string
  timestamp?: string | number
  service?: string
  replyToId?: string
  attachments?: IMessageInboundAttachment[]
}

function resolveSecretFromRequest(request: NextRequest): string | null {
  const headerSecret = request.headers.get('x-lucid-webhook-secret')?.trim()
  if (headerSecret) return headerSecret

  const auth = request.headers.get('authorization')?.trim()
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice('bearer '.length).trim()
    return token || null
  }

  return null
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function normalizeTarget(payload: IMessageInboundPayload): string | null {
  const target = payload.target?.trim()
  if (target) return target

  const chatId = payload.chatId?.trim()
  if (chatId) return chatId

  const chatGuid = payload.chatGuid?.trim()
  if (chatGuid) return `chat_guid:${chatGuid}`

  const chatIdentifier = payload.chatIdentifier?.trim()
  if (chatIdentifier) return `chat_identifier:${chatIdentifier}`

  return null
}

function buildMessageText(payload: IMessageInboundPayload): string {
  const text = payload.text?.trim() || ''
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : []
  if (text) return text
  if (attachments.length === 0) return ''

  const labels = attachments
    .map((attachment) => {
      const kind = typeof attachment.kind === 'string' ? attachment.kind.trim().toLowerCase() : 'attachment'
      return kind.length > 0 ? kind : 'attachment'
    })
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const { channelId } = await params
    const providedSecret = resolveSecretFromRequest(request)
    if (!providedSecret) {
      return NextResponse.json({ ok: false, error: 'missing webhook secret' }, { status: 401 })
    }

    const channel = await getAssistantChannelForWebhook(channelId, 'imessage')
    if (!channel) {
      return NextResponse.json({ ok: true })
    }

    if (!channel.secret_token_hash || hashToken(providedSecret) !== channel.secret_token_hash) {
      return NextResponse.json({ ok: false, error: 'invalid webhook secret' }, { status: 401 })
    }

    const payload = (await request.json().catch(() => null)) as IMessageInboundPayload | null
    if (!payload) {
      return NextResponse.json({ ok: true })
    }

    const target = normalizeTarget(payload)
    if (!target) {
      return NextResponse.json({ ok: true })
    }

    if (channel.external_channel_id && channel.external_channel_id !== target) {
      return NextResponse.json({ ok: true })
    }

    if (!channel.external_channel_id) {
      const supabase = createServiceClient()
      await supabase
        .from('assistant_channels')
        .update({ external_channel_id: target })
        .eq('id', channelId)
    }

    const messageId = payload.messageId?.trim()
    const messageText = buildMessageText(payload)
    if (!messageId || !messageText) {
      return NextResponse.json({ ok: true })
    }

    const insertedEvent = await insertAssistantInboundEvent({
      channel_id: channelId,
      assistant_id: channel.assistant_id,
      external_message_id: messageId,
      external_user_id: payload.senderId?.trim() || target,
      external_chat_id: target,
      message_text: messageText,
      message_data: {
        imessage_target: target,
        sender_name: payload.senderName?.trim() || null,
        timestamp: payload.timestamp ?? null,
        service: payload.service?.trim() || null,
        reply_to_id: payload.replyToId?.trim() || null,
        imessage_attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      },
    })

    await triggerWorker({
      eventId: insertedEvent?.id ?? null,
      assistantId: insertedEvent?.assistant_id ?? channel.assistant_id,
    })
    void publishWakeForChannel(channelId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[imessage-webhook] Error:', error)
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'imessage-webhook' })
}
