const DEFAULT_MAX_CHARS = 2000
const DEFAULT_MAX_LINES = 17
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/

type OpenFence = {
  indent: string
  markerChar: string
  markerLen: number
  openLine: string
}

function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').length
}

function parseFenceLine(line: string): OpenFence | null {
  const match = line.match(FENCE_RE)
  if (!match) return null
  const indent = match[1] ?? ''
  const marker = match[2] ?? ''
  return {
    indent,
    markerChar: marker[0] ?? '`',
    markerLen: marker.length,
    openLine: line,
  }
}

function closeFenceLine(openFence: OpenFence): string {
  return `${openFence.indent}${openFence.markerChar.repeat(openFence.markerLen)}`
}

function closeFenceIfNeeded(text: string, openFence: OpenFence | null): string {
  if (!openFence) return text
  const closeLine = closeFenceLine(openFence)
  if (!text) return closeLine
  if (!text.endsWith('\n')) return `${text}\n${closeLine}`
  return `${text}${closeLine}`
}

function splitLongLine(
  line: string,
  maxChars: number,
  opts: { preserveWhitespace: boolean },
): string[] {
  const limit = Math.max(1, Math.floor(maxChars))
  if (line.length <= limit) return [line]

  const out: string[] = []
  let remaining = line
  while (remaining.length > limit) {
    if (opts.preserveWhitespace) {
      out.push(remaining.slice(0, limit))
      remaining = remaining.slice(limit)
      continue
    }

    const window = remaining.slice(0, limit)
    let breakIdx = -1
    for (let i = window.length - 1; i >= 0; i -= 1) {
      if (/\s/.test(window[i] ?? '')) {
        breakIdx = i
        break
      }
    }
    if (breakIdx <= 0) breakIdx = limit
    out.push(remaining.slice(0, breakIdx))
    remaining = remaining.slice(breakIdx)
  }
  if (remaining.length) out.push(remaining)
  return out
}

function rebalanceReasoningItalics(source: string, chunks: string[]): string[] {
  if (chunks.length <= 1) return chunks

  const wrapsReasoningItalics =
    source.startsWith('Reasoning:\n_') && source.trimEnd().endsWith('_')
  if (!wrapsReasoningItalics) return chunks

  const adjusted = [...chunks]
  for (let i = 0; i < adjusted.length; i += 1) {
    const isLast = i === adjusted.length - 1
    const current = adjusted[i] ?? ''
    if (!current.trimEnd().endsWith('_')) {
      adjusted[i] = `${current}_`
    }
    if (!isLast) {
      const next = adjusted[i + 1] ?? ''
      if (!next.startsWith('_')) {
        adjusted[i + 1] = `_${next}`
      }
    }
  }
  return adjusted
}

export function chunkDiscordText(
  text: string,
  opts: {
    maxChars?: number
    maxLines?: number
    chunkMode?: 'length' | 'newline'
  } = {},
): string[] {
  const maxChars = Math.max(1, Math.floor(opts.maxChars ?? DEFAULT_MAX_CHARS))
  const maxLines = Math.max(1, Math.floor(opts.maxLines ?? DEFAULT_MAX_LINES))
  const chunkMode = opts.chunkMode === 'newline' ? 'newline' : 'length'
  const body = text ?? ''
  if (!body) return []

  if (body.length <= maxChars && countLines(body) <= maxLines) {
    return [body]
  }

  const lines = body.split('\n')
  const chunks: string[] = []

  let current = ''
  let currentLines = 0
  let openFence: OpenFence | null = null

  const flush = () => {
    if (!current) return
    const payload = closeFenceIfNeeded(current, openFence)
    if (payload.trim().length) chunks.push(payload)
    current = ''
    currentLines = 0
    if (openFence) {
      current = openFence.openLine
      currentLines = 1
    }
  }

  for (const originalLine of lines) {
    const fenceInfo = parseFenceLine(originalLine)
    const wasInsideFence = openFence !== null
    let nextOpenFence: OpenFence | null = openFence
    if (fenceInfo) {
      if (!openFence) {
        nextOpenFence = fenceInfo
      } else if (
        openFence.markerChar === fenceInfo.markerChar &&
        fenceInfo.markerLen >= openFence.markerLen
      ) {
        nextOpenFence = null
      }
    }

    const reserveChars = nextOpenFence ? closeFenceLine(nextOpenFence).length + 1 : 0
    const reserveLines = nextOpenFence ? 1 : 0
    const effectiveMaxChars = maxChars - reserveChars
    const effectiveMaxLines = maxLines - reserveLines
    const charLimit = effectiveMaxChars > 0 ? effectiveMaxChars : maxChars
    const lineLimit = effectiveMaxLines > 0 ? effectiveMaxLines : maxLines
    const prefixLen = current.length > 0 ? current.length + 1 : 0
    const segmentLimit = Math.max(1, charLimit - prefixLen)
    const segments = splitLongLine(originalLine, segmentLimit, {
      preserveWhitespace: wasInsideFence || chunkMode === 'newline',
    })

    for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
      const segment = segments[segIndex] ?? ''
      const isLineContinuation = segIndex > 0
      const delimiter = isLineContinuation ? '' : current.length > 0 ? '\n' : ''
      const addition = `${delimiter}${segment}`
      const nextLen = current.length + addition.length
      const nextLines = currentLines + (isLineContinuation ? 0 : 1)

      if ((nextLen > charLimit || nextLines > lineLimit) && current.length > 0) {
        flush()
      }

      if (current.length > 0) {
        current += addition
        if (!isLineContinuation) currentLines += 1
      } else {
        current = segment
        currentLines = 1
      }
    }

    openFence = nextOpenFence
  }

  if (current.length) {
    const payload = closeFenceIfNeeded(current, openFence)
    if (payload.trim().length) chunks.push(payload)
  }

  return rebalanceReasoningItalics(text, chunks)
}
