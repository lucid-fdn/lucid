/**
 * Trading UI — shared formatters, colors, and labels.
 *
 * Generic financial display helpers used across all trading features:
 * Polymarket predictions, Hyperliquid perps, DEX swaps, Launchpad.
 */

// ── Formatters ──

/** Format a 0-1 probability as percentage string */
export function formatProbability(price: number): string {
  return `${(price * 100).toFixed(1)}%`
}

/** Format USD amount */
export function formatUsd(amount: number): string {
  if (Math.abs(amount) < 0.01) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Format P&L percentage */
export function formatPnlPercent(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

/** Format token size (shares/contracts) */
export function formatShares(size: string): string {
  const n = parseFloat(size)
  if (isNaN(n)) return size
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toFixed(n % 1 === 0 ? 0 : 2)
}

// ── Colors ──

export function pnlColor(value: number): string {
  if (value > 0) return 'text-green-400'
  if (value < 0) return 'text-red-400'
  return 'text-muted-foreground'
}

export function pnlBgColor(value: number): string {
  if (value > 0) return 'bg-green-500/10'
  if (value < 0) return 'bg-red-500/10'
  return 'bg-muted/50'
}

export function probabilityColor(price: number): string {
  if (price >= 0.8) return 'text-green-400'
  if (price >= 0.5) return 'text-yellow-400'
  if (price >= 0.2) return 'text-orange-400'
  return 'text-red-400'
}

export function orderSideColor(side: 'BUY' | 'SELL'): string {
  return side === 'BUY' ? 'text-green-400' : 'text-red-400'
}

export function marketStatusColor(active: boolean, closed: boolean): string {
  if (closed) return 'text-zinc-500'
  if (active) return 'text-emerald-400'
  return 'text-amber-400'
}

// ── Labels ──

export const ORDER_TYPE_LABELS: Record<string, string> = {
  GTC: 'Good Till Cancel',
  FOK: 'Fill or Kill',
  GTD: 'Good Till Date',
}
