import 'server-only'

import {
  CONDITIONAL_DEL_LUA,
  FLOOR_DECR_LUA,
  type PulseEventType,
  type PulseJob,
  type PulseLeaseInfo,
  type PulsePriority,
  PulseKeys,
  LEASE_TTL_SECONDS,
  MAX_CONCURRENT_PER_AGENT,
  METRICS_TTL_SECONDS,
} from '@contracts/pulse'
import { supabase } from '@/lib/db/client'
import { getPulseRedis } from './redis-client'
import {
  CONTROL_PLANE_CONSUMER_GROUP,
  CONTROL_PLANE_DEFAULT_WAIT_MS,
  CONTROL_PLANE_INFLIGHT_TTL_SECONDS,
  CONTROL_PLANE_MAX_WAIT_MS,
  CONTROL_PLANE_RATE_LIMIT_MAX_OPS,
  CONTROL_PLANE_RATE_LIMIT_WINDOW_MS,
  CONTROL_PLANE_RATE_LIMIT_WINDOW_SECONDS,
  CONTROL_PLANE_STREAM_MAXLEN,
  pulseStreamsFor,
} from './constants'

export interface ClaimResult {
  job: PulseJob
  leaseToken: string
}

const BASE_IDS = ['>', '>', '>']

function rateLimitKey(runtimeId: string): string {
  return `pulse:rl:${runtimeId}`
}

function clampWaitMs(waitMs?: number): number {
  if (waitMs == null) return CONTROL_PLANE_DEFAULT_WAIT_MS
  return Math.max(0, Math.min(waitMs, CONTROL_PLANE_MAX_WAIT_MS))
}

async function checkRateLimit(runtimeId: string): Promise<boolean> {
  const redis = await getPulseRedis()
  if (!redis) return false

  const now = Date.now()
  const cutoff = now - CONTROL_PLANE_RATE_LIMIT_WINDOW_MS
  const key = rateLimitKey(runtimeId)
  const member = `${now}-${Math.random().toString(36).slice(2, 10)}`

  try {
    const evalResult = await redis.eval(
      `
      redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, ARGV[1])
      redis.call("ZADD", KEYS[1], ARGV[2], ARGV[3])
      local count = redis.call("ZCARD", KEYS[1])
      redis.call("EXPIRE", KEYS[1], ARGV[4])
      return count
      `,
      [key],
      [String(cutoff), String(now), member, String(CONTROL_PLANE_RATE_LIMIT_WINDOW_SECONDS + 5)],
    )
    const count = Number(evalResult)
    if (count > CONTROL_PLANE_RATE_LIMIT_MAX_OPS) {
      await redis.eval(`return redis.call("ZREM", KEYS[1], ARGV[1])`, [key], [member]).catch(() => {})
      return false
    }
    return true
  } catch (error) {
    console.error('[pulse:control-plane] Rate limiter error (failing open):', error)
    return true
  }
}

function parseStreamEntry(fields: string[]): PulseJob | null {
  const index = fields.indexOf('job')
  if (index === -1 || !fields[index + 1]) return null
  try {
    return JSON.parse(fields[index + 1]) as PulseJob
  } catch {
    return null
  }
}

async function claimNonBlocking(
  eventType: PulseEventType,
  workerId: string,
  priority: PulsePriority,
): Promise<PulseJob | null> {
  const redis = await getPulseRedis()
  if (!redis) return null

  const streamKey = PulseKeys.stream(eventType, priority)
  const result = await redis.xreadgroup(
    CONTROL_PLANE_CONSUMER_GROUP,
    workerId,
    [streamKey],
    ['>'],
    { count: 1 },
  )

  if (!result || result.length === 0) return null

  const [, entries] = result[0]
  if (!entries?.length) return null

  const [entryId, fields] = entries[0]
  const job = parseStreamEntry(fields)
  await redis.xack(streamKey, CONTROL_PLANE_CONSUMER_GROUP, entryId)
  if (!job) {
    console.error('[pulse:control-plane] Discarding malformed stream entry')
    return null
  }
  return job
}

