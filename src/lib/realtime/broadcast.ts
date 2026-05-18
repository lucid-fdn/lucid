/**
 * Wake Bus Publisher (Phase 1)
 *
 * Publishes wake signals to runtimes via Supabase Realtime Broadcast.
 * Called from webhook handlers and governance actions on the control plane.
 *
 * Architecture:
 *   "Wake bus" is vendor-agnostic naming. Transport is Supabase Broadcast.
 *   Each runtime subscribes to `runtime.wake.{runtimeId}`.
 *   Publisher sends fire-and-forget — if the runtime is offline, fallback polling catches it.
 *
 * Source of truth rules (Phase 1-3):
 *   - DB is authoritative queue + audit log (truth for routing + billing)
 *   - Broadcast is a doorbell (wake signal, not data transport)
 *   - Cursor is informational (helps deduplicate, not authoritative)
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type WakeHint = 'inbound' | 'governance' | 'config'

interface WakePayload {
  hint: WakeHint
  cursor?: number
  publishedAt: string
}

// Singleton admin client for broadcast (no cookies needed)
let adminClient: SupabaseClient | null = null

function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createServiceClient()
  }
  return adminClient
}

/**
 * Publish a wake signal to a specific runtime.
 * Fire-and-forget — errors are logged but never thrown.
 *
 * @param runtimeId - Target runtime UUID
 * @param hint - What caused the wake (inbound event, governance action, config change)
 * @param cursor - Optional monotonic cursor (e.g., latest inbound event sequence)
 */
export async function publishRuntimeWake(
  runtimeId: string,
  hint: WakeHint,
  cursor?: number,
): Promise<void> {
  try {
    const client = getAdminClient()
    const channelName = `runtime.wake.${runtimeId}`

    const payload: WakePayload = {
      hint,
      cursor,
      publishedAt: new Date().toISOString(),
    }

    const channel = client.channel(channelName)
    await channel.send({
      type: 'broadcast',
      event: 'wake',
      payload,
    })

    // Clean up the channel after sending (no persistent subscription needed on publisher side)
    await client.removeChannel(channel)
  } catch (err) {
    // Fire-and-forget: never block the webhook handler
    console.warn(
      `[broadcast] Failed to publish wake for runtime ${runtimeId}:`,
      err instanceof Error ? err.message : err,
    )
  }
}

/**
 * Publish wake signals to all runtimes in an org.
 * Used for governance actions that affect all runtimes (e.g., pause all agents).
 *
 * @param runtimeIds - Target runtime UUIDs
 * @param hint - What caused the wake
 */
/**
 * Publish wake signals to all runtimes in an org.
 * Used for governance actions that affect all runtimes (e.g., pause all agents).
 *
 * @param runtimeIds - Target runtime UUIDs
 * @param hint - What caused the wake
 */
export async function publishOrgWake(
  runtimeIds: string[],
  hint: WakeHint,
): Promise<void> {
  // Fan out in parallel — each is fire-and-forget
  await Promise.allSettled(
    runtimeIds.map((id) => publishRuntimeWake(id, hint)),
  )
}

/**
 * Wake the runtime that owns a given channel.
 * Resolves channel → assistant → runtime_id, then publishes wake.
 * Fire-and-forget — safe to call from any webhook handler.
 *
 * @param channelId - The assistant_channels.id that received the inbound event
 */
export async function publishWakeForChannel(channelId: string): Promise<void> {
  try {
    const client = getAdminClient()

    // Single query: channel → assistant → runtime_id
    const { data } = await client
      .from('assistant_channels')
      .select('assistant:ai_assistants!inner(runtime_id)')
      .eq('id', channelId)
      .single()

    const assistant = Array.isArray(data?.assistant) ? data.assistant[0] : data?.assistant
    const runtimeId = (assistant as Record<string, unknown> | undefined)?.runtime_id as string | null

    if (runtimeId) {
      await publishRuntimeWake(runtimeId, 'inbound')
    }
    // If no runtime_id, this is a shared worker agent — existing /trigger handles it
  } catch {
    // Fire-and-forget: never block the webhook handler
  }
}
