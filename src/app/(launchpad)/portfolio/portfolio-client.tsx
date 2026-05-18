'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { AnimatedNumber } from '@/components/motion-primitives/animated-number'
import type { LaunchedAgent } from '../../../../contracts/launchpad'

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; dot: string; bg: string; text: string }
> = {
  draft: {
    label: 'Draft',
    dot: 'bg-gray-400',
    bg: 'bg-gray-500/10 border-gray-500/20',
    text: 'text-gray-400',
  },
  launching: {
    label: 'Launching',
    dot: 'bg-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
    text: 'text-yellow-400',
  },
  trading: {
    label: 'Trading',
    dot: 'bg-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    text: 'text-emerald-400',
  },
  sunset: {
    label: 'Sunset',
    dot: 'bg-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
    text: 'text-orange-400',
  },
  archived: {
    label: 'Archived',
    dot: 'bg-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
    text: 'text-red-400',
  },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
      {category}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Icons (inline SVG to avoid extra deps)
// ---------------------------------------------------------------------------

function IconRocket({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  )
}

function IconDollar({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconActivity({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

function IconExternalLink({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

function SummaryCard({
  icon,
  label,
  value,
  prefix,
  index,
}: {
  icon: React.ReactNode
  label: string
  value: number
  prefix?: string
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: 'easeOut' }}
      className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-xl transition-colors duration-200 hover:border-cyan-500/20 hover:bg-white/[0.05]"
    >
      {/* Glow accent */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-cyan-500/5 blur-2xl transition-opacity duration-300 group-hover:bg-cyan-500/10" />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            {label}
          </p>
          <div className="mt-2 flex items-baseline gap-1">
            {prefix && (
              <span className="text-lg font-semibold text-cyan-400">
                {prefix}
              </span>
            )}
            <AnimatedNumber
              value={value}
              className="text-2xl font-bold text-white"
              springOptions={{ bounce: 0, duration: 800 }}
            />
          </div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.04]">
          {icon}
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Agent row card
// ---------------------------------------------------------------------------

function AgentCard({
  agent,
  index,
}: {
  agent: LaunchedAgent
  index: number
}) {
  const revenue = Number(agent.total_revenue_usdc)
  const initial = agent.display_name?.[0]?.toUpperCase() ?? '?'

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: 0.15 + index * 0.06, ease: 'easeOut' }}
    >
      <Link
        href={`/agent/${agent.slug}`}
        className="group relative flex items-center gap-5 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-4 backdrop-blur-xl transition-all duration-200 hover:translate-y-[-1px] hover:border-cyan-500/25 hover:bg-white/[0.05] hover:shadow-[0_0_30px_-8px_rgba(6,182,212,0.12)]"
      >
        {/* Left: Avatar + Name + Badges */}
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {/* Avatar */}
          {agent.avatar_url ? (
            <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg border border-white/[0.08]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={agent.avatar_url}
                alt={agent.display_name}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-sm font-bold text-cyan-400">
              {initial}
            </div>
          )}

          {/* Name + badges */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-white">
                {agent.display_name}
              </h3>
              <CategoryBadge category={agent.category} />
              <StatusBadge status={agent.status} />
            </div>
            {agent.description && (
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {agent.description}
              </p>
            )}
          </div>
        </div>

        {/* Center: Metrics */}
        <div className="hidden items-center gap-8 md:flex">
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Revenue
            </p>
            <p className="text-sm font-semibold text-white">
              <span className="text-cyan-400">$</span>
              {revenue.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Requests
            </p>
            <p className="text-sm font-semibold text-white">
              {agent.total_requests.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Holders
            </p>
            <p className="text-sm font-semibold text-white">
              {agent.holder_count.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Right: Action */}
        <div className="flex flex-shrink-0 items-center gap-2 pl-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.04] text-gray-500 transition-colors duration-150 group-hover:border-cyan-500/20 group-hover:text-cyan-400">
            <IconExternalLink className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-20 text-center backdrop-blur-xl"
    >
      {/* Animated gradient bg */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute left-1/2 top-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-cyan-500/5 via-blue-500/5 to-purple-500/5 blur-3xl"
          animate={{
            scale: [1, 1.15, 1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="relative">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.04]">
          <IconRocket className="h-8 w-8 text-gray-600" />
        </div>

        <h3 className="text-lg font-semibold text-white">
          You haven&apos;t launched any agents yet
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
          Launch your first AI agent on the launchpad, set pricing, and start
          earning revenue from every request.
        </p>

        <Link
          href="/launch"
          className="group/btn mt-8 inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 px-6 py-3 text-sm font-semibold text-cyan-400 backdrop-blur-sm transition-all duration-200 hover:border-cyan-400/50 hover:from-cyan-500/30 hover:to-blue-500/30 hover:shadow-[0_0_30px_-6px_rgba(6,182,212,0.3)]"
        >
          Launch Your First Agent
          <IconArrowRight className="h-4 w-4 transition-transform duration-150 group-hover/btn:translate-x-0.5" />
        </Link>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

type PortfolioTab = 'created' | 'holdings'

export function PortfolioClient({
  agents,
  allAgents = [],
}: {
  agents: LaunchedAgent[]
  allAgents?: LaunchedAgent[]
}) {
  const [activeTab, setActiveTab] = useState<PortfolioTab>('created')

  if (agents.length === 0 && activeTab === 'created') {
    return (
      <div className="space-y-8">
        {/* Tab switcher */}
        <PortfolioTabs activeTab={activeTab} onTabChange={setActiveTab} createdCount={agents.length} />
        {activeTab === 'created' ? <EmptyState /> : <HoldingsTab agents={allAgents} />}
      </div>
    )
  }

  const displayAgents = activeTab === 'created' ? agents : allAgents
  const totalRevenue = agents.reduce(
    (sum, a) => sum + Number(a.total_revenue_usdc),
    0,
  )
  const totalHolders = agents.reduce((sum, a) => sum + a.holder_count, 0)
  const totalRequests = agents.reduce((sum, a) => sum + a.total_requests, 0)

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          index={0}
          icon={<IconRocket className="h-5 w-5 text-cyan-400" />}
          label="Agents Launched"
          value={agents.length}
        />
        <SummaryCard
          index={1}
          icon={<IconDollar className="h-5 w-5 text-cyan-400" />}
          label="Combined Revenue"
          value={Math.round(totalRevenue)}
          prefix="$"
        />
        <SummaryCard
          index={2}
          icon={<IconUsers className="h-5 w-5 text-cyan-400" />}
          label="Total Holders"
          value={totalHolders}
        />
        <SummaryCard
          index={3}
          icon={<IconActivity className="h-5 w-5 text-cyan-400" />}
          label="Total Requests"
          value={totalRequests}
        />
      </div>

      {/* Tab switcher */}
      <PortfolioTabs activeTab={activeTab} onTabChange={setActiveTab} createdCount={agents.length} />

      {/* Agent list */}
      {activeTab === 'created' ? (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500">
              Your Agents
            </h2>
            <Link
              href="/launch"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors duration-150 hover:border-cyan-500/20 hover:text-cyan-400"
            >
              <span className="text-base leading-none">+</span>
              New Agent
            </Link>
          </div>

          <div className="space-y-3">
            {agents.map((agent, i) => (
              <AgentCard key={agent.id} agent={agent} index={i} />
            ))}
          </div>
        </div>
      ) : (
        <HoldingsTab agents={allAgents} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Portfolio tabs
// ---------------------------------------------------------------------------

function PortfolioTabs({
  activeTab,
  onTabChange,
  createdCount,
}: {
  activeTab: PortfolioTab
  onTabChange: (tab: PortfolioTab) => void
  createdCount: number
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
      <button
        onClick={() => onTabChange('created')}
        className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
          activeTab === 'created'
            ? 'bg-cyan-500/15 text-cyan-400 shadow-sm'
            : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        Created ({createdCount})
      </button>
      <button
        onClick={() => onTabChange('holdings')}
        className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
          activeTab === 'holdings'
            ? 'bg-cyan-500/15 text-cyan-400 shadow-sm'
            : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        Token Holdings
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Holdings tab — connect wallet to view tokens held
// ---------------------------------------------------------------------------

function HoldingsTab({ agents }: { agents: LaunchedAgent[] }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500">
          Token Holdings
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Connect your Solana wallet to see which agent tokens you hold. Browse all agents below.
        </p>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center">
          <p className="text-sm text-slate-500">No trading agents available yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent, i) => (
            <AgentCard key={agent.id} agent={agent} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
