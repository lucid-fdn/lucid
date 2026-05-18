/**
 * Broadcast Wake Subscriber (Phase 1)
 *
 * Subscribes to Supabase Realtime Broadcast for push-based wake signals.
 * Replaces 5s inbound polling with near-instant event notification.
 *
 * Architecture:
 *   Control plane publishes wake(runtimeId, { hint, cursor, publishedAt })
 *   Worker receives → immediately triggers claim poll
 *   Fallback polling (30s default) rescues missed wakes
 *
 * Design decisions:
 *   - Vendor-agnostic "wake bus" naming internally (Supabase Broadcast is the transport)
 *   - Monotonic cursor prevents "woken but nothing to do" thrash
 *   - Reconnect with exponential backoff (1s, 2s, 4s... capped at 30s)
 *   - Metrics: wake_received, polling_rescued, wake_latency_ms
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import {
  incBroadcastWakeReceived,
  incBroadcastPollingRescued,
  recordBroadcastWakeLatency,
} from '../observability/metrics.js'

export interface WakePayload {
  /** Hint about what caused the wake: 'inbound', 'governance', 'config' */
  hint: 'inbound' | 'governance' | 'config'
  /** Monotonic cursor — latest inbound event sequence number */
  cursor?: number
  /** ISO timestamp of when the wake was published */
  publishedAt: string
}

export interface BroadcastSubscriberOptions {
  supabaseUrl: string
  supabaseKey: string
  runtimeId: string
  /** Called when a wake signal is received. */
  onWake: (payload: WakePayload) => void
  /** Called on subscription status changes. */
  onStatusChange?: (status: 'connected' | 'disconnected' | 'error') => void
}

let client: SupabaseClient | null = null
let channel: RealtimeChannel | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
let lastSeenCursor = 0
let stopped = false

const MAX_RECONNECT_DELAY_MS = 30_000

function getReconnectDelay(): number {
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY_MS)
  // Add 10% jitter to prevent thundering herd
  return delay + Math.random() * delay * 0.1
}

/**
 * Start listening for broadcast wake signals.
 * Channel name: `runtime.wake.{runtimeId}`
 */
export function startBroadcastWake(options: BroadcastSubscriberOptions): void {
  // Guard: clean up any existing subscription before starting a new one
  if (client || channel) {
    stopBroadcastWake()
  }

  stopped = false
  reconnectAttempts = 0
  lastSeenCursor = 0

  // Create a dedicated Supabase client for Realtime (separate from DB client)
  client = createClient(options.supabaseUrl, options.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  })

  subscribe(options)
}

function subscribe(options: BroadcastSubscriberOptions): void {
  if (stopped || !client) return

  const channelName = `runtime.wake.${options.runtimeId}`

  channel = client
    .channel(channelName, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'wake' }, (message) => {
      const payload = message.payload as WakePayload
      if (!payload) return

      // Cursor dedup: skip if we've already seen this or a later cursor
      if (payload.cursor !== undefined && payload.cursor <= lastSeenCursor) {
        return
      }
      if (payload.cursor !== undefined) {
        lastSeenCursor = payload.cursor
      }

      // Record latency
      if (payload.publishedAt) {
        const latencyMs = Date.now() - new Date(payload.publishedAt).getTime()
        if (latencyMs >= 0 && latencyMs < 60_000) {
          recordBroadcastWakeLatency(latencyMs)
        }
      }

      incBroadcastWakeReceived()
      reconnectAttempts = 0
      options.onWake(payload)
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        reconnectAttempts = 0
        options.onStatusChange?.('connected')
        console.log(`[broadcast] Subscribed to ${channelName}`)
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        options.onStatusChange?.('error')
        console.warn(`[broadcast] Channel error (${status}), reconnecting...`)
        scheduleReconnect(options)
      } else if (status === 'CLOSED') {
        if (!stopped) {
          options.onStatusChange?.('disconnected')
          scheduleReconnect(options)
        }
      }
    })
}

function scheduleReconnect(options: BroadcastSubscriberOptions): void {
  if (stopped) return
  if (reconnectTimer) clearTimeout(reconnectTimer)

  reconnectAttempts++
  const delay = getReconnectDelay()
  console.log(`[broadcast] Reconnect attempt #${reconnectAttempts} in ${Math.round(delay)}ms`)

  reconnectTimer = setTimeout(() => {
    if (stopped) return
    // Unsubscribe old channel if exists
    if (channel && client) {
      client.removeChannel(channel).catch(() => {})
    }
    subscribe(options)
  }, delay)
}

/**
 * Stop listening for broadcast wake signals.
 */
export function stopBroadcastWake(): void {
  stopped = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (channel && client) {
    client.removeChannel(channel).catch(() => {})
    channel = null
  }
  if (client) {
    client.removeAllChannels().catch(() => {})
    client = null
  }
  console.log('[broadcast] Stopped')
}

/**
 * Get the last seen cursor (for fallback polling comparison).
 * If fallback polling finds events beyond this cursor, it means broadcast missed them.
 */
export function getLastSeenCursor(): number {
  return lastSeenCursor
}

/**
 * Update the cursor from fallback polling results.
 * Called when polling finds events, to track whether broadcast is keeping up.
 */
export function updateCursorFromPolling(cursor: number): void {
  if (cursor > lastSeenCursor) {
    incBroadcastPollingRescued()
    lastSeenCursor = cursor
  }
}
