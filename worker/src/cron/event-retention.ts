/**
 * Event Retention Cleanup (Daily Cron)
 *
 * Deletes runtime_events and vps_health_snapshots older than 30 days.
 * Processes in batches of 1000 to avoid long-running transactions.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const RETENTION_DAYS = 30
const BATCH_SIZE = 1000

export async function cleanupEventRetention(supabase: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  try {
    // Delete old runtime_events in batches
    let totalEventsDeleted = 0
    let batchDeleted = 0
    do {
      const { data, error } = await supabase
        .from('runtime_events')
        .delete()
        .lt('created_at', cutoff)
        .limit(BATCH_SIZE)
        .select('id')

      batchDeleted = data?.length ?? 0
      totalEventsDeleted += batchDeleted
      if (error) {
        console.error('[cron:event-retention] runtime_events cleanup error:', error.message)
        break
      }
    } while (batchDeleted === BATCH_SIZE)

    // Delete old vps_health_snapshots in batches
    let totalSnapshotsDeleted = 0
    batchDeleted = 0
    do {
      const { data, error } = await supabase
        .from('vps_health_snapshots')
        .delete()
        .lt('reported_at', cutoff)
        .limit(BATCH_SIZE)
        .select('id')

      batchDeleted = data?.length ?? 0
      totalSnapshotsDeleted += batchDeleted
      if (error) {
        console.error('[cron:event-retention] vps_health_snapshots cleanup error:', error.message)
        break
      }
    } while (batchDeleted === BATCH_SIZE)

    if (totalEventsDeleted > 0 || totalSnapshotsDeleted > 0) {
      console.log(`[cron:event-retention] cleaned up ${totalEventsDeleted} events, ${totalSnapshotsDeleted} snapshots (>30d)`)
    }
  } catch (err) {
    console.error('[cron:event-retention] Error:', err)
  }
}
