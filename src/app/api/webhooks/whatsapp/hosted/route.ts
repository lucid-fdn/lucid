import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { triggerInboundWorker } from '@/lib/channels/worker-trigger'
import { getMediaProviderConfig } from '@/lib/ai/media-provider-config'
import { hasWhatsAppInboundForChatMessage, insertAssistantInboundEvent } from '@/lib/db'
import { getChannelSurfaceDefaultBinding } from '@/lib/db/channel-routing'
import { publishWakeForChannel } from '@/lib/realtime/broadcast'
import { resolveHostedWhatsAppInbound } from '@/lib/whatsapp/hosted-commands'
import {
  getHostedWhatsAppConfig,
  parseWhatsAppInboundMessages,
  resolveWhatsAppIngress,
  sendWhatsAppText,
  verifyWhatsAppSignature,
  type WhatsAppWebhookPayload,
} from '@/lib/whatsapp/webhook'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    if (mode !== 'subscribe' || !token || !challenge) {
      return new NextResponse('Missing parameters', { status: 400 })
    }

    if (token !== getHostedWhatsAppConfig().verifyToken) {
      return new NextResponse('Invalid verify token', { status: 403 })
    }

    return new NextResponse(challenge, { status: 200 })
  } catch (error) {
    console.error('[whatsapp-hosted] Verification error:', error)
    return new NextResponse('Internal error', { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-hub-signature-256')
    if (!signature) {
      return NextResponse.json({ status: 'signature_missing' })
    }

    const rawBody = await request.text()
    const hostedConfig = getHostedWhatsAppConfig()
    if (!verifyWhatsAppSignature(rawBody, signature, hostedConfig.appSecret)) {
      return NextResponse.json({ status: 'invalid_signature' })
    }

    const body = JSON.parse(rawBody) as WhatsAppWebhookPayload
    const messages = parseWhatsAppInboundMessages(body)
    if (messages.length === 0) {
      return NextResponse.json({ status: 'ok' })
    }

    const wakeChannelIds = new Set<string>()
    const mediaProviderConfig = getMediaProviderConfig()
    for (const message of messages) {
      const seen = await hasWhatsAppInboundForChatMessage(message.chatId, message.messageId)
      if (seen) continue

      const resolution = await resolveHostedWhatsAppInbound({
        chatId: message.chatId,
        text: message.text ?? '',
        hostedSurfaceId: hostedConfig.phoneNumberId,
        resolveSurfaceDefault: async () => {
          const surfaceDefault = await getChannelSurfaceDefaultBinding({
            channelType: 'whatsapp',
            surfaceOwnerKind: 'hosted_surface',
            surfaceOwnerId: hostedConfig.phoneNumberId,
          })
          if (!surfaceDefault?.channel) return null
          return {
            channelId: surfaceDefault.channel.id,
            assistantId: surfaceDefault.channel.assistant_id,
          }
        },
        sendText: async (text) =>
          sendWhatsAppText({
            accessToken: hostedConfig.accessToken,
            phoneNumberId: hostedConfig.phoneNumberId,
            to: message.chatId,
            text,
          }),
      })

      if (resolution.kind === 'handled') {
        continue
      }

      const ingress = await resolveWhatsAppIngress({
        messageText: message.text,
        attachments: message.attachments,
        accessToken: hostedConfig.accessToken,
        gatewayBaseUrls: mediaProviderConfig.gatewayBaseUrls,
        gatewayApiKeys: mediaProviderConfig.gatewayApiKeys,
      })

      if (!ingress.messageText) {
        continue
      }

      await insertAssistantInboundEvent({
        channel_id: resolution.channelId,
        assistant_id: resolution.assistantId,
        external_message_id: message.messageId,
        external_user_id: message.chatId,
        external_chat_id: message.chatId,
        message_text: ingress.messageText,
        message_data: {
          timestamp: message.timestamp,
          message_type: message.type,
          hosted: true,
          whatsapp_chat_id: message.chatId,
          whatsapp_hosted_surface_id: hostedConfig.phoneNumberId,
          contact_name: message.contactName,
          whatsapp_audio_input: message.attachments.some((attachment) => attachment.kind === 'audio'),
          whatsapp_attachments: message.attachments,
          audio_processing_unavailable: ingress.audioProcessingUnavailable,
        },
      })
      wakeChannelIds.add(resolution.channelId)
    }

    if (wakeChannelIds.size > 0) {
      await triggerInboundWorker('[whatsapp-hosted]')
      for (const channelId of wakeChannelIds) {
        void publishWakeForChannel(channelId)
      }
    }

    return NextResponse.json({ status: 'ok', service: 'whatsapp-hosted-webhook' })
  } catch (error) {
    console.error('[whatsapp-hosted] Error:', error)
    return NextResponse.json({ status: 'error' })
  }
}
