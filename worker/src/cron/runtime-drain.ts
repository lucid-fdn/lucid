/**
 * Runtime Drain Worker — Lock-protected 30s drain loop
 *
 * Reads buffered telemetry from Redis (Hash + Streams) and persists to Postgres.
 * Single-consumer via drain lock (SET NX EX pattern).
 *
 * Three semantic types:
 * - Heartbeats: Redis Hash → batch UPDATE dedicated_runtimes
 * - Events: Redis Stream → batch INSERT runtime_events (ON CONFLICT ingest_event_id)
 * - Costs: Redis Stream → grouped UPSERT mc_agent_cost_tracking
 *
 * Failure semantics (data-loss safe):
 * - Postgres unique violation (code 23505) is treated as a successful conflict —
 *   the row is already persisted via the ingest_event_id idempotency key, so the
 *   stream entry is XDELed.
 * - Any other Postgres/network error leaves the stream entries IN PLACE so the
 *   next drain cycle retries them. A consecutive-failure counter promotes the
 *   batch to a DLQ stream after MAX_DRAIN_RETRIES so a poison-pill cannot stall
 *   the pipeline indefinitely.
 */

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js'
import { getRedisRestEnv } from '../redis/env.js'

const HEARTBEAT_BATCH = 200
const EVENT_BATCH = 1000
const COST_BATCH = 200

// Postgres unique-violation error code — treated as a safe idempotency conflict.
const PG_UNIQUE_VIOLATION = '23505'

// After this many consecutive drain failures on the same head batch, escalate
// the entries to the DLQ stream so the main stream can keep moving.
const MAX_DRAIN_RETRIES = 5

const EVENT_DLQ_STREAM = 'rt:events:dlq'
const EVENT_RETRY_KEY = 'rt:drain:events:retry'
const COST_DLQ_STREAM = 'rt:costs:dlq'
const COST_RETRY_KEY = 'rt:drain:costs:retry'
const UPSTASH_QUOTA_BACKOFF_MS = 15 * 60 * 1000

let upstashQuotaBackoffUntil = 0
let upstashQuotaWarningIssued = false

export interface DrainResult {
  skipped: boolean
  heartbeatsUpdated: number
  eventsDrained: number
  /** Stream entries that failed to persist and were left in-stream for retry. */
  eventsDeferred: number
  /** Stream entries promoted to the DLQ after exceeding MAX_DRAIN_RETRIES. */
  eventsDlqed: number
  costsDrained: number
  costsDeferred: number
  costsDlqed: number
  durationMs: number
  error?: string
}

function isUniqueViolation(error: PostgrestError | { code?: string } | null | undefined): boolean {
  return !!error && (error as { code?: string }).code === PG_UNIQUE_VIOLATION
}

