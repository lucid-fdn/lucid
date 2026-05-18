/**
 * Integration Health Cron
 *
 * Daily check for expiring OAuth connections.
 * Emits user notifications for connections expiring within 7 days
 * and marks truly expired connections (expires_at < now()).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { emitNotification } from '../notifications/emitter.js'

const EXPIRY_WARNING_DAYS = 7

interface ExpiringRow {
  id: string
  org_id: string
  connection_id: string
  auth_provider: string
  status: string
  expires_at: string
  account_label: string | null
}

export async function checkIntegrationHealth(supabase: SupabaseClient): Promise<void> {
  const now = new Date()
  const warningThreshold = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000)

  // Find active connections expiring within 7 days
  const { data: expiring, error } = await supabase
    .from('org_integration_connections')
    .select('id, org_id, connection_id, auth_provider, status, expires_at, account_label')
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .lt('expires_at', warningThreshold.toISOString())

  if (error) {
    console.error('[integration-health] Query failed:', error.message)
    return
  }

  if (!expiring || expiring.length === 0) {
    console.info('[integration-health] No expiring connections found')
    return
  }

  let expiredCount = 0
  let warningCount = 0

  for (const conn of expiring as ExpiringRow[]) {
    const expiresAt = new Date(conn.expires_at)
    const label = conn.account_label || conn.auth_provider

    if (expiresAt <= now) {
      // Already expired — update status
      const { error: updateErr } = await supabase.rpc('update_connection_health', {
        p_connection_id: conn.connection_id,
        p_status: 'expired',
        p_error_code: 'token_expired',
        p_error_message: `Token expired at ${conn.expires_at}`,
      })

      if (!updateErr) {
        expiredCount++
        void emitNotification(supabase, {
          orgId: conn.org_id,
          title: 'Integration token expired',
          message: `Your ${label} connection has expired. Reconnect to restore access.`,
          severity: 'error',
          href: '/mission-control/integrations',
        }).catch(() => {})
      }
    } else {
      // Expiring soon — warn
      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      warningCount++
      void emitNotification(supabase, {
        orgId: conn.org_id,
        title: 'Integration token expiring soon',
        message: `Your ${label} connection expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Reconnect to avoid disruption.`,
        severity: 'warning',
        href: '/mission-control/integrations',
      }).catch(() => {})
    }
  }

  console.info('[integration-health] Check complete', {
    total: expiring.length,
    expired: expiredCount,
    warnings: warningCount,
  })
}
