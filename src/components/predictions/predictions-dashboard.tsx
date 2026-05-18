'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, ListOrdered, Search, BookOpen, Wallet } from 'lucide-react'
import { CollapsibleSection } from '@/components/panels/collapsible-section'
import { PositionsTable } from './positions-table'
import { OpenOrdersTable } from './open-orders-table'
import { MarketSearchPanel } from './market-search-panel'
import { FundingPanel } from './funding-panel'
import { OrderbookPanel } from '@/components/trading'
import { usePredictions } from '@/hooks/use-predictions'
import type { PredictionMarket, Orderbook } from '@/lib/trading/polymarket/types'

interface PredictionsDashboardProps {
  /** The assistant whose Polymarket positions to display */
  assistantId: string
  /** Organization ID for auth scoping */
  orgId: string
  /** Compact mode hides search + orderbook (for embedding in smaller panels) */
  compact?: boolean
  /** Additional className */
  className?: string
}

/**
 * PredictionsDashboard — Composable Polymarket monitoring panel.
 *
 * Displays positions, open orders, market search, and orderbook for an agent.
 * Designed to be embedded in Mission Control agent detail, standalone pages,
 * or any dashboard layout.
 *
 * Usage:
 *   <PredictionsDashboard assistantId="ast-123" orgId="org-456" />
 *   <PredictionsDashboard assistantId="ast-123" orgId="org-456" compact />
 */
export function PredictionsDashboard({
  assistantId,
  orgId,
  compact = false,
  className,
}: PredictionsDashboardProps) {
  const {
    positions,
    openOrders,
    loading,
    cancelOrder,
    cancellingOrderId,
    searchMarkets,
    fetchOrderbook,
    funding,
    fundingLoading,
    fundingError,
    fetchFunding,
    withdraw,
  } = usePredictions({ assistantId, orgId })

  const [selectedOrderbook, setSelectedOrderbook] = useState<Orderbook | null>(null)
  const [orderbookLoading, setOrderbookLoading] = useState(false)
  const [selectedMarketQuestion, setSelectedMarketQuestion] = useState<string | null>(null)

  const handleSelectMarket = useCallback(async (market: PredictionMarket) => {
    setSelectedMarketQuestion(market.question)
    setOrderbookLoading(true)
    try {
      const ob = await fetchOrderbook(market.conditionId)
      setSelectedOrderbook(ob)
    } finally {
      setOrderbookLoading(false)
    }
  }, [fetchOrderbook])

  const handleSelectMarketFromPosition = useCallback(async (conditionId: string) => {
    const pos = positions.find((p) => p.conditionId === conditionId)
    setSelectedMarketQuestion(pos?.question ?? conditionId)
    setOrderbookLoading(true)
    try {
      const ob = await fetchOrderbook(conditionId)
      setSelectedOrderbook(ob)
    } finally {
      setOrderbookLoading(false)
    }
  }, [fetchOrderbook, positions])

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Funding */}
      {!compact && (
        <CollapsibleSection
          title="Funding"
          icon={<Wallet className="h-3.5 w-3.5" />}
          defaultOpen={false}
        >
          <FundingPanel
            funding={funding}
            loading={fundingLoading}
            error={fundingError}
            onFetchFunding={fetchFunding}
            onWithdraw={withdraw}
          />
        </CollapsibleSection>
      )}

      {/* Positions */}
      <CollapsibleSection
        title="Positions"
        icon={<TrendingUp className="h-3.5 w-3.5" />}
        badge={positions.length || null}
        defaultOpen
      >
        <PositionsTable
          positions={positions}
          loading={loading}
          onSelectMarket={compact ? undefined : handleSelectMarketFromPosition}
        />
      </CollapsibleSection>

      {/* Open Orders */}
      <CollapsibleSection
        title="Open Orders"
        icon={<ListOrdered className="h-3.5 w-3.5" />}
        badge={openOrders.length || null}
        defaultOpen
      >
        <OpenOrdersTable
          orders={openOrders}
          loading={loading}
          cancelling={cancellingOrderId}
          onCancel={cancelOrder}
        />
      </CollapsibleSection>

      {!compact && (
        <>
          {/* Market Search */}
          <CollapsibleSection
            title="Search Markets"
            icon={<Search className="h-3.5 w-3.5" />}
            defaultOpen={false}
          >
            <MarketSearchPanel
              onSearch={searchMarkets}
              onSelectMarket={handleSelectMarket}
            />
          </CollapsibleSection>

          {/* Orderbook */}
          <CollapsibleSection
            title={selectedMarketQuestion ? `Orderbook: ${selectedMarketQuestion}` : 'Orderbook'}
            icon={<BookOpen className="h-3.5 w-3.5" />}
            defaultOpen={false}
            open={selectedOrderbook != null || orderbookLoading}
          >
            <OrderbookPanel
              orderbook={selectedOrderbook}
              loading={orderbookLoading}
            />
          </CollapsibleSection>
        </>
      )}
    </div>
  )
}
