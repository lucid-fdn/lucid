'use client'

import { useEffect } from 'react'
import { motion, useSpring, useTransform } from 'motion/react'

// ---------------------------------------------------------------------------
// Animated number with spring physics
// ---------------------------------------------------------------------------

function AnimatedValue({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  compact = false,
}: {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  compact?: boolean
}) {
  const spring = useSpring(0, { stiffness: 50, damping: 20 })
  const display = useTransform(spring, (v) => {
    if (compact) {
      if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
      if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
    }
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

// ---------------------------------------------------------------------------
// Market Stats Bar
// ---------------------------------------------------------------------------

interface MarketStatsProps {
  price: number
  priceChange24h: number
  marketCap: number
  volume24h: number
  fdv: number
  holders: number
  totalRevenue: number
  totalRequests: number
}

export function MarketStats({
  price,
  priceChange24h,
  marketCap,
  volume24h,
  fdv,
  holders,
  totalRevenue,
  totalRequests,
}: MarketStatsProps) {
  const isPositive = priceChange24h >= 0

  const stats = [
    {
      label: 'Price',
      value: (
        <span className="flex items-baseline gap-2">
          <AnimatedValue value={price} prefix="$" decimals={4} />
          <span className={`text-xs font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPositive ? '+' : ''}{priceChange24h.toFixed(2)}%
          </span>
        </span>
      ),
      highlight: true,
    },
    {
      label: 'Market Cap',
      value: <AnimatedValue value={marketCap} prefix="$" compact />,
    },
    {
      label: '24h Volume',
      value: <AnimatedValue value={volume24h} prefix="$" compact />,
    },
    {
      label: 'FDV',
      value: <AnimatedValue value={fdv} prefix="$" compact />,
    },
    {
      label: 'Holders',
      value: <AnimatedValue value={holders} compact />,
    },
    {
      label: 'Revenue',
      value: <AnimatedValue value={totalRevenue} prefix="$" compact />,
    },
    {
      label: 'Requests',
      value: <AnimatedValue value={totalRequests} compact />,
    },
  ]

  return (
    <motion.div
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="flex items-stretch gap-1 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-x-visible sm:pb-0"
    >
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.25 + i * 0.04 }}
          className={`flex min-w-[100px] shrink-0 flex-1 flex-col justify-center rounded-lg border px-3 py-2 sm:shrink ${
            stat.highlight
              ? 'border-cyan-500/20 bg-cyan-500/[0.05]'
              : 'border-white/[0.06] bg-white/[0.02]'
          }`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {stat.label}
          </p>
          <p className="mt-0.5 text-sm font-bold text-white">{stat.value}</p>
        </motion.div>
      ))}
    </motion.div>
  )
}
