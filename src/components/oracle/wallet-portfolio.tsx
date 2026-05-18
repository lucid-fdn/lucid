'use client'

import { formatUsd } from '@/lib/oracle/format'

interface TokenBalance {
  token: string
  symbol: string
  balance: number
  usd_value: number
}

interface WalletPortfolioProps {
  balances: TokenBalance[]
  totalValue: number
}

function formatBalance(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  if (value < 0.01 && value > 0) return value.toExponential(2)
  return value.toFixed(4)
}

/**
 * Token balance portfolio table for agent detail page.
 * Shows token balances per agent with USD values and portfolio %.
 */
export function WalletPortfolio({ balances, totalValue }: WalletPortfolioProps) {
  if (!balances || balances.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Portfolio
        </h3>
        <p className="text-xs text-zinc-600">No balance data yet</p>
      </div>
    )
  }

  const sorted = [...balances].sort((a, b) => b.usd_value - a.usd_value)

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Portfolio
        </h3>
        <span className="text-sm font-bold font-mono text-zinc-100">
          {formatUsd(totalValue)}
        </span>
      </div>

      <div className="overflow-hidden rounded border border-zinc-800">
        {/* Header */}
        <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900/70 border-b border-zinc-800 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
          <span className="flex-1">Token</span>
          <span className="w-24 text-right">Balance</span>
          <span className="w-20 text-right">USD Value</span>
          <span className="w-16 text-right">%</span>
        </div>

        {/* Rows */}
        {sorted.map((token) => {
          const pct = totalValue > 0 ? (token.usd_value / totalValue) * 100 : 0
          return (
            <div
              key={token.token}
              className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-zinc-300">
                  {token.symbol}
                </span>
                <span className="text-[10px] text-zinc-600 ml-1.5 truncate">
                  {token.token.length > 12
                    ? `${token.token.slice(0, 6)}...${token.token.slice(-4)}`
                    : token.token}
                </span>
              </div>
              <span className="w-24 text-right text-xs font-mono text-zinc-400">
                {formatBalance(token.balance)}
              </span>
              <span className="w-20 text-right text-xs font-mono text-zinc-200">
                {formatUsd(token.usd_value)}
              </span>
              <div className="w-16 flex items-center justify-end gap-1">
                <div className="w-8 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/60 rounded-full"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-zinc-500">
                  {pct.toFixed(1)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
