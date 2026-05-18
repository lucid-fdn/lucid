/**
 * Pulse Queue — Redis Streams + XREADGROUP
 *
 * Core queue operations: enqueue, claim (non-blocking + blocking), complete, fail, dlq.
 * Uses Redis Streams with consumer groups for job claiming. Dedup via SET NX.
 * Retry delays handled by a separate retry ZSET + RetryDrainer.
 */

import type { IPulseRedisAdapter } from './adapters/types.js'
import { getPulseRedis } from './redis.js'
import {
  type PulseJob,
  type PulseEventType,
  type PulsePriority,
  type PulseLeaseInfo,
  type PulseConfig,
  DEFAULT_PULSE_CONFIG,
  PulseKeys,
} from './types.js'
import { CONDITIONAL_DEL_LUA, FLOOR_DECR_LUA, RENEW_LEASE_LUA } from './lua-scripts.js'
import {
  incPulseEnqueued,
  incPulseClaimed,
  incPulseCompleted,
  incPulseFailed,
  incPulseDlq,
  recordPulseClaimLatency,
} from '../observability/metrics.js'
import { withSpan } from '../observability/tracing.js'
import { recordDlq } from './agent-runs.js'

const CONSUMER_GROUP = 'pulse-workers'
const STREAM_MAXLEN = 10_000
const PRIORITIES: readonly PulsePriority[] = ['critical', 'normal', 'background']

export interface PulsePriorityBacklogMetrics {
  priority: PulsePriority
  streamLength: number
  pending: number
  lag: number | null
  consumers: number
  backlog: number
  groupMissing: boolean
}

export interface PulseQueueBacklogMetrics {
  streamLength: number
  pending: number
  lag: number | null
  consumers: number
  backlog: number
  groupMissingStreams: number
  priorities: Record<PulsePriority, PulsePriorityBacklogMetrics>
}

export class PulseQueue {
  private config: PulseConfig

  constructor(config?: Partial<PulseConfig>) {
    this.config = { ...DEFAULT_PULSE_CONFIG, ...config }
  }

  // ─── Enqueue ──────────────────────────────────────────────────────────────

  /**
   * Add a job to the stream.
   * Uses SET NX dedup — idempotent if same eventId:attempt already enqueued.
   * For retries, use enqueueRetry() which routes to the retry ZSET.
   */
  async enqueue(params: {
    eventId: string
    eventType: PulseEventType
    agentId: string
    orgId: string
    priority?: PulsePriority
    attempt?: number
  }): Promise<boolean> {
    const redis = await getPulseRedis()
    if (!redis) return false

    const attempt = params.attempt ?? 0
    const priority = attempt > 0 ? 'background' : (params.priority ?? 'normal')
    const now = Date.now()

    const runId = `${params.eventId}:${attempt}`

    const job: PulseJob = {
      runId,
      eventId: params.eventId,
      eventType: params.eventType,
      agentId: params.agentId,
      orgId: params.orgId,
      priority,
      attempt,
      enqueuedAt: now,
    }

    return withSpan('pulse.enqueue', {
      'lucid.pulse.event_type': params.eventType,
      'lucid.pulse.event_id': params.eventId,
      'lucid.pulse.agent_id': params.agentId,
      'lucid.pulse.priority': priority,
      'lucid.pulse.attempt': attempt,
    }, async () => {
      // Dedup: SET NX with 5-minute TTL
      const dedupKey = PulseKeys.dedup(params.eventId, attempt)
      const dedupResult = await redis.set(dedupKey, '1', { nx: true, ex: 300 })
      if (dedupResult !== 'OK') {
        // Already enqueued — skip
        return false
      }

      // XADD with approximate MAXLEN trimming
      // Rollback dedup key on XADD failure so the event can be re-enqueued
      const streamKey = PulseKeys.stream(params.eventType, priority)
      try {
        await redis.xadd(streamKey, '*', { job: JSON.stringify(job) }, { maxlen: STREAM_MAXLEN, approximate: true })
      } catch (xaddErr) {
        await redis.del(dedupKey).catch((delErr) => {
          console.warn('[pulse:enqueue] Failed to rollback dedup key after XADD failure:', delErr instanceof Error ? delErr.message : delErr)
        })
        throw xaddErr
      }

      await this.incrementMetric(redis, 'enqueued')
      incPulseEnqueued(params.eventType, priority)
      return true
    })
  }

  // ─── Step Enqueue (Phase 3N) ──────────────────────────────────────────────

