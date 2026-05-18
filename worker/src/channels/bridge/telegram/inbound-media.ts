import type { ImageAttachment } from '../../../agent/OpenClawAgent.js'
import { normalizeAudioTranscriptionFileName } from '../media/audio-filename.js'
import { normalizeAudioTranscriptText } from '../media/audio-transcript-text.js'
import { transcribeAudio } from '../media/audio-transcription.js'

const MAX_TELEGRAM_MEDIA_BYTES = 20 * 1024 * 1024
export interface TelegramInboundAttachmentRef {
  kind: 'image' | 'voice' | 'audio' | 'document' | 'sticker'
  file_id?: string
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

interface TelegramFileDownload {
  buffer: Buffer
  mimeType: string
  fileName: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function getTelegramInboundAttachments(
  messageData: Record<string, unknown> | null | undefined,
): TelegramInboundAttachmentRef[] {
  if (!messageData) return []
  const raw = messageData.attachments
  if (!Array.isArray(raw)) return []
  return raw.filter(isObject).map((item) => ({
    kind: typeof item.kind === 'string' ? item.kind as TelegramInboundAttachmentRef['kind'] : 'document',
    file_id: typeof item.file_id === 'string' ? item.file_id : undefined,
    file_unique_id: typeof item.file_unique_id === 'string' ? item.file_unique_id : undefined,
    file_name: typeof item.file_name === 'string' ? item.file_name : undefined,
    mime_type: typeof item.mime_type === 'string' ? item.mime_type : undefined,
    file_size: typeof item.file_size === 'number' ? item.file_size : undefined,
    duration: typeof item.duration === 'number' ? item.duration : undefined,
    width: typeof item.width === 'number' ? item.width : undefined,
    height: typeof item.height === 'number' ? item.height : undefined,
    emoji: typeof item.emoji === 'string' ? item.emoji : undefined,
    is_animated: item.is_animated === true,
    is_video: item.is_video === true,
  }))
}

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

async function downloadTelegramFile(
  botToken: string,
  fileId: string,
  fallbackFileName: string,
): Promise<TelegramFileDownload> {
  const filePath = await getTelegramFilePath(botToken, fileId)
  const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`)
  if (!res.ok) {
    throw new Error(`Telegram file download failed (${res.status})`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.byteLength > MAX_TELEGRAM_MEDIA_BYTES) {
    throw new Error(`Telegram attachment exceeds ${MAX_TELEGRAM_MEDIA_BYTES} bytes`)
  }

  const guessedName = filePath.split('/').pop() || fallbackFileName
  return {
    buffer,
    mimeType: res.headers.get('content-type') ?? 'application/octet-stream',
    fileName: guessedName,
  }
}

export async function resolveTelegramInboundAugmentation(params: {
  messageText: string
  messageData: Record<string, unknown> | null | undefined
  botToken?: string
  llmBaseUrl?: string
  llmApiKey?: string
  llmBaseUrls?: string[]
  llmApiKeys?: string[]
}): Promise<{ effectiveText: string; images: ImageAttachment[] }> {
  const attachments = getTelegramInboundAttachments(params.messageData)
  if (attachments.length === 0) {
    return { effectiveText: params.messageText, images: [] }
  }

  const gatewayBaseUrls = [
    ...(params.llmBaseUrls ?? []),
    ...(params.llmBaseUrl ? [params.llmBaseUrl] : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  const gatewayApiKeys = [
    ...(params.llmApiKeys ?? []),
    ...(params.llmApiKey ? [params.llmApiKey] : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  const notes: string[] = []
  const images: ImageAttachment[] = []
  const audioContext: Array<{ transcript?: string; unavailableNote?: string; failureNote?: string }> = []

  for (const attachment of attachments) {
    if (!attachment.file_id || !params.botToken) {
      if (attachment.kind === 'document' && attachment.file_name) {
        notes.push(`User attached a document: ${attachment.file_name}.`)
      } else if (attachment.kind === 'voice') {
        notes.push('User sent a voice note.')
      }
      continue
    }

    try {
      if (attachment.kind === 'image' || (attachment.kind === 'document' && attachment.mime_type?.startsWith('image/'))) {
        const file = await downloadTelegramFile(
          params.botToken,
          attachment.file_id,
          attachment.file_name || 'telegram-image',
        )
        if (file.mimeType.startsWith('image/')) {
          images.push({ data: file.buffer.toString('base64'), mimeType: file.mimeType })
        }
        continue
      }

      if (attachment.kind === 'sticker') {
        if (attachment.is_animated || attachment.is_video) {
          notes.push(
            attachment.emoji
              ? `User sent a ${attachment.emoji} sticker.`
              : 'User sent an animated sticker.',
          )
          continue
        }
        const file = await downloadTelegramFile(
          params.botToken,
          attachment.file_id,
          attachment.file_name || 'telegram-sticker.webp',
        )
        if (file.mimeType.startsWith('image/') || file.fileName.endsWith('.webp')) {
          images.push({ data: file.buffer.toString('base64'), mimeType: file.mimeType || 'image/webp' })
        }
        if (attachment.emoji) {
          notes.push(`Sticker emoji: ${attachment.emoji}.`)
        }
        continue
      }

      if (attachment.kind === 'voice' || attachment.kind === 'audio') {
        const file = await downloadTelegramFile(
          params.botToken,
          attachment.file_id,
          attachment.file_name || (attachment.kind === 'voice' ? 'voice-note.ogg' : 'audio-file'),
        )
        if (gatewayApiKeys.length > 0 && gatewayBaseUrls.length > 0) {
          const transcript = await transcribeAudio({
            buffer: file.buffer,
            mimeType: file.mimeType,
            fileName: normalizeAudioTranscriptionFileName({
              fallbackBaseName: attachment.kind === 'voice' ? 'voice-note' : 'audio-file',
              attachmentFileName: attachment.file_name,
              downloadedFileName: file.fileName,
              mimeType: file.mimeType,
            }),
            gatewayBaseUrls,
            gatewayApiKeys,
          })
          if (transcript) {
            audioContext.push({ transcript })
            continue
          }
        }
        audioContext.push({
          unavailableNote:
            attachment.kind === 'voice'
              ? 'User sent a voice note, but transcription was unavailable.'
              : `User attached an audio file${attachment.file_name ? `: ${attachment.file_name}` : ''}.`,
        })
        continue
      }

      if (attachment.kind === 'document') {
        notes.push(
          `User attached a document${attachment.file_name ? `: ${attachment.file_name}` : ''}${attachment.mime_type ? ` (${attachment.mime_type})` : ''}.`,
        )
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (attachment.kind === 'voice' || attachment.kind === 'audio') {
        audioContext.push({ failureNote: `User sent audio, but processing failed: ${reason}.` })
      } else if (attachment.kind === 'document') {
        notes.push(`User attached a document${attachment.file_name ? `: ${attachment.file_name}` : ''}.`)
      } else if (attachment.kind === 'sticker' && attachment.emoji) {
        notes.push(`User sent a ${attachment.emoji} sticker.`)
      } else if (attachment.kind === 'image') {
        notes.push('User sent an image.')
      }
    }
  }

  if (images.length > 0 && !notes.some((note) => note.startsWith('User sent an image'))) {
    notes.unshift(`User sent ${images.length} image${images.length === 1 ? '' : 's'}. Analyze ${images.length === 1 ? 'it' : 'them'} and help accordingly.`)
  }

  const transcriptText = audioContext
    .map((entry) => entry.transcript?.trim())
    .filter((value): value is string => Boolean(value))
    .join('\n\n')
  const unavailableText = audioContext
    .map((entry) => entry.unavailableNote?.trim())
    .filter((value): value is string => Boolean(value))
    .join('\n\n')
  const failureText = audioContext
    .map((entry) => entry.failureNote?.trim())
    .filter((value): value is string => Boolean(value))
    .join('\n\n')
  const sections = [
    normalizeAudioTranscriptText({
      messageText: params.messageText,
      transcript: transcriptText,
      unavailableNote: unavailableText,
      failureNote: failureText,
    }).effectiveText,
    ...notes.filter(Boolean),
  ].filter(Boolean)
  return {
    effectiveText: sections.join('\n\n').trim(),
    images,
  }
}
