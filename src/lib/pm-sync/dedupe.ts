/**
 * Webhook Dedupe — Redis SET NX guard against double-delivery.
 *
 * Every inbound webhook carries a provider-native event id (Linear `data.id`,
 * Asana `events[i].guid`, Trello `action.id`, Monday delivery id). Providers
 * are allowed to retry on timeouts, and reconcile may also synthesize events
 * keyed `reconcile:{refId}:{lastSyncedAt}`. One guard handles all of them.
 *
 * Key:   pm_sync:dedupe:{provider}:{rawEventId}
 * TTL:   24h — long enough to survive provider retry windows
 * Value: ISO 8601 timestamp (operators can eyeball when it was seen)
 *
 * Returns true if this is the FIRST time we've seen this id (caller should
 * proceed), false if it's a duplicate (caller should short-circuit 200 OK).
 *
 * Fails open: if Redis is not configured or errors, we return true so that
 * the webhook still processes. At-least-once is the correct default — the
 * dispatcher has idempotency guards further down the pipeline
 * (`work_item_external_refs` unique on (work_item_id, provider), outbound
 * sync checks for existing ref before creating).
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section D.1
 */

import 'server-only'
import { getPulseRedis } from '@/lib/pulse/redis-client'
import { ErrorService } from '@/lib/db/client'
import type { PmProvider } from '@contracts/pm-adapter'

const DEDUPE_TTL_SECONDS = 24 * 60 * 60 // 24h
const DEDUPE_PREFIX = 'pm_sync:dedupe'

function buildKey(provider: PmProvider, rawEventId: string): string {
  return `${DEDUPE_PREFIX}:${provider}:${rawEventId}`
}

/**
 * Attempt to mark (provider, rawEventId) as seen. Returns true if this is
 * the first sighting, false if it's a duplicate. Fails open on Redis errors.
 */
export async function markEventSeen(
  provider: PmProvider,
  rawEventId: string,
): Promise<boolean> {
  if (!rawEventId) return true // No id to key on → always process

  const redis = await getPulseRedis()
  if (!redis) return true // Redis not configured → fail open

  const key = buildKey(provider, rawEventId)
  try {
    // SET NX EX 86400 — returns 'OK' on first write, null on duplicate
    const result = await redis.set(key, new Date().toISOString(), {
      nx: true,
      ex: DEDUPE_TTL_SECONDS,
    })
    return result === 'OK'
  } catch (err) {
    ErrorService.captureException(err, {
      severity: 'warning',
      context: { op: 'markEventSeen', provider, raw_event_id: rawEventId },
      tags: { layer: 'pm-sync', component: 'dedupe' },
    })
    return true // Fail open
  }
}

/**
 * Peek without writing. Used only by tests and debug tooling — the
 * production path must always use `markEventSeen` (atomic set-if-absent).
 */
export async function hasSeenEvent(
  provider: PmProvider,
  rawEventId: string,
): Promise<boolean> {
  const redis = await getPulseRedis()
  if (!redis || !rawEventId) return false
  try {
    const value = await redis.get(buildKey(provider, rawEventId))
    return value !== null
  } catch {
    return false
  }
}