  /**
   * Enqueue a step job with step-specific fields.
   */
  async enqueueStep(params: {
    eventId: string
    eventType: PulseEventType
    agentId: string
    orgId: string
    stepType: string
    priority?: PulsePriority
    stepId?: string
    webhookUrl?: string
    webhookPayload?: Record<string, unknown>
    approvalConfig?: { toolName: string; toolArgs: Record<string, unknown>; timeoutSeconds: number }
  }): Promise<boolean> {
    const redis = await getPulseRedis()
    if (!redis) return false

    const priority = params.priority ?? 'normal'
    const now = Date.now()
    const runId = `${params.eventId}:0`

    const job: PulseJob = {
      runId,
      eventId: params.eventId,
      eventType: params.eventType,
      agentId: params.agentId,
      orgId: params.orgId,
      priority,
      attempt: 0,
      enqueuedAt: now,
      stepType: params.stepType,
      stepId: params.stepId,
      webhookUrl: params.webhookUrl,
      webhookPayload: params.webhookPayload ? JSON.stringify(params.webhookPayload) : undefined,
      approvalConfig: params.approvalConfig,
    }

    // Dedup (always attempt 0 for step events — retries increment attempt server-side)
    const dedupKey = PulseKeys.dedup(params.eventId, 0)
    const dedupResult = await redis.set(dedupKey, '1', { nx: true, ex: 300 })
    if (dedupResult !== 'OK') return false

    const streamKey = PulseKeys.stream(params.eventType, priority)
    try {
      await redis.xadd(streamKey, '*', { job: JSON.stringify(job) }, { maxlen: STREAM_MAXLEN, approximate: true })
    } catch (xaddErr) {
      await redis.del(dedupKey).catch((delErr) => {
        console.warn('[pulse:enqueue] Failed to rollback dedup key after XADD failure:', delErr instanceof Error ? delErr.message : delErr)
      })
      throw xaddErr
    }

    await this.incrementMetric(redis, 'enqueued')
    incPulseEnqueued(params.eventType, priority)
    return true
  }

  // ─── Retry Re-enqueue ─────────────────────────────────────────────────────

  /**
   * Enqueue a retry to the retry ZSET (delayed). RetryDrainer moves it to the
   * stream when the delay expires.
   */
  private async enqueueRetry(
    redis: IPulseRedisAdapter,
    originalJob: PulseJob,
    nextAttempt: number,
  ): Promise<boolean> {
    const priority: PulsePriority = nextAttempt > 0 ? 'background' : originalJob.priority
    const now = Date.now()
    const score = now + (nextAttempt * this.config.retryBaseDelayMs)
    const runId = `${originalJob.eventId}:${nextAttempt}`

    const job: PulseJob = {
      ...originalJob,
      runId,
      priority,
      attempt: nextAttempt,
      enqueuedAt: 0, // Set when drainer moves to stream
    }

    // Dedup the retry
    const dedupKey = PulseKeys.dedup(originalJob.eventId, nextAttempt)
    const dedupResult = await redis.set(dedupKey, '1', { nx: true, ex: 300 })
    if (dedupResult !== 'OK') return false

    const retryKey = PulseKeys.retry(originalJob.eventType)
    const member = JSON.stringify(job)
    const added = await redis.zadd(retryKey, { nx: true }, { score, member })
    if (added) {
      await this.incrementMetric(redis, 'enqueued')
      incPulseEnqueued(originalJob.eventType, priority)
    }
    return added === 1
  }

  /**
   * Raw re-enqueue to stream — bypasses dedup. Used for:
   * - Concurrency-reject re-enqueue (job already dedup-verified)
   * - RetryDrainer transfer from ZSET → stream
   * Caller must DEL dedup key first if needed for future sweep re-enqueue.
   */
  async reEnqueueRaw(job: PulseJob): Promise<void> {
    const redis = await getPulseRedis()
    if (!redis) return

    const streamKey = PulseKeys.stream(job.eventType, job.priority)
    const { streamEntry: _streamEntry, ...serializableJob } = job
    const jobWithTimestamp = { ...serializableJob, enqueuedAt: Date.now() }
    await redis.xadd(streamKey, '*', { job: JSON.stringify(jobWithTimestamp) }, { maxlen: STREAM_MAXLEN, approximate: true })
  }

  // ─── Claim (Non-Blocking) ─────────────────────────────────────────────────

