import 'server-only'

import {
  normalizeProviderBaseUrl,
  normalizeProviderSecret,
  uniqueDefined,
} from '@/lib/media/audio-transcription'
import { transcribeAudio } from '@/lib/ai/media-gateway'
import { normalizeAudioTranscriptionFileName } from '@/lib/media/audio-filename'
import { isDeploymentLevelUnavailable } from '@/lib/ai/provider-errors'

export const TELEGRAM_AUDIO_PROCESSING_UNAVAILABLE_REPLY =
  "I received your voice note, but unfortunately, I can't transcribe or process audio messages in this setup. Could you please type out your message or let me know how I can help you?"

export interface TelegramIngressResolution {
  messageText: string | null
  audioProcessingUnavailable: boolean
}

export interface TelegramInboundPhotoSize {
  file_id: string
  file_unique_id?: string
  file_size?: number
  width?: number
  height?: number
}

export interface TelegramInboundVoice {
  file_id: string
  file_unique_id?: string
  file_size?: number
  duration?: number
  mime_type?: string
}

export interface TelegramInboundAudio {
  file_id: string
  file_unique_id?: string
  file_name?: string
  file_size?: number
  duration?: number
  mime_type?: string
}

export interface TelegramInboundDocument {
  file_id: string
  file_unique_id?: string
  file_name?: string
  file_size?: number
  mime_type?: string
}

export interface TelegramInboundSticker {
  file_id: string
  file_unique_id?: string
  file_size?: number
  width?: number
  height?: number
  emoji?: string
  is_animated?: boolean
  is_video?: boolean
}

export interface TelegramInboundMessageLike {
  text?: string
  caption?: string
  photo?: TelegramInboundPhotoSize[]
  voice?: TelegramInboundVoice
  audio?: TelegramInboundAudio
  document?: TelegramInboundDocument
  sticker?: TelegramInboundSticker
}

export interface TelegramInboundAttachmentRef {
  kind: 'image' | 'voice' | 'audio' | 'document' | 'sticker'
  file_id: string
  file_unique_id?: string
  file_name?: string
  mime_type?: string
  file_size?: number
  duration?: number
  width?: number
  height?: number
  emoji?: string
  is_animated?: boolean
  is_video?: boolean
}

export function extractTelegramInboundContent(message: TelegramInboundMessageLike): {
  messageText: string | null
  attachments: TelegramInboundAttachmentRef[]
} {
  const attachments: TelegramInboundAttachmentRef[] = []

  const largestPhoto = message.photo?.at(-1)
  if (largestPhoto?.file_id) {
    attachments.push({
      kind: 'image',
      file_id: largestPhoto.file_id,
      file_unique_id: largestPhoto.file_unique_id,
      file_size: largestPhoto.file_size,
      width: largestPhoto.width,
      height: largestPhoto.height,
    })
  }

  if (message.voice?.file_id) {
    attachments.push({
      kind: 'voice',
      file_id: message.voice.file_id,
      file_unique_id: message.voice.file_unique_id,
      mime_type: message.voice.mime_type,
      file_size: message.voice.file_size,
      duration: message.voice.duration,
    })
  }

  if (message.audio?.file_id) {
    attachments.push({
      kind: 'audio',
      file_id: message.audio.file_id,
      file_unique_id: message.audio.file_unique_id,
      file_name: message.audio.file_name,
      mime_type: message.audio.mime_type,
      file_size: message.audio.file_size,
      duration: message.audio.duration,
    })
  }

  if (message.document?.file_id) {
    attachments.push({
      kind: 'document',
      file_id: message.document.file_id,
      file_unique_id: message.document.file_unique_id,
      file_name: message.document.file_name,
      mime_type: message.document.mime_type,
      file_size: message.document.file_size,
    })
  }

  if (message.sticker?.file_id) {
    attachments.push({
      kind: 'sticker',
      file_id: message.sticker.file_id,
      file_unique_id: message.sticker.file_unique_id,
      file_size: message.sticker.file_size,
      width: message.sticker.width,
      height: message.sticker.height,
      emoji: message.sticker.emoji,
      is_animated: message.sticker.is_animated,
      is_video: message.sticker.is_video,
      mime_type: message.sticker.is_video ? 'video/webm' : 'image/webp',
      file_name: message.sticker.is_video ? 'sticker.webm' : 'sticker.webp',
    })
  }

  const rawText = typeof message.text === 'string'
    ? message.text
    : typeof message.caption === 'string'
      ? message.caption
      : null

  const messageText = rawText?.trim() ? rawText.trim() : null
  return { messageText, attachments }
}

