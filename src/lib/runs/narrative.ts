export interface RunNarrativeItem {
  id: string
  title: string
  summary?: string | null
  timestamp: string
  status?: string | null
  kind?: string | null
  channel?: string | null
  direction?: 'inbound' | 'outbound' | null
  errorMessage?: string | null
  costUsd?: number | null
  tokensUsed?: number | null
  durationMs?: number | null
  details?: Record<string, unknown> | null
}

export interface NarrativeDetailSection {
  id: string
  label: string
  tone?: 'default' | 'muted' | 'error'
  content: string
}

export function isNarrativeError(status?: string | null) {
  return status === 'failed' || status === 'error'
}

export function formatNarrativeTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatNarrativeLabel(value?: string | null) {
  if (!value) return null
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function formatNarrativeDuration(durationMs?: number | null) {
  if (durationMs == null || durationMs < 0) return null
  if (durationMs < 1_000) return `${durationMs}ms`

  const totalSeconds = Math.round(durationMs / 1_000)
  if (totalSeconds < 60) return `${totalSeconds}s`

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
}

export function getNarrativeMetrics(item: RunNarrativeItem) {
  const metrics: string[] = []

  const duration = formatNarrativeDuration(item.durationMs)
  if (duration) metrics.push(duration)
  if (item.tokensUsed && item.tokensUsed > 0) metrics.push(`${item.tokensUsed.toLocaleString()} tokens`)
  if (item.costUsd && item.costUsd > 0) metrics.push(`$${item.costUsd.toFixed(4)}`)

  return metrics
}

export function getNarrativeDetailSections(item: RunNarrativeItem): NarrativeDetailSection[] {
  const sections: NarrativeDetailSection[] = []
  const details = item.details ?? null

  const push = (
    id: string,
    label: string,
    value: unknown,
    tone: NarrativeDetailSection['tone'] = 'default',
  ) => {
    const content = normalizeNarrativeContent(value)
    if (!content) return
    sections.push({ id, label, tone, content })
  }

  if (item.errorMessage) {
    push('error', 'Error', item.errorMessage, 'error')
  }

  if (!details) {
    return sections
  }

  push('message', 'Message', details.message_text ?? details.message)
  push('tool', 'Tool', details.tool_name)
  push('transcript', 'Transcript', details.transcript)
  push('output', 'Output', details.output ?? details.result ?? details.response ?? details.outcome_summary)
  push('stdout', 'Stdout', details.stdout, 'muted')
  push('stderr', 'Stderr', details.stderr, 'error')
  push('command', 'Command', details.command, 'muted')

  const remaining = omitNarrativeKeys(details, [
    'message_text',
    'message',
    'tool_name',
    'transcript',
    'output',
    'result',
    'response',
    'outcome_summary',
    'stdout',
    'stderr',
    'command',
  ])

  if (Object.keys(remaining).length > 0) {
    push('details', 'Details', remaining, 'muted')
  }

  return dedupeNarrativeSections(sections)
}

function dedupeNarrativeSections(sections: NarrativeDetailSection[]) {
  const seen = new Set<string>()
  return sections.filter((section) => {
    const key = `${section.label}:${section.content}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeNarrativeContent(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => normalizeNarrativeContent(entry))
      .filter((entry): entry is string => Boolean(entry))
    if (normalized.length === 0) return null
    return normalized.join('\n')
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, nested]) => nested != null && !(typeof nested === 'string' && nested.trim().length === 0))
      .slice(0, 12)
      .map(([key, nested]) => `${formatNarrativeLabel(key) ?? key}: ${stringifyNarrativeValue(nested)}`)
    return entries.length > 0 ? entries.join('\n') : null
  }
  return null
}

function stringifyNarrativeValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((entry) => stringifyNarrativeValue(entry))
      .join(', ')
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value)
  }
  return ''
}

function omitNarrativeKeys(
  details: Record<string, unknown>,
  keys: string[],
) {
  const hiddenKeys = new Set(keys)
  return Object.fromEntries(Object.entries(details).filter(([key]) => !hiddenKeys.has(key)))
}