  /**
   * Non-blocking claim from a single priority stream.
   * Returns null if stream is empty. Valid entries are XACKed only after
   * postClaimFlow acquires the durable lease/active-run state.
   */
  async claimNonBlocking(
    eventType: PulseEventType,
    workerId: string,
    priority: PulsePriority,
  ): Promise<PulseJob | null> {
    const redis = await getPulseRedis()
    if (!redis) return null

    const streamKey = PulseKeys.stream(eventType, priority)
    const result = await redis.xreadgroup(
      CONSUMER_GROUP, workerId,
      [streamKey], ['>'],
      { count: 1 },
    )

    if (!result || result.length === 0) return null

    const [, entries] = result[0]
    if (!entries || entries.length === 0) return null

    const [entryId, fields] = entries[0]

    // Parse first — if malformed, XACK to clear PEL then log and discard
    const job = this.parseStreamEntry(fields)
    if (!job) {
      await redis.xack(streamKey, CONSUMER_GROUP, entryId)
      console.error('[pulse:claim] Discarding malformed stream entry (XACKed to prevent PEL bloat):', fields.slice(0, 4))
      return null
    }

    return { ...job, streamEntry: { streamKey, entryId } }
  }

  /**
   * Blocking claim from all 3 priority streams.
   * Blocks for up to blockMs. Returns null on timeout.
   */
  async claimBlocking(
    eventType: PulseEventType,
    workerId: string,
    blockMs: number,
  ): Promise<PulseJob | null> {
    const redis = await getPulseRedis()
    if (!redis) return null

    const streams = [
      PulseKeys.stream(eventType, 'critical'),
      PulseKeys.stream(eventType, 'normal'),
      PulseKeys.stream(eventType, 'background'),
    ]
    const ids = ['>', '>', '>']

    const result = await redis.xreadgroup(
      CONSUMER_GROUP, workerId,
      streams, ids,
      { count: 1, block: blockMs },
    )

    if (!result || result.length === 0) return null

    // Got a message from one of the streams
    const [streamKey, entries] = result[0]
    if (!entries || entries.length === 0) return null

    const [entryId, fields] = entries[0]

    // Parse first — if malformed, XACK to clear PEL then log and discard
    const job = this.parseStreamEntry(fields)
    if (!job) {
      await redis.xack(streamKey, CONSUMER_GROUP, entryId)
      console.error('[pulse:claim] Discarding malformed blocking stream entry (XACKed to prevent PEL bloat):', fields.slice(0, 4))
      return null
    }

    return { ...job, streamEntry: { streamKey, entryId } }
  }

  // ─── Legacy claim() — kept for compatibility ──────────────────────────────

  /**
   * Claim the next job with full post-claim flow (inflight + lease).
   * Used by BaseWorker — delegates to claimNonBlocking internally.
   *
   * Post-claim flow:
   * 1. XREADGROUP from priority streams (non-blocking sweep)
   * 2. INCR agent inflight counter (pipeline + EXPIRE)
   * 3. Post-INCR check: if > limit → DECR + re-enqueue → return null
   * 4. SET lease NX EX + SADD active (pipeline)
   * 5. If lease SET NX fails → DECR + return null
   */
  async claim(
    eventType: PulseEventType,
    workerId: string,
  ): Promise<PulseJob | null> {
    const redis = await getPulseRedis()
    if (!redis) return null

    // Priority sweep: try critical, then normal (non-blocking)
    let job = await this.claimNonBlocking(eventType, workerId, 'critical')
    if (!job) job = await this.claimNonBlocking(eventType, workerId, 'normal')
    if (!job) job = await this.claimNonBlocking(eventType, workerId, 'background')
    if (!job) return null

    return this.postClaimFlow(redis, job, workerId, eventType)
  }

