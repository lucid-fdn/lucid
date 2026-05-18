import 'server-only'

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { triggerInboundWorker } from '@/lib/channels/worker-trigger'
import { getMediaProviderConfig } from '@/lib/ai/media-provider-config'
import {
  getAssistantChannelForWebhook,
  hasWhatsAppInboundForChatMessage,
  insertAssistantInboundEvent,
} from '@/lib/db'
import { publishWakeForChannel } from '@/lib/realtime/broadcast'
import {
  getChannelSecrets,
  parseWhatsAppInboundMessages,
  resolveWhatsAppIngress,
  verifyWhatsAppSignature,
  type WhatsAppWebhookPayload,
} from '@/lib/whatsapp/webhook'
import { maskIdentifier, summarizeError } from '@/lib/logging/safe-log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const { channelId } = await params
    const searchParams = new URL(request.url).searchParams
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    if (mode !== 'subscribe' || !token || !challenge) {
      return new NextResponse('Missing parameters', { status: 400 })
    }

    const channel = await getAssistantChannelForWebhook(channelId, 'whatsapp')
    if (!channel) {
      return new NextResponse('Channel not found', { status: 404 })
    }

    const secrets = getChannelSecrets(channel)
    const verifyToken = secrets.verify_token
    const tokenMatches =
      (verifyToken && verifyToken === token) ||
      (!!channel.secret_token_hash &&
        crypto.createHash('sha256').update(token).digest('hex') === channel.secret_token_hash)

    if (!tokenMatches) {
      return new NextResponse('Invalid verify token', { status: 403 })
    }

    return new NextResponse(challenge, { status: 200 })
  } catch (error) {
    console.error('[whatsapp-webhook] Verification failed:', summarizeError(error))
    return new NextResponse('Internal error', { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const { channelId } = await params
    const signature = request.headers.get('x-hub-signature-256')
    if (!signature) {
      return NextResponse.json({ status: 'signature_missing' })
    }

    const channel = await getAssistantChannelForWebhook(channelId, 'whatsapp')
    if (!channel) {
      return NextResponse.json({ status: 'ok' })
    }

    const secrets = getChannelSecrets(channel)
    const appSecret = secrets.app_secret || process.env.WHATSAPP_APP_SECRET
    if (!appSecret) {
      console.warn('[whatsapp-webhook] Signing key missing for channel', {
        channelId: maskIdentifier(channelId),
      })
      return NextResponse.json({ status: 'invalid_signature' })
    }

    const rawBody = await request.text()
    if (!verifyWhatsAppSignature(rawBody, signature, appSecret)) {
      return NextResponse.json({ status: 'invalid_signature' })
    }

    const body = JSON.parse(rawBody) as WhatsAppWebhookPayload
    const messages = parseWhatsAppInboundMessages(body)
    if (messages.length === 0) {
      return NextResponse.json({ status: 'ok' })
    }

    let queuedMessage = false
    const mediaProviderConfig = getMediaProviderConfig()
    for (const message of messages) {
      const alreadySeen = await hasWhatsAppInboundForChatMessage(message.chatId, message.messageId)
      if (alreadySeen) continue

      try {
        const ingress = await resolveWhatsAppIngress({
          messageText: message.text,
          attachments: message.attachments,
          accessToken: secrets.access_token || secrets.whatsapp_token,
          gatewayBaseUrls: mediaProviderConfig.gatewayBaseUrls,
          gatewayApiKeys: mediaProviderConfig.gatewayApiKeys,
        })
        if (!ingress.messageText) continue

        await insertAssistantInboundEvent({
          channel_id: channelId,
          assistant_id: channel.assistant_id,
          external_message_id: message.messageId,
          external_user_id: message.chatId,
          external_chat_id: message.chatId,
          message_text: ingress.messageText,
          message_data: {
            timestamp: message.timestamp,
            contact_name: message.contactName,
            message_type: message.type,
            whatsapp_audio_input: message.attachments.some((attachment) => attachment.kind === 'audio'),
            whatsapp_attachments: message.attachments,
            audio_processing_unavailable: ingress.audioProcessingUnavailable,
          },
        })
        queuedMessage = true
      } catch (insertError) {
        console.error('[whatsapp-webhook] Insert error:', insertError)
      }
    }

    if (queuedMessage) {
      await triggerInboundWorker('[whatsapp-webhook]')
      void publishWakeForChannel(channelId)
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[whatsapp-webhook] Error:', error)
    return NextResponse.json({ status: 'error' })
  }
}
