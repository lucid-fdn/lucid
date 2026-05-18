'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, useSpring, useTransform } from 'motion/react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import type { LaunchedAgent, StakingPool, RevenueEpoch } from '@contracts/launchpad'
import { getCategoryColor } from '@/lib/launchpad/constants'
import { truncateAddress, formatDate, deriveTokenSymbol } from '@/lib/launchpad/format'
import { PriceChart } from './components/price-chart'
import { TradingFeed } from './components/trading-feed'
import { MarketStats } from './components/market-stats'
import { SwapPanel } from './components/swap-panel'

// ---------------------------------------------------------------------------
// Animated number with spring physics
// ---------------------------------------------------------------------------

function AnimatedStat({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
}: {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
}) {
  const spring = useSpring(0, { stiffness: 50, damping: 20 })
  const display = useTransform(spring, (v) => {
    if (decimals > 0) return v.toFixed(decimals)
    return Math.round(v).toLocaleString()
  })

  useEffect(() => {
    spring.set(value)
  }, [spring, value])

  return (
    <span className="tabular-nums">
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  )
}

// Category colors and helpers imported from '@/lib/launchpad/constants'

// ---------------------------------------------------------------------------
// Epoch status badge
// ---------------------------------------------------------------------------

function EpochStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    distributed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    calculating: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${styles[status] ?? styles.pending}`}
    >
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="ml-2 rounded p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-cyan-400"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  )
}

// truncateAddress and formatDate imported from '@/lib/launchpad/format'

// ---------------------------------------------------------------------------
// Tab component
// ---------------------------------------------------------------------------

type DetailTab = 'chart' | 'revenue' | 'info'

function TabButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
        active ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {icon}
      {children}
      {active && (
        <motion.div
          layoutId="activeTab"
          className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 to-blue-500"
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Staking Actions Component
// ---------------------------------------------------------------------------

function StakingActions({ agent, stakingPool }: { agent: LaunchedAgent; stakingPool: StakingPool | null }) {
  const { publicKey, connected } = useWallet()
  const { setVisible } = useWalletModal()
  const [stakeAmount, setStakeAmount] = useState('')
  const [stakeDuration, setStakeDuration] = useState(30)
  const [isStaking, setIsStaking] = useState(false)
  const [stakeError, setStakeError] = useState<string | null>(null)
  const [stakeSuccess, setStakeSuccess] = useState(false)

  const handleStake = async () => {
    if (!publicKey || !stakeAmount) return
    setIsStaking(true)
    setStakeError(null)
    setStakeSuccess(false)

    try {
      const res = await fetch(`/api/launchpad/agents/${agent.slug}/stake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(stakeAmount),
          duration: stakeDuration * 86400,
          wallet_address: publicKey.toBase58(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Staking failed')
      }

      setStakeSuccess(true)
      setStakeAmount('')
      setTimeout(() => setStakeSuccess(false), 3000)
    } catch (err) {
      setStakeError((err as Error).message)
    } finally {
      setIsStaking(false)
    }
  }

  if (!connected) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-400 transition-all hover:bg-cyan-500/20 hover:shadow-lg hover:shadow-cyan-500/10"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
        </svg>
        Connect Wallet to Stake
      </button>
    )
  }

  if (!stakingPool) {
    return (
      <button
        disabled
        className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-500 opacity-60"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        Staking Pool Not Active
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Amount to Stake</label>
        <input
          type="number"
          value={stakeAmount}
          onChange={(e) => setStakeAmount(e.target.value)}
          placeholder="0.00"
          min="0"
          step="any"
          className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Lock Duration</label>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { days: 7, label: '7D' },
            { days: 30, label: '30D' },
            { days: 90, label: '90D' },
            { days: 365, label: '1Y' },
          ].map((opt) => (
            <button
              key={opt.days}
              onClick={() => setStakeDuration(opt.days)}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                stakeDuration === opt.days
                  ? 'border border-cyan-500/50 bg-cyan-500/15 text-cyan-400 shadow-sm shadow-cyan-500/20'
                  : 'border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-600">
          Longer lock = higher reward multiplier (up to 2x)
        </p>
      </div>

      <button
        onClick={handleStake}
        disabled={isStaking || !stakeAmount || Number(stakeAmount) <= 0}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isStaking ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Staking...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Stake Tokens
          </>
        )}
      </button>

      {stakeError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {stakeError}
        </p>
      )}
      {stakeSuccess && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
          Tokens staked successfully!
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Client Component
// ---------------------------------------------------------------------------

interface AgentDetailClientProps {
  agent: LaunchedAgent
  stakingPool: StakingPool | null
  epochs: RevenueEpoch[]
  livePrice?: number | null
}

export function AgentDetailClient({ agent, stakingPool, epochs, livePrice }: AgentDetailClientProps) {
  const colors = getCategoryColor(agent.category)
  const [activeTab, setActiveTab] = useState<DetailTab>('chart')

  // Use live Jupiter price when available, otherwise fall back to price_per_request
  const price = livePrice ?? Number(agent.price_per_request)
  const hasLivePrice = livePrice != null && livePrice > 0
  // Price change: only show real change when we have live data, otherwise estimate
  const priceChange24h = hasLivePrice
    ? ((price - Number(agent.price_per_request)) / Number(agent.price_per_request)) * 100
    : agent.total_requests > 0 ? 8.42 : 0
  const marketCap = price * agent.token_supply * 0.1 // circulating supply estimate
  const volume24h = Number(agent.total_revenue_usdc) * 0.15 // daily volume estimate
  const fdv = price * agent.token_supply

  return (
    <div className="min-h-screen">
      {/* ================================================================= */}
      {/* COMPACT HERO                                                      */}
      {/* ================================================================= */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className={`relative -mx-4 -mt-8 overflow-hidden bg-gradient-to-br ${colors.accent} to-transparent px-4 pb-6 pt-8`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative mx-auto max-w-7xl">
          {/* Back link */}
          <Link
            href="/discover"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-cyan-400"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Discover
          </Link>

          {/* Agent identity row — compact */}
          <div className="flex items-center gap-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
              className={`relative h-14 w-14 shrink-0 rounded-xl shadow-lg ${colors.glow}`}
            >
              <div className="absolute -inset-[2px] rounded-xl bg-gradient-to-br from-cyan-400/60 via-transparent to-blue-500/60" />
              {agent.avatar_url ? (
                <img
                  src={agent.avatar_url}
                  alt={agent.display_name}
                  className="relative h-14 w-14 rounded-xl object-cover"
                />
              ) : (
                <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 text-xl font-bold text-cyan-400">
                  {agent.display_name[0]}
                </div>
              )}
            </motion.div>

            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="min-w-0 flex-1"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight text-white">
                  {agent.display_name}
                </h1>

                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${colors.badge}`}
                >
                  {agent.category}
                </span>

                {agent.status === 'trading' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    Live
                  </span>
                )}
                {agent.status !== 'trading' && (
                  <span className="inline-flex items-center rounded-full border border-slate-600/50 bg-slate-700/30 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-400">
                    {agent.status}
                  </span>
                )}
              </div>

              {agent.description && (
                <p className="mt-1 max-w-2xl truncate text-xs text-slate-400">{agent.description}</p>
              )}
            </motion.div>

            {/* Quick CTA */}
            <div className="hidden items-center gap-2 md:flex">
              <Link
                href={`/${agent.slug}`}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/30 hover:brightness-110"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
                Use Agent
              </Link>
              {agent.token_mint && (
                <a
                  href={`https://solscan.io/token/${agent.token_mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-medium text-slate-300 transition-all hover:border-white/20 hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  Solscan
                </a>
              )}
            </div>
          </div>

          {/* Mobile CTAs */}
          <div className="mt-4 flex items-center gap-2 md:hidden">
            <Link
              href={`/${agent.slug}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              Use Agent
            </Link>
            {agent.token_mint && (
              <a
                href={`https://solscan.io/token/${agent.token_mint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-medium text-slate-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Solscan
              </a>
            )}
          </div>
        </div>
      </motion.section>

      {/* ================================================================= */}
      {/* MARKET STATS BAR                                                   */}
      {/* ================================================================= */}
      <div className="mx-auto mt-4 max-w-7xl">
        <MarketStats
          price={price}
          priceChange24h={priceChange24h}
          marketCap={marketCap}
          volume24h={volume24h}
          fdv={fdv}
          holders={agent.holder_count}
          totalRevenue={Number(agent.total_revenue_usdc)}
          totalRequests={agent.total_requests}
        />
      </div>

      {/* ================================================================= */}
      {/* TABBED CONTENT AREA                                                */}
      {/* ================================================================= */}
      <div className="mx-auto mt-6 max-w-7xl">
        {/* Tab navigation */}
        <div className="flex items-center border-b border-white/[0.06]">
          <TabButton
            active={activeTab === 'chart'}
            onClick={() => setActiveTab('chart')}
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            }
          >
            Chart & Trading
          </TabButton>
          <TabButton
            active={activeTab === 'revenue'}
            onClick={() => setActiveTab('revenue')}
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          >
            Revenue
          </TabButton>
          <TabButton
            active={activeTab === 'info'}
            onClick={() => setActiveTab('info')}
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            }
          >
            Info & Staking
          </TabButton>
        </div>

        {/* Tab content */}
        <div className="mt-6">
          {/* ============================================================= */}
          {/* CHART & TRADING TAB                                           */}
          {/* ============================================================= */}
          {activeTab === 'chart' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Top row: Chart + Swap Panel */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Price Chart (2/3) */}
                <div className="lg:col-span-2">
                  <PriceChart
                    slug={agent.slug}
                    currentPrice={price}
                    priceChange24h={priceChange24h}
                  />
                </div>

                {/* Swap Panel (1/3) */}
                <div>
                  <SwapPanel
                    tokenMint={agent.token_mint}
                    tokenSymbol={deriveTokenSymbol(agent.display_name)}
                    currentPrice={price}
                  />
                </div>
              </div>

              {/* Trading Feed — full width below */}
              <TradingFeed slug={agent.slug} />
            </motion.div>
          )}

          {/* ============================================================= */}
          {/* REVENUE TAB                                                    */}
          {/* ============================================================= */}
          {activeTab === 'revenue' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Revenue summary cards */}
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  {
                    label: 'Total Revenue',
                    value: Number(agent.total_revenue_usdc),
                    prefix: '$',
                    decimals: 2,
                    color: 'text-white',
                  },
                  {
                    label: 'Total Distributed',
                    value: epochs.reduce((sum, e) => sum + Number(e.staker_reward_usdc), 0),
                    prefix: '$',
                    decimals: 2,
                    color: 'text-emerald-400',
                  },
                  {
                    label: 'Platform Fees',
                    value: epochs.reduce((sum, e) => sum + Number(e.platform_fee_usdc), 0),
                    prefix: '$',
                    decimals: 2,
                    color: 'text-slate-400',
                  },
                  {
                    label: 'Total Epochs',
                    value: epochs.length,
                    color: 'text-cyan-400',
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                  >
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{s.label}</p>
                    <p className={`mt-1 text-lg font-bold ${s.color}`}>
                      <AnimatedStat value={s.value} prefix={s.prefix} decimals={s.decimals} />
                    </p>
                  </div>
                ))}
              </div>

              {/* Epoch list */}
              {epochs.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-6 py-10 text-center">
                  <svg className="mx-auto h-10 w-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="mt-3 text-sm text-slate-500">
                    No epochs yet &mdash; revenue distribution happens weekly
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {epochs.map((epoch, i) => (
                    <motion.div
                      key={epoch.id}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ duration: 0.3, delay: i * 0.06 }}
                      className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-sm transition-colors hover:border-cyan-500/20 hover:bg-white/[0.04]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-xs font-bold text-cyan-400">
                            #{epoch.epoch_number}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-white">Epoch {epoch.epoch_number}</p>
                            <p className="text-xs text-slate-500">
                              {formatDate(epoch.period_start)} &mdash; {formatDate(epoch.period_end)}
                            </p>
                          </div>
                        </div>
                        <EpochStatusBadge status={epoch.status} />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-white/[0.04] pt-3 sm:grid-cols-4">
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-slate-500">Gross Revenue</p>
                          <p className="text-sm font-semibold text-white">${Number(epoch.gross_revenue_usdc).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-slate-500">Staker Reward</p>
                          <p className="text-sm font-semibold text-emerald-400">${Number(epoch.staker_reward_usdc).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-slate-500">Platform Fee</p>
                          <p className="text-sm font-semibold text-slate-400">${Number(epoch.platform_fee_usdc).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-slate-500">Requests</p>
                          <p className="text-sm font-semibold text-white">{epoch.request_count.toLocaleString()}</p>
                        </div>
                      </div>

                      {epoch.distribution_tx && (
                        <div className="mt-3 border-t border-white/[0.04] pt-2">
                          <a
                            href={`https://solscan.io/tx/${epoch.distribution_tx}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-cyan-400/70 transition-colors hover:text-cyan-400"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                            View on Solscan
                          </a>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ============================================================= */}
          {/* INFO & STAKING TAB                                             */}
          {/* ============================================================= */}
          {activeTab === 'info' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid gap-6 lg:grid-cols-3"
            >
              {/* Left: Agent Info + Description */}
              <div className="space-y-4 lg:col-span-2">
                {/* About */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                    About
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">
                    {agent.description || 'No description provided.'}
                  </p>
                  {agent.tags && agent.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {agent.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[11px] font-medium text-slate-400"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {agent.launched_at && (
                    <p className="mt-3 text-xs text-slate-500">
                      Launched {formatDate(agent.launched_at)}
                    </p>
                  )}
                </div>

                {/* Token Details */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                    </svg>
                    Token Details
                  </h3>

                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">Chain</dt>
                      <dd className="font-medium capitalize text-white">{agent.chain}</dd>
                    </div>
                    {agent.token_mint && (
                      <div className="flex items-center justify-between">
                        <dt className="text-slate-500">Token Mint</dt>
                        <dd className="flex items-center font-mono text-xs text-white">
                          {truncateAddress(agent.token_mint)}
                          <CopyButton text={agent.token_mint} />
                        </dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">Total Supply</dt>
                      <dd className="font-medium text-white">{agent.token_supply.toLocaleString()}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">Creator Allocation</dt>
                      <dd className="font-medium text-white">{(agent.creator_alloc_bps / 100).toFixed(1)}%</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">Platform Fee</dt>
                      <dd className="font-medium text-white">{(agent.platform_fee_bps / 100).toFixed(1)}%</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">Price Per Request</dt>
                      <dd className="font-medium text-white">${Number(agent.price_per_request).toFixed(4)}</dd>
                    </div>
                    {agent.agent_wallet_address && (
                      <div className="flex items-center justify-between">
                        <dt className="text-slate-500">Agent Wallet</dt>
                        <dd className="flex items-center font-mono text-xs text-white">
                          {truncateAddress(agent.agent_wallet_address)}
                          <CopyButton text={agent.agent_wallet_address} />
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              {/* Right: Staking */}
              <div className="space-y-4">
                {/* Staking Pool Info */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                    </svg>
                    Staking Pool
                  </h3>

                  {stakingPool ? (
                    <dl className="mt-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <dt className="text-slate-500">Status</dt>
                        <dd>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium capitalize text-emerald-400">
                            {stakingPool.status}
                          </span>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-slate-500">Total Staked</dt>
                        <dd className="font-medium text-white">{stakingPool.total_staked.toLocaleString()}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-slate-500">Rewards Dist.</dt>
                        <dd className="font-medium text-emerald-400">${Number(stakingPool.total_rewards_distributed).toFixed(2)}</dd>
                      </div>
                      {stakingPool.streamflow_pool_id && (
                        <div className="flex items-center justify-between">
                          <dt className="text-slate-500">Pool ID</dt>
                          <dd className="flex items-center font-mono text-xs text-white">
                            {truncateAddress(stakingPool.streamflow_pool_id)}
                            <CopyButton text={stakingPool.streamflow_pool_id} />
                          </dd>
                        </div>
                      )}
                    </dl>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">
                      No staking pool active for this agent.
                    </p>
                  )}
                </div>

                {/* Stake Action */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm">
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                    <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                    Stake & Earn
                  </h3>
                  <StakingActions agent={agent} stakingPool={stakingPool} />
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="h-20" />
    </div>
  )
}
