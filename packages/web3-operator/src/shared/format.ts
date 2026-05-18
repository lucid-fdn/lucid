/**
 * Shared formatting helpers for web3-operator tools.
 *
 * All human-readable output formatting lives here.
 * Tools import from here instead of duplicating formatters.
 */

/** Format a number for display — handles tiny prices and large numbers. */
export function formatNumber(n: number): string {
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  // For tiny prices, show significant digits
  const str = n.toFixed(12)
  const match = str.match(/^0\.0*[1-9]\d{0,3}/)
  return match ? match[0] : str.slice(0, 10)
}

/** Format large numbers compactly — 1.5B, 2.3M, 500K. */
export function formatCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(2)
}

/** Format a duration in seconds as human-readable. */
export function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`
  return `${(seconds / 86400).toFixed(1)}d`
}

/** Format an interval in seconds as human-readable. */
export function formatInterval(secs: number): string {
  if (secs >= 86400) return `${(secs / 86400).toFixed(0)} day(s)`
  if (secs >= 3600) return `${(secs / 3600).toFixed(0)} hour(s)`
  if (secs >= 60) return `${(secs / 60).toFixed(0)} minute(s)`
  return `${secs} seconds`
}

/** Format a percentage with sign. */
export function formatPercent(p: number): string {
  const sign = p >= 0 ? '+' : ''
  return `${sign}${p.toFixed(2)}%`
}