export async function drainRuntimeStreams(
  supabase: SupabaseClient,
  workerId: string
): Promise<DrainResult> {
  const start = Date.now()
  const empty: DrainResult = {
    skipped: true,
    heartbeatsUpdated: 0,
    eventsDrained: 0,
    eventsDeferred: 0,
    eventsDlqed: 0,
    costsDrained: 0,
    costsDeferred: 0,
    costsDlqed: 0,
    durationMs: 0,
  }

  if (upstashQuotaBackoffUntil > Date.now()) {
    return empty
  }

  // Lazy import Redis operations (streams.ts has 'server-only' — skip for worker)
  // Worker uses its own Redis client via @upstash/redis
  let redis: any = null
  try {
    redis = await getWorkerRedis()
  } catch (err) {
    if (isUpstashQuotaExceeded(err)) {
      enterUpstashQuotaBackoff(err)
      return empty
    }
    throw err
  }
  if (!redis) return empty

  // 1. Acquire lock
  let lockResult: string | null = null
  try {
    lockResult = await redis.set('rt:drain:lock', workerId, { nx: true, ex: 10 })
  } catch (err) {
    if (isUpstashQuotaExceeded(err)) {
      enterUpstashQuotaBackoff(err)
      return empty
    }
    throw err
  }
  if (lockResult !== 'OK') return empty

  let heartbeatsUpdated = 0
  let eventResult: DrainStreamResult = { persisted: 0, deferred: 0, dlqed: 0 }
  let costResult: DrainStreamResult = { persisted: 0, deferred: 0, dlqed: 0 }

  try {
    // 2. Drain heartbeats (hash → Postgres)
    heartbeatsUpdated = await drainHeartbeats(redis, supabase)

    // Renew lock mid-drain
    await redis.expire('rt:drain:lock', 10)

    // 3. Drain events (stream → Postgres)
    eventResult = await drainEvents(redis, supabase)

    // 4. Drain costs (stream → Postgres)
    costResult = await drainCosts(redis, supabase)

    // 5. Record drain metrics
    const durationMs = Date.now() - start
    await redis.hset('rt:drain:metrics', {
      lastDrainAt: new Date().toISOString(),
      drainDurationMs: String(durationMs),
      heartbeatsUpdated: String(heartbeatsUpdated),
      eventsDrained: String(eventResult.persisted),
      eventsDeferred: String(eventResult.deferred),
      eventsDlqed: String(eventResult.dlqed),
      costsDrained: String(costResult.persisted),
      costsDeferred: String(costResult.deferred),
      costsDlqed: String(costResult.dlqed),
      fallbackCount: '0',
    })

    return {
      skipped: false,
      heartbeatsUpdated,
      eventsDrained: eventResult.persisted,
      eventsDeferred: eventResult.deferred,
      eventsDlqed: eventResult.dlqed,
      costsDrained: costResult.persisted,
      costsDeferred: costResult.deferred,
      costsDlqed: costResult.dlqed,
      durationMs,
    }
  } catch (err) {
    if (isUpstashQuotaExceeded(err)) {
      enterUpstashQuotaBackoff(err)
      return empty
    }
    const durationMs = Date.now() - start
    console.error('[drain] Error:', err instanceof Error ? err.message : err)
    return {
      skipped: false,
      heartbeatsUpdated,
      eventsDrained: eventResult.persisted,
      eventsDeferred: eventResult.deferred,
      eventsDlqed: eventResult.dlqed,
      costsDrained: costResult.persisted,
      costsDeferred: costResult.deferred,
      costsDlqed: costResult.dlqed,
      durationMs,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  } finally {
    // 6. Release lock atomically (Lua: only delete if value matches our workerId)
    try {
      await redis.eval(
        `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`,
        ['rt:drain:lock'],
        [workerId]
      )
    } catch {
      // Lock will expire via TTL
    }
  }
}

// ─── Heartbeat Drain ───

async function drainHeartbeats(redis: any, supabase: SupabaseClient): Promise<number> {
  // SCAN for active rt:*:live hashes
  const keys: string[] = []
  let cursor = 0
  do {
    const [nextCursor, batch] = await redis.scan(cursor, { match: 'rt:*:live', count: HEARTBEAT_BATCH })
    cursor = Number(nextCursor)
    keys.push(...(batch as string[]))
  } while (cursor !== 0 && keys.length < HEARTBEAT_BATCH)

  if (keys.length === 0) return 0

  // Pipeline HGETALL for each
  const pipeline = redis.pipeline()
  for (const key of keys) {
    pipeline.hgetall(key)
  }
  const results = await pipeline.exec()

  // Build parallel updates (avoids N+1 sequential round-trips)
  const updates: Promise<boolean>[] = []
  for (let i = 0; i < keys.length; i++) {
    const data = results[i] as Record<string, string> | null
    if (!data || !data.lastSeenAt) continue

    const runtimeId = keys[i].replace(/^rt:/, '').replace(/:live$/, '')

    updates.push(
      Promise.resolve(supabase
        .from('dedicated_runtimes')
        .update({
          cpu_percent: Number(data.cpuPercent) || 0,
          ram_percent: Number(data.ramPercent) || 0,
          disk_percent: Number(data.diskPercent) || 0,
          gpu_percent: data.gpuPercent ? Number(data.gpuPercent) : null,
          last_seen_at: data.lastSeenAt,
          status: 'connected',
        })
        .eq('id', runtimeId)
        .eq('generation', Number(data.generation) || 0)
        .then(({ error }) => !error))
    )
  }

  const results_ = await Promise.all(updates)
  return results_.filter(Boolean).length
}

// ─── Event Drain ───

interface DrainStreamResult {
  /** Entries successfully persisted (or accepted as idempotent conflicts). */
  persisted: number
  /** Entries left in-stream because of a transient error; will retry next cycle. */
  deferred: number
  /** Entries promoted to DLQ after MAX_DRAIN_RETRIES consecutive failures. */
  dlqed: number
}

async function drainEvents(redis: any, supabase: SupabaseClient): Promise<DrainStreamResult> {
  const raw = await redis.xrange('rt:events', '-', '+', EVENT_BATCH) as any[]
  if (!raw || raw.length === 0) {
    await clearRetryCounter(redis, EVENT_RETRY_KEY).catch(() => {})
    return { persisted: 0, deferred: 0, dlqed: 0 }
  }

  const entries = parseStreamEntries(raw)
  if (entries.length === 0) {
    // Poison-pill guard: raw rows existed but every one was unparseable.
    // Without xdel'ing them, the malformed entries stay at head forever and
    // every future cycle re-scans them. Best-effort extract whatever IDs we
    // can salvage from the raw shapes and drop them so the stream advances.
    const poisonIds = extractRawIds(raw)
    if (poisonIds.length > 0) {
      console.warn(`[drain] Discarding ${poisonIds.length} unparseable rt:events entries (poison pill)`)
      await redis.xdel('rt:events', ...poisonIds).catch((err: unknown) => {
        console.error('[drain] Failed to XDEL poison rt:events entries:', err)
      })
    }
    return { persisted: 0, deferred: 0, dlqed: 0 }
  }
  const retryKey = getRetryKey(EVENT_RETRY_KEY, entries)

  // Build insert rows
  const rows = entries.map((e) => ({
    runtime_id: e.fields.runtime_id,
    org_id: e.fields.org_id,
    agent_id: e.fields.agent_id || null,
    event_type: e.fields.event_type,
    severity: e.fields.severity || 'info',
    payload: safeJsonParse(e.fields.payload),
    ingest_event_id: e.fields.ingest_event_id,
    created_at: e.fields.created_at || new Date().toISOString(),
  }))

  // Batch INSERT first for throughput. If we hit a unique violation on
  // ingest_event_id, Postgres aborts the whole statement, so we must reconcile
  // entry-by-entry before XDEL or we risk dropping fresh rows that happened to
  // share a batch with one duplicate.
  const { error } = await supabase
    .from('runtime_events')
    .insert(rows)
    .select('id')

  const ids = entries.map((e) => e.id)

  if (!error) {
    if (ids.length > 0) {
      await redis.xdel('rt:events', ...ids)
    }
    await clearRetryCounter(redis, retryKey).catch(() => {})
    return { persisted: entries.length, deferred: 0, dlqed: 0 }
  }

  if (isUniqueViolation(error)) {
    const reconciled = await reconcileEventBatchAfterConflict(supabase, entries, rows)
    if (reconciled.deferred === 0 && reconciled.persistedIds.length > 0) {
      await redis.xdel('rt:events', ...reconciled.persistedIds)
      await clearRetryCounter(redis, retryKey).catch(() => {})
      return { persisted: reconciled.persistedIds.length, deferred: 0, dlqed: 0 }
    }

    console.warn(
      `[drain] Event batch conflict reconciliation deferred (${reconciled.deferred} entries): ${reconciled.reason}`,
    )

    const retryCount = await incrRetryCounter(redis, retryKey)
    if (retryCount >= MAX_DRAIN_RETRIES) {
      const deferredEntries = entries.filter((entry) => !reconciled.persistedIdSet.has(entry.id))
      await moveBatchToDlq(redis, EVENT_DLQ_STREAM, 'rt:events', deferredEntries, {
        reason: reconciled.reason,
        code: reconciled.code,
      })
      if (reconciled.persistedIds.length > 0) {
        await redis.xdel('rt:events', ...reconciled.persistedIds).catch(() => {})
      }
      await clearRetryCounter(redis, retryKey).catch(() => {})
      console.error(
        `[drain] Event conflict-reconciliation batch promoted to DLQ after ${retryCount} failures: ${reconciled.reason}`,
      )
      return { persisted: reconciled.persistedIds.length, deferred: 0, dlqed: deferredEntries.length }
    }

    return { persisted: reconciled.persistedIds.length, deferred: reconciled.deferred, dlqed: 0 }
  }

  // Transient failure → keep entries in stream, bump retry counter, escalate to DLQ if stuck.
  console.warn(
    `[drain] Event insert deferred (${entries.length} entries): ${error.message}`,
    error.code ? `[code=${error.code}]` : '',
  )

  const retryCount = await incrRetryCounter(redis, retryKey)
  if (retryCount >= MAX_DRAIN_RETRIES) {
    await moveBatchToDlq(redis, EVENT_DLQ_STREAM, 'rt:events', entries, {
      reason: error.message,
      code: error.code ?? '',
    })
    await clearRetryCounter(redis, retryKey).catch(() => {})
    console.error(
      `[drain] Event batch promoted to DLQ after ${retryCount} failures: ${error.message}`,
    )
    return { persisted: 0, deferred: 0, dlqed: entries.length }
  }

  return { persisted: 0, deferred: entries.length, dlqed: 0 }
}

async function reconcileEventBatchAfterConflict(
  supabase: SupabaseClient,
  entries: StreamEntry[],
  rows: Array<Record<string, unknown>>,
): Promise<{
  persistedIds: string[]
  persistedIdSet: Set<string>
  deferred: number
  reason: string
  code: string
}> {
  const persistedIds: string[] = []
  let reason = 'event conflict reconciliation failed'
  let code = PG_UNIQUE_VIOLATION

  for (let i = 0; i < rows.length; i++) {
    const { error: rowError } = await supabase
      .from('runtime_events')
      .insert(rows[i])
      .select('id')

    if (!rowError || isUniqueViolation(rowError)) {
      persistedIds.push(entries[i].id)
      continue
    }

    reason = rowError.message
    code = rowError.code ?? ''
  }

  return {
    persistedIds,
    persistedIdSet: new Set(persistedIds),
    deferred: entries.length - persistedIds.length,
    reason,
    code,
  }
}

// ─── Cost Drain ───

async function drainCosts(redis: any, supabase: SupabaseClient): Promise<DrainStreamResult> {
  const raw = await redis.xrange('rt:costs', '-', '+', COST_BATCH) as any[]
  if (!raw || raw.length === 0) {
    await clearRetryCounter(redis, COST_RETRY_KEY).catch(() => {})
    return { persisted: 0, deferred: 0, dlqed: 0 }
  }

  const entries = parseStreamEntries(raw)
  if (entries.length === 0) {
    const poisonIds = extractRawIds(raw)
    if (poisonIds.length > 0) {
      console.warn(`[drain] Discarding ${poisonIds.length} unparseable rt:costs entries (poison pill)`)
      await redis.xdel('rt:costs', ...poisonIds).catch((err: unknown) => {
        console.error('[drain] Failed to XDEL poison rt:costs entries:', err)
      })
    }
    return { persisted: 0, deferred: 0, dlqed: 0 }
  }
  const retryKey = getRetryKey(COST_RETRY_KEY, entries)

  // Group by agent_id + date for upsert
  const grouped = new Map<string, {
    agentId: string
    orgId: string
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
    runtimeId: string
    windowStart: string | null
    costSeq: number
  }>()

  for (const e of entries) {
    const date = new Date().toISOString().split('T')[0]
    const key = `${e.fields.agent_id}:${date}`
    const existing = grouped.get(key)

    if (existing) {
      existing.inputTokens += Number(e.fields.input_tokens) || 0
      existing.outputTokens += Number(e.fields.output_tokens) || 0
      existing.estimatedCostUsd += Number(e.fields.estimated_cost_usd) || 0
    } else {
      grouped.set(key, {
        agentId: e.fields.agent_id,
        orgId: e.fields.org_id,
        inputTokens: Number(e.fields.input_tokens) || 0,
        outputTokens: Number(e.fields.output_tokens) || 0,
        estimatedCostUsd: Number(e.fields.estimated_cost_usd) || 0,
        runtimeId: e.fields.runtime_id,
        windowStart: e.fields.window_start || null,
        costSeq: Number(e.fields.cost_seq) || 0,
      })
    }
  }

  // Upsert each group. If ANY upsert errors with a non-conflict code, defer
  // the whole batch (cost is monetary — never silently drop).
  let deferReason: { message: string; code: string } | null = null

  for (const [, group] of grouped) {
    const date = new Date().toISOString().split('T')[0]

    // Read-then-accumulate pattern (same as existing upsertRuntimeCosts)
    const { data: existing, error: selectError } = await supabase
      .from('mc_agent_cost_tracking')
      .select('input_tokens, output_tokens, estimated_cost_usd')
      .eq('agent_id', group.agentId)
      .eq('date', date)
      .maybeSingle()

    if (selectError && !isUniqueViolation(selectError)) {
      deferReason = { message: selectError.message, code: selectError.code ?? '' }
      break
    }

    const row: Record<string, unknown> = {
      agent_id: group.agentId,
      org_id: group.orgId,
      date,
      input_tokens: (existing?.input_tokens ?? 0) + group.inputTokens,
      output_tokens: (existing?.output_tokens ?? 0) + group.outputTokens,
      estimated_cost_usd: (existing?.estimated_cost_usd ?? 0) + group.estimatedCostUsd,
      runtime_id: group.runtimeId,
    }

    if (group.windowStart) {
      row.window_start = group.windowStart
      row.cost_seq = group.costSeq
    }

    const { error: upsertError } = await supabase
      .from('mc_agent_cost_tracking')
      .upsert(row, { onConflict: 'agent_id,date' })

    if (upsertError && !isUniqueViolation(upsertError)) {
      deferReason = { message: upsertError.message, code: upsertError.code ?? '' }
      break
    }
  }

  const ids = entries.map((e) => e.id)

  if (!deferReason) {
    if (ids.length > 0) {
      await redis.xdel('rt:costs', ...ids)
    }
    await clearRetryCounter(redis, retryKey).catch(() => {})
    return { persisted: entries.length, deferred: 0, dlqed: 0 }
  }

  console.warn(
    `[drain] Cost upsert deferred (${entries.length} entries): ${deferReason.message}`,
    deferReason.code ? `[code=${deferReason.code}]` : '',
  )

  const retryCount = await incrRetryCounter(redis, retryKey)
  if (retryCount >= MAX_DRAIN_RETRIES) {
    await moveBatchToDlq(redis, COST_DLQ_STREAM, 'rt:costs', entries, {
      reason: deferReason.message,
      code: deferReason.code ?? '',
    })
    await clearRetryCounter(redis, retryKey).catch(() => {})
    console.error(
      `[drain] Cost batch promoted to DLQ after ${retryCount} failures: ${deferReason.message}`,
    )
    return { persisted: 0, deferred: 0, dlqed: entries.length }
  }

  return { persisted: 0, deferred: entries.length, dlqed: 0 }
}

// ─── Retry / DLQ helpers ───

async function incrRetryCounter(redis: any, key: string): Promise<number> {
  const count = await redis.incr(key)
  // 5 minute TTL — long enough for many retry cycles, short enough that the
  // counter resets if the stream is empty for a while.
  await redis.expire(key, 300).catch(() => {})
  return Number(count) || 0
}

async function clearRetryCounter(redis: any, keyPrefix: string): Promise<void> {
  const keys = await findRetryKeys(redis, keyPrefix)
  if (keys.length === 0) return

  await redis.del(...keys).catch(() => {})
}

async function findRetryKeys(redis: any, keyPrefix: string): Promise<string[]> {
  const exact = await redis.get(keyPrefix).catch(() => null)
  if (exact !== null && exact !== undefined) {
    return [keyPrefix]
  }

  const keys: string[] = []
  let cursor = 0
  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match: `${keyPrefix}:*`,
      count: 100,
    })
    cursor = Number(nextCursor)
    keys.push(...(batch as string[]))
  } while (cursor !== 0)

  return keys
}

