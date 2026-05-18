'use client'

import { useState, useEffect, useCallback } from 'react'
import type { EntitlementStatusResponse, EntitlementStatus } from '@/lib/entitlements/types'
import { setVisibleInterval } from '@/lib/utils/visible-interval'

interface UseEntitlementStatusOptions {
  orgId: string | null | undefined
  /** Refresh interval in ms. Default 60_000 (1 min). Set 0 to disable. */
  refreshInterval?: number
}

interface UseEntitlementStatusReturn {
  data: EntitlementStatusResponse | null
  isLoading: boolean
  error: Error | null
  /** Get status for a specific metric */
  getMetricStatus: (metric: string) => EntitlementStatus
  /** Check if any metric is at warning or blocked */
  hasWarning: boolean
  /** Refresh manually */
  refresh: () => void
}

/**
 * Client hook for proactive usage warnings.
 * Fetches entitlement status from the server (source of truth).
 * Thresholds are server-computed — frontend only renders.
 */
export function useEntitlementStatus({
  orgId,
  refreshInterval = 60_000,
}: UseEntitlementStatusOptions): UseEntitlementStatusReturn {
  const [data, setData] = useState<EntitlementStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!orgId) return

    setIsLoading(true)
    try {
      const res = await fetch(`/api/entitlements/status?orgId=${orgId}`, { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(`Status fetch failed: ${res.status}`)
      }
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [orgId])

  // Initial fetch
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Periodic refresh
  useEffect(() => {
    if (!orgId || refreshInterval <= 0) return
    return setVisibleInterval(fetchStatus, refreshInterval)
  }, [orgId, refreshInterval, fetchStatus])

  const getMetricStatus = useCallback((metric: string): EntitlementStatus => {
    if (!data) return 'normal'
    const item = data.items.find(i => i.metric === metric)
    return item?.status || 'normal'
  }, [data])

  const hasWarning = data?.items.some(
    i => i.status === 'warning_80' || i.status === 'warning_95' || i.status === 'blocked'
  ) ?? false

  return {
    data,
    isLoading,
    error,
    getMetricStatus,
    hasWarning,
    refresh: fetchStatus,
  }
}
