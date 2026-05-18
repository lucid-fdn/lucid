'use client'

/**
 * Supabase Realtime subscription hook.
 *
 * Authenticates via a custom Supabase JWT minted by
 * /api/mission-control/realtime-token (bridges Privy auth → Supabase
 * Realtime RLS). The JWT is signed with a dedicated imported signing
 * key — not the legacy project JWT secret.
 *
 * Token lifecycle:
 *   - Fetched on mount, cached across hook instances
 *   - Refresh timer fires 2 minutes before expiry
 *   - On refresh, calls realtime.setAuth(newToken) to update the
 *     connection without resubscribing
 *   - If token fetch fails, falls back to polling (no Realtime)
 *
 * See: https://supabase.com/docs/guides/realtime/authorization
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

export interface RealtimeSubscription {
  /** Postgres table name */
  table: string
  /** Event types to listen for */
  events: RealtimeEvent[]
  /** Column-level filter (e.g. `org_id=eq.${orgId}`) */
  filter?: string
  /** Schema (default: public) */
  schema?: string
}

interface UseSupabaseRealtimeOptions {
  /** Channel name (must be unique per component instance) */
  channelName: string
  /** Table subscriptions */
  subscriptions: RealtimeSubscription[]
  /** Called when a matching change arrives */
  onEvent: (payload: RealtimePayload) => void
  /** Broadcast events to listen for on the same channel */
  broadcasts?: RealtimeBroadcastSubscription[]
  /** Called when a matching broadcast arrives */
  onBroadcast?: (payload: RealtimeBroadcastPayload) => void
  /** Enable/disable the subscription */
  enabled?: boolean
  /** Org ID for token scoping */
  orgId?: string
}

export interface RealtimePayload {
  table: string
  eventType: RealtimeEvent
  new: Record<string, unknown>
  old: Record<string, unknown>
}

export interface RealtimeBroadcastSubscription {
  event: string
}

export interface RealtimeBroadcastPayload {
  event: string
  payload: Record<string, unknown>
}

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

// ─── Token Management (shared across hook instances) ───

interface TokenState {
  token: string | null
  expiresAt: number // ms timestamp
}

let tokenState: TokenState = { token: null, expiresAt: 0 }
let tokenFetchPromise: Promise<TokenState> | null = null

/** Refresh buffer: fetch new token 2 minutes before expiry */
const REFRESH_BUFFER_MS = 2 * 60 * 1000

function isTokenValid(): boolean {
  return (
    tokenState.token !== null &&
    tokenState.expiresAt > Date.now() + REFRESH_BUFFER_MS
  )
}

async function fetchRealtimeToken(orgId?: string): Promise<TokenState> {
  if (isTokenValid()) return tokenState

  // Deduplicate concurrent fetches
  if (tokenFetchPromise) return tokenFetchPromise

  tokenFetchPromise = (async () => {
    try {
      const params = orgId ? `?org_id=${orgId}` : ''
      const res = await fetch(`/api/mission-control/realtime-token${params}`)
      if (!res.ok) return { token: null, expiresAt: 0 }
      const data = await res.json()
      tokenState = {
        token: data.token ?? null,
        expiresAt: data.expires_at ?? 0,
      }
      return tokenState
    } catch {
      return { token: null, expiresAt: 0 }
    } finally {
      tokenFetchPromise = null
    }
  })()

  return tokenFetchPromise
}

// ─── Hook ───

export function useSupabaseRealtime({
  channelName,
  subscriptions,
  onEvent,
  broadcasts = [],
  onBroadcast,
  enabled = true,
  orgId,
}: UseSupabaseRealtimeOptions) {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected')
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabaseRef = useRef<SupabaseClient | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onEventRef = useRef(onEvent)
  const onBroadcastRef = useRef(onBroadcast)
  onEventRef.current = onEvent
  onBroadcastRef.current = onBroadcast

  const cleanup = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
    if (channelRef.current) {
      channelRef.current.unsubscribe()
      channelRef.current = null
    }
    setStatus('disconnected')
  }, [])

  // Schedule token refresh before expiry
  const scheduleRefresh = useCallback((expiresAt: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)

    const refreshIn = expiresAt - Date.now() - REFRESH_BUFFER_MS
    if (refreshIn <= 0) return // Already expired or about to

    refreshTimerRef.current = setTimeout(async () => {
      // Force refetch by clearing cached state
      tokenState = { token: null, expiresAt: 0 }
      const newState = await fetchRealtimeToken(orgId)

      if (newState.token && supabaseRef.current) {
        // Update the token on the existing connection — no resubscribe needed
        supabaseRef.current.realtime.setAuth(newState.token)
        scheduleRefresh(newState.expiresAt)
      }
    }, refreshIn)
  }, [orgId])

  useEffect(() => {
    if (!enabled || (subscriptions.length === 0 && broadcasts.length === 0)) {
      cleanup()
      return
    }

    let cancelled = false

    async function setup() {
      const supabase = createSupabaseBrowserClient()
      supabaseRef.current = supabase

      // Fetch token and authenticate the Realtime connection
      const state = await fetchRealtimeToken(orgId)
      if (cancelled) return

      if (!state.token) {
        // No token available — stay in disconnected (polling fallback)
        setStatus('error')
        return
      }

      supabase.realtime.setAuth(state.token)
      scheduleRefresh(state.expiresAt)

      // Build channel with subscriptions
      let channel = supabase.channel(channelName)

      for (const sub of subscriptions) {
        for (const event of sub.events) {
          const opts: Record<string, string> = {
            event,
            schema: sub.schema ?? 'public',
            table: sub.table,
          }
          if (sub.filter) {
            opts.filter = sub.filter
          }
          channel = channel.on(
            'postgres_changes' as any,
            opts,
            (payload: any) => {
              onEventRef.current({
                table: sub.table,
                eventType: event,
                new: payload.new ?? {},
                old: payload.old ?? {},
              })
            }
          )
        }
      }

      for (const broadcast of broadcasts) {
        channel = channel.on(
          'broadcast' as any,
          { event: broadcast.event },
          (payload: any) => {
            onBroadcastRef.current?.({
              event: broadcast.event,
              payload: payload?.payload && typeof payload.payload === 'object'
                ? (payload.payload as Record<string, unknown>)
                : {},
            })
          },
        )
      }

      setStatus('connecting')

      channel.subscribe((subStatus: string) => {
        if (cancelled) return
        if (subStatus === 'SUBSCRIBED') {
          setStatus('connected')
        } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
          setStatus('error')
        } else if (subStatus === 'CLOSED') {
          setStatus('disconnected')
        }
      })

      channelRef.current = channel
    }

    setup()

    return () => {
      cancelled = true
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, enabled, cleanup, scheduleRefresh, JSON.stringify(subscriptions), JSON.stringify(broadcasts)])

  return { status, cleanup }
}