function getRetryKey(baseKey: string, entries: StreamEntry[]): string {
  const headId = entries[0]?.id
  return headId ? `${baseKey}:${headId}` : baseKey
}

async function moveBatchToDlq(
  redis: any,
  dlqStream: string,
  sourceStream: string,
  entries: StreamEntry[],
  meta: { reason: string; code: string },
): Promise<void> {
  const dlqAt = new Date().toISOString()
  const dlqSucceededIds: string[] = []
  for (const entry of entries) {
    const fields = {
      ...entry.fields,
      _dlq_source_id: entry.id,
      _dlq_reason: meta.reason || 'unknown',
      _dlq_code: meta.code || '',
      _dlq_at: dlqAt,
    }
    // XADD writes a fresh stream entry; ID is server-generated.
    await redis.xadd(dlqStream, '*', fields).then(() => {
      dlqSucceededIds.push(entry.id)
    }).catch((err: unknown) => {
      console.error(`[drain] Failed to XADD to ${dlqStream}:`, err)
    })
  }
  if (dlqSucceededIds.length > 0) {
    await redis.xdel(sourceStream, ...dlqSucceededIds).catch((err: unknown) => {
      console.error(`[drain] Failed to XDEL from ${sourceStream} after DLQ:`, err)
    })
  }
}

