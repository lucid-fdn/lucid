import { getFeeds, getEconomySnapshot } from '@/lib/oracle/api'
import type { EconomySnapshot, Feed } from '@/lib/oracle/api'
import { FeedCard } from '@/components/oracle/feed-card'
import { ActivityPulse } from '@/components/oracle/activity-pulse'
import { UniverseHero } from '@/components/oracle/universe-hero'
import { formatUsd, formatCompact, formatScore } from '@/lib/oracle/format'

// ── Formatting helpers ──────────────────────────────────────

function fmtCompact(v: number | undefined | null): string {
  if (v == null) return '--'
  return formatCompact(v) || v.toLocaleString()
}

function fmtUsd(v: number | undefined | null): string {
  if (v == null) return '--'
  return formatUsd(v)
}

function fmtScore(v: number | undefined | null): string {
  return formatScore(v)
}

// ── Stat component ──────────────────────────────────────────

function TopStat({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string
  value: string
  subtitle?: string
  accent?: string
}) {
  return (
    <div className="px-4 py-2.5 min-w-0">
      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider truncate">
        {label}
      </div>
      <div className={`text-lg font-bold font-mono mt-0.5 ${accent ?? 'text-zinc-100'}`}>
        {value}
      </div>
      {subtitle && (
        <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{subtitle}</div>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────

export default async function OracleOverviewPage() {
  let feeds: Feed[] = []
  let economy: EconomySnapshot | null = null

  try {
    const [feedsResult, economyResult] = await Promise.all([
      getFeeds().catch(() => ({ feeds: [] as Feed[] })),
      getEconomySnapshot(),
    ])
    feeds = feedsResult.feeds
    economy = economyResult
  } catch (err) {
    console.error('[oracle] Failed to fetch data:', (err as Error).message)
  }

  return (
    <div>
      {/* Header with particle background */}
      <div className="relative mb-6 -mx-6 -mt-6 px-6 pt-6 pb-8 overflow-hidden" style={{ minHeight: '120px' }}>
        <UniverseHero />
        <div className="relative z-10">
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
            Agent Economy Oracle
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Real-time economic intelligence across the agent economy
          </p>
        </div>
      </div>

      {/* Top Stats Bar */}
      <div className="grid grid-cols-6 divide-x divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/80 mb-6">
        <TopStat
          label="Portfolio"
          value={fmtUsd(economy?.total_tvl_usd)}
          subtitle="Agent wallet balances"
          accent="text-emerald-400"
        />
        <TopStat
          label="24h Volume"
          value={fmtUsd(economy?.tx_volume_24h_usd)}
          subtitle={economy?.tx_count_24h ? `${fmtCompact(economy.tx_count_24h)} txns` : undefined}
          accent="text-blue-400"
        />
        <TopStat
          label="Total Agents"
          value={fmtCompact(economy?.total_agents)}
          subtitle="ERC-8004 registered"
        />
        <TopStat
          label="Active (24h)"
          value={fmtCompact(economy?.active_agents_24h)}
          subtitle={economy?.total_agents ? `${((economy.active_agents_24h / economy.total_agents) * 100).toFixed(1)}% of total` : undefined}
          accent="text-amber-400"
        />
        <TopStat
          label="New (7d)"
          value={fmtCompact(economy?.new_agents_7d)}
          subtitle="Registered this week"
        />
        <TopStat
          label="Avg Reputation"
          value={fmtScore(economy?.avg_reputation_score)}
          subtitle="Cross-protocol avg"
          accent={
            economy?.avg_reputation_score != null
              ? economy.avg_reputation_score >= 80
                ? 'text-emerald-400'
                : economy.avg_reputation_score >= 60
                  ? 'text-amber-400'
                  : 'text-red-400'
              : undefined
          }
        />
      </div>

      {/* Main content: Feeds + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Feed Cards -- 3 columns */}
        <div className="lg:col-span-3">
          <div className="grid gap-4 md:grid-cols-3">
            {feeds.map((feed) => (
              <FeedCard key={feed.id} feed={feed} />
            ))}
          </div>

          {feeds.length === 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center">
              <p className="text-sm text-zinc-500">
                Feed data unavailable -- Oracle API may be starting up
              </p>
            </div>
          )}

          {/* Info panels */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
              <h2 className="text-sm font-semibold text-zinc-100 mb-2">About the Oracle</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                The Agent Economy Oracle indexes activity across Lucid, Virtuals, Olas, ERC-8004,
                and on-chain wallets to compute verifiable economic indexes. All feeds are signed
                with Ed25519 attestations and published on Solana and Base.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
              <h2 className="text-sm font-semibold text-zinc-100 mb-2">Feed Definitions</h2>
              <dl className="space-y-2 text-xs">
                <div>
                  <dt className="font-medium text-emerald-400">AEGDP</dt>
                  <dd className="text-zinc-500">Total USD output across all indexed protocols</dd>
                </div>
                <div>
                  <dt className="font-medium text-blue-400">AAI</dt>
                  <dd className="text-zinc-500">Active agents, throughput, tool calls, model diversity [0-1000]</dd>
                </div>
                <div>
                  <dt className="font-medium text-amber-400">APRI</dt>
                  <dd className="text-zinc-500">HHI-based provider concentration index</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        {/* Right sidebar -- Activity Feed */}
        <div className="lg:col-span-1 space-y-4">
          <ActivityPulse />

          {/* Economy snapshot timestamp */}
          {economy?.snapshot_at && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Snapshot
              </h3>
              <div className="text-xs font-mono text-zinc-400">
                {new Date(economy.snapshot_at).toLocaleString()}
              </div>
              {economy.total_wallets != null && (
                <div className="mt-2 text-xs text-zinc-600">
                  {fmtCompact(economy.total_wallets)} wallets mapped
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
