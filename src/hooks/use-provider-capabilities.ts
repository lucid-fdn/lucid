'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ProviderCapabilities, CapabilitiesResponse } from '@/lib/mission-control/types'

export type CapabilityState =
  | { status: 'loading' }
  | { status: 'managed'; provider: string; capabilities: ProviderCapabilities }
  | { status: 'unmanaged'; provider: string }
  | { status: 'unavailable'; provider: string; warning?: string }
  | { status: 'error'; error: string }

/** SWR-style stale time for capabilities (5 min) */
const STALE_TIME_MS = 5 * 60 * 1000

/** Max cache entries to prevent memory leaks from long-running sessions */
const MAX_CACHE_ENTRIES = 50

interface CacheEntry {
  state: CapabilityState
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()

/** Evict oldest entries when cache exceeds max size */
function evictStaleEntries() {
  if (cache.size <= MAX_CACHE_ENTRIES) return
  const now = Date.now()
  // First pass: remove expired entries
  for (const [key, entry] of cache) {
    if (now - entry.fetchedAt >= STALE_TIME_MS) cache.delete(key)
  }
  // Second pass: if still over limit, remove oldest
  if (cache.size > MAX_CACHE_ENTRIES) {
    const entries = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
    const toRemove = entries.slice(0, cache.size - MAX_CACHE_ENTRIES)
    for (const [key] of toRemove) cache.delete(key)
  }
}

/**
 * Fetch and cache provider capabilities for a runtime.
 *
 * Returns one of 4 states:
 * - managed: runtime has an L2 passport, capabilities are known
 * - unmanaged: BYO/manual runtime, heartbeat-only
 * - unavailable: L2 temporarily unavailable (show stale cache + warning)
 * - error: something went wrong
 */
export function useProviderCapabilities(runtimeId: string | null, orgId: string): CapabilityState {
  const [state, setState] = useState<CapabilityState>(() => {
    if (!runtimeId) return { status: 'unmanaged', provider: 'unknown' }
    const cached = cache.get(runtimeId)
    if (cached && Date.now() - cached.fetchedAt < STALE_TIME_MS) {
      return cached.state
    }
    return { status: 'loading' }
  })

  const fetchCapabilities = useCallback(async () => {
    if (!runtimeId) return

    try {
      const res = await fetch(`/api/runtimes/${runtimeId}/capabilities?org_id=${orgId}`)

      if (res.status === 502) {
        // L2 unavailable — check cache for stale data
        const cached = cache.get(runtimeId)
        const newState: CapabilityState = cached?.state.status === 'managed'
          ? { ...cached.state, status: 'unavailable' as const, warning: 'Control plane temporarily unavailable' }
          : { status: 'unavailable', provider: 'unknown', warning: 'Control plane temporarily unavailable' }
        setState(newState)
        return
      }

      if (!res.ok) {
        setState({ status: 'error', error: `Failed to fetch capabilities: ${res.status}` })
        return
      }

      const data: CapabilitiesResponse = await res.json()

      if (!data.capabilities) {
        // No capabilities → unmanaged or unavailable
        if (data.deploymentMode === 'manual') {
          const newState: CapabilityState = { status: 'unmanaged', provider: data.provider || 'manual' }
          setState(newState)
          cache.set(runtimeId, { state: newState, fetchedAt: Date.now() })
          evictStaleEntries()
        } else if (data.warning) {
          setState({ status: 'unavailable', provider: data.provider || 'unknown', warning: data.warning })
        } else {
          setState({ status: 'unmanaged', provider: data.provider || 'unknown' })
        }
        return
      }

      const newState: CapabilityState = {
        status: 'managed',
        provider: data.provider,
        capabilities: data.capabilities,
      }
      setState(newState)
      cache.set(runtimeId, { state: newState, fetchedAt: Date.now() })
      evictStaleEntries()
    } catch (err) {
      setState({ status: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }, [runtimeId, orgId])

  useEffect(() => {
    if (!runtimeId) return
    const cached = cache.get(runtimeId)
    if (cached && Date.now() - cached.fetchedAt < STALE_TIME_MS) {
      setState(cached.state)
      return
    }
    fetchCapabilities()
  }, [runtimeId, fetchCapabilities])

  return state
}

/** Check if a specific capability is supported */
export function hasCapability(
  state: CapabilityState,
  path: string
): boolean {
  if (state.status !== 'managed') return false
  const parts = path.split('.')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = state.capabilities
  for (const part of parts) {
    if (current == null) return false
    current = current[part]
  }
  return current === true
}
