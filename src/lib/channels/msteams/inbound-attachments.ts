export interface TeamsInboundAttachment {
  contentType?: string
  contentUrl?: string
  name?: string
}

export interface TeamsAttachmentSummary {
  attachments: Array<{
    kind: 'audio' | 'image' | 'file'
    contentType?: string
    contentUrl?: string
    name?: string
  }>
  notes: string[]
  hasAudio: boolean
}

export function summarizeTeamsInboundAttachments(
  attachments: TeamsInboundAttachment[] | null | undefined,
): TeamsAttachmentSummary {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { attachments: [], notes: [], hasAudio: false }
  }

  const normalized = attachments.map((attachment) => {
    const contentType = attachment.contentType?.trim()
    const kind: 'audio' | 'image' | 'file' =
      contentType?.startsWith('audio/')
        ? 'audio'
        : contentType?.startsWith('image/')
          ? 'image'
          : 'file'
    return {
      kind,
      ...(contentType ? { contentType } : {}),
      ...(attachment.contentUrl ? { contentUrl: attachment.contentUrl } : {}),
      ...(attachment.name ? { name: attachment.name } : {}),
    }
  })

  const notes = normalized.map((attachment) => {
    if (attachment.kind === 'audio') {
      return `User attached Microsoft Teams audio${attachment.name ? `: ${attachment.name}` : ''}.`
    }
    if (attachment.kind === 'image') {
      return `User attached a Microsoft Teams image${attachment.name ? `: ${attachment.name}` : ''}.`
    }
    return `User attached a Microsoft Teams file${attachment.name ? `: ${attachment.name}` : ''}.`
  })

  return {
    attachments: normalized,
    notes,
    hasAudio: normalized.some((attachment) => attachment.kind === 'audio'),
  }
}
