import 'server-only'

import { classifyWhatsAppError } from '../shared/errors'
import type { ShimDeliveryResult } from '../shared/types'

const WHATSAPP_MESSAGE_LIMIT = 4096

interface WhatsAppGraphResponse {
  messages?: Array<{ id: string }>
  error?: {
    message: string
    type?: string
    code?: number
    error_subcode?: number
  }
}

function whatsappChunker(text: string, limit: number): string[] {
  if (text.length <= limit) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining)
      break
    }

    let splitAt = remaining.lastIndexOf('\n\n', limit)
    if (splitAt <= 0) splitAt = remaining.lastIndexOf('\n', limit)
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(' ', limit)
    if (splitAt <= 0) splitAt = limit

    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }

  return chunks
}

function buildWhatsAppGraphError(
  status: number,
  data: WhatsAppGraphResponse,
): Error {
  const message = data.error?.message || `WhatsApp API error (${status})`
  const err = Object.assign(new Error(message), {
    status,
    statusCode: status,
    body: data,
    code: data.error?.code,
  })
  return err
}

/**
 * Managed WhatsApp shim.
 *
 * Unlike Discord/Slack/Telegram/MSTeams, the compiled `@lucid/openclaw-runtime`
 * currently does not export a Cloud API WhatsApp sender. We still put the
 * control-plane path behind the same managed relay boundary so the rest of the
 * app stops caring whether a channel is backed by runtime exports or a direct
 * adapter implementation.
 *
 * This mirrors the worker WhatsApp plugin behavior:
 * - same Cloud API endpoint family
 * - same plain-text chunking limit
 * - same first-message-id return convention
 */
export async function sendWhatsAppViaShim(
  secrets: Record<string, string>,
  destinationId: string,
  text: string,
): Promise<ShimDeliveryResult> {
  const token = secrets.access_token || secrets.whatsapp_token
  const phoneNumberId = secrets.phone_number_id

  if (!token || !phoneNumberId) {
    throw new Error('WhatsApp credentials not configured')
  }

  const chunks = whatsappChunker(text, WHATSAPP_MESSAGE_LIMIT)
  let firstMessageId: string | null = null

  try {
    for (const chunk of chunks) {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: destinationId,
            type: 'text',
            text: { body: chunk },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      )

      const data = (await response.json()) as WhatsAppGraphResponse
      if (!response.ok || data.error) {
        throw buildWhatsAppGraphError(response.status, data)
      }

      const messageId = data.messages?.[0]?.id ?? null
      if (firstMessageId == null && messageId) {
        firstMessageId = messageId
      }
    }
  } catch (err) {
    const permanent = classifyWhatsAppError(err)
    if (permanent) throw permanent
    throw err
  }

  return { delivered: true, externalMessageId: firstMessageId }
}
