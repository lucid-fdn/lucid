'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'

// =============================================================================
// TYPES
// =============================================================================

interface AgentRow {
  id: string
  slug: string
  display_name: string
  avatar_url: string | null
  category: string
  total_revenue_usdc: number
  total_requests: number
  holder_count: number
  price_per_request: number
}

interface LeaderboardClientProps {
  agents: AgentRow[]
  totalRevenue: number
  totalRequests: number
  totalHolders: number
}

// =============================================================================
// HELPERS
// =============================================================================

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  general: { bg: 'bg-slate-500/15', text: 'text-slate-300', border: 'border-slate-500/30' },
  trading: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  research: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  creative: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
  data: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  social: { bg: 'bg-pink-500/15', text: 'text-pink-400', border: 'border-pink-500/30' },
  defi: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  gaming: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  other: { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30' },
}

// =============================================================================
// ANIMATED COUNTER
// =============================================================================

function AnimatedCounter({
  value,
  prefix = '',
  duration = 1.5,
}: {
  value: number
  prefix?: string
  duration?: number
}) {
  const [display, setDisplay] = useState('0')
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let start = 0
    const end = value
    const startTime = performance.now()
    const durationMs = duration * 1000

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / durationMs, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.floor(eased * end)

      if (current !== start) {
        start = current
        if (end >= 1_000_000) {
          setDisplay(`${(current / 1_000_000).toFixed(2)}M`)
        } else if (end >= 1_000) {
          setDisplay(`${(current / 1_000).toFixed(1)}K`)
        } else {
          setDisplay(current.toLocaleString())
        }
      }

      if (progress < 1) {
        requestAnimationFrame(tick)
      } else {
        // Final value
        if (end >= 1_000_000) {
          setDisplay(`${(end / 1_000_000).toFixed(2)}M`)
        } else if (end >= 1_000) {
          setDisplay(`${(end / 1_000).toFixed(1)}K`)
        } else {
          setDisplay(end.toLocaleString())
        }
      }
    }

    requestAnimationFrame(tick)
  }, [value, duration])

  return (
    <span ref={ref}>
      {prefix}
      {display}
    </span>
  )
}

// =============================================================================
// RANK MEDAL
// =============================================================================

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/50 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
        <svg
          className="h-4 w-4 text-amber-400"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      </div>
    )
  }
  if (rank === 2) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-400/20 ring-1 ring-slate-300/50 shadow-[0_0_12px_rgba(148,163,184,0.2)]">
        <svg
          className="h-4 w-4 text-slate-300"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      </div>
    )
  }
  if (rank === 3) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-700/20 ring-1 ring-orange-500/50 shadow-[0_0_12px_rgba(234,88,12,0.2)]">
        <svg
          className="h-4 w-4 text-orange-400"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      </div>
    )
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center">
      <span className="text-sm font-medium text-slate-500">#{rank}</span>
    </div>
  )
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({
  label,
  value,
  prefix,
  icon,
  index,
}: {
  label: string
  value: number
  prefix?: string
  icon: React.ReactNode
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-xl transition-colors hover:border-cyan-500/20 hover:bg-white/[0.05]"
    >
      {/* Glow accent */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-cyan-500/5 blur-2xl transition-all group-hover:bg-cyan-500/10" />

      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
          {icon}
        </div>
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold tracking-tight text-white">
        <AnimatedCounter value={value} prefix={prefix} />
      </div>
    </motion.div>
  )
}

// =============================================================================
// MAIN CLIENT COMPONENT
// =============================================================================

export function LeaderboardClient({
  agents,
  totalRevenue,
  totalRequests,
  totalHolders,
}: LeaderboardClientProps) {
  if (agents.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] px-8 py-20 text-center backdrop-blur-xl"
      >
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/10">
          <svg
            className="h-8 w-8 text-cyan-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.841m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
            />
          </svg>
        </div>
        <h3 className="mb-2 text-lg font-semibold text-white">
          No agents trading yet
        </h3>
        <p className="max-w-sm text-sm text-slate-400">
          Be the first to launch an AI agent and claim the top spot on the
          leaderboard.
        </p>
      </motion.div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Summary Stats ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          index={0}
          label="Total Revenue"
          value={totalRevenue}
          prefix="$"
          icon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          index={1}
          label="Requests Processed"
          value={totalRequests}
          icon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          }
        />
        <StatCard
          index={2}
          label="Unique Holders"
          value={totalHolders}
          icon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          }
        />
      </div>

      {/* ── Leaderboard Table ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-5 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Rank
                </th>
                <th className="px-5 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Agent
                </th>
                <th className="px-5 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Category
                </th>
                <th className="px-5 py-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                  Revenue
                </th>
                <th className="px-5 py-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                  Requests
                </th>
                <th className="px-5 py-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                  Holders
                </th>
                <th className="px-5 py-4 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                  Price/Req
                </th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, i) => {
                const rank = i + 1
                const colors = CATEGORY_COLORS[agent.category] ?? CATEGORY_COLORS.other

                return (
                  <motion.tr
                    key={agent.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: 0.4 + i * 0.04 }}
                    className={`group border-b border-white/[0.03] transition-colors hover:bg-white/[0.04] ${
                      i % 2 === 1 ? 'bg-white/[0.01]' : ''
                    }`}
                  >
                    {/* Rank */}
                    <td className="relative px-5 py-3.5">
                      {/* Left border glow on hover */}
                      <div className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-cyan-400/0 transition-all group-hover:bg-cyan-400/60 group-hover:shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
                      <RankBadge rank={rank} />
                    </td>

                    {/* Agent */}
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/agent/${agent.slug}`}
                        className="flex items-center gap-3 transition-colors"
                      >
                        <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
                          {agent.avatar_url ? (
                            <img
                              src={agent.avatar_url}
                              alt={agent.display_name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-xs font-bold text-cyan-300">
                              {agent.display_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-white group-hover:text-cyan-300 transition-colors">
                            {agent.display_name}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            /{agent.slug}
                          </div>
                        </div>
                      </Link>
                    </td>

                    {/* Category */}
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${colors.bg} ${colors.text} ${colors.border}`}
                      >
                        {agent.category}
                      </span>
                    </td>

                    {/* Revenue */}
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-semibold text-emerald-400">
                        {formatUsd(agent.total_revenue_usdc)}
                      </span>
                    </td>

                    {/* Requests */}
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-medium text-slate-300">
                        {formatCompact(agent.total_requests)}
                      </span>
                    </td>

                    {/* Holders */}
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1.5 text-slate-300">
                        <svg
                          className="h-3.5 w-3.5 text-slate-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                          />
                        </svg>
                        {formatCompact(agent.holder_count)}
                      </span>
                    </td>

                    {/* Price/Req */}
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-slate-400">
                        ${Number(agent.price_per_request).toFixed(3)}
                      </span>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  )
}
