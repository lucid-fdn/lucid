'use client'

import { useState, useMemo, useEffect } from 'react'
import { InfiniteList } from '@/components/ui/infinite-list'
import { LeaderboardTabs, type LeaderboardSort } from '@/components/oracle/leaderboard-tabs'
import type { AgentSearchResult } from '@/lib/oracle/api'
import { AnimatedCounter } from '@/components/oracle/animated-counter'
import { StatusIndicator } from '@/components/oracle/status-indicator'
import { ChainIcon, ChainBadge } from '@/components/oracle/chain-badge'
import Link from 'next/link'

// ─── Stats Bar ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  const numericValue = typeof value === 'string' ? parseInt(value, 10) : value
  const isNumeric = typeof numericValue === 'number' && !Number.isNaN(numericValue) && numericValue > 0

  return (
    <div className="px-4 py-2.5">
      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-bold font-mono mt-0.5 ${accent ?? 'text-zinc-100'}`}>
        {isNumeric ? (
          <AnimatedCounter value={numericValue} duration={800} className={accent ?? 'text-zinc-100'} />
        ) : (
          value ?? '--'
        )}
      </div>
      {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  )
}

function StatsBar() {
  const [s, setS] = useState<Record<string, string>>({})
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/oracle/stats', { signal: controller.signal })
      .then(r => r.json())
      .then(setS)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  return (
    <div className="grid grid-cols-6 divide-x divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/80 mb-4">
      <StatCard label="Total Agents" value={s.total_agents ?? '--'} sub="On-chain registered" accent="text-emerald-400" />
      <StatCard label="Identified" value={s.named_agents ?? '--'} sub="Name resolved" />
      <StatCard label="Active" value={s.active_agents ?? '--'} sub="Currently active" />
      <StatCard label="Wallets" value={s.total_wallets ?? '--'} sub="Mapped on-chain" />
      <StatCard label="Reputation" value={s.total_feedback ?? '--'} sub="On-chain signals" accent="text-amber-400" />
      <StatCard label="Transactions" value={s.total_transactions ?? '--'} sub="Token transfers" accent="text-blue-400" />
    </div>
  )
}

// ─── Formatting ─────────────────────────────────────────────────────────────

import { formatUsd, formatCompact, getReputationColor } from '@/lib/oracle/format'

// ─── Reputation Badge ────────────────────────────────────────────────────────

function ReputationBadge({ score, count }: { score: number | null; count: number }) {
  if (count === 0) return <span className="text-xs text-zinc-700">--</span>

  const pct = score != null ? Math.min(100, Math.max(0, score)) : null
  const repColor = pct != null ? getReputationColor(pct) : null
  const color = repColor?.text ?? 'text-zinc-400'
  const barColor = repColor?.bg ?? 'bg-zinc-700'

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        {pct != null && <span className={`text-xs font-bold font-mono ${color}`}>{pct.toFixed(0)}%</span>}
        <span className="text-[10px] text-zinc-600">{count}</span>
      </div>
      {pct != null && (
        <div className="w-full h-0.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

// ─── Status ──────────────────────────────────────────────────────────────────

// Green dot = had activity in last 7 days (based on tx_count_7d or feedback_count)
function StatusDot({ agent }: { agent: AgentSearchResult }) {
  const hasRecentActivity = (agent.tx_count_7d ?? 0) > 0 || (agent.feedback_count ?? 0) > 0
  return <StatusIndicator active={hasRecentActivity} variant="dot" />
}

// ─── Agent Row ───────────────────────────────────────────────────────────────

function AgentRow({
  agent,
  rank,
}: {
  agent: AgentSearchResult
  rank: number
}) {
  return (
    <Link href={`/oracle/agents/${agent.id}`} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors cursor-pointer">
        <span className="w-7 text-right text-xs font-mono text-zinc-600 shrink-0">{rank}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <StatusDot agent={agent} />
            {agent.display_name ? (
              <span className="font-medium text-zinc-200 truncate">{agent.display_name}</span>
            ) : (
              <span className="font-medium text-zinc-500 truncate">
                {agent.erc8004_id && agent.erc8004_id.length > 10
                  ? `Agent ${agent.erc8004_id.slice(0, 6)}...${agent.erc8004_id.slice(-4)}`
                  : `Agent #${agent.erc8004_id}`}
              </span>
            )}
            {agent.ecosystem && typeof agent.ecosystem === 'string' && agent.ecosystem.length < 20 && (
              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                {agent.ecosystem}
              </span>
            )}
          </div>
          {agent.description && (
            <p className="text-xs text-zinc-600 truncate mt-0.5 max-w-md">{agent.description}</p>
          )}
        </div>

        <div className="w-20 text-right shrink-0 flex items-center justify-end gap-1">
          <ChainIcon chain={(agent as any).primary_chain ?? 'base'} size={12} />
          <span className="text-xs font-mono text-zinc-600 truncate max-w-[50px]">
            {agent.erc8004_id && agent.erc8004_id.length > 8
              ? agent.erc8004_id.slice(0, 4) + '...'
              : `#${agent.erc8004_id}`}
          </span>
        </div>

        {/* Portfolio Value -- Phase B */}
        <div className="w-20 text-right shrink-0">
          <span className="text-xs font-mono text-emerald-400">
            {agent.portfolio_value_usd != null && agent.portfolio_value_usd > 0
              ? formatUsd(agent.portfolio_value_usd)
              : '--'}
          </span>
        </div>

        {/* Tx Count -- Phase B */}
        <div className="w-14 text-right shrink-0">
          <span className="text-xs font-mono text-blue-400">
            {agent.tx_count_24h != null && agent.tx_count_24h > 0
              ? formatCompact(agent.tx_count_24h)
              : '--'}
          </span>
          {agent.tx_count_7d != null && agent.tx_count_7d > 0 && (
            <div className="text-[10px] text-zinc-600 font-mono">
              {formatCompact(agent.tx_count_7d)} 7d
            </div>
          )}
        </div>

        <div className="w-12 text-right shrink-0">
          <span className="text-sm font-mono text-zinc-300">{agent.wallet_count ?? 0}</span>
        </div>

        <div className="w-12 text-right shrink-0">
          <span className="text-sm font-mono text-zinc-300">{agent.services_count ?? 0}</span>
        </div>

        <div className="w-20 shrink-0">
          <ReputationBadge score={agent.reputation_score} count={agent.feedback_count ?? 0} />
        </div>

        <div className="w-16 text-right text-xs text-zinc-600 shrink-0 font-mono">
          {new Date(agent.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
    </Link>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function AgentSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/50 animate-pulse">
      <div className="w-7 h-4 bg-zinc-800 rounded" />
      <div className="flex-1 space-y-1.5">
        <div className="w-40 h-4 bg-zinc-800 rounded" />
        <div className="w-64 h-3 bg-zinc-800/50 rounded" />
      </div>
      <div className="w-14 h-4 bg-zinc-800 rounded" />
      <div className="w-20 h-4 bg-zinc-800 rounded" />
      <div className="w-14 h-4 bg-zinc-800 rounded" />
      <div className="w-12 h-4 bg-zinc-800 rounded" />
      <div className="w-12 h-4 bg-zinc-800 rounded" />
      <div className="w-20 h-4 bg-zinc-800 rounded" />
      <div className="w-16 h-4 bg-zinc-800 rounded" />
    </div>
  )
}

