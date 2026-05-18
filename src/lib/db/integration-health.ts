/**
 * Integration Health — Server-only DB layer
 *
 * Manages OAuth connection health status updates and queries.
 * Used by webhook handler, unified skills API, and Mission Control.
 */

import 'server-only'
import { createClient } from '@supabase/supabase-js'

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionHealthStatus = 'active' | 'expired' | 'revoked' | 'error'

export interface ConnectionHealth {
  id: string
  connection_id: string
  auth_provider: string
  status: ConnectionHealthStatus
  expires_at: string | null
  last_used_at: string | null
  disconnected_at: string | null
  metadata: Record<string, unknown>
}

export type IntegrationHealthStatus = 'healthy' | 'expiring' | 'expired' | 'error'

// ---------------------------------------------------------------------------
// Webhook + passive health sync
// ---------------------------------------------------------------------------

/**
 * Update connection status from webhook events or reconnection.
 * Fire-and-forget — logs errors, never throws.
 */
export async function syncConnectionHealth(
  connectionId: string,
  status: ConnectionHealthStatus,
  provider: string,
  errorInfo?: { error_code?: string; error_message?: string },
): Promise<void> {
  try {
    const supabase = getSupabase()

    if (status === 'active') {
      // Reconnection — restore from broken state
      await supabase.rpc('restore_connection_health', {
        p_connection_id: connectionId,
      })
    } else {
      // Downgrade — mark as expired/revoked/error
      await supabase.rpc('update_connection_health', {
        p_connection_id: connectionId,
        p_status: status,
        p_error_code: errorInfo?.error_code ?? null,
        p_error_message: errorInfo?.error_message ?? null,
      })
    }

    console.info('[IntegrationHealth] Status synced', {
      connectionId,
      status,
      provider,
    })
  } catch (err) {
    console.error('[IntegrationHealth] Sync failed:', err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// Health queries (used by unified skills API + MC integrations)
// ---------------------------------------------------------------------------

/**
 * Get health status for all connections in an org.
 * Returns a map of connection_id → health info for fast lookup.
 */
export async function getOrgConnectionHealth(
  orgId: string,
): Promise<Map<string, ConnectionHealth>> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('org_integration_connections')
    .select('id, connection_id, auth_provider, status, expires_at, last_used_at, disconnected_at, metadata')
    .eq('org_id', orgId)

  if (error || !data) return new Map()

  const map = new Map<string, ConnectionHealth>()
  for (const row of data) {
    map.set(row.connection_id, row as ConnectionHealth)
  }
  return map
}

/**
 * Derive a UI-friendly health status from connection data.
 */
export function deriveHealthStatus(
  conn: ConnectionHealth | undefined,
  expiryWarningDays = 7,
): { health_status: IntegrationHealthStatus | null; health_message: string | null; expires_at: string | null } {
  if (!conn) {
    return { health_status: null, health_message: null, expires_at: null }
  }

  if (conn.status === 'expired') {
    return {
      health_status: 'expired',
      health_message: 'Token expired — reconnect to restore',
      expires_at: conn.expires_at,
    }
  }

  if (conn.status === 'revoked') {
    return {
      health_status: 'error',
      health_message: 'Connection revoked — reconnect to restore',
      expires_at: conn.expires_at,
    }
  }

  if (conn.status === 'error') {
    const errMsg = (conn.metadata?.last_error_message as string) || 'Connection error'
    return {
      health_status: 'error',
      health_message: errMsg,
      expires_at: conn.expires_at,
    }
  }

  // Active — check if expiring soon
  if (conn.expires_at) {
    const expiresAt = new Date(conn.expires_at)
    const warningThreshold = new Date(Date.now() + expiryWarningDays * 24 * 60 * 60 * 1000)

    if (expiresAt <= new Date()) {
      return {
        health_status: 'expired',
        health_message: 'Token expired — reconnect to restore',
        expires_at: conn.expires_at,
      }
    }

    if (expiresAt <= warningThreshold) {
      const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return {
        health_status: 'expiring',
        health_message: `Token expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
        expires_at: conn.expires_at,
      }
    }
  }

  return {
    health_status: 'healthy',
    health_message: null,
    expires_at: conn.expires_at,
  }
}

/**
 * Get connections expiring within N days for an org.
 * Used by the daily health cron.
 */
export async function getExpiringConnections(
  orgId: string,
  withinDays = 7,
): Promise<ConnectionHealth[]> {
  const supabase = getSupabase()

  const threshold = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('org_integration_connections')
    .select('id, connection_id, auth_provider, status, expires_at, last_used_at, disconnected_at, metadata')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .lt('expires_at', threshold)

  if (error || !data) return []
  return data as ConnectionHealth[]
}