// ─── Helpers ───

interface StreamEntry {
  id: string
  fields: Record<string, string>
}

/**
 * Best-effort ID extraction from raw stream rows that failed to parse into
 * `StreamEntry`. Used to xdel poison-pill entries so a single malformed row
 * cannot block the stream forever. Mirrors the two shapes that
 * `parseStreamEntries` accepts.
 */
function extractRawIds(raw: any[]): string[] {
  if (!raw || !Array.isArray(raw)) return []
  const ids: string[] = []
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'id' in entry) {
      ids.push(String((entry as { id: unknown }).id))
    } else if (Array.isArray(entry) && entry.length >= 1) {
      ids.push(String(entry[0]))
    }
  }
  return ids
}

function parseStreamEntries(raw: any[]): StreamEntry[] {
  if (!raw || !Array.isArray(raw)) return []

  return raw.map((entry) => {
    if (typeof entry === 'object' && !Array.isArray(entry)) {
      const { id, ...fields } = entry
      return { id: String(id), fields: fields as Record<string, string> }
    }
    if (Array.isArray(entry) && entry.length >= 2) {
      const [id, fieldArr] = entry
      const fields: Record<string, string> = {}
      if (Array.isArray(fieldArr)) {
        for (let i = 0; i < fieldArr.length; i += 2) {
          fields[fieldArr[i]] = String(fieldArr[i + 1])
        }
      }
      return { id: String(id), fields }
    }
    return null
  }).filter((e): e is StreamEntry => e !== null)
}

