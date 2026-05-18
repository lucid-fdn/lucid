'use client'

/**
 * useRealtimeQuery — Centralized Realtime + Polling Data Fetcher
 *
 * Combines Supabase Realtime subscriptions with polling fallback into a
 * single reusable hook. Eliminates the boilerplate that every RT consumer
 * was duplicating: debounced refetch, mounted ref, polling intervals, etc.
 *
 * Pattern:
 *   1. Initial fetch on mount
 *   2. Subscribe to Realtime postgres_changes
 *   3. On RT event → debounced refetch (coalesces rapid events)
 *   4. Polling fallback: fast when RT is down, slow heartbeat when connected
 *   5. Cleanup on unmount (timers, subscriptions, mounted guard)
 *
 * Usage:
 *   const { data, realtimeStatus, refetch } = useRealtimeQuery({
 *     queryKey: `feed-${orgId}`,
 *     queryFn: async () => { ... return data },
 *     realtimeConfig: {
 *       channelName: `mc-feed-${orgId}`,
 *       subscriptions: [{ table: 'events', events: ['INSERT'] }],
 *       orgId,
 *     },
 *     initialData: [],
 *   })
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime'
import type { RealtimePayload, RealtimeSubscription, RealtimeStatus } from '@/hooks/use-supabase-realtime'
import { REALTIME_HEARTBEAT_INTERVAL } from '@/lib/mission-control/constants'

/** Default fast poll interval when Realtime is disconnected */
const DEFAULT_POLL_INTERVAL = 10_000

/** Default debounce for coalescing rapid RT events */
const DEFAULT_DEBOUNCE_MS = 300

interface RealtimeConfig {
  /** Supabase channel name (unique per component) */
  channelName: string
  /** Table subscriptions */
  subscriptions: RealtimeSubscription[]
  /** Org ID for token scoping */
  orgId: string
}

interface UseRealtimeQueryOptions<T> {
  /** Async function that fetches the data */
  queryFn: () => Promise<T>
  /** Realtime subscription config. Omit to use polling only. */
  realtimeConfig: RealtimeConfig
  /** Initial data before first fetch */
  initialData: T
  /** Enable/disable (default: true) */
  enabled?: boolean
  /**
   * Enable live behavior (Realtime subscriptions + polling).
   * When false, the hook still performs the initial fetch if enabled=true,
   * but remains snapshot-only afterward.
   */
  liveEnabled?: boolean
  /** Fast poll interval when RT is down (default: 10s) */
  pollInterval?: number | false
  /** Slow heartbeat interval when RT is connected (default: 30s) */
  heartbeatInterval?: number | false
  /** Debounce ms for coalescing rapid RT events (default: 300ms) */
  debounceMs?: number
  /**
   * Optional callback to process an RT event before refetching.
   * Return `false` to skip the refetch (e.g. optimistic removal).
   * If omitted, every event triggers a refetch.
   */
  onRealtimeEvent?: (payload: RealtimePayload, setData: React.Dispatch<React.SetStateAction<T>>) => boolean | void
}

interface UseRealtimeQueryResult<T> {
  data: T
  setData: React.Dispatch<React.SetStateAction<T>>
  /** True until first successful fetch completes (false immediately when initialData is non-empty) */
  isLoading: boolean
  realtimeStatus: RealtimeStatus
  isRealtimeConnected: boolean
  refetch: () => Promise<void>
}

export function useRealtimeQuery<T>({
  queryFn,
  realtimeConfig,
  initialData,
  enabled = true,
  liveEnabled = true,
  pollInterval = DEFAULT_POLL_INTERVAL,
  heartbeatInterval = REALTIME_HEARTBEAT_INTERVAL,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  onRealtimeEvent,
}: UseRealtimeQueryOptions<T>): UseRealtimeQueryResult<T> {
  const [data, setData] = useState<T>(initialData)
  const [isLoading, setIsLoading] = useState(() => {
    // If initialData is a non-empty array or truthy object, skip loading state
    if (Array.isArray(initialData)) return initialData.length === 0
    return !initialData
  })
  const mountedRef = useRef(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable ref for queryFn to avoid re-subscribing on every render
  const queryFnRef = useRef(queryFn)
  queryFnRef.current = queryFn

  const onRealtimeEventRef = useRef(onRealtimeEvent)
  onRealtimeEventRef.current = onRealtimeEvent

  const fetchData = useCallback(async () => {
    try {
      const result = await queryFnRef.current()
      if (mountedRef.current) {
        setData(result)
        setIsLoading(false)
      }
    } catch {
      // Non-critical — data stays stale until next poll
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  const debouncedRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchData()
    }, debounceMs)
  }, [fetchData, debounceMs])

  // Memoize subscriptions to prevent re-renders
  const subscriptions = useMemo(
    () => realtimeConfig.subscriptions,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(realtimeConfig.subscriptions)]
  )

  const handleRealtimeEvent = useCallback(
    (payload: RealtimePayload) => {
      if (onRealtimeEventRef.current) {
        const shouldRefetch = onRealtimeEventRef.current(payload, setData)
        if (shouldRefetch === false) return
      }
      debouncedRefetch()
    },
    [debouncedRefetch]
  )

  const { status: realtimeStatus } = useSupabaseRealtime({
    channelName: realtimeConfig.channelName,
    subscriptions,
    onEvent: handleRealtimeEvent,
    enabled: enabled && liveEnabled,
    orgId: realtimeConfig.orgId,
  })

  const isRealtimeConnected = liveEnabled && realtimeStatus === 'connected'

  // Polling: fast when RT down, slow heartbeat when connected
  // Pauses when tab is hidden to save network/battery
  useEffect(() => {
    if (!enabled) return

    if (!liveEnabled) return

    const interval = isRealtimeConnected ? heartbeatInterval : pollInterval
    if (!interval) return
    let timer: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (!timer) timer = setInterval(fetchData, interval)
    }

    const stopPolling = () => {
      if (timer) { clearInterval(timer); timer = null }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopPolling()
      } else {
        fetchData() // Refetch immediately on tab focus
        startPolling()
      }
    }

    // Only poll when tab is visible
    if (document.visibilityState !== 'hidden') {
      startPolling()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchData, enabled, liveEnabled, isRealtimeConnected, heartbeatInterval, pollInterval])

  // Initial fetch
  useEffect(() => {
    if (enabled) fetchData()
  }, [fetchData, enabled])

  // Cleanup
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return {
    data,
    setData,
    isLoading,
    realtimeStatus,
    isRealtimeConnected,
    refetch: fetchData,
  }
}
