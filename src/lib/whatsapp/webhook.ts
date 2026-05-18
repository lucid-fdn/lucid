import 'server-only'

import crypto from 'crypto'
import { decryptChannelSecrets } from '@/lib/channels/secrets'
import {
  normalizeProviderBaseUrl,
  normalizeProviderSecret,
  uniqueDefined,
} from '@/lib/media/audio-transcription'
import { normalizeAudioTranscriptionFileName } from '@/lib/media/audio-filename'
import { transcribeAudio } from '@/lib/ai/media-gateway'
import { isDeploymentLevelUnavailable } from '@/lib/ai/provider-errors'
import { summarizeError } from '@/lib/logging/safe-log'

export interface WhatsAppWebhookPayload {
  object?: string
  entry?: Array<{
    id?: string
    changes?: Array<{
      field?: string
      value?: {
        messaging_product?: string
        metadata?: {
          display_phone_number?: string
          phone_number_id?: string
        }
        contacts?: Array<{
          profile?: { name?: string }
          wa_id?: string
        }>
        messages?: Array<{
          from: string
          id: string
          timestamp: string
          text?: { body?: string }
          audio?: {
            id?: string
            mime_type?: string
            voice?: boolean
          }
          image?: {
            id?: string
            mime_type?: string
            caption?: string
          }
          document?: {
            id?: string
            mime_type?: string
            filename?: string
            caption?: string
          }
          type: string
        }>
      }
    }>
  }>
}

export interface ParsedWhatsAppTextMessage {
  chatId: string
  messageId: string
  timestamp: string
  text: string
  type: string
  contactName: string | null
}

export interface WhatsAppInboundAttachmentRef {
  kind: 'image' | 'audio' | 'document'
  mediaId: string
  mimeType?: string
  fileName?: string
  caption?: string
  isVoiceNote?: boolean
}

export interface ParsedWhatsAppInboundMessage {
  chatId: string
  messageId: string
  timestamp: string
  text: string | null
  type: string
  contactName: string | null
  attachments: WhatsAppInboundAttachmentRef[]
}

type ChannelWithEncryptedSecrets = {
  encrypted_secrets?:
    | { encrypted_data?: string | null }
    | Array<{ encrypted_data?: string | null }>
    | null
}

export function getChannelSecrets(
  channel: ChannelWithEncryptedSecrets | null | undefined,
  logPrefix = '[whatsapp-webhook]',
): Record<string, string> {
  const rawSecrets = Array.isArray(channel?.encrypted_secrets)
    ? channel?.encrypted_secrets[0]
    : channel?.encrypted_secrets
  const encrypted = rawSecrets?.encrypted_data
  if (!encrypted) return {}

  try {
    return decryptChannelSecrets(encrypted)
  } catch (error) {
    console.error(`${logPrefix} Failed to decrypt channel secrets:`, summarizeError(error))
    return {}
  }
}

