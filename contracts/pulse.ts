/**
 * Pulse Contracts — Shared Constants
 *
 * Types, Redis key patterns, and Lua scripts shared between:
 * - worker/ (Pulse engine on Railway)
 * - src/ (Control plane on Vercel — claims on behalf of C1/C2a runtimes)
 *
 * NO framework dependencies. Pure TypeScript.
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export type PulseEventType = 'inbound' | 'outbound' | 'scheduled' | 'human_task'
export type PulsePriority = 'critical' | 'normal' | 'background'

/** Step types — extends event types with webhook and approval */
export type StepType = 'inbound' | 'outbound' | 'scheduled' | 'webhook' | 'approval'

export interface PulseJob {
  runId: string
  eventId: string
  eventType: PulseEventType
  agentId: string
  orgId: string
  priority: PulsePriority
  attempt: number
  enqueuedAt: number

  // Phase 3N Step Execution Protocol (all optional, backwards compatible)
  /** Overrides eventType for executor resolution (e.g., 'webhook', 'approval') */
  stepType?: string
  /** orchestration_steps.id for step tracking */
  stepId?: string
  /** URL to POST to for webhook executor */
  webhookUrl?: string
  /** Serialized JSON payload for webhook executor */
  webhookPayload?: string
  /** Configuration for approval executor */
  approvalConfig?: {
    toolName: string
    toolArgs: Record<string, unknown>
    timeoutSeconds: number
  }

  // ─── Phase 4N DAG Planner (all optional, backwards compatible) ─────────────
  /** DAG instance this step belongs to (orchestration_dags.id) */
  dagId?: string
  /** DAG node this step is materializing (orchestration_dag_nodes.id) */
  dagNodeId?: string
}

export interface PulseLeaseInfo {
  workerId: string
  agentId: string
  eventId: string
  eventType: PulseEventType
  attempt: number
  claimedAt: string
}

// ─── Shared Constants ────────────────────────────────────────────────────────────

/** Lease TTL in seconds — must match worker and control plane */
export const LEASE_TTL_SECONDS = 60

/** Max concurrent runs per agent — enforced by Redis counter on both sides */
export const MAX_CONCURRENT_PER_AGENT = 3

/** TTL for agent inflight counter keys in seconds (5 min auto-reset on idle) */
export const INFLIGHT_EXPIRE_SECONDS = 300

/** Max retry attempts before DLQ */
export const MAX_ATTEMPTS = 5

/** Metrics key TTL in seconds (7 days) */
export const METRICS_TTL_SECONDS = 7 * 24 * 60 * 60

// ─── Redis Key Patterns ─────────────────────────────────────────────────────────

/** Redis key helpers — hash-tagged for Lua co-location */
export const PulseKeys = {
  /** @deprecated Use stream() instead — ZSET keys for legacy reference */
  queue: (type: PulseEventType, priority: PulsePriority) =>
    `pulse:{${type}}:${priority}`,

  /** Stream key: pulse:stream:{type}:{priority} */
  stream: (type: PulseEventType, priority: PulsePriority) =>
    `pulse:stream:{${type}}:${priority}`,

  /** Retry ZSET key: pulse:retry:{type} (delayed retries only) */
  retry: (type: PulseEventType) =>
    `pulse:retry:{${type}}`,

  /** Dedup key: pulse:dedup:{eventId}:{attempt} */
  dedup: (eventId: string, attempt: number) =>
    `pulse:dedup:${eventId}:${attempt}`,

  /** Active run set */
  active: () => 'pulse:active',

  /** Lease key for a specific run */
  lease: (runId: string) => `pulse:lease:${runId}`,

  /** Per-agent inflight counter */
  agentInflight: (agentId: string) => `pulse:agent:${agentId}:inflight`,

  /** Dead letter queue per type */
  dlq: (type: PulseEventType) => `pulse:dlq:${type}`,

  /** Metrics hash */
  metrics: (date?: string) => {
    const d = date || new Date().toISOString().split('T')[0]
    return `pulse:metrics:${d}`
  },

  /** Orphan detector lock */
  orphanLock: () => 'pulse:orphan:lock',
} as const

// ─── Lua Scripts ────────────────────────────────────────────────────────────────

/**
 * @deprecated Pulse v2 uses XREADGROUP instead of Lua ZPOPMIN. Kept for compat.
 */
export const CLAIM_LUA = ''

/**
 * Atomic fencing for complete/fail — only DEL if lease JSON contains matching workerId.
 * KEYS[1]: pulse:lease:{runId}
 * ARGV[1]: workerId
 * Returns: 1 if deleted, 0 if stale
 */
export const CONDITIONAL_DEL_LUA = `
local val = redis.call("GET", KEYS[1])
if val == false then return 0 end
local pattern = '"workerId":"' .. ARGV[1] .. '"'
if string.find(val, pattern, 1, true) then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`

/**
 * Plain string conditional DEL — for non-JSON values (e.g., lock keys).
 * KEYS[1]: key to delete
 * ARGV[1]: expected value (exact match)
 * Returns: 1 if deleted, 0 if value doesn't match
 */
export const PLAIN_CONDITIONAL_DEL_LUA = `
local val = redis.call("GET", KEYS[1])
if val == false then return 0 end
if val == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`

/**
 * Decrement with floor guard — prevents negative counters.
 * KEYS[1]: pulse:agent:{agentId}:inflight
 * Returns: new value (floored to 0)
 */
export const FLOOR_DECR_LUA = `
local v = redis.call("DECR", KEYS[1])
if v < 0 then
  redis.call("SET", KEYS[1], "0")
  return 0
end
return v
`

/**
 * Atomic lease renewal with ownership check.
 * KEYS[1]: pulse:lease:{runId}
 * ARGV[1]: workerId
 * ARGV[2]: new TTL in seconds
 * Returns: 1 if renewed, 0 if expired/owned by another
 */
export const RENEW_LEASE_LUA = `
local val = redis.call("GET", KEYS[1])
if val == false then return 0 end
local pattern = '"workerId":"' .. ARGV[1] .. '"'
if string.find(val, pattern, 1, true) then
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2]))
  return 1
else
  return 0
end
`

/**
 * Atomic compare-and-set for inflight counter reset.
 * Only resets if current value > expected — prevents overwriting
 * a concurrent INCR from the claim loop's postClaimFlow.
 * KEYS[1]: pulse:agent:{agentId}:inflight
 * ARGV[1]: expected count (from active lease scan)
 * Returns: 1 if reset, 0 if current <= expected
 */
export const RESET_INFLIGHT_LUA = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local expected = tonumber(ARGV[1])
if current > expected then
  redis.call("SET", KEYS[1], ARGV[1])
  redis.call("EXPIRE", KEYS[1], 300)
  return 1
end
return 0
`
