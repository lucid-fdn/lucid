import type { ImageAttachment } from '../../../agent/OpenClawAgent.js'
import { normalizeAudioTranscriptionFileName } from '../media/audio-filename.js'
import { normalizeAudioTranscriptText } from '../media/audio-transcript-text.js'
import { transcribeAudio } from '../media/audio-transcription.js'

const MAX_SLACK_MEDIA_BYTES = 20 * 1024 * 1024

export interface SlackInboundAttachmentRef {
  kind: 'image' | 'audio' | 'document'
  file_id?: string
  file_name?: string
  mime_type?: string
  url_private?: string
  file_size?: number
}

export interface SlackInboundFileLike {
  id?: string
  name?: string
  mimetype?: string
  filetype?: string
  url_private?: string
  size?: number
}

interface SlackFileDownload {
  buffer: Buffer
  mimeType: string
  fileName: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function mapSlackFilesToAttachments(
  files: readonly SlackInboundFileLike[] | null | undefined,
): SlackInboundAttachmentRef[] {
  if (!files || files.length === 0) return []

  return files.map((file) => ({
    kind: resolveSlackAttachmentKind(file),
    file_id: file.id,
    file_name: file.name,
    mime_type: file.mimetype,
    url_private: file.url_private,
    file_size: file.size,
  }))
}

export function getSlackInboundAttachments(
  messageData: Record<string, unknown> | null | undefined,
): SlackInboundAttachmentRef[] {
  if (!messageData) return []
  const raw = Array.isArray(messageData.attachments)
    ? messageData.attachments
    : Array.isArray(messageData.slack_files)
      ? messageData.slack_files
      : []

  return raw.filter(isObject).map((item) => ({
    kind:
      item.kind === 'image' || item.kind === 'audio' || item.kind === 'document'
        ? item.kind
        : 'document',
    file_id: typeof item.file_id === 'string' ? item.file_id : undefined,
    file_name: typeof item.file_name === 'string' ? item.file_name : undefined,
    mime_type: typeof item.mime_type === 'string' ? item.mime_type : undefined,
    url_private: typeof item.url_private === 'string' ? item.url_private : undefined,
    file_size: typeof item.file_size === 'number' ? item.file_size : undefined,
  }))
}

function resolveSlackAttachmentKind(
  file: SlackInboundFileLike,
): 'image' | 'audio' | 'document' {
  const mimeType = file.mimetype?.toLowerCase() || ''
  const fileType = file.filetype?.toLowerCase() || ''
  if (mimeType.startsWith('image/')) return 'image'
  if (
    mimeType.startsWith('audio/') ||
    ['mp3', 'm4a', 'wav', 'ogg', 'opus', 'aac'].includes(fileType)
  ) {
    return 'audio'
  }
  return 'document'
}

async function downloadSlackFile(
  botToken: string,
  urlPrivate: string,
  fallbackFileName: string,
): Promise<SlackFileDownload> {
  const res = await fetch(urlPrivate, {
    headers: {
      Authorization: `Bearer ${botToken}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Slack file download failed (${res.status})`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.byteLength > MAX_SLACK_MEDIA_BYTES) {
    throw new Error(`Slack attachment exceeds ${MAX_SLACK_MEDIA_BYTES} bytes`)
  }

  return {
    buffer,
    mimeType: res.headers.get('content-type') ?? 'application/octet-stream',
    fileName: fallbackFileName,
  }
}

export async function resolveSlackInboundAugmentation(params: {
  messageText: string
  messageData: Record<string, unknown> | null | undefined
  botToken?: string
  llmBaseUrl?: string
  llmApiKey?: string
}): Promise<{ effectiveText: string; images: ImageAttachment[] }> {
  const attachments = getSlackInboundAttachments(params.messageData)
  if (attachments.length === 0) {
    return { effectiveText: params.messageText, images: [] }
  }

  const notes: string[] = []
  const images: ImageAttachment[] = []
  const audioContext: Array<{ transcript?: string; unavailableNote?: string; failureNote?: string }> = []

  for (const attachment of attachments) {
    if (!attachment.url_private || !params.botToken) {
      if (attachment.kind === 'document' && attachment.file_name) {
        notes.push(`User attached a Slack document: ${attachment.file_name}.`)
      } else if (attachment.kind === 'audio') {
        notes.push(
          `User attached Slack audio${attachment.file_name ? `: ${attachment.file_name}` : ''}.`,
        )
      }
      continue
    }

    try {
      if (attachment.kind === 'image') {
        const file = await downloadSlackFile(
          params.botToken,
          attachment.url_private,
          attachment.file_name || 'slack-image',
        )
        if (file.mimeType.startsWith('image/')) {
          images.push({
            data: file.buffer.toString('base64'),
            mimeType: file.mimeType,
          })
        }
        continue
      }

      if (attachment.kind === 'audio') {
        const file = await downloadSlackFile(
          params.botToken,
          attachment.url_private,
          attachment.file_name || 'slack-audio',
        )
        if (params.llmApiKey && params.llmBaseUrl) {
          const transcript = await transcribeAudio({
            buffer: file.buffer,
            mimeType: file.mimeType,
            fileName: normalizeAudioTranscriptionFileName({
              fallbackBaseName: 'slack-audio',
              attachmentFileName: attachment.file_name,
              downloadedFileName: file.fileName,
              mimeType: file.mimeType,
            }),
            gatewayBaseUrls: [params.llmBaseUrl],
            gatewayApiKeys: [params.llmApiKey],
          })
          if (transcript) {
            audioContext.push({ transcript })
            continue
          }
        }
        audioContext.push({
          unavailableNote:
            `User attached Slack audio${attachment.file_name ? `: ${attachment.file_name}` : ''}, but transcription was unavailable.`,
        })
        continue
      }

      notes.push(
        `User attached a Slack document${attachment.file_name ? `: ${attachment.file_name}` : ''}${attachment.mime_type ? ` (${attachment.mime_type})` : ''}.`,
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (attachment.kind === 'audio') {
        audioContext.push({ failureNote: `Slack audio processing failed: ${reason}.` })
      } else if (attachment.kind === 'image') {
        notes.push('User sent a Slack image.')
      } else {
        notes.push(
          `User attached a Slack document${attachment.file_name ? `: ${attachment.file_name}` : ''}.`,
        )
      }
    }
  }

  if (images.length > 0 && !notes.some((note) => note.startsWith('User sent a Slack image'))) {
    notes.unshift(
      `User sent ${images.length} Slack image${images.length === 1 ? '' : 's'}. Analyze ${images.length === 1 ? 'it' : 'them'} and help accordingly.`,
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
