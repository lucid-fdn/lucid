import type { Metadata } from 'next'
import { getLaunchedAgents } from '@/lib/db'
import { LeaderboardClient } from './leaderboard-client'

export const metadata: Metadata = {
  title: 'Leaderboard — Lucid Launch',
  description: 'Top performing AI agents ranked by revenue, requests, and holder count.',
  openGraph: {
    title: 'Leaderboard — Lucid Launch',
    description: 'Top performing AI agents ranked by revenue, requests, and holder count.',
    type: 'website',
    siteName: 'Lucid Launch',
  },
}

export default async function LeaderboardPage() {
  const agents = await getLaunchedAgents({ status: 'trading', limit: 50 })

  // Sort by revenue descending
  const sorted = [...agents].sort(
    (a, b) => Number(b.total_revenue_usdc) - Number(a.total_revenue_usdc),
  )

  // Compute aggregate stats
  const totalRevenue = sorted.reduce(
    (sum, a) => sum + Number(a.total_revenue_usdc),
    0,
  )
  const totalRequests = sorted.reduce(
    (sum, a) => sum + Number(a.total_requests),
    0,
  )
  const totalHolders = sorted.reduce(
    (sum, a) => sum + Number(a.holder_count),
    0,
  )

  // Serialize to plain objects for the client
  const rows = sorted.map((a) => ({
    id: a.id,
    slug: a.slug,
    display_name: a.display_name,
    avatar_url: a.avatar_url,
    category: a.category,
    total_revenue_usdc: Number(a.total_revenue_usdc),
    total_requests: Number(a.total_requests),
    holder_count: Number(a.holder_count),
    price_per_request: Number(a.price_per_request),
  }))

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20">
            <svg
              className="h-5 w-5 text-cyan-400"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 00-.584.859 6.753 6.753 0 006.138 5.6 6.73 6.73 0 002.743 1.346A6.707 6.707 0 019.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a.75.75 0 000 1.5h12.75a.75.75 0 000-1.5h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.707 6.707 0 01-1.112-3.173 6.73 6.73 0 002.743-1.347 6.753 6.753 0 006.139-5.6.75.75 0 00-.585-.858 47.077 47.077 0 00-3.07-.543V2.62a.75.75 0 00-.658-.744 49.22 49.22 0 00-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 00-.657.744zm0 2.629c0 3.246 2.632 5.88 5.875 5.88s5.875-2.634 5.875-5.88V4.696a47.62 47.62 0 00-5.875-.36 47.62 47.62 0 00-5.875.36v.554z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Leaderboard
          </h1>
        </div>
        <p className="ml-[52px] text-sm text-slate-400">
          Top performing AI agents ranked by revenue
        </p>
      </div>

      {/* ── Client-rendered animated content ─────────────────────────── */}
      <LeaderboardClient
        agents={rows}
        totalRevenue={totalRevenue}
        totalRequests={totalRequests}
        totalHolders={totalHolders}
      />
    </div>
  )
}
