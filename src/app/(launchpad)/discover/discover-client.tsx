'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'motion/react'
import type { LaunchedAgent } from '@contracts/launchpad'
import { CATEGORIES, CATEGORY_COLORS, SORT_OPTIONS, type SortKey } from '@/lib/launchpad/constants'
import { formatCompact as formatCompactUtil } from '@/lib/launchpad/format'

// ---------------------------------------------------------------------------
// Particle field background
// ---------------------------------------------------------------------------

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let particles: {
      x: number
      y: number
      vx: number
      vy: number
      size: number
      opacity: number
    }[] = []

    function resize() {
      if (!canvas) return
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      ctx!.scale(window.devicePixelRatio, window.devicePixelRatio)
    }

    function initParticles() {
      if (!canvas) return
      particles = Array.from({ length: 60 }, () => ({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
      }))
    }

    function animate() {
      if (!canvas || !ctx) return
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0) p.x = canvas.offsetWidth
        if (p.x > canvas.offsetWidth) p.x = 0
        if (p.y < 0) p.y = canvas.offsetHeight
        if (p.y > canvas.offsetHeight) p.y = 0

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(103, 232, 249, ${p.opacity})`
        ctx.fill()
      }

      animationId = requestAnimationFrame(animate)
    }

    resize()
    initParticles()
    animate()

    window.addEventListener('resize', () => {
      resize()
      initParticles()
    })

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  )
}

// ---------------------------------------------------------------------------
// Search icon SVG
// ---------------------------------------------------------------------------

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Agent Card
// ---------------------------------------------------------------------------

function AgentCard({
  agent,
  index,
}: {
  agent: LaunchedAgent
  index: number
}) {
  const colors = CATEGORY_COLORS[agent.category] ?? CATEGORY_COLORS.general
  const categoryColor = colors.badge

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.06,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      <Link
        href={`/agent/${agent.slug}`}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-xl transition-all duration-240 hover:-translate-y-1 hover:border-cyan-400/30 hover:bg-white/[0.06] hover:shadow-[0_0_30px_-5px_rgba(103,232,249,0.15)]"
      >
        {/* Gradient border glow on hover */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-240 group-hover:opacity-100">
          <div className="absolute inset-[-1px] rounded-2xl bg-gradient-to-br from-cyan-400/20 via-transparent to-teal-400/10" />
        </div>

        {/* Top row: category badge + status */}
        <div className="relative flex items-center justify-between">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${categoryColor}`}
          >
            {agent.category}
          </span>
          {agent.status === 'trading' && (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live
            </span>
          )}
        </div>

        {/* Avatar + name */}
        <div className="relative mt-4 flex items-center gap-3">
          <div className="relative">
            {/* Glow ring */}
            <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-cyan-400/30 to-teal-500/20 opacity-0 blur-sm transition-opacity duration-240 group-hover:opacity-100" />
            {agent.avatar_url ? (
              <img
                src={agent.avatar_url}
                alt={agent.display_name}
                className="relative h-11 w-11 rounded-full border border-white/10 object-cover"
              />
            ) : (
              <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-cyan-500/20 to-teal-600/20 text-sm font-bold text-cyan-300">
                {agent.display_name[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold text-white transition-colors duration-200 group-hover:text-cyan-300">
              {agent.display_name}
            </h3>
            {agent.token_mint && (
              <span className="text-xs text-white/30 font-mono">
                {agent.token_mint.slice(0, 4)}...{agent.token_mint.slice(-4)}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {agent.description && (
          <p className="relative mt-3 line-clamp-2 text-sm leading-relaxed text-white/50">
            {agent.description}
          </p>
        )}

        {/* Stats row */}
        <div className="relative mt-auto flex items-center gap-1 pt-4">
          <StatPill
            label="Price/req"
            value={`$${Number(agent.price_per_request).toFixed(3)}`}
          />
          <StatPill
            label="Revenue"
            value={`$${formatCompact(Number(agent.total_revenue_usdc))}`}
          />
          <StatPill
            label="Holders"
            value={agent.holder_count.toLocaleString()}
          />
        </div>

        {/* View agent link */}
        <div className="relative mt-4 flex items-center text-sm font-medium text-cyan-400 opacity-0 transition-all duration-200 group-hover:opacity-100">
          <span>View Agent</span>
          <svg
            className="ml-1 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </div>
      </Link>
    </motion.div>
  )
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-lg bg-white/[0.04] px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-white/30">
        {label}
      </span>
      <span className="text-xs font-semibold text-white/80">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="relative mx-auto mt-16 flex max-w-lg flex-col items-center rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center backdrop-blur-xl"
    >
      {/* Animated gradient orb */}
      <div className="absolute -top-20 left-1/2 h-40 w-40 -translate-x-1/2">
        <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-br from-cyan-500/20 to-teal-500/10 blur-3xl" />
        <div
          className="absolute inset-4 rounded-full bg-gradient-to-br from-cyan-400/15 to-purple-500/10 blur-2xl"
          style={{ animation: 'pulse 3s ease-in-out infinite' }}
        />
      </div>

      {/* Icon */}
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
        <svg
          className="h-10 w-10 text-cyan-400/60"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2v4" />
          <path d="m16.2 7.8 2.9-2.9" />
          <path d="M18 12h4" />
          <path d="m16.2 16.2 2.9 2.9" />
          <path d="M12 18v4" />
          <path d="m4.9 19.1 2.9-2.9" />
          <path d="M2 12h4" />
          <path d="m4.9 4.9 2.9 2.9" />
        </svg>
      </div>

      <h3 className="relative text-xl font-semibold text-white">
        No agents found
      </h3>
      <p className="relative mt-2 text-sm text-white/40">
        Be the first to launch an AI agent on the platform and start earning
        from usage.
      </p>

      <Link
        href="/launch"
        className="relative mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all duration-200 hover:shadow-cyan-500/30 hover:brightness-110"
      >
        <svg
          className="h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
        Launch an Agent
      </Link>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCompact = formatCompactUtil

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

interface DiscoverClientProps {
  agents: LaunchedAgent[]
}

export function DiscoverClient({ agents }: DiscoverClientProps) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('revenue')

  const filteredAgents = useMemo(() => {
    let result = agents

    if (activeCategory !== 'all') {
      result = result.filter((a) => a.category === activeCategory)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (a) =>
          a.display_name.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q)
      )
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'revenue':
          return Number(b.total_revenue_usdc) - Number(a.total_revenue_usdc)
        case 'holders':
          return b.holder_count - a.holder_count
        case 'newest':
          return new Date(b.launched_at ?? b.created_at).getTime() - new Date(a.launched_at ?? a.created_at).getTime()
        case 'price':
          return Number(b.price_per_request) - Number(a.price_per_request)
        case 'requests':
          return b.total_requests - a.total_requests
        default:
          return 0
      }
    })

    return result
  }, [agents, activeCategory, searchQuery, sortBy])

  return (
    <div className="relative min-h-[80vh]">
      {/* ---- Hero Section ---- */}
      <div className="relative mb-12 overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent px-6 py-16 sm:px-12">
        <ParticleField />

        {/* Decorative gradients */}
        <div className="pointer-events-none absolute -left-32 -top-32 h-64 w-64 rounded-full bg-cyan-500/10 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-48 w-48 rounded-full bg-teal-500/8 blur-[80px]" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative z-10 max-w-2xl"
        >
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-cyan-300 via-cyan-200 to-white bg-clip-text text-transparent">
              Discover AI Agents
            </span>
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-white/50">
            Explore tokenized AI agents, invest in their success, and earn
            revenue share from real usage. The future of AI is
            community-powered.
          </p>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10 mt-8 flex flex-wrap gap-8"
        >
          <div>
            <span className="text-2xl font-bold text-white">
              {agents.length}
            </span>
            <span className="ml-2 text-sm text-white/40">Live Agents</span>
          </div>
          <div>
            <span className="text-2xl font-bold text-white">
              $
              {formatCompact(
                agents.reduce((s, a) => s + Number(a.total_revenue_usdc), 0)
              )}
            </span>
            <span className="ml-2 text-sm text-white/40">Total Revenue</span>
          </div>
          <div>
            <span className="text-2xl font-bold text-white">
              {agents
                .reduce((s, a) => s + a.holder_count, 0)
                .toLocaleString()}
            </span>
            <span className="ml-2 text-sm text-white/40">Token Holders</span>
          </div>
        </motion.div>
      </div>

      {/* ---- Filter bar + Search ---- */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        {/* Category pills */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`relative shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-white shadow-[0_0_20px_-4px_rgba(103,232,249,0.4)]'
                    : 'text-white/50 hover:bg-white/[0.06] hover:text-white/70'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeCategoryPill"
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500/80 to-teal-500/80"
                    transition={{
                      type: 'spring',
                      bounce: 0.15,
                      duration: 0.5,
                    }}
                  />
                )}
                <span className="relative z-10">{cat.label}</span>
              </button>
            )
          })}
        </div>

        {/* Search + Sort */}
        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="h-[38px] rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white/70 outline-none transition-all focus:border-cyan-400/40"
            style={{ colorScheme: 'dark' }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Search input */}
          <div className="relative w-full sm:w-64">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2 pl-10 pr-4 text-sm text-white placeholder-white/30 backdrop-blur-xl outline-none transition-all duration-200 focus:border-cyan-400/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-cyan-400/20"
            />
          </div>
        </div>
      </motion.div>

      {/* ---- Agent grid or empty state ---- */}
      <AnimatePresence mode="wait">
        {filteredAgents.length === 0 ? (
          <EmptyState key="empty" />
        ) : (
          <motion.div
            key={`grid-${activeCategory}-${searchQuery}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {filteredAgents.map((agent, i) => (
              <AgentCard key={agent.id} agent={agent} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
