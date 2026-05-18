export interface ChannelTextChunkOptions {
  maxChars: number
  maxLines?: number
}

const DEFAULT_CHUNK_OPTIONS: ChannelTextChunkOptions = {
  maxChars: 3500,
}

const CHANNEL_CHUNK_OPTIONS: Record<string, ChannelTextChunkOptions> = {
  discord: { maxChars: 1900, maxLines: 17 },
  slack: { maxChars: 3900 },
  telegram: { maxChars: 3900 },
  whatsapp: { maxChars: 3500 },
  msteams: { maxChars: 3500 },
  teams: { maxChars: 3500 },
  imessage: { maxChars: 3000 },
}

export function getChannelTextChunkOptions(
  channelType: string | null | undefined,
): ChannelTextChunkOptions {
  const normalized = channelType?.trim().toLowerCase()
  return normalized && CHANNEL_CHUNK_OPTIONS[normalized]
    ? CHANNEL_CHUNK_OPTIONS[normalized]
    : DEFAULT_CHUNK_OPTIONS
}

export function chunkChannelText(
  text: string,
  channelType: string | null | undefined,
  override?: Partial<ChannelTextChunkOptions>,
): string[] {
  const base = getChannelTextChunkOptions(channelType)
  const options = {
    ...base,
    ...override,
    maxChars: Math.max(200, override?.maxChars ?? base.maxChars),
  }
  return chunkText(text, options)
}

export function chunkText(text: string, options: ChannelTextChunkOptions): string[] {
  const normalized = text.trimEnd()
  if (!normalized) return ['']

  const chunks: string[] = []
  let current = ''
  let currentLines = 0

  const flush = () => {
    if (!current) return
    chunks.push(current)
    current = ''
    currentLines = 0
  }

  const appendLine = (line: string) => {
    const lineParts = splitLongLine(line, options.maxChars)
    for (const part of lineParts) {
      const separator = current ? '\n' : ''
      const candidate = `${current}${separator}${part}`
      const candidateLines = currentLines + (current ? 1 : 0)
      const exceedsChars = candidate.length > options.maxChars
      const exceedsLines =
        typeof options.maxLines === 'number' &&
        current.length > 0 &&
        candidateLines > options.maxLines

      if (exceedsChars || exceedsLines) {
        flush()
        current = part
        currentLines = 1
      } else {
        current = candidate
        currentLines = current ? candidateLines + (currentLines === 0 ? 1 : 0) : 0
      }
    }
  }

  for (const line of normalized.split('\n')) {
    appendLine(line)
  }
  flush()

  return chunks.length > 0 ? chunks : ['']
}

function splitLongLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line]

  const parts: string[] = []
  let remaining = line
  while (remaining.length > maxChars) {
    let cutAt = remaining.lastIndexOf(' ', maxChars)
    if (cutAt < Math.floor(maxChars * 0.6)) {
      cutAt = maxChars
    }
    parts.push(remaining.slice(0, cutAt).trimEnd())
    remaining = remaining.slice(cutAt).trimStart()
  }
  if (remaining.length > 0) parts.push(remaining)
  return parts
}
