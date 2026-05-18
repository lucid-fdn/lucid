'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { setVisibleInterval } from '@/lib/utils/visible-interval'

interface OracleStats {
  total_agents?: string
  named_agents?: string
  active_agents?: string
  total_wallets?: string
  total_feedback?: string
  total_transactions?: string
}

interface OracleActivityState {
  stats: OracleStats
  initialStats: OracleStats | null
  delta: {
    agents: number
    wallets: number
    transactions: number
  }
  isLive: boolean
  lastUpdated: Date | null
}

/**
 * Polling-based activity indicator for Oracle dashboard.
 * Polls /api/oracle/stats every 30s and tracks deltas.
 * Phase A implementation -- no SSE dependency (SSE is Pro-tier gated).
 */
export function useOracleActivity(intervalMs = 30_000): OracleActivityState {
  const [stats, setStats] = useState<OracleStats>({})
  const [initialStats, setInitialStats] = useState<OracleStats | null>(null)
  const [isLive, setIsLive] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const mountedRef = useRef(true)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/oracle/stats')
      if (!res.ok) return
      const data: OracleStats = await res.json()
      if (!mountedRef.current) return

      setStats(data)
      setIsLive(true)
      setLastUpdated(new Date())

      setInitialStats((prev) => prev ?? data)
    } catch {
      if (mountedRef.current) {
        setIsLive(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchStats()

    const cleanup = setVisibleInterval(fetchStats, intervalMs)
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [fetchStats, intervalMs])

  const delta = {
    agents:
      initialStats?.total_agents && stats.total_agents
        ? Number(stats.total_agents) - Number(initialStats.total_agents)
        : 0,
    wallets:
      initialStats?.total_wallets && stats.total_wallets
        ? Number(stats.total_wallets) - Number(initialStats.total_wallets)
        : 0,
    transactions:
      initialStats?.total_transactions && stats.total_transactions
        ? Number(stats.total_transactions) - Number(initialStats.total_transactions)
        : 0,
  }

  return { stats, initialStats, delta, isLive, lastUpdated }
}