const MAX_TELEGRAM_MEDIA_BYTES = 20 * 1024 * 1024
async function getTelegramFilePath(botToken: string, fileId: string): Promise<string> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`)
  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; result?: { file_path?: string }; description?: string }
    | null
  if (!res.ok || payload?.ok === false || !payload?.result?.file_path) {
    throw new Error(payload?.description ?? `Telegram getFile failed (${res.status})`)
  }
  return payload.result.file_path
}

async function downloadTelegramFile(params: {
  botToken: string
  fileId: string
  fallbackFileName: string
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const filePath = await getTelegramFilePath(params.botToken, params.fileId)
  const res = await fetch(`https://api.telegram.org/file/bot${params.botToken}/${filePath}`)
  if (!res.ok) {
    throw new Error(`Telegram file download failed (${res.status})`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.byteLength > MAX_TELEGRAM_MEDIA_BYTES) {
    throw new Error(`Telegram attachment exceeds ${MAX_TELEGRAM_MEDIA_BYTES} bytes`)
  }

  return {
    buffer,
    mimeType: res.headers.get('content-type') ?? 'application/octet-stream',
    fileName: filePath.split('/').pop() || params.fallbackFileName,
  }
}

export async function resolveTelegramIngress(params: {
  messageText: string | null
  attachments: TelegramInboundAttachmentRef[]
  botToken?: string
  llmBaseUrl?: string
  llmApiKey?: string
  llmBaseUrls?: string[]
  llmApiKeys?: string[]
}): Promise<TelegramIngressResolution> {
  const notes: string[] = []
  let audioProcessingUnavailable = false
  const llmBaseUrls = uniqueDefined([
    ...((params.llmBaseUrls ?? []).map((value) => normalizeProviderBaseUrl(value))),
    normalizeProviderBaseUrl(params.llmBaseUrl),
  ])
  const llmApiKeys = uniqueDefined([
    ...((params.llmApiKeys ?? []).map((value) => normalizeProviderSecret(value))),
    normalizeProviderSecret(params.llmApiKey),
  ])
  for (const attachment of params.attachments) {
    if (attachment.kind === 'image') {
      notes.push('User sent an image.')
      continue
    }

    if (attachment.kind === 'sticker') {
      notes.push(
        attachment.emoji
          ? `User sent a ${attachment.emoji} sticker.`
          : 'User sent a sticker.',
      )
      continue
    }

    if (attachment.kind === 'document') {
      notes.push(
        `User attached a document${attachment.file_name ? `: ${attachment.file_name}` : ''}${attachment.mime_type ? ` (${attachment.mime_type})` : ''}.`,
      )
      continue
    }

    if (attachment.kind === 'voice' || attachment.kind === 'audio') {
      const botToken = params.botToken
      const hasAudioProcessingConfig = Boolean(attachment.file_id && botToken && llmBaseUrls.length > 0 && llmApiKeys.length > 0)
      if (hasAudioProcessingConfig) {
        try {
          const file = await downloadTelegramFile({
            botToken: botToken!,
            fileId: attachment.file_id,
            fallbackFileName: attachment.file_name || (attachment.kind === 'voice' ? 'voice-note.ogg' : 'audio-file'),
          })
          const transcript = await transcribeAudio({
            buffer: file.buffer,
            mimeType: file.mimeType,
            fileName: normalizeAudioTranscriptionFileName({
              fallbackBaseName: attachment.kind === 'voice' ? 'voice-note' : 'audio-file',
              attachmentFileName: attachment.file_name,
              downloadedFileName: file.fileName,
              mimeType: file.mimeType,
            }),
            gatewayBaseUrls: llmBaseUrls,
            gatewayApiKeys: llmApiKeys,
          })
          if (transcript) {
            notes.push(`${attachment.kind === 'voice' ? 'Voice note' : 'Audio'} transcript:\n${transcript}`)
            continue
          }
        } catch (error) {
          if (isDeploymentLevelUnavailable(error)) {
            audioProcessingUnavailable = true
          }
          notes.push(
            attachment.kind === 'voice'
              ? 'User sent a voice note. Transcription is unavailable in this deployment.'
              : 'User sent audio. Transcription is unavailable in this deployment.',
          )
          continue
        }
      }

      if (!hasAudioProcessingConfig) {
        audioProcessingUnavailable = true
      }

      notes.push(
        attachment.kind === 'voice'
          ? 'User sent a voice note.'
          : `User attached an audio file${attachment.file_name ? `: ${attachment.file_name}` : ''}.`,
      )
    }
  }

  const sections = [params.messageText?.trim() || '', ...notes.filter(Boolean)].filter(Boolean)
  return {
    messageText: sections.length > 0 ? sections.join('\n\n').trim() : null,
    audioProcessingUnavailable,
  }
}

export async function resolveTelegramIngressMessage(params: {
  messageText: string | null
  attachments: TelegramInboundAttachmentRef[]
  botToken?: string
  llmBaseUrl?: string
  llmApiKey?: string
  llmBaseUrls?: string[]
  llmApiKeys?: string[]
}): Promise<string | null> {
  const result = await resolveTelegramIngress(params)
  return result.messageText
}