export function verifyWhatsAppSignature(
  payload: string,
  signatureHeader: string,
  appSecret: string,
): boolean {
  const expectedSignature = signatureHeader.replace(/^sha256=/, '')
  const computedSignature = crypto.createHmac('sha256', appSecret).update(payload).digest('hex')

  const expected = Buffer.from(expectedSignature, 'hex')
  const actual = Buffer.from(computedSignature, 'hex')
  if (expected.length !== actual.length) {
    return false
  }

  try {
    return crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export function parseWhatsAppTextMessages(
  payload: WhatsAppWebhookPayload,
): ParsedWhatsAppTextMessage[] {
  const parsed = parseWhatsAppInboundMessages(payload)
  return parsed
    .filter((message): message is ParsedWhatsAppInboundMessage & { text: string } => typeof message.text === 'string' && message.text.trim().length > 0)
    .map((message) => ({
      chatId: message.chatId,
      messageId: message.messageId,
      timestamp: message.timestamp,
      text: message.text!,
      type: message.type,
      contactName: message.contactName,
    }))
}

export function parseWhatsAppInboundMessages(
  payload: WhatsAppWebhookPayload,
): ParsedWhatsAppInboundMessage[] {
  const parsed: ParsedWhatsAppInboundMessage[] = []

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      const contactsById = new Map(
        (value?.contacts ?? [])
          .filter((contact): contact is NonNullable<typeof contact> & { wa_id: string } => !!contact?.wa_id)
          .map((contact) => [contact.wa_id, contact.profile?.name ?? null]),
      )

      for (const message of value?.messages ?? []) {
        const attachments: WhatsAppInboundAttachmentRef[] = []
        if (message.audio?.id) {
          attachments.push({
            kind: 'audio',
            mediaId: message.audio.id,
            mimeType: message.audio.mime_type,
            isVoiceNote: message.audio.voice === true,
          })
        }
        if (message.image?.id) {
          attachments.push({
            kind: 'image',
            mediaId: message.image.id,
            mimeType: message.image.mime_type,
            caption: message.image.caption,
          })
        }
        if (message.document?.id) {
          attachments.push({
            kind: 'document',
            mediaId: message.document.id,
            mimeType: message.document.mime_type,
            fileName: message.document.filename,
            caption: message.document.caption,
          })
        }

        const text = message.text?.body?.trim()
          || message.image?.caption?.trim()
          || message.document?.caption?.trim()
          || null

        if (!text && attachments.length === 0) continue

        parsed.push({
          chatId: message.from,
          messageId: message.id,
          timestamp: message.timestamp,
          text,
          type: message.type,
          contactName: contactsById.get(message.from) ?? null,
          attachments,
        })
      }
    }
  }

  return parsed
}

const MAX_WHATSAPP_MEDIA_BYTES = 20 * 1024 * 1024

interface WhatsAppMediaMetadata {
  url: string
  mime_type?: string
  file_size?: number
}

async function getWhatsAppMediaMetadata(params: {
  accessToken: string
  mediaId: string
}): Promise<WhatsAppMediaMetadata> {
  const response = await fetch(`https://graph.facebook.com/v21.0/${params.mediaId}`, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  })

  const payload = (await response.json().catch(() => null)) as
    | (WhatsAppMediaMetadata & { error?: { message?: string } })
    | null

  if (!response.ok || !payload?.url) {
    throw new Error(payload?.error?.message ?? `WhatsApp media metadata lookup failed (${response.status})`)
  }

  return payload
}

