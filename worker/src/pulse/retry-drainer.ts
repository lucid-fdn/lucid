/**
 * Pulse RetryDrainer — Delayed Retry Transfer
 *
 * Drains ready retries from per-type retry ZSETs into their target streams.
 * Runs on a 2s interval with distributed lock (only one replica drains).
 *
 * Flow: ZRANGEBYSCORE → ZREM first → raw XADD (bypass dedup)
 * ZREM-first is fail-safe (D8): crash after ZREM but before XADD means
 * the job is in neither place — DB sweep safety net recovers it (~30s delay).
 *
 * The reverse order (XADD then ZREM) risks duplicate delivery on crash.
 */

import { randomUUID } from 'node:crypto'
import type { IPulseRedisAdapter } from './adapters/types.js'
import { getPulseRedis } from './redis.js'
import { PLAIN_CONDITIONAL_DEL_LUA } from './lua-scripts.js'
import { PulseKeys } from './types.js'
import type { PulseJob, PulseEventType } from './types.js'

const LOCK_KEY = 'pulse:retry:lock'
const LOCK_TTL_SECONDS = 5
const STREAM_MAXLEN = 10_000
const BATCH_SIZE = 10
const EVENT_TYPES: PulseEventType[] = ['inbound', 'outbound', 'scheduled', 'human_task']

export class RetryDrainer {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  start(intervalMs: number = 2000): void {
    if (this.timer) return
    this.timer = setInterval(() => this.drain(), intervalMs)
    // Run immediately on start
    this.drain()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async drain(): Promise<number> {
    if (this.running) return 0
    this.running = true

    let totalDrained = 0

    try {
      const redis = await getPulseRedis()
      if (!redis) return 0

      // Acquire distributed lock (UUID per-acquisition avoids PID reuse across containers)
      const lockValue = `drainer-${randomUUID()}`
      const lockResult = await redis.set(LOCK_KEY, lockValue, { nx: true, ex: LOCK_TTL_SECONDS })
      if (lockResult !== 'OK') return 0

      try {
        const now = Date.now()

        for (const eventType of EVENT_TYPES) {
          const retryKey = PulseKeys.retry(eventType)
          const ready = await redis.zrangebyscore(retryKey, '-inf', now, { limit: { offset: 0, count: BATCH_SIZE } })

          if (!ready || ready.length === 0) continue

          for (const memberJson of ready) {
            try {
              const job: PulseJob = JSON.parse(memberJson)

              // ZREM first (fail-safe — see D8)
              const removed = await redis.zrem(retryKey, memberJson)
              if (removed === 0) continue // Another replica got it

              // Raw XADD — bypass dedup (already verified at enqueueRetry time)
              const streamKey = PulseKeys.stream(job.eventType, job.priority)
              const jobWithTimestamp = { ...job, enqueuedAt: Date.now() }
              await redis.xadd(streamKey, '*', { job: JSON.stringify(jobWithTimestamp) }, { maxlen: STREAM_MAXLEN, approximate: true })

              totalDrained++
            } catch (err) {
              console.error('[pulse:retry-drainer] Failed to transfer retry:', err instanceof Error ? err.message : err)
            }
          }
        }
      } finally {
        // Fenced lock release — only delete if we still own it (prevents
        // deleting another replica's lock if TTL expired during a slow drain)
        try {
          await redis.eval(PLAIN_CONDITIONAL_DEL_LUA, [LOCK_KEY], [lockValue])
        } catch {
          // Lock will expire via TTL
        }
      }
    } catch (err) {
      console.error('[pulse:retry-drainer] Error:', err instanceof Error ? err.message : err)
    } finally {
      this.running = false
    }

    if (totalDrained > 0) {
      console.log(`[pulse:retry-drainer] Transferred ${totalDrained} ready retries to streams`)
    }

    return totalDrained
  }
}
