/**
 * Pulse Redis — Adapter Factory
 *
 * Selects the correct Redis adapter based on available env vars:
 *   1. REDIS_URL → IoredisAdapter (TCP, required for Streams XREADGROUP BLOCK)
 *   2. UPSTASH_REDIS_REST_URL → UpstashAdapter (HTTP, SaaS — NO Stream support)
 *   3. Neither → null (Pulse disabled, polling fallback)
 *
 * REDIS_URL takes priority when FEATURE_PULSE=true because Streams require
 * a TCP connection (XREADGROUP BLOCK). Upstash HTTP cannot block.
 * Upstash is kept for runtime-drain telemetry (separate concern).
 *
 * Lazy initialization, single instance for all Pulse operations.
 * Initialization promise is cached to prevent concurrent callers
 * from creating multiple adapter instances (race condition guard).
 */

import type { IPulseRedisAdapter } from './adapters/types.js'
import { PulseKeys } from './types.js'
import type { PulseEventType, PulsePriority } from './types.js'
import { getRedisRestEnv } from '../redis/env.js'

let pulseRedis: IPulseRedisAdapter | null = null
let initPromise: Promise<IPulseRedisAdapter | null> | null = null

const CONSUMER_GROUP = 'pulse-workers'

/** All event types × priorities = 12 streams (inbound/outbound/scheduled/human_task × 3 priorities) */
const EVENT_TYPES: PulseEventType[] = ['inbound', 'outbound', 'scheduled', 'human_task']
const PRIORITIES: PulsePriority[] = ['critical', 'normal', 'background']

async function initPulseRedis(): Promise<IPulseRedisAdapter | null> {
  const featurePulse = process.env.FEATURE_PULSE === 'true' || process.env.FEATURE_PULSE === '1'

  // Priority 1: ioredis TCP (required for Streams when FEATURE_PULSE=true)
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    const { IoredisAdapter } = await import('./adapters/ioredis.js')
    const adapter = new IoredisAdapter({ url: redisUrl })
    try {
      console.log('[pulse:redis] Connecting to managed queue')
      await adapter.connect()
      console.log('[pulse:redis] Managed queue connected')
      return adapter
    } catch (err) {
      console.warn(
        '[pulse:redis] Failed to connect to managed queue:',
        err instanceof Error ? err.message : err,
      )
      // If Pulse requires ioredis and it failed, don't fall back to Upstash
      if (featurePulse) return null
    }
  }

  // Priority 2: Upstash HTTP (legacy — no Stream support)
  // Only used when FEATURE_PULSE is off or REDIS_URL is not set
  const upstashEnv = getRedisRestEnv()

  if (upstashEnv) {
    if (featurePulse) {
      console.error(
        '[pulse:redis] Pulse stream mode requires a managed queue connection that supports blocking stream reads.',
      )
      return null
    }
    const { Redis } = await import('@upstash/redis')
    const { UpstashAdapter } = await import('./adapters/upstash.js')
    return new UpstashAdapter(new Redis(upstashEnv))
  }

  // Neither — Pulse disabled
  return null
}

export async function getPulseRedis(): Promise<IPulseRedisAdapter | null> {
  if (pulseRedis) return pulseRedis

  // Cache the initialization promise so concurrent callers share the same init.
  // Prevents multiple TCP connections from racing to create separate adapters.
  if (!initPromise) {
    initPromise = initPulseRedis().then((adapter) => {
      pulseRedis = adapter
      initPromise = null
      return adapter
    }).catch((err) => {
      initPromise = null
      throw err
    })
  }

  return initPromise
}

/**
 * Bootstrap consumer groups on all Pulse streams.
 * Creates the group `pulse-workers` with MKSTREAM (auto-creates the stream if missing).
 * Safe to call on every startup — BUSYGROUP error means group already exists.
 */
export async function bootstrapConsumerGroups(redis: IPulseRedisAdapter): Promise<void> {
  for (const type of EVENT_TYPES) {
    for (const priority of PRIORITIES) {
      const streamKey = PulseKeys.stream(type, priority)
      try {
        await redis.xgroupCreate(streamKey, CONSUMER_GROUP, '0', { mkstream: true })
        console.log(`[pulse:redis] Created consumer group ${CONSUMER_GROUP} on ${streamKey}`)
      } catch (err) {
        // BUSYGROUP = group already exists = safe to ignore
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('BUSYGROUP')) continue
        console.warn(`[pulse:redis] Failed to create consumer group on ${streamKey}:`, msg)
      }
    }
  }
}

/**
 * Gracefully disconnect Redis (TCP clients need cleanup).
 * Safe to call multiple times or when no client was created.
 */
export async function shutdownPulseRedis(): Promise<void> {
  if (pulseRedis?.quit) {
    try {
      await pulseRedis.quit()
    } catch {
      // TCP client may fail if never connected or already disconnected
    }
  }
  pulseRedis = null
  initPromise = null
}

/** Reset for testing */
export function resetPulseRedis(): void {
  pulseRedis = null
  initPromise = null
}