async function claimBlocking(
  eventType: PulseEventType,
  workerId: string,
  waitMs: number,
): Promise<PulseJob | null> {
  const redis = await getPulseRedis()
  if (!redis) return null

  const streams = pulseStreamsFor(eventType)
  const result = await redis.xreadgroup(
    CONTROL_PLANE_CONSUMER_GROUP,
    workerId,
    streams,
    BASE_IDS,
    { count: 1, block: waitMs },
  )

  if (!result || result.length === 0) return null

  const [streamKey, entries] = result[0]
  if (!entries?.length) return null

  const [entryId, fields] = entries[0]
  const job = parseStreamEntry(fields)
  await redis.xack(streamKey, CONTROL_PLANE_CONSUMER_GROUP, entryId)
  if (!job) {
    console.error('[pulse:control-plane] Discarding malformed blocking stream entry')
    return null
  }
  return job
}

async function reEnqueueRaw(job: PulseJob): Promise<void> {
  const redis = await getPulseRedis()
  if (!redis) return

  const streamKey = PulseKeys.stream(job.eventType, job.priority)
  const jobWithTimestamp = { ...job, enqueuedAt: Date.now() }
  await redis.xadd(streamKey, '*', { job: JSON.stringify(jobWithTimestamp) }, { maxlen: CONTROL_PLANE_STREAM_MAXLEN, approximate: true })
}

async function postClaimFlow(job: PulseJob, workerId: string): Promise<PulseJob | null> {
  const redis = await getPulseRedis()
  if (!redis) return null

  const inflightKey = PulseKeys.agentInflight(job.agentId)
  const p1 = redis.pipeline()
  p1.incr(inflightKey)
  p1.expire(inflightKey, CONTROL_PLANE_INFLIGHT_TTL_SECONDS)
  const [inflightResult] = await p1.exec()
  const inflight = Number(inflightResult)

  if (inflight > MAX_CONCURRENT_PER_AGENT) {
    await redis.eval(FLOOR_DECR_LUA, [inflightKey], [])
    await redis.del(PulseKeys.dedup(job.eventId, job.attempt)).catch(() => {})
    await reEnqueueRaw(job)
    return null
  }

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
  p2.set(leaseKey, JSON.stringify(leaseInfo), { nx: true, ex: LEASE_TTL_SECONDS })
  p2.sadd(PulseKeys.active(), job.runId)
  const [leaseResult] = await p2.exec()

  if (leaseResult !== 'OK') {
    await redis.eval(FLOOR_DECR_LUA, [inflightKey], [])
    await redis.srem(PulseKeys.active(), job.runId).catch(() => {})
    await redis.del(PulseKeys.dedup(job.eventId, job.attempt)).catch(() => {})
    await reEnqueueRaw(job)
    return null
  }

  try {
    const metricsKey = PulseKeys.metrics()
    const metrics = redis.pipeline()
    metrics.hincrby(metricsKey, 'claimed', 1)
    metrics.expire(metricsKey, METRICS_TTL_SECONDS)
    await metrics.exec()
  } catch {
    // best effort
  }

  recordAgentRunClaim(job, workerId)
  return job
}

export async function claimForRuntime(
  eventType: PulseEventType,
  runtimeId: string,
  opts?: { waitMs?: number },
): Promise<ClaimResult | null> {
  const redis = await getPulseRedis()
  if (!redis) return null
  if (!(await checkRateLimit(runtimeId))) return null

  const workerId = `relay-${runtimeId}`
  const waitMs = clampWaitMs(opts?.waitMs)

  let job = await claimNonBlocking(eventType, workerId, 'critical')
  if (!job) job = await claimNonBlocking(eventType, workerId, 'normal')
  if (!job && waitMs > 0) job = await claimBlocking(eventType, workerId, waitMs)
  if (!job && waitMs === 0) job = await claimNonBlocking(eventType, workerId, 'background')
  if (!job) return null

  const claimedJob = await postClaimFlow(job, workerId)
  if (!claimedJob) return null

  return { job: claimedJob, leaseToken: workerId }
}

