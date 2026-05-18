'use client'

import { cn } from '@/lib/utils'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { PriceBadge, TableSkeleton } from '@/components/trading'
import {
  formatShares,
  orderSideColor,
  ORDER_TYPE_LABELS,
  EMPTY_STATES,
} from '@/lib/trading/polymarket/constants'
import type { OpenOrder } from '@/lib/trading/polymarket/types'

interface OpenOrdersTableProps {
  orders: OpenOrder[]
  loading?: boolean
  cancelling?: string | null
  onCancel?: (orderId: string) => void
  className?: string
}

export function OpenOrdersTable({
  orders,
  loading,
  cancelling,
  onCancel,
  className,
}: OpenOrdersTableProps) {
  if (loading) return <TableSkeleton rows={2} className={className} />

  if (orders.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-8 text-xs text-muted-foreground/50', className)}>
        {EMPTY_STATES.orders}
      </div>
    )
  }

  return (
    <Table className={className}>
      <TableHeader>
        <TableRow className="border-zinc-800/50 hover:bg-transparent">
          <TableHead className="text-xs">Side</TableHead>
          <TableHead className="text-xs w-20 text-right">Price</TableHead>
          <TableHead className="text-xs w-20 text-right">Size</TableHead>
          <TableHead className="text-xs w-20 text-right">Filled</TableHead>
          <TableHead className="text-xs w-16">Type</TableHead>
          <TableHead className="text-xs w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const isCancelling = cancelling === order.id
          const fillPct = parseFloat(order.originalSize) > 0
            ? (parseFloat(order.sizeMatched) / parseFloat(order.originalSize)) * 100
            : 0

          return (
            <TableRow key={order.id} className="border-zinc-800/30">
              <TableCell>
                <span className={cn('text-xs font-medium', orderSideColor(order.side))}>
                  {order.side}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <PriceBadge price={parseFloat(order.price)} />
              </TableCell>
              <TableCell className="text-right">
                <span className="text-xs font-mono tabular-nums text-muted-foreground">
                  {formatShares(order.originalSize)}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <span className="text-xs font-mono tabular-nums text-muted-foreground">
                  {fillPct.toFixed(0)}%
                </span>
              </TableCell>
              <TableCell>
                <span className="text-[10px] text-muted-foreground/60" title={ORDER_TYPE_LABELS[order.orderType]}>
                  {order.orderType}
                </span>
              </TableCell>
              <TableCell>
                {onCancel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground/40 hover:text-red-400"
                    disabled={isCancelling}
                    onClick={(e) => {
                      e.stopPropagation()
                      onCancel(order.id)
                    }}
                  >
                    <X className={cn('h-3 w-3', isCancelling && 'animate-spin')} />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
