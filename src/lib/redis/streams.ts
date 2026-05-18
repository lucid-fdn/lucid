/**
 * Redis Streams + Hash helpers for runtime event ingest buffering.
 *
 * Uses existing Upstash HTTP Redis client. Provides:
 * - Stream operations (XADD, XRANGE, XDEL, XLEN) for event/cost buffering
 * - Hash operations for heartbeat live metrics (latest-wins, no stream)
 * - Distributed drain lock (SET NX EX pattern)
 * - Operational metrics for observability
 */

import 'server-only'
import { Redis } from '@upstash/redis'
import { getRedisRestEnv } from '@/lib/redis/env'

// ─── Redis client (lazy singleton, same pattern as src/lib/redis.ts) ───

let redis: Redis | null = null

type RedisStreamClient = Redis & {
  xadd(stream: string, id: string, fields: Record<string, string>, options?: { MAXLEN: number; approx?: boolean }): Promise<string>
  xdel(stream: string, ...ids: string[]): Promise<number>
}

function getRedis(): Redis | null {
  if (redis) return redis
  const redisEnv = getRedisRestEnv()
  if (!redisEnv) return null
  redis = new Redis(redisEnv)
  return redis
}

// ─── Types ───

export interface StreamEntry {
  id: string
  fields: Record<string, string>
}

export interface LiveMetrics {
  cpuPercent: number
  ramPercent: number
  diskPercent: number
  gpuPercent: number | null
  lastSeenAt: string
  generation: number
}

export interface DrainMetrics {
  lastDrainAt: string
  drainDurationMs: number
  heartbeatsUpdated: number
  eventsDrained: number
  costsDrained: number
  fallbackCount: number
}

// ─── Stream Operations ───