export async function completeForRuntime(job: PulseJob, workerId: string): Promise<boolean> {
  const redis = await getPulseRedis()
  if (!redis) return false

  const leaseKey = PulseKeys.lease(job.runId)
  const deleted = await redis.eval(CONDITIONAL_DEL_LUA, [leaseKey], [workerId]) as number
  if (deleted === 0) return false

  await redis.srem(PulseKeys.active(), job.runId)
  await redis.eval(FLOOR_DECR_LUA, [PulseKeys.agentInflight(job.agentId)], [])

  try {
    const metricsKey = PulseKeys.metrics()
    const metrics = redis.pipeline()
    metrics.hincrby(metricsKey, 'completed', 1)
    metrics.expire(metricsKey, METRICS_TTL_SECONDS)
    await metrics.exec()
  } catch {
    // best effort
  }

  recordAgentRunComplete(job)
  return true
}

export async function failForRuntime(job: PulseJob, workerId: string): Promise<boolean> {
  const redis = await getPulseRedis()
  if (!redis) return false

  const leaseKey = PulseKeys.lease(job.runId)
  const deleted = await redis.eval(CONDITIONAL_DEL_LUA, [leaseKey], [workerId]) as number
  if (deleted === 0) return false

  await redis.srem(PulseKeys.active(), job.runId)
  await redis.eval(FLOOR_DECR_LUA, [PulseKeys.agentInflight(job.agentId)], [])

  try {
    const metricsKey = PulseKeys.metrics()
    const metrics = redis.pipeline()
    metrics.hincrby(metricsKey, 'failed', 1)
    metrics.expire(metricsKey, METRICS_TTL_SECONDS)
    await metrics.exec()
  } catch {
    // best effort
  }

  recordAgentRunFail(job)
  return true
}

export async function enqueueAndClaimSelf(params: {
  eventId: string
  eventType: PulseEventType
  agentId: string
  orgId: string
  priority?: PulsePriority
  runtimeId: string
}): Promise<ClaimResult | null> {
  const redis = await getPulseRedis()
  if (!redis) return null
  if (!(await checkRateLimit(params.runtimeId))) return null

  const priority = params.priority ?? 'normal'
  const workerId = `native-${params.runtimeId}`
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
  }

  const dedupResult = await redis.set(PulseKeys.dedup(params.eventId, 0), '1', { nx: true, ex: 300 })
  if (dedupResult !== 'OK') return null
  await redis.xadd(PulseKeys.stream(params.eventType, priority), '*', { job: JSON.stringify(job) }, { maxlen: CONTROL_PLANE_STREAM_MAXLEN, approximate: true })

  const claimedJob = await postClaimFlow(job, workerId)
  if (!claimedJob) return null

  try {
    const metricsKey = PulseKeys.metrics()
    const metrics = redis.pipeline()
    metrics.hincrby(metricsKey, 'enqueued', 1)
    metrics.hincrby(metricsKey, 'claimed', 1)
    metrics.expire(metricsKey, METRICS_TTL_SECONDS)
    await metrics.exec()
  } catch {
    // best effort
  }

  return { job: claimedJob, leaseToken: workerId }
}

export function isPulseAvailable(): boolean {
  return Boolean(process.env.REDIS_URL)
}

function recordAgentRunClaim(job: PulseJob, workerId: string): void {
  void Promise.resolve(
    supabase
      .from('agent_runs')
      .insert({
        agent_id: job.agentId,
        org_id: job.orgId,
        event_type: job.eventType,
        event_id: job.eventId,
        worker_id: workerId,
        status: 'claimed',
        priority: job.priority,
        attempt: job.attempt + 1,
        lease_expires_at: new Date(Date.now() + LEASE_TTL_SECONDS * 1000).toISOString(),
      }),
  ).catch(() => {})
}

function recordAgentRunComplete(job: PulseJob): void {
  void Promise.resolve(
    supabase
      .from('agent_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('event_id', job.eventId)
      .eq('event_type', job.eventType)
      .eq('attempt', job.attempt + 1)
      .eq('status', 'claimed'),
  ).catch(() => {})
}

function recordAgentRunFail(job: PulseJob): void {
  void Promise.resolve(
    supabase
      .from('agent_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('event_id', job.eventId)
      .eq('event_type', job.eventType)
      .eq('attempt', job.attempt + 1)
      .eq('status', 'claimed'),
  ).catch(() => {})
}
