/**
 * WhatsApp OpenClaw Plugin - implements OpenClawChannelPluginBridgeContract
 * with real Meta Cloud API (WhatsApp Business) calls.
 *
 * Ported from:
 * - worker/src/processors/outbound.ts (sendWhatsAppMessage)
 * - worker/src/channels/whatsapp/WhatsAppOutput.ts
 * - worker/src/channels/whatsapp/WhatsAppBusinessAPI.ts
 */

import type { OpenClawChannelPluginBridgeContract } from '../OpenClawBridgeContract.js'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const WHATSAPP_MESSAGE_LIMIT = 4096

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
    if (splitAt <= 0) {
      splitAt = remaining.lastIndexOf('\n', limit)
    }
    if (splitAt <= 0) {
      splitAt = remaining.lastIndexOf(' ', limit)
    }
    if (splitAt <= 0) {
      splitAt = limit
    }

    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }

  return chunks
}

interface WhatsAppResponse {
  messages?: Array<{ id: string }>
  error?: {
    message: string
    type?: string
    code?: number
  }
}

async function uploadWhatsAppMedia(params: {
  accessToken: string
  phoneNumberId: string
  mediaUrl: string
  mimeType?: string
  fileName?: string
}): Promise<string> {
  let buffer: Buffer
  let mimeType = params.mimeType || 'audio/ogg'
  let fileName = params.fileName || 'voice-note.ogg'

  if (params.mediaUrl.startsWith('file://')) {
    const filePath = fileURLToPath(params.mediaUrl)
    buffer = await fs.readFile(filePath)
    if (!params.fileName) {
      fileName = filePath.split(/[\\/]/).pop() || fileName
    }
  } else {
    const response = await fetch(params.mediaUrl)
    if (!response.ok) {
      throw new Error(`WhatsApp media download failed (${response.status})`)
    }
    mimeType = params.mimeType || response.headers.get('content-type') || mimeType
    buffer = Buffer.from(await response.arrayBuffer())
  }

  const form = new FormData()
  form.set('messaging_product', 'whatsapp')
  form.set('type', mimeType)
  form.set('file', new Blob([buffer], { type: mimeType }), fileName)

  const response = await fetch(`https://graph.facebook.com/v18.0/${params.phoneNumberId}/media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: form,
  })

  const data = (await response.json()) as { id?: string; error?: { message?: string } }
  if (!response.ok || !data.id) {
    throw new Error(data.error?.message || `WhatsApp media upload failed (${response.status})`)
  }

  return data.id
}

export function createWhatsAppPlugin(
  secrets: Record<string, string>,
): OpenClawChannelPluginBridgeContract {
  const { access_token, phone_number_id } = secrets

  if (!access_token || !phone_number_id) {
    throw new Error('[whatsapp-plugin] access_token and phone_number_id are required')
  }

  return {
    id: 'whatsapp',
    outbound: {
      deliveryMode: 'direct',
      chunker: whatsappChunker,
      chunkerMode: 'plain',
      textChunkLimit: WHATSAPP_MESSAGE_LIMIT,

      sendText: async (params) => {
        const { to, text } = params

        const response = await fetch(
          `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${access_token}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to,
              type: 'text',
              text: { body: text },
            }),
          },
        )

        const data = (await response.json()) as WhatsAppResponse

        if (!response.ok || data.error) {
          return {
            channel: 'whatsapp',
            ok: false,
            error: data.error?.message || `WhatsApp API error (${response.status})`,
          }
        }

        return {
          channel: 'whatsapp',
          messageId: data.messages?.[0]?.id,
          chatId: to,
          ok: true,
        }
      },

      sendMedia: async (params) => {
        try {
          const mediaId = await uploadWhatsAppMedia({
            accessToken: access_token,
            phoneNumberId: phone_number_id,
            mediaUrl: params.mediaUrl,
            mimeType:
              typeof params.platformOptions?.mediaMimeType === 'string'
                ? params.platformOptions.mediaMimeType
                : undefined,
            fileName:
              typeof params.platformOptions?.mediaFileName === 'string'
                ? params.platformOptions.mediaFileName
                : undefined,
          })

          const response = await fetch(
            `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${access_token}`,
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: params.to,
                type: 'audio',
                audio: { id: mediaId },
              }),
            },
          )

          const data = (await response.json()) as WhatsAppResponse
          if (!response.ok || data.error) {
            return {
              channel: 'whatsapp',
              ok: false,
              error: data.error?.message || `WhatsApp API error (${response.status})`,
            }
          }

          return {
            channel: 'whatsapp',
            messageId: data.messages?.[0]?.id,
            chatId: params.to,
            ok: true,
          }
        } catch (error) {
          return {
            channel: 'whatsapp',
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      },
    },
  }
}
