/**
 * InboundDeduper — Prevents duplicate message processing from webhook retries.
 *
 * Uses INSERT + catch 23505 (unique violation) for atomic dedup.
 * Tenant-scoped dedup via 4-column UNIQUE key:
 *   (tenant_key, channel_type, external_chat_id, external_message_id)
 *
 * external_chat_id is required because some channels (e.g. Telegram)
 * only guarantee message_id uniqueness per-chat, not globally.
 *
 * TTL cleanup removes entries older than configurable hours.
 *
 * See docs/OPENCLAW_INTEGRATION_SPEC.md §5.3 (v2.2)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export class InboundDeduper {
  constructor(
    private supabase: SupabaseClient,
    private ttlHours: number = 24
  ) {}

  /**
   * Check if a message is a duplicate. If not, records it atomically.
   * Returns true if duplicate (already processed), false if new.
   *
   * All 4 params are required for the UNIQUE constraint:
   *   (tenant_key, channel_type, external_chat_id, external_message_id)
   *
   * @param tenantKey - Canonical tenant key (orgId:projectId:envId)
   * @param channelType - Channel type (telegram, whatsapp, etc.)
   * @param externalChatId - External chat/conversation ID from the channel
   * @param externalMessageId - External message ID from the channel
   * @param channelId - Optional channel UUID for FK join (not part of dedup key)
   */
  async isDuplicate(
    tenantKey: string,
    channelType: string,
    externalChatId: string,
    externalMessageId: string,
    channelId?: string
  ): Promise<boolean> {
    if (!externalMessageId) {
      // No external ID to deduplicate on — treat as new
      return false
    }

    try {
      const insertData: Record<string, string> = {
        tenant_key: tenantKey,
        channel_type: channelType,
        external_chat_id: externalChatId,
        external_message_id: externalMessageId,
      }
      if (channelId) {
        insertData.channel_id = channelId
      }

      const { error } = await this.supabase
        .from('assistant_inbound_dedup')
        .insert(insertData)

      if (!error) {
        // Insert succeeded — message is new
        return false
      }

      // Check for unique violation (23505) — means duplicate
      if (error.code === '23505') {
        console.log(`[dedup] Duplicate detected: tenant=${tenantKey} chat=${externalChatId} msg=${externalMessageId}`)
        return true
      }

      // Other DB error — log but don't block processing (fail open)
      console.warn(`[dedup] Insert error (failing open): ${error.code} ${error.message}`)
      return false
    } catch (err) {
      // Network/unexpected error — fail open
      console.warn('[dedup] Unexpected error (failing open):', err)
      return false
    }
  }

  /**
   * Remove a dedup entry so the event can be retried.
   * Called when processing fails — dedup should only prevent duplicate
   * webhook deliveries, not block retries of failed events.
   */
  async remove(
    tenantKey: string,
    channelType: string,
    externalChatId: string,
    externalMessageId: string,
  ): Promise<void> {
    if (!externalMessageId) return
    try {
      await this.supabase
        .from('assistant_inbound_dedup')
        .delete()
        .eq('tenant_key', tenantKey)
        .eq('channel_type', channelType)
        .eq('external_chat_id', externalChatId)
        .eq('external_message_id', externalMessageId)
    } catch (err) {
      console.warn('[dedup] Failed to remove entry for retry:', err)
    }
  }

  /**
   * Clean up expired dedup entries.
   * Should be called periodically (e.g., every cleanup cycle).
   */
  async cleanup(): Promise<number> {
    const cutoff = new Date(Date.now() - this.ttlHours * 60 * 60 * 1000).toISOString()

    const { data, error } = await this.supabase
      .from('assistant_inbound_dedup')
      .delete()
      .lt('received_at', cutoff)
      .select('id')

    if (error) {
      console.warn('[dedup] Cleanup error:', error.message)
      return 0
    }

    const count = data?.length ?? 0
    if (count > 0) {
      console.log(`[dedup] Cleaned up ${count} expired entries (older than ${this.ttlHours}h)`)
    }
    return count
  }
}