function safeJsonParse(str: string): Record<string, unknown> {
  if (!str) return {}
  try {
    const parsed = JSON.parse(str)
    return parsed && typeof parsed === 'object' ? parsed : { _raw: parsed }
  } catch (err) {
    // Surface corruption rather than silently dropping it: keep the raw payload
    // visible in runtime_events so operators can debug producer-side bugs.
    console.warn('[drain] safeJsonParse failed:', err instanceof Error ? err.message : err)
    return {
      _parse_error: true,
      _parse_message: err instanceof Error ? err.message : 'unknown',
      _raw: str.length > 1024 ? `${str.slice(0, 1024)}…(truncated)` : str,
    }
  }
}

// ─── Worker Redis client (separate from src/lib/redis which has 'server-only') ───

let workerRedis: any = null

async function getWorkerRedis() {
  if (workerRedis) return workerRedis

  const redisEnv = getRedisRestEnv()
  if (!redisEnv) return null

  const { Redis } = await import('@upstash/redis')
  workerRedis = new Redis(redisEnv)
  return workerRedis
}

function isUpstashQuotaExceeded(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('ERR max requests limit exceeded')
}

function enterUpstashQuotaBackoff(err: unknown): void {
  upstashQuotaBackoffUntil = Date.now() + UPSTASH_QUOTA_BACKOFF_MS
  if (upstashQuotaWarningIssued) return
  upstashQuotaWarningIssued = true
  const message = err instanceof Error ? err.message : String(err)
  console.warn(
    `[drain] Upstash quota exceeded; skipping runtime-drain for ${Math.round(UPSTASH_QUOTA_BACKOFF_MS / 60000)}m: ${message}`,
  )
}

export function __resetRuntimeDrainBackoffForTests(): void {
  upstashQuotaBackoffUntil = 0
  upstashQuotaWarningIssued = false
  workerRedis = null
}
