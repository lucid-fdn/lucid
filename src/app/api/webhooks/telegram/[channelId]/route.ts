/**
 * Telegram Webhook Handler
 * 
 * Receives webhook callbacks from Telegram, validates them using hash comparison,
 * inserts inbound events into the database, and triggers the worker.
 * 
 * URL: POST /api/webhooks/telegram/[channelId]
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAssistantChannelForWebhook, insertAssistantInboundEvent } from '@/lib/db'
import { decryptChannelSecrets } from '@/lib/channels/secrets'
import { publishWakeForChannel } from '@/lib/realtime/broadcast'
import { getMediaProviderConfig } from '@/lib/ai/media-provider-config'
import {
  extractTelegramInboundContent,
  resolveTelegramIngress,
  type TelegramInboundAudio,
  type TelegramInboundDocument,
  type TelegramInboundPhotoSize,
  type TelegramInboundSticker,
  type TelegramInboundVoice,
} from '@/lib/telegram/inbound-media'
import { maskIdentifier } from '@/lib/logging/safe-log'

export const dynamic = 'force-dynamic'

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from: {
      id: number
      first_name: string
      last_name?: string
      username?: string
    }
    chat: {
      id: number
      type: string
    }
    date: number
    text?: string
    caption?: string
    photo?: TelegramInboundPhotoSize[]
    voice?: TelegramInboundVoice
    audio?: TelegramInboundAudio
    document?: TelegramInboundDocument
    sticker?: TelegramInboundSticker
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params
    
    // Parse body
    const body = await request.json() as TelegramUpdate
    
    // Get secret token from header (Telegram sends this if configured)
    const secretToken = request.headers.get('x-telegram-bot-api-secret-token')
    
    // Validate channel exists and secret token matches
    const channel = await getAssistantChannelForWebhook(channelId, 'telegram')
    
    if (!channel) {
      console.warn('[telegram-webhook] Unknown channel', { channelId: maskIdentifier(channelId) })
      // Return 200 to prevent Telegram from retrying
      return NextResponse.json({ ok: true })
    }
    
    // Validate secret token (hash comparison, no decryption needed). If a BYO
    // Telegram channel has a secret configured, missing headers must fail
    // closed instead of silently accepting forged webhooks.
    if (channel.secret_token_hash && !secretToken) {
      console.warn('[telegram-webhook] Missing request signature', { channelId: maskIdentifier(channelId) })
      return NextResponse.json({ ok: true })
    }
    if (secretToken && channel.secret_token_hash) {
      const tokenHash = crypto.createHash('sha256').update(secretToken).digest('hex')
      if (tokenHash !== channel.secret_token_hash) {
        console.warn('[telegram-webhook] Invalid request signature', { channelId: maskIdentifier(channelId) })
        return NextResponse.json({ ok: true })
      }
    }
    
    // Extract message (ignore non-message updates)
    const message = body.message
    if (!message) {
      return NextResponse.json({ ok: true })
    }

    const inbound = extractTelegramInboundContent(message)
    const mediaProviderConfig = getMediaProviderConfig()
    const botToken = channel.encrypted_secrets?.encrypted_data
      ? decryptChannelSecrets(channel.encrypted_secrets.encrypted_data).bot_token
      : process.env.TELEGRAM_HOSTED_BOT_TOKEN
    const ingress = await resolveTelegramIngress({
      messageText: inbound.messageText,
      attachments: inbound.attachments,
      botToken,
      llmBaseUrl: mediaProviderConfig.preferredGatewayBaseUrl,
      llmApiKey: mediaProviderConfig.preferredGatewayApiKey,
      llmBaseUrls: mediaProviderConfig.gatewayBaseUrls,
      llmApiKeys: mediaProviderConfig.gatewayApiKeys,
    })
    const effectiveMessageText = ingress.messageText
    if (!effectiveMessageText && inbound.attachments.length === 0) {
      return NextResponse.json({ ok: true })
    }

    // Insert inbound event (idempotent via unique constraint)
    try {
      const insertedEvent = await insertAssistantInboundEvent({
        channel_id: channelId,
        assistant_id: channel.assistant_id,
        external_message_id: String(message.message_id),
        external_user_id: String(message.from.id),
        external_chat_id: String(message.chat.id),
        message_text: effectiveMessageText,
        message_data: {
          from: message.from,
          chat: message.chat,
          date: message.date,
          telegram_ingress_preprocessed: true,
          telegram_voice_input: inbound.attachments.some((attachment) => attachment.kind === 'voice'),
          ...(inbound.attachments.length > 0 ? { attachments: inbound.attachments } : {}),
        },
      })

      triggerWorker({
        eventId: insertedEvent?.id ?? null,
        assistantId: insertedEvent?.assistant_id ?? channel.assistant_id,
      })
    } catch (insertError) {
      console.error(`[telegram-webhook] Insert error:`, insertError)
      // Still return 200 to prevent retries
      return NextResponse.json({ ok: true })
    }
    
    // Trigger worker (fire-and-forget) — HTTP for shared workers, broadcast for dedicated runtimes
    void publishWakeForChannel(channelId)
    
    return NextResponse.json({ ok: true })
    
  } catch (error) {
    console.error('[telegram-webhook] Error:', error)
    // Return 200 to prevent Telegram from retrying
    return NextResponse.json({ ok: true })
  }
}

/**
 * Trigger worker to process events (fire-and-forget)
 */
function triggerWorker(payload?: { eventId?: string | null; assistantId?: string | null }): void {
  const workerUrl = process.env.WORKER_URL
  const workerSecret = process.env.WORKER_TRIGGER_SECRET
  
  if (!workerUrl) return
  
  // Fire and forget - don't await
  fetch(`${workerUrl}/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(workerSecret && { Authorization: `Bearer ${workerSecret}` }),
    },
    body: JSON.stringify({
      event_type: 'inbound',
      event_id: payload?.eventId ?? undefined,
      assistant_id: payload?.assistantId ?? undefined,
    }),
  }).catch((err) => {
    console.warn('[telegram-webhook] Failed to trigger worker:', err.message)
  })
}

// Telegram sends GET to verify webhook URL
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'telegram-webhook' })
}