  /**
   * Post-claim processing: inflight check, lease acquisition.
   * Shared between claim() and the BaseWorker claim loop.
   */
  async postClaimFlow(
    redis: IPulseRedisAdapter,
    job: PulseJob,
    workerId: string,
    eventType: PulseEventType,
  ): Promise<PulseJob | null> {
    // 2. INCR agent inflight + EXPIRE (pipeline)
    const inflightKey = PulseKeys.agentInflight(job.agentId)
    const p1 = redis.pipeline()
    p1.incr(inflightKey)
    p1.expire(inflightKey, 300) // 5min TTL auto-reset on idle
    const [inflightResult] = await p1.exec()
    const inflight = inflightResult as number

    // 3. Post-INCR check: over limit?
    if (inflight > this.config.maxConcurrentPerAgent) {
      await redis.eval(FLOOR_DECR_LUA, [inflightKey], [])
      try {
        // DEL dedup key so future sweep can re-enqueue
        await redis.del(PulseKeys.dedup(job.eventId, job.attempt))
        // Raw XADD — bypass dedup since already verified
        await this.reEnqueueRaw(job)
      } catch (err) {
        console.error('[pulse] CRITICAL: re-enqueue failed after over-limit, sending to DLQ:', err)
        try {
          await this.sendToDlq(redis, job, `Re-enqueue failed after over-limit: ${err instanceof Error ? err.message : err}`)
        } catch {
          console.error('[pulse] CRITICAL: DLQ fallback also failed. Lost job:', JSON.stringify(job))
        }
      }
      await this.ackClaimedStreamEntry(redis, job)
      return null
    }

    // 4. Acquire lease + add to active set
    const leaseKey = PulseKeys.lease(job.runId)
    const leaseInfo: PulseLeaseInfo = {
      workerId,
      agentId: job.agentId,
      eventId: job.eventId,
      eventType: job.eventType,
      attempt: job.attempt,
      claimedAt: new Date().toISOString(),
    }

    const p2 = redis.pipeline()
    p2.set(leaseKey, JSON.stringify(leaseInfo), { nx: true, ex: this.config.leaseTtlSeconds })
    p2.sadd(PulseKeys.active(), job.runId)
    const [leaseResult] = await p2.exec()

    // 5. If lease SET NX fails (stale re-claim)
    if (leaseResult !== 'OK') {
      await redis.eval(FLOOR_DECR_LUA, [inflightKey], [])
      await redis.srem(PulseKeys.active(), job.runId)
      try {
        await redis.del(PulseKeys.dedup(job.eventId, job.attempt))
        await this.reEnqueueRaw(job)
      } catch (err) {
        console.error('[pulse] CRITICAL: re-enqueue failed after lease collision, sending to DLQ:', err)
        try {
          await this.sendToDlq(redis, job, `Re-enqueue failed after lease collision: ${err instanceof Error ? err.message : err}`)
        } catch {
          console.error('[pulse] CRITICAL: DLQ fallback also failed. Lost job:', JSON.stringify(job))
        }
      }
      await this.ackClaimedStreamEntry(redis, job)
      return null
    }

    await this.ackClaimedStreamEntry(redis, job)
    await this.incrementMetric(redis, 'claimed')
    incPulseClaimed(eventType)
    recordPulseClaimLatency(Date.now() - job.enqueuedAt, eventType)
    return job
  }

  private async ackClaimedStreamEntry(redis: IPulseRedisAdapter, job: PulseJob): Promise<void> {
    if (!job.streamEntry) return
    await redis.xack(job.streamEntry.streamKey, CONSUMER_GROUP, job.streamEntry.entryId)
  }

  // ─── Complete ─────────────────────────────────────────────────────────────

  /**
   * Complete a job — fenced via conditional-DEL Lua.
   */
  async complete(job: PulseJob, workerId: string): Promise<boolean> {
    const redis = await getPulseRedis()
    if (!redis) return false

    return withSpan('pulse.complete', {
      'lucid.pulse.event_type': job.eventType,
      'lucid.pulse.event_id': job.eventId,
      'lucid.pulse.run_id': job.runId,
      'lucid.pulse.agent_id': job.agentId,
      'lucid.pulse.outcome': 'completed',
    }, async () => {
      const leaseKey = PulseKeys.lease(job.runId)
      const deleted = await redis.eval(
        CONDITIONAL_DEL_LUA,
        [leaseKey],
        [workerId],
      ) as number

      if (deleted === 0) return false

      await redis.srem(PulseKeys.active(), job.runId)

      const inflightKey = PulseKeys.agentInflight(job.agentId)
      await redis.eval(FLOOR_DECR_LUA, [inflightKey], [])

      await this.incrementMetric(redis, 'completed')
      incPulseCompleted(job.eventType)
      return true
    })
  }

  // ─── Fail ─────────────────────────────────────────────────────────────────

  /**
   * Fail a job — re-enqueue with incremented attempt or send to DLQ.
   */
  async fail(job: PulseJob, workerId: string, errorMessage?: string): Promise<'retried' | 'dlq' | 'stale'> {
    const redis = await getPulseRedis()
    if (!redis) return 'stale'

    const outcome = (job.attempt + 1) >= this.config.maxAttempts ? 'dlq' : 'retried'

    return withSpan('pulse.fail', {
      'lucid.pulse.event_type': job.eventType,
      'lucid.pulse.event_id': job.eventId,
      'lucid.pulse.run_id': job.runId,
      'lucid.pulse.agent_id': job.agentId,
      'lucid.pulse.attempt': job.attempt,
      'lucid.pulse.outcome': outcome,
    }, async () => {
      const leaseKey = PulseKeys.lease(job.runId)
      const deleted = await redis.eval(
        CONDITIONAL_DEL_LUA,
        [leaseKey],
        [workerId],
      ) as number

      if (deleted === 0) return 'stale'

      await redis.srem(PulseKeys.active(), job.runId)

      const inflightKey = PulseKeys.agentInflight(job.agentId)
      await redis.eval(FLOOR_DECR_LUA, [inflightKey], [])

      await this.incrementMetric(redis, 'failed')

      const nextAttempt = job.attempt + 1
      if (nextAttempt >= this.config.maxAttempts) {
        await this.sendToDlq(redis, job, errorMessage)
        incPulseFailed(job.eventType, 'dlq')
        incPulseDlq(job.eventType)
        return 'dlq'
      }

      try {
        await this.enqueueRetry(redis, job, nextAttempt)
        incPulseFailed(job.eventType, 'retried')
        return 'retried'
      } catch (err) {
        console.error('[pulse] CRITICAL: retry re-enqueue failed, sending to DLQ:', err)
        try {
          await this.sendToDlq(redis, job, `Retry re-enqueue failed: ${err instanceof Error ? err.message : err}`)
        } catch {
          console.error('[pulse] CRITICAL: DLQ fallback also failed. Lost job:', JSON.stringify(job))
        }
        incPulseFailed(job.eventType, 'dlq')
        incPulseDlq(job.eventType)
        return 'dlq'
      }
    })
  }

  // ─── Lease Renewal ────────────────────────────────────────────────────────

  async renewLease(runId: string, workerId: string): Promise<boolean> {
    const redis = await getPulseRedis()
    if (!redis) return false

    const leaseKey = PulseKeys.lease(runId)
    const result = await redis.eval(
      RENEW_LEASE_LUA,
      [leaseKey],
      [workerId, String(this.config.leaseTtlSeconds)],
    ) as number
    return result === 1
  }

  // ─── DLQ ──────────────────────────────────────────────────────────────────

  private async sendToDlq(redis: IPulseRedisAdapter, job: PulseJob, errorMessage?: string): Promise<void> {
    const dlqKey = PulseKeys.dlq(job.eventType)
    const entry = JSON.stringify({
      ...job,
      errorMessage: errorMessage || 'Max attempts exceeded',
      dlqAt: new Date().toISOString(),
    })

    const p = redis.pipeline()
    p.rpush(dlqKey, entry)
    p.ltrim(dlqKey, -this.config.dlqMaxLength, -1)
    p.hincrby(PulseKeys.metrics(), 'dlq', 1)
    p.expire(PulseKeys.metrics(), 7 * 24 * 60 * 60)
    await p.exec()

    recordDlq(job, errorMessage)
  }

  // ─── Queue Depth ──────────────────────────────────────────────────────────

  /**
   * Get queue depth for a specific type (across all priority streams).
   * Uses XLEN instead of ZCARD.
   */
  async getQueueDepth(eventType: PulseEventType): Promise<number> {
    const redis = await getPulseRedis()
    if (!redis) return 0

    try {
      const [critical, normal, background] = await Promise.all(
        PRIORITIES.map((priority) => redis.xlen(PulseKeys.stream(eventType, priority))),
      )
      return (critical || 0) + (normal || 0) + (background || 0)
    } catch {
      return 0
    }
  }

