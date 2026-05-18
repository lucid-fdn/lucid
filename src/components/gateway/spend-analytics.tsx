'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  DollarSign,
  TrendingUp,
  Key,
  BarChart3,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModelSpend {
  model: string
  spend: number
  tokens: number
}

interface KeySpendData {
  keyId: string
  keyAlias: string
  keyPreview: string
  totalSpend: number
  maxBudget: number | null
  budgetDuration: string | null
  rpmLimit: number | null
  tpmLimit: number | null
  models: string[]
  isActive: boolean
  createdAt: string
  modelSpend: ModelSpend[]
}

interface SpendSummary {
  totalSpend: number
  totalBudget: number
  activeKeys: number
  totalKeys: number
  topModels: ModelSpend[]
}

interface SpendResponse {
  keys: KeySpendData[]
  summary: SpendSummary
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount)
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return tokens.toString()
}

function BudgetBar({ spend, budget }: { spend: number; budget: number | null }) {
  if (!budget || budget === 0) {
    return <span className="text-xs text-muted-foreground">No budget set</span>
  }
  const pct = Math.min((spend / budget) * 100, 100)
  const isWarning = pct >= 75
  const isCritical = pct >= 90

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {formatCurrency(spend)} / {formatCurrency(budget)}
        </span>
        <span
          className={cn(
            'font-medium',
            isCritical ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-emerald-500'
          )}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function SpendAnalytics({ orgId }: { orgId: string }) {
  const [data, setData] = useState<SpendResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSpend = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/lucidgateway-keys/spend`)
      if (!res.ok) throw new Error('Failed to fetch spend data')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchSpend()
  }, [fetchSpend])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{error}</span>
        <button
          onClick={fetchSpend}
          className="ml-auto text-xs underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const { summary, keys } = data

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            Total Spend
          </div>
          <p className="mt-1 text-2xl font-semibold">
            {formatCurrency(summary.totalSpend)}
          </p>
          {summary.totalBudget > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              of {formatCurrency(summary.totalBudget)} total budget
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Key className="h-4 w-4" />
            Active Keys
          </div>
          <p className="mt-1 text-2xl font-semibold">
            {summary.activeKeys}
            <span className="text-sm font-normal text-muted-foreground">
              {' '}
              / {summary.totalKeys}
            </span>
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            Top Model
          </div>
          <p className="mt-1 truncate text-lg font-semibold">
            {summary.topModels[0]?.model || 'None'}
          </p>
          {summary.topModels[0] && (
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary.topModels[0].spend)} ·{' '}
              {formatTokens(summary.topModels[0].tokens)} tokens
            </p>
          )}
        </div>
      </div>

      {/* Per-Key Spend Table */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BarChart3 className="h-4 w-4" />
            Spend by Key
          </div>
          <button
            onClick={fetchSpend}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>

        {keys.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No keys found. Create a key to start tracking spend.
          </div>
        ) : (
          <div className="divide-y">
            {keys.map((key) => (
              <div key={key.keyId} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {key.keyAlias}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {key.keyPreview}
                      </span>
                      {!key.isActive && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5">
                      <BudgetBar spend={key.totalSpend} budget={key.maxBudget} />
                    </div>
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <p className="text-lg font-semibold">
                      {formatCurrency(key.totalSpend)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {key.models.length} model{key.models.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Model breakdown (expandable later, show top 3 inline) */}
                {key.modelSpend.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {key.modelSpend.slice(0, 3).map((ms) => (
                      <span
                        key={ms.model}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px]"
                      >
                        <span className="truncate" style={{ maxWidth: 120 }}>
                          {ms.model}
                        </span>
                        <span className="text-muted-foreground">
                          {formatCurrency(ms.spend)}
                        </span>
                      </span>
                    ))}
                    {key.modelSpend.length > 3 && (
                      <span className="text-[11px] text-muted-foreground">
                        +{key.modelSpend.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Models Breakdown */}
      {summary.topModels.length > 0 && (
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3 text-sm font-medium">
            Top Models by Spend
          </div>
          <div className="divide-y">
            {summary.topModels.map((model, i) => (
              <div key={model.model} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-5 text-center text-xs font-medium text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {model.model}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTokens(model.tokens)} tokens
                </span>
                <span className="w-20 text-right text-sm font-medium">
                  {formatCurrency(model.spend)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}