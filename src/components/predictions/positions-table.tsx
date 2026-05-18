'use client'

import { cn } from '@/lib/utils'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { PriceBadge, PnlBadge, TableSkeleton } from '@/components/trading'
import { formatShares, EMPTY_STATES } from '@/lib/trading/polymarket/constants'
import type { Position } from '@/lib/trading/polymarket/types'

interface PositionsTableProps {
  positions: Position[]
  loading?: boolean
  onSelectMarket?: (conditionId: string) => void
  className?: string
}

export function PositionsTable({ positions, loading, onSelectMarket, className }: PositionsTableProps) {
  if (loading) return <TableSkeleton rows={3} className={className} />

  if (positions.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-8 text-xs text-muted-foreground/50', className)}>
        {EMPTY_STATES.positions}
      </div>
    )
  }

  return (
    <Table className={className}>
      <TableHeader>
        <TableRow className="border-zinc-800/50 hover:bg-transparent">
          <TableHead className="text-xs">Market</TableHead>
          <TableHead className="text-xs w-16">Side</TableHead>
          <TableHead className="text-xs w-20 text-right">Shares</TableHead>
          <TableHead className="text-xs w-20 text-right">Price</TableHead>
          <TableHead className="text-xs w-24 text-right">P&L</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((pos) => (
          <TableRow
            key={`${pos.conditionId}-${pos.outcome}`}
            className={cn(
              'border-zinc-800/30 cursor-pointer',
              'hover:bg-zinc-900/50 transition-colors',
            )}
            onClick={() => onSelectMarket?.(pos.conditionId)}
          >
            <TableCell className="text-xs max-w-[200px]">
              <div className="flex items-center gap-2">
                <BreathingDot
                  color={pos.marketActive ? 'bg-emerald-400' : 'bg-zinc-500'}
                  animate={pos.marketActive}
                  size="xs"
                />
                <span className="truncate">{pos.question}</span>
              </div>
            </TableCell>
            <TableCell>
              <span className={cn(
                'text-xs font-medium',
                pos.outcome === 'Yes' ? 'text-green-400' : 'text-red-400',
              )}>
                {pos.outcome}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {formatShares(pos.size)}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <PriceBadge price={pos.currentPrice} />
            </TableCell>
            <TableCell className="text-right">
              <PnlBadge pnlUsd={pos.pnlUsd} pnlPercent={pos.pnlPercent} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
