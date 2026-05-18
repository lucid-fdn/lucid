'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Search } from 'lucide-react'
import { BreathingDot } from '@/ui/components/breathing-dot'
import { PriceBadge, SearchSkeleton } from '@/components/trading'
import { EMPTY_STATES, marketStatusColor } from '@/lib/trading/polymarket/constants'
import type { PredictionMarket } from '@/lib/trading/polymarket/types'

interface MarketSearchPanelProps {
  onSearch: (query: string) => Promise<PredictionMarket[]>
  onSelectMarket?: (market: PredictionMarket) => void
  className?: string
}

export function MarketSearchPanel({ onSearch, onSelectMarket, className }: MarketSearchPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PredictionMarket[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed) return

    setLoading(true)
    setSearched(true)
    try {
      const markets = await onSearch(trimmed)
      setResults(markets)
    } finally {
      setLoading(false)
    }
  }, [query, onSearch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }, [handleSearch])

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search markets..."
            className={cn(
              'w-full rounded-md border border-border bg-muted/50 pl-8 pr-3 py-1.5',
              'text-xs text-zinc-200 placeholder:text-muted-foreground/30',
              'focus:outline-none focus:ring-1 focus:ring-zinc-700',
            )}
          />
        </div>
      </div>

      {loading && <SearchSkeleton />}

      {!loading && searched && results.length === 0 && (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/50">
          {EMPTY_STATES.noResults}
        </div>
      )}

      {!loading && !searched && (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/30">
          {EMPTY_STATES.search}
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {results.map((market) => (
            <button
              key={market.conditionId}
              onClick={() => onSelectMarket?.(market)}
              className={cn(
                'w-full text-left rounded-lg border border-zinc-800/50 p-3',
                'hover:bg-zinc-900/60 hover:border-zinc-700/50 transition-colors',
                'focus:outline-none focus:ring-1 focus:ring-zinc-700',
              )}
            >
              <div className="flex items-start gap-2">
                <BreathingDot
                  color={market.active ? 'bg-emerald-400' : 'bg-zinc-500'}
                  animate={market.active && market.acceptingOrders}
                  size="xs"
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-200 line-clamp-2">
                    {market.question}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <PriceBadge price={market.yesPrice} outcome="Yes" />
                    <PriceBadge price={market.noPrice} outcome="No" />
                    <span className={cn(
                      'text-[10px]',
                      marketStatusColor(market.active, market.closed),
                    )}>
                      {market.closed ? 'Closed' : market.acceptingOrders ? 'Active' : 'Paused'}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