// ─── Compare Bar ────────────────────────────────────────────────────────────

function CompareBar({ selectedIds, onClear }: { selectedIds: string[]; onClear: () => void }) {
  if (selectedIds.length < 2) return null

  const compareUrl = `/oracle/agents/compare?ids=${selectedIds.join(',')}`

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-lg border border-emerald-500/30 bg-zinc-900/95 shadow-xl shadow-black/50 backdrop-blur-sm">
      <span className="text-xs text-zinc-400">
        {selectedIds.length} agents selected
      </span>
      <Link
        href={compareUrl}
        className="px-4 py-1.5 text-xs font-medium rounded bg-emerald-500 text-white hover:bg-emerald-400 transition-colors"
      >
        Compare {selectedIds.length} agents
      </Link>
      <button
        type="button"
        onClick={onClear}
        className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        Clear
      </button>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

const CHAIN_FILTERS = [
  { value: '', label: 'All Chains' },
  { value: 'base', label: 'Base' },
  { value: 'eth', label: 'Ethereum' },
  { value: 'solana', label: 'Solana' },
  { value: 'bsc', label: 'BSC' },
  { value: 'poly', label: 'Polygon' },
  { value: 'monad', label: 'Monad' },
] as const

export function AgentsClient({ initialAgents }: { initialAgents: AgentSearchResult[] }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<LeaderboardSort>('smart')
  const [chain, setChain] = useState('')

  const filters = useMemo(() => {
    const f: Record<string, string> = { q: search.trim() || '*', sort }
    if (chain) f.chain = chain
    return f
  }, [search, sort, chain])
  const isDefaultView = sort === 'smart' && !search.trim() && !chain

  return (
    <div>
      <StatsBar />

      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">Agent Registry</h1>
          <p className="text-xs text-zinc-500">On-chain agent identity, wallets, services, reputation</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-52 px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700 font-mono"
          />
        </div>
      </div>

      {/* Chain filter + Leaderboard Tabs */}
      <div className="flex items-center justify-between mb-3">
        <LeaderboardTabs active={sort} onChange={setSort} />
        <div className="flex items-center gap-1">
          {CHAIN_FILTERS.map((cf) => (
            <button
              key={cf.value}
              onClick={() => setChain(cf.value)}
              className={`px-2 py-1 text-[10px] font-medium rounded-md border transition-colors inline-flex items-center gap-1 ${
                chain === cf.value
                  ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-400'
              }`}
            >
              {cf.value && <ChainIcon chain={cf.value} size={10} />}
              {cf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
        <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900/70 border-b border-zinc-800 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
          <span className="w-7 text-right">#</span>
          <span className="flex-1">Agent</span>
          <span className="w-14 text-right">ID</span>
          <span className="w-20 text-right">Portfolio</span>
          <span className="w-14 text-right">Txns</span>
          <span className="w-12 text-right">Wallets</span>
          <span className="w-12 text-right">Services</span>
          <span className="w-20 text-right">Reputation</span>
          <span className="w-16 text-right">Registered</span>
        </div>

        <InfiniteList<AgentSearchResult>
          key={`${sort}-${search}-${chain}`}
          endpoint="/api/oracle/agents"
          renderItem={(agent, index) => (
            <AgentRow agent={agent} rank={index + 1} />
          )}
          getItemKey={(agent) => agent.id}
          limit={50}
          filters={filters}
          initialData={isDefaultView ? initialAgents : undefined}
          layout="list"
          skeleton={<AgentSkeleton />}
          skeletonCount={12}
          emptyState={
            <div className="p-12 text-center">
              <p className="text-zinc-500 text-sm">No agents found</p>
              <p className="text-xs text-zinc-600 mt-1">Try a different search or tab</p>
            </div>
          }
        />
      </div>

      {/* Floating compare bar */}
    </div>
  )
}
