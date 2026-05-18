import type { ImageAttachment } from '../../../agent/OpenClawAgent.js'
import { normalizeAudioTranscriptionFileName } from '../media/audio-filename.js'
import { normalizeAudioTranscriptText } from '../media/audio-transcript-text.js'
import { transcribeAudio } from '../media/audio-transcription.js'

const MAX_DISCORD_MEDIA_BYTES = 20 * 1024 * 1024

export interface DiscordInboundAttachmentRef {
  kind: 'image' | 'audio' | 'document'
  id?: string
  fileName?: string
  mimeType?: string
  url?: string
}

interface DiscordFileDownload {
  buffer: Buffer
  mimeType: string
  fileName: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function resolveDiscordAttachmentKind(input: {
  kind?: string
  mimeType?: string
  fileName?: string
}): DiscordInboundAttachmentRef['kind'] {
  if (input.kind === 'image' || input.kind === 'audio' || input.kind === 'document') {
    return input.kind
  }

  const mimeType = input.mimeType?.toLowerCase() || ''
  const fileName = input.fileName?.toLowerCase() || ''

  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/iu.test(fileName)) return 'image'
  if (/\.(mp3|m4a|wav|ogg|opus|aac|flac)$/iu.test(fileName)) return 'audio'

  return 'document'
}

export function getDiscordInboundAttachments(
  messageData: Record<string, unknown> | null | undefined,
): DiscordInboundAttachmentRef[] {
  if (!messageData) return []
  const raw = Array.isArray(messageData.discord_attachments)
    ? messageData.discord_attachments
    : Array.isArray(messageData.attachments)
      ? messageData.attachments
      : []

  return raw.filter(isObject).map((item) => {
    const fileName = typeof item.fileName === 'string'
      ? item.fileName
      : typeof item.file_name === 'string'
        ? item.file_name
        : undefined
    const mimeType = typeof item.mimeType === 'string'
      ? item.mimeType
      : typeof item.mime_type === 'string'
        ? item.mime_type
        : undefined

    return {
      kind: resolveDiscordAttachmentKind({
        kind: typeof item.kind === 'string' ? item.kind : undefined,
        mimeType,
        fileName,
      }),
      id: typeof item.id === 'string' ? item.id : undefined,
      fileName,
      mimeType,
      url: typeof item.url === 'string' ? item.url : undefined,
    }
  })
}

async function downloadDiscordFile(
  url: string,
  fallbackFileName: string,
): Promise<DiscordFileDownload> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Discord file download failed (${res.status})`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.byteLength > MAX_DISCORD_MEDIA_BYTES) {
    throw new Error(`Discord attachment exceeds ${MAX_DISCORD_MEDIA_BYTES} bytes`)
  }

  return {
    buffer,
    mimeType: res.headers.get('content-type') ?? 'application/octet-stream',
    fileName: fallbackFileName,
  }
}

export async function resolveDiscordInboundAugmentation(params: {
  messageText: string
  messageData: Record<string, unknown> | null | undefined
  llmBaseUrl?: string
  llmApiKey?: string
  llmBaseUrls?: string[]
  llmApiKeys?: string[]
}): Promise<{ effectiveText: string; images: ImageAttachment[] }> {
  const attachments = getDiscordInboundAttachments(params.messageData)
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
    if (!attachment.url) {
      if (attachment.kind === 'document' && attachment.fileName) {
        notes.push(`User attached a Discord file: ${attachment.fileName}.`)
      } else if (attachment.kind === 'audio') {
        notes.push(
          `User attached Discord audio${attachment.fileName ? `: ${attachment.fileName}` : ''}.`,
        )
      }
      continue
    }

    try {
      if (attachment.kind === 'image') {
        const file = await downloadDiscordFile(
          attachment.url,
          attachment.fileName || 'discord-image',
        )
        if (file.mimeType.startsWith('image/')) {
          images.push({
            data: file.buffer.toString('base64'),
            mimeType: file.mimeType,
          })
          continue
        }
        notes.push(
          `User attached a Discord image${attachment.fileName ? `: ${attachment.fileName}` : ''}.`,
        )
        continue
      }

      if (attachment.kind === 'audio') {
        const file = await downloadDiscordFile(
          attachment.url,
          attachment.fileName || 'discord-audio',
        )
        if (gatewayApiKeys.length > 0 && gatewayBaseUrls.length > 0) {
          const transcript = await transcribeAudio({
            buffer: file.buffer,
            mimeType: file.mimeType,
            fileName: normalizeAudioTranscriptionFileName({
              fallbackBaseName: 'discord-audio',
              attachmentFileName: attachment.fileName,
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
            `User attached Discord audio${attachment.fileName ? `: ${attachment.fileName}` : ''}, but transcription was unavailable.`,
        })
        continue
      }

      notes.push(
        `User attached a Discord file${attachment.fileName ? `: ${attachment.fileName}` : ''}${attachment.mimeType ? ` (${attachment.mimeType})` : ''}.`,
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (attachment.kind === 'audio') {
        audioContext.push({ failureNote: `Discord audio processing failed: ${reason}.` })
      } else if (attachment.kind === 'image') {
        notes.push('User sent a Discord image.')
      } else {
        notes.push(
          `User attached a Discord file${attachment.fileName ? `: ${attachment.fileName}` : ''}.`,
        )
      }
    }
  }

  if (images.length > 0 && !notes.some((note) => note.startsWith('User sent a Discord image'))) {
    notes.unshift(
      `User sent ${images.length} Discord image${images.length === 1 ? '' : 's'}. Analyze ${images.length === 1 ? 'it' : 'them'} and help accordingly.`,
    )
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
