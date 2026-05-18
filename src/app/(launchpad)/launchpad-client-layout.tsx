'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence, useSpring, useTransform } from 'motion/react'
import { Plus, Menu, X } from 'lucide-react'
import { SolanaWalletProvider } from '@/providers/solana-wallet-provider'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface LaunchpadClientLayoutProps {
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: '/discover', label: 'Discover' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/portfolio', label: 'Portfolio' },
] as const

const DEFAULT_TICKER_STATS = [
  { label: 'Total Agents', value: 0, prefix: '' },
  { label: 'Total Volume', value: 0, prefix: '$' },
  { label: 'Active Stakers', value: 0, prefix: '' },
]

// ---------------------------------------------------------------------------
// Animated counter — spring-driven number display
// ---------------------------------------------------------------------------

function TickerNumber({ value, prefix = '' }: { value: number; prefix?: string }) {
  const spring = useSpring(0, { stiffness: 40, damping: 20 })
  const display = useTransform(spring, (v) => {
    const rounded = Math.round(v)
    if (rounded >= 1_000_000) return `${prefix}${(rounded / 1_000_000).toFixed(1)}M`
    if (rounded >= 1_000) return `${prefix}${(rounded / 1_000).toFixed(1)}K`
    return `${prefix}${rounded.toLocaleString()}`
  })

  useEffect(() => {
    spring.set(value)
  }, [spring, value])

  return <motion.span className="tabular-nums font-semibold text-foreground">{display}</motion.span>
}

// ---------------------------------------------------------------------------
// Mesh gradient background with faint grid overlay
// ---------------------------------------------------------------------------

function MeshBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Dark base */}
      <div className="absolute inset-0 bg-[#050a0f]" />

      {/* Animated mesh blobs */}
      <div
        className="absolute -left-[20%] -top-[30%] h-[70vh] w-[70vh] rounded-full opacity-30"
        style={{
          background: 'radial-gradient(circle, #0B84F3 0%, transparent 70%)',
          animation: 'meshFloat1 18s ease-in-out infinite alternate',
        }}
      />
      <div
        className="absolute -right-[10%] top-[20%] h-[60vh] w-[60vh] rounded-full opacity-20"
        style={{
          background: 'radial-gradient(circle, #8B5CF6 0%, transparent 70%)',
          animation: 'meshFloat2 22s ease-in-out infinite alternate',
        }}
      />
      <div
        className="absolute bottom-[-20%] left-[30%] h-[50vh] w-[50vh] rounded-full opacity-15"
        style={{
          background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)',
          animation: 'meshFloat3 20s ease-in-out infinite alternate',
        }}
      />

      {/* Faint grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Top-down vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#050a0f]/80" />

      {/* Keyframes injected via style tag */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes meshFloat1 {
              0% { transform: translate(0, 0) scale(1); }
              100% { transform: translate(8vw, 12vh) scale(1.15); }
            }
            @keyframes meshFloat2 {
              0% { transform: translate(0, 0) scale(1); }
              100% { transform: translate(-10vw, 8vh) scale(1.1); }
            }
            @keyframes meshFloat3 {
              0% { transform: translate(0, 0) scale(1); }
              100% { transform: translate(6vw, -10vh) scale(1.2); }
            }
            @keyframes navGlow {
              0%, 100% { opacity: 0.4; }
              50% { opacity: 0.7; }
            }
            @keyframes pulse-live {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.5; transform: scale(0.85); }
            }
          `,
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wallet connect button for NavBar
// ---------------------------------------------------------------------------

function WalletButton() {
  const { publicKey, disconnect, connecting } = useWallet()
  const { setVisible } = useWalletModal()

  if (connecting) {
    return (
      <button className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/50 md:inline-flex">
        Connecting...
      </button>
    )
  }

  if (publicKey) {
    const addr = publicKey.toBase58()
    const short = `${addr.slice(0, 4)}...${addr.slice(-4)}`
    return (
      <button
        onClick={() => disconnect()}
        className="hidden items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 md:inline-flex"
        title={addr}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" style={{ animation: 'pulse-live 2s cubic-bezier(0.4,0,0.6,1) infinite' }} />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        {short}
      </button>
    )
  }

  return (
    <button
      onClick={() => setVisible(true)}
      className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/60 transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-400 md:inline-flex"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
      </svg>
      Connect Wallet
    </button>
  )
}

// ---------------------------------------------------------------------------
// Navigation bar (glass morphism, fixed)
// ---------------------------------------------------------------------------

function NavBar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const isActive = useCallback(
    (href: string) => (href === '/discover' ? pathname === '/discover' : (pathname ?? '').startsWith(href)),
    [pathname]
  )

  return (
    <header className="fixed left-0 right-0 top-0 z-50">
      {/* Glass bar */}
      <div
        className="border-b backdrop-blur-xl"
        style={{
          background: 'rgba(5, 10, 15, 0.7)',
          borderColor: 'rgba(255, 255, 255, 0.06)',
          boxShadow: '0 1px 24px rgba(11, 132, 243, 0.06), inset 0 -1px 0 rgba(255,255,255,0.03)',
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/discover" className="group flex items-center gap-2.5">
            <div className="relative flex items-center gap-1">
              <span className="text-lg font-bold tracking-tight text-white">LUCID</span>
              <span className="text-lg font-light tracking-tight text-white/60">LAUNCH</span>
              {/* Animated pulse dot */}
              <span className="relative ml-2 flex h-2 w-2">
                <span
                  className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"
                  style={{ animation: 'pulse-live 2s cubic-bezier(0.4,0,0.6,1) infinite' }}
                />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="relative px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  color: isActive(item.href) ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
                }}
              >
                {item.label}
                {isActive(item.href) && (
                  <motion.div
                    layoutId="nav-underline"
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, #0B84F3, #06b6d4)',
                      boxShadow: '0 0 8px rgba(6, 182, 212, 0.5)',
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            ))}
          </nav>

          {/* Desktop CTA + mobile hamburger */}
          <div className="flex items-center gap-3">
            {/* Wallet connect button — desktop */}
            <WalletButton />

            {/* Launch Agent button — desktop */}
            <Link
              href="/launch"
              className="group relative hidden overflow-hidden rounded-lg px-4 py-2 text-sm font-semibold text-white md:inline-flex md:items-center md:gap-1.5"
              style={{
                background: 'linear-gradient(135deg, #06b6d4 0%, #0B84F3 40%, #8B5CF6 100%)',
              }}
            >
              {/* Hover glow overlay */}
              <span className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{
                  background: 'linear-gradient(135deg, #22d3ee 0%, #3b82f6 40%, #a78bfa 100%)',
                }}
              />
              <Plus className="relative z-10 h-4 w-4" strokeWidth={2.5} />
              <span className="relative z-10">Launch Agent</span>
              {/* Ambient glow underneath */}
              <span
                className="absolute -bottom-2 left-1/2 h-6 w-3/4 -translate-x-1/2 rounded-full opacity-0 blur-lg transition-opacity duration-200 group-hover:opacity-60"
                style={{ background: 'linear-gradient(90deg, #06b6d4, #8B5CF6)' }}
              />
            </Link>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/5 hover:text-white md:hidden"
              aria-label="Toggle menu"
            >
              <AnimatePresence mode="wait" initial={false}>
                {mobileOpen ? (
                  <motion.div
                    key="close"
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 90 }}
                    transition={{ duration: 0.15 }}
                  >
                    <X className="h-5 w-5" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="menu"
                    initial={{ opacity: 0, rotate: 90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: -90 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Menu className="h-5 w-5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden border-b backdrop-blur-xl md:hidden"
            style={{
              background: 'rgba(5, 10, 15, 0.92)',
              borderColor: 'rgba(255, 255, 255, 0.06)',
            }}
          >
            <div className="mx-auto max-w-7xl space-y-1 px-4 pb-4 pt-2">
              {NAV_ITEMS.map((item, i) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                >
                  <Link
                    href={item.href}
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                    style={{
                      color: isActive(item.href) ? '#06b6d4' : 'rgba(255,255,255,0.6)',
                      background: isActive(item.href) ? 'rgba(6, 182, 212, 0.08)' : 'transparent',
                    }}
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: NAV_ITEMS.length * 0.05, duration: 0.2 }}
                className="pt-2"
              >
                <Link
                  href="/launch"
                  className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4 0%, #0B84F3 40%, #8B5CF6 100%)',
                  }}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                  Launch Agent
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Stats ticker bar
// ---------------------------------------------------------------------------

function StatsTicker() {
  const [stats, setStats] = useState(DEFAULT_TICKER_STATS)

  useEffect(() => {
    let mounted = true
    async function fetchStats() {
      try {
        const res = await fetch('/api/launchpad/stats')
        if (!res.ok) return
        const data = await res.json()
        if (!mounted) return
        setStats([
          { label: 'Total Agents', value: data.totalAgents ?? 0, prefix: '' },
          { label: 'Total Volume', value: data.totalVolume ?? 0, prefix: '$' },
          { label: 'Active Stakers', value: data.activeStakers ?? 0, prefix: '' },
        ])
      } catch {
        // Keep defaults on error
      }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 30_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  return (
    <div
      className="fixed left-0 right-0 top-16 z-40 border-b"
      style={{
        background: 'rgba(5, 10, 15, 0.55)',
        borderColor: 'rgba(255, 255, 255, 0.04)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-center gap-6 px-4 sm:gap-10">
        {stats.map((stat, i) => (
          <React.Fragment key={stat.label}>
            {i > 0 && (
              <span className="hidden h-3 w-px sm:block" style={{ background: 'rgba(255,255,255,0.08)' }} />
            )}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="hidden text-white/30 sm:inline">{stat.label}:</span>
              <span className="text-white/30 sm:hidden">{stat.label.split(' ')[1] ?? stat.label}:</span>
              <TickerNumber value={stat.value} prefix={stat.prefix} />
            </div>
          </React.Fragment>
        ))}
        {/* Live dot */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
              style={{ animation: 'pulse-live 2s cubic-bezier(0.4,0,0.6,1) infinite' }}
            />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/70">Live</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main layout export
// ---------------------------------------------------------------------------

export function LaunchpadClientLayout({ children }: LaunchpadClientLayoutProps) {
  return (
    <SolanaWalletProvider>
      <div className="dark relative min-h-screen text-white">
        <MeshBackground />
        <NavBar />
        <StatsTicker />
        {/* Main content — offset for fixed nav (h-16 = 4rem) + ticker (h-9 ≈ 2.25rem) */}
        <main className="mx-auto max-w-7xl px-4 pb-16 pt-[calc(4rem+2.25rem+2rem)] sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </SolanaWalletProvider>
  )
}
