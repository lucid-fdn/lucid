'use client'

import { cn } from '@/lib/utils'
import { OrderbookSkeleton } from './trading-skeletons'

interface OrderbookLevel {
  price: string
  size: string
}

interface OrderbookData {
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  spread: string
  midPrice: number | null
}

interface OrderbookPanelProps {
  orderbook: OrderbookData | null
  loading?: boolean
  maxLevels?: number
  className?: string
}

/**
 * Bid/ask depth ladder with size bars.
 * Reusable for any orderbook display (predictions, perps, DEX).
 */
export function OrderbookPanel({
  orderbook,
  loading,
  maxLevels = 8,
  className,
}: OrderbookPanelProps) {
  if (loading || !orderbook) return <OrderbookSkeleton className={className} />

  const asks = orderbook.asks.slice(0, maxLevels).reverse()
  const bids = orderbook.bids.slice(0, maxLevels)

  const maxSize = Math.max(
    ...asks.map((l) => parseFloat(l.size)),
    ...bids.map((l) => parseFloat(l.size)),
    1,
  )

  return (
    <div className={cn('space-y-0.5 font-mono text-[11px]', className)}>
      <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground/40 mb-1">
        <span>Price</span>
        <span>Size</span>
      </div>

      {asks.map((level, i) => (
        <LevelRow key={`ask-${i}`} price={level.price} size={level.size} maxSize={maxSize} side="ask" />
      ))}

      <div className="flex items-center justify-center py-1.5 border-y border-zinc-800/30">
        <span className="text-[10px] text-muted-foreground/60">
          Spread: {orderbook.spread}
          {orderbook.midPrice != null && (
            <span className="ml-2">Mid: {(orderbook.midPrice * 100).toFixed(1)}%</span>
          )}
        </span>
      </div>

      {bids.map((level, i) => (
        <LevelRow key={`bid-${i}`} price={level.price} size={level.size} maxSize={maxSize} side="bid" />
      ))}
    </div>
  )
}

function LevelRow({
  price, size, maxSize, side,
}: {
  price: string; size: string; maxSize: number; side: 'bid' | 'ask'
}) {
  const pct = (parseFloat(size) / maxSize) * 100
  const barColor = side === 'bid' ? 'bg-green-500/15' : 'bg-red-500/15'
  const textColor = side === 'bid' ? 'text-green-400' : 'text-red-400'

  return (
    <div className="relative flex items-center justify-between px-1 py-0.5 rounded-sm">
      <div
        className={cn('absolute inset-y-0 rounded-sm', barColor, side === 'bid' ? 'left-0' : 'right-0')}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
      <span className={cn('relative z-10 tabular-nums', textColor)}>
        {(parseFloat(price) * 100).toFixed(1)}%
      </span>
      <span className="relative z-10 tabular-nums text-muted-foreground">
        {parseFloat(size).toFixed(0)}
      </span>
    </div>
  )
}