async function downloadWhatsAppMedia(params: {
  accessToken: string
  mediaId: string
  fallbackFileName: string
  attachmentMimeType?: string
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const metadata = await getWhatsAppMediaMetadata({
    accessToken: params.accessToken,
    mediaId: params.mediaId,
  })
  if (typeof metadata.file_size === 'number' && metadata.file_size > MAX_WHATSAPP_MEDIA_BYTES) {
    throw new Error(`WhatsApp attachment exceeds ${MAX_WHATSAPP_MEDIA_BYTES} bytes`)
  }

  const response = await fetch(metadata.url, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  })
  if (!response.ok) {
    throw new Error(`WhatsApp media download failed (${response.status})`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > MAX_WHATSAPP_MEDIA_BYTES) {
    throw new Error(`WhatsApp attachment exceeds ${MAX_WHATSAPP_MEDIA_BYTES} bytes`)
  }

  const mimeType =
    response.headers.get('content-type')
    ?? metadata.mime_type
    ?? params.attachmentMimeType
    ?? 'application/octet-stream'

  return {
    buffer,
    mimeType,
    fileName: params.fallbackFileName,
  }
}

export interface WhatsAppIngressResolution {
  messageText: string | null
  audioProcessingUnavailable: boolean
}

export async function resolveWhatsAppIngress(params: {
  messageText: string | null
  attachments: WhatsAppInboundAttachmentRef[]
  accessToken?: string
  gatewayBaseUrl?: string
  gatewayApiKey?: string
  gatewayBaseUrls?: string[]
  gatewayApiKeys?: string[]
}): Promise<WhatsAppIngressResolution> {
  const notes: string[] = []
  let audioProcessingUnavailable = false
  const gatewayBaseUrls = uniqueDefined([
    ...((params.gatewayBaseUrls ?? []).map((value) => normalizeProviderBaseUrl(value))),
    normalizeProviderBaseUrl(params.gatewayBaseUrl),
  ])
  const gatewayApiKeys = uniqueDefined([
    ...((params.gatewayApiKeys ?? []).map((value) => normalizeProviderSecret(value))),
    normalizeProviderSecret(params.gatewayApiKey),
  ])

  for (const attachment of params.attachments) {
    if (attachment.kind === 'image') {
      notes.push('User sent an image on WhatsApp.')
      continue
    }

    if (attachment.kind === 'document') {
      notes.push(
        `User attached a WhatsApp document${attachment.fileName ? `: ${attachment.fileName}` : ''}${attachment.mimeType ? ` (${attachment.mimeType})` : ''}.`,
      )
      continue
    }

    const hasAudioProcessingConfig = Boolean(
      attachment.mediaId
      && params.accessToken
      && gatewayBaseUrls.length > 0
      && gatewayApiKeys.length > 0,
    )

    if (hasAudioProcessingConfig) {
      try {
        const file = await downloadWhatsAppMedia({
          accessToken: params.accessToken!,
          mediaId: attachment.mediaId,
          fallbackFileName: attachment.fileName || (attachment.isVoiceNote ? 'whatsapp-voice-note.ogg' : 'whatsapp-audio'),
          attachmentMimeType: attachment.mimeType,
        })
        const transcript = await transcribeAudio({
          buffer: file.buffer,
          mimeType: file.mimeType,
          fileName: normalizeAudioTranscriptionFileName({
            fallbackBaseName: attachment.isVoiceNote ? 'whatsapp-voice-note' : 'whatsapp-audio',
            attachmentFileName: attachment.fileName,
            downloadedFileName: file.fileName,
            mimeType: file.mimeType,
          }),
          gatewayBaseUrls,
          gatewayApiKeys,
        })
        if (transcript) {
          notes.push(`${attachment.isVoiceNote ? 'WhatsApp voice note' : 'WhatsApp audio'} transcript:\n${transcript}`)
          continue
        }
      } catch (error) {
        if (isDeploymentLevelUnavailable(error)) {
          audioProcessingUnavailable = true
        }
        notes.push(
          attachment.isVoiceNote
            ? 'User sent a WhatsApp voice note, but transcription was unavailable.'
            : 'User sent WhatsApp audio, but transcription was unavailable.',
        )
        continue
      }
    }

    if (!hasAudioProcessingConfig) {
      audioProcessingUnavailable = true
    }

    notes.push(
      attachment.isVoiceNote
        ? 'User sent a WhatsApp voice note.'
        : `User attached WhatsApp audio${attachment.fileName ? `: ${attachment.fileName}` : ''}.`,
    )
  }

  const sections = [params.messageText?.trim() || '', ...notes.filter(Boolean)].filter(Boolean)
  return {
    messageText: sections.length > 0 ? sections.join('\n\n').trim() : null,
    audioProcessingUnavailable,
  }
}

export interface HostedWhatsAppConfig {
  accessToken: string
  phoneNumber: string
  phoneNumberId: string
  appSecret: string
  verifyToken: string
}

export function getHostedWhatsAppConfig(): HostedWhatsAppConfig {
  const accessToken = process.env.WHATSAPP_HOSTED_ACCESS_TOKEN
  const phoneNumber = process.env.WHATSAPP_HOSTED_PHONE_NUMBER
  const phoneNumberId = process.env.WHATSAPP_HOSTED_PHONE_NUMBER_ID
  const appSecret = process.env.WHATSAPP_HOSTED_APP_SECRET
  const verifyToken = process.env.WHATSAPP_HOSTED_VERIFY_TOKEN

  if (!accessToken || !phoneNumber || !phoneNumberId || !appSecret || !verifyToken) {
    throw new Error('Hosted WhatsApp is not fully configured')
  }

  return { accessToken, phoneNumber, phoneNumberId, appSecret, verifyToken }
}

export async function sendWhatsAppText(params: {
  accessToken: string
  phoneNumberId: string
  to: string
  text: string
}): Promise<void> {
  const response = await fetch(`https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'text',
      text: { body: params.text },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `WhatsApp send failed: HTTP ${response.status}${body ? ` ${body.slice(0, 200)}` : ''}`,
    )
  }
}
