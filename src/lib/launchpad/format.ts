/**
 * Launchpad Formatting Helpers
 *
 * Centralized formatting functions used across all launchpad pages.
 * Import from '@/lib/launchpad/format' instead of duplicating in each component.
 */

/** Compact number display: 1.2K, 3.5M, 1.2B */
export function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/** USD display: $1.2K, $3.5M */
export function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

/** Truncate wallet/mint address: 7xKX...sAsU */
export function truncateAddress(addr: string, front = 6, back = 4): string {
  if (addr.length <= front + back + 3) return addr
  return `${addr.slice(0, front)}...${addr.slice(-back)}`
}

/** Relative time: "just now", "5m ago", "3h ago", "2d ago" */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Short date: "Mar 9, 2026" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Price with appropriate decimals */
export function formatPrice(n: number): string {
  if (n < 0.001) return `$${n.toFixed(6)}`
  if (n < 0.01) return `$${n.toFixed(5)}`
  if (n < 1) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

/** Token symbol from agent display name (first word, up to 5 chars) */
export function deriveTokenSymbol(displayName: string): string {
  return displayName.split(' ')[0].toUpperCase().slice(0, 5)
}
