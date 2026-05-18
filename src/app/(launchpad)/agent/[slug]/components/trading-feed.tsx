'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TradeEvent {
  id: string
  type: 'buy' | 'sell'
  wallet: string
  amount_tokens: number
  amount_usdc: number
  price: number
  timestamp: string
  tx_signature?: string
}

// ---------------------------------------------------------------------------
// Trading Activity Feed
// ---------------------------------------------------------------------------

export function TradingFeed({ slug }: { slug: string }) {
  const [trades, setTrades] = useState<TradeEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all')

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch(`/api/launchpad/agents/${slug}/trades`)
      if (res.ok) {
        const data = await res.json()
        setTrades(data.trades ?? [])
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchTrades()
    // Poll every 15s for new trades
    const interval = setInterval(fetchTrades, 15000)
    return () => clearInterval(interval)
  }, [fetchTrades])

  const filteredTrades = filter === 'all' ? trades : trades.filter(t => t.type === filter)

  const truncateAddr = (addr: string) =>
    addr.length > 10 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const formatCompact = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return n.toLocaleString()
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.04] px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          Trading Activity
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        </h3>

        {/* Filter pills */}
        <div className="flex items-center gap-1">
          {(['all', 'buy', 'sell'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-all ${
                filter === f
                  ? f === 'buy'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : f === 'sell'
                      ? 'bg-red-500/15 text-red-400'
                      : 'bg-cyan-500/15 text-cyan-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Trade list */}
      <div className="max-h-[360px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="h-5 w-5 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : filteredTrades.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <svg className="mx-auto h-8 w-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-2 text-sm text-slate-500">No trades yet</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredTrades.map((trade, i) => (
              <motion.div
                key={trade.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
                className="flex items-center justify-between border-b border-white/[0.03] px-5 py-2.5 transition-colors last:border-b-0 hover:bg-white/[0.02]"
              >
                {/* Left: type + wallet */}
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                      trade.type === 'buy'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-red-500/15 text-red-400'
                    }`}
                  >
                    {trade.type === 'buy' ? (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25" />
                      </svg>
                    )}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-white">
                      <span className={trade.type === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                        {trade.type === 'buy' ? 'Buy' : 'Sell'}
                      </span>
                      {' '}
                      <span className="text-slate-400">{formatCompact(trade.amount_tokens)} tokens</span>
                    </p>
                    <p className="font-mono text-[10px] text-slate-600">
                      {truncateAddr(trade.wallet)}
                    </p>
                  </div>
                </div>

                {/* Right: amount + time */}
                <div className="text-right">
                  <p className="text-xs font-semibold tabular-nums text-white">
                    ${trade.amount_usdc.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-slate-600">
                    {timeAgo(trade.timestamp)}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
