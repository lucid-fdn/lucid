export function formatUsd(v: number | null | undefined): string {
  if (v == null || v === 0) return '$0'
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`
  return `$${v.toFixed(2)}`
}

export function formatScore(v: number | null | undefined): string {
  if (v == null) return '--'
  return v.toFixed(1)
}

export function formatCompact(v: number | null | undefined): string {
  if (v == null || v === 0) return '0'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

export function getReputationColor(score: number): { text: string; bg: string } {
  if (score >= 90) return { text: 'text-emerald-400', bg: 'bg-emerald-400' }
  if (score >= 70) return { text: 'text-amber-400', bg: 'bg-amber-400' }
  if (score >= 50) return { text: 'text-orange-400', bg: 'bg-orange-400' }
  return { text: 'text-red-400', bg: 'bg-red-400' }
}

export function truncateAddr(addr: string): string {
  if (addr.length <= 14) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}