  /**
   * Get consumer-group-aware backlog metrics.
   *
   * `getQueueDepth()` intentionally remains the legacy XLEN stream-history number.
   * This method exposes the production pressure signal: pending PEL entries plus
   * Redis XINFO lag for messages not yet delivered to the consumer group.
   */
  async getQueueBacklog(eventType: PulseEventType): Promise<PulseQueueBacklogMetrics> {
    const redis = await getPulseRedis()
    if (!redis) return this.emptyBacklog()

    const lanes = await Promise.all(
      PRIORITIES.map((priority) => this.getPriorityBacklog(redis, eventType, priority)),
    )

    const priorities = Object.fromEntries(
      lanes.map((lane) => [lane.priority, lane]),
    ) as Record<PulsePriority, PulsePriorityBacklogMetrics>

    const lagValues = lanes.map((lane) => lane.lag).filter((lag): lag is number => lag !== null)

    return {
      streamLength: lanes.reduce((sum, lane) => sum + lane.streamLength, 0),
      pending: lanes.reduce((sum, lane) => sum + lane.pending, 0),
      lag: lagValues.length > 0 ? lagValues.reduce((sum, lag) => sum + lag, 0) : null,
      consumers: lanes.reduce((sum, lane) => sum + lane.consumers, 0),
      backlog: lanes.reduce((sum, lane) => sum + lane.backlog, 0),
      groupMissingStreams: lanes.filter((lane) => lane.groupMissing).length,
      priorities,
    }
  }

  private async getPriorityBacklog(
    redis: IPulseRedisAdapter,
    eventType: PulseEventType,
    priority: PulsePriority,
  ): Promise<PulsePriorityBacklogMetrics> {
    const streamKey = PulseKeys.stream(eventType, priority)
    let streamLength = 0
    let pending = 0
    let consumers = 0
    let lag: number | null = null
    let groupMissing = false

    try {
      streamLength = await redis.xlen(streamKey)
    } catch {
      streamLength = 0
    }

    if (redis.xpending) {
      try {
        const summary = await redis.xpending(streamKey, CONSUMER_GROUP)
        pending = summary.pending
        consumers = summary.consumers.length
      } catch {
        pending = 0
      }
    }

    if (redis.xinfoGroups) {
      try {
        const groups = await redis.xinfoGroups(streamKey)
        const group = groups.find((item) => item.name === CONSUMER_GROUP)
        if (group) {
          consumers = Math.max(consumers, group.consumers)
          pending = Math.max(pending, group.pending)
          lag = group.lag
        } else {
          groupMissing = streamLength > 0
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        groupMissing = streamLength > 0 && /NOGROUP|no such key|does not exist/i.test(message)
      }
    }

    return {
      priority,
      streamLength,
      pending,
      lag,
      consumers,
      backlog: lag === null ? (groupMissing ? streamLength : pending) : pending + lag,
      groupMissing,
    }
  }

  private emptyBacklog(): PulseQueueBacklogMetrics {
    const priorities = Object.fromEntries(
      PRIORITIES.map((priority) => [priority, {
        priority,
        streamLength: 0,
        pending: 0,
        lag: null,
        consumers: 0,
        backlog: 0,
        groupMissing: false,
      }]),
    ) as Record<PulsePriority, PulsePriorityBacklogMetrics>

    return {
      streamLength: 0,
      pending: 0,
      lag: null,
      consumers: 0,
      backlog: 0,
      groupMissingStreams: 0,
      priorities,
    }
  }

  async getActiveRunCount(): Promise<number> {
    const redis = await getPulseRedis()
    if (!redis) return 0
    return redis.scard(PulseKeys.active())
  }

  // ─── Metrics ──────────────────────────────────────────────────────────────

  private async incrementMetric(redis: IPulseRedisAdapter, field: string): Promise<void> {
    try {
      const key = PulseKeys.metrics()
      const p = redis.pipeline()
      p.hincrby(key, field, 1)
      p.expire(key, 7 * 24 * 60 * 60)
      await p.exec()
    } catch {
      // Metrics are best-effort
    }
  }

  async getMetrics(): Promise<Record<string, number>> {
    const redis = await getPulseRedis()
    if (!redis) return {}

    const raw = await redis.hgetall(PulseKeys.metrics()) as Record<string, string> | null
    if (!raw) return {}

    const result: Record<string, number> = {}
    for (const [k, v] of Object.entries(raw)) {
      result[k] = Number(v) || 0
    }
    return result
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Parse a stream entry's field array into a PulseJob.
   * Stream entries from ioredis come as [field, value, field, value, ...].
   */
  private parseStreamEntry(fields: string[]): PulseJob | null {
    try {
      // fields = ['job', '<json>']
      for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === 'job') {
          return JSON.parse(fields[i + 1]) as PulseJob
        }
      }
      console.error('[pulse] Stream entry missing "job" field:', fields)
      return null
    } catch {
      console.error('[pulse] Failed to parse stream entry:', fields)
      return null
    }
  }
}
