import type { BrowserOperatorTrustState } from './types'

export function formatBrowserLabel(value: string | null | undefined): string {
  if (!value) return 'None'
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function formatBrowserDate(value: string | null | undefined): string {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function trustBadgeVariant(state: BrowserOperatorTrustState): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state === 'active') return 'default'
  if (state === 'blocked') return 'destructive'
  if (state === 'quarantined') return 'secondary'
  return 'outline'
}

export function shortId(value: string | null | undefined): string {
  if (!value) return 'none'
  return value.length <= 12 ? value : value.slice(0, 8)
}