export async function xadd(
  stream: string,
  fields: Record<string, string>,
  maxLen?: number
): Promise<string | null> {
  const r = getRedis()
  if (!r) return null

  try {
    const streamClient = r as RedisStreamClient
    const id = maxLen != null
      ? await streamClient.xadd(stream, '*', fields, { MAXLEN: maxLen, approx: true })
      : await streamClient.xadd(stream, '*', fields)
    return id
  } catch (err) {
    console.warn('[redis:streams] xadd failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function xrange(
  stream: string,
  start: string,
  end: string,
  count?: number
): Promise<StreamEntry[]> {
  const r = getRedis()
  if (!r) return []

  try {
    const raw = (await r.xrange(stream, start, end, count)) as unknown
    if (!raw || !Array.isArray(raw)) return []

    return raw.map((entry) => {
      // Upstash returns entries as { id, ...fields } or [id, fields]
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const { id, ...fields } = entry
        return { id: String(id), fields: fields as Record<string, string> }
      }
      // Array format: [id, [field, value, field, value, ...]]
      const [id, fieldArr] = entry as [unknown, unknown]
      const fields: Record<string, string> = {}
      if (Array.isArray(fieldArr)) {
        for (let i = 0; i < fieldArr.length; i += 2) {
          fields[fieldArr[i]] = fieldArr[i + 1]
        }
      }
      return { id: String(id), fields }
    })
  } catch (err) {
    console.warn('[redis:streams] xrange failed:', err instanceof Error ? err.message : err)
    return []
  }
}

export async function xdel(stream: string, ...ids: string[]): Promise<number> {
  const r = getRedis()
  if (!r || ids.length === 0) return 0
  try {
    return await (r as RedisStreamClient).xdel(stream, ...ids)
  } catch (err) {
    console.warn('[redis:streams] xdel failed:', err instanceof Error ? err.message : err)
    return 0
  }
}

export async function xlen(stream: string): Promise<number> {
  const r = getRedis()
  if (!r) return 0
  try {
    return await r.xlen(stream)
  } catch (err) {
    console.warn('[redis:streams] xlen failed:', err instanceof Error ? err.message : err)
    return 0
  }
}

// ─── Live Metrics Hash (heartbeat — no stream, hash only) ───

const LIVE_HASH_TTL = 300 // 5 minutes

export async function setLiveMetrics(
  runtimeId: string,
  metrics: LiveMetrics
): Promise<boolean> {
  const r = getRedis()
  if (!r) return false

  try {
    const key = `rt:${runtimeId}:live`
    const pipeline = r.pipeline()
    pipeline.hset(key, {
      cpuPercent: String(metrics.cpuPercent),
      ramPercent: String(metrics.ramPercent),
      diskPercent: String(metrics.diskPercent),
      gpuPercent: metrics.gpuPercent != null ? String(metrics.gpuPercent) : '',
      lastSeenAt: metrics.lastSeenAt,
      generation: String(metrics.generation),
    })
    pipeline.expire(key, LIVE_HASH_TTL)
    await pipeline.exec()
    return true
  } catch (err) {
    console.warn('[redis:streams] setLiveMetrics failed:', err instanceof Error ? err.message : err)
    return false
  }
}

export async function getLiveMetrics(
  runtimeIds: string[]
): Promise<Map<string, LiveMetrics>> {
  const r = getRedis()
  const result = new Map<string, LiveMetrics>()
  if (!r || runtimeIds.length === 0) return result

  try {
    const pipeline = r.pipeline()
    for (const id of runtimeIds) {
      pipeline.hgetall(`rt:${id}:live`)
    }

    const responses = await pipeline.exec()

    for (let i = 0; i < runtimeIds.length; i++) {
      const data = responses[i] as Record<string, string> | null
      if (data && data.lastSeenAt) {
        result.set(runtimeIds[i], {
          cpuPercent: Number(data.cpuPercent) || 0,
          ramPercent: Number(data.ramPercent) || 0,
          diskPercent: Number(data.diskPercent) || 0,
          gpuPercent: data.gpuPercent ? Number(data.gpuPercent) : null,
          lastSeenAt: data.lastSeenAt,
          generation: Number(data.generation) || 0,
        })
      }
    }
  } catch (err) {
    console.warn('[redis:streams] getLiveMetrics failed:', err instanceof Error ? err.message : err)
  }

  return result
}

export async function getActiveLiveKeys(): Promise<string[]> {
  const r = getRedis()
  if (!r) return []

  // SCAN for rt:*:live pattern
  const keys: string[] = []
  let cursor = 0
  do {
    const [nextCursor, batch] = await r.scan(cursor, { match: 'rt:*:live', count: 200 })
    cursor = Number(nextCursor)
    keys.push(...(batch as string[]))
  } while (cursor !== 0)

  return keys
}

export async function getActiveLiveMetrics(): Promise<Map<string, LiveMetrics>> {
  const keys = await getActiveLiveKeys()
  if (keys.length === 0) return new Map()

  // Extract runtime IDs from keys (rt:{id}:live)
  const runtimeIds = keys.map((k) => k.replace(/^rt:/, '').replace(/:live$/, ''))
  return getLiveMetrics(runtimeIds)
}

// ─── Drain Lock ───

const DRAIN_LOCK_KEY = 'rt:drain:lock'

export async function acquireDrainLock(
  workerId: string,
  ttlSeconds = 10
): Promise<boolean> {
  const r = getRedis()
  if (!r) return false

  const result = await r.set(DRAIN_LOCK_KEY, workerId, { nx: true, ex: ttlSeconds })
  return result === 'OK'
}

export async function renewDrainLock(
  workerId: string,
  ttlSeconds = 10
): Promise<boolean> {
  const r = getRedis()
  if (!r) return false

  // Only renew if we still hold it
  const current = await r.get(DRAIN_LOCK_KEY)
  if (current !== workerId) return false

  await r.expire(DRAIN_LOCK_KEY, ttlSeconds)
  return true
}

export async function releaseDrainLock(workerId: string): Promise<void> {
  const r = getRedis()
  if (!r) return

  // Atomic check-and-delete via Lua — prevents releasing another worker's lock
  try {
    await r.eval(
      `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`,
      [DRAIN_LOCK_KEY],
      [workerId]
    )
  } catch {
    // Fallback: non-atomic release (lock expires via TTL anyway)
    const current = await r.get(DRAIN_LOCK_KEY)
    if (current === workerId) {
      await r.del(DRAIN_LOCK_KEY)
    }
  }
}

// ─── Drain Metrics ───

const DRAIN_METRICS_KEY = 'rt:drain:metrics'

export async function recordDrainMetrics(metrics: DrainMetrics): Promise<void> {
  const r = getRedis()
  if (!r) return

  await r.hset(DRAIN_METRICS_KEY, {
    lastDrainAt: metrics.lastDrainAt,
    drainDurationMs: String(metrics.drainDurationMs),
    heartbeatsUpdated: String(metrics.heartbeatsUpdated),
    eventsDrained: String(metrics.eventsDrained),
    costsDrained: String(metrics.costsDrained),
    fallbackCount: String(metrics.fallbackCount),
  })
}

export async function getDrainMetrics(): Promise<DrainMetrics | null> {
  const r = getRedis()
  if (!r) return null

  const data = await r.hgetall(DRAIN_METRICS_KEY) as Record<string, string> | null
  if (!data || !data.lastDrainAt) return null

  return {
    lastDrainAt: data.lastDrainAt,
    drainDurationMs: Number(data.drainDurationMs) || 0,
    heartbeatsUpdated: Number(data.heartbeatsUpdated) || 0,
    eventsDrained: Number(data.eventsDrained) || 0,
    costsDrained: Number(data.costsDrained) || 0,
    fallbackCount: Number(data.fallbackCount) || 0,
  }
}

// ─── Utility ───

export function isRedisAvailable(): boolean {
  return getRedis() !== null
}
