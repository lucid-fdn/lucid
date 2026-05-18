/**
 * Pulse Queue — Type Definitions
 *
 * Core types for the distributed agent orchestration engine.
 * Event-driven priority queue with Redis TTL leases.
 *
 * IMPORTANT: Types and PulseKeys are mirrored in contracts/pulse.ts
 * for control plane use. Keep both in sync.
 */

export type PulseEventType = 'inbound' | 'outbound' | 'scheduled' | 'human_task'
export type PulsePriority = 'critical' | 'normal' | 'background'
export type PulseRunStatus = 'claimed' | 'running' | 'completed' | 'failed' | 'dlq'

export interface PulseJob {
  /** Unique run ID for this claim (UUID) */
  runId: string
  /** The DB event ID being processed */
  eventId: string
  /** Event type determines which ZSET family to use */
  eventType: PulseEventType
  /** Agent that owns this event */
  agentId: string
  /** Organization scope */
  orgId: string
  /** Priority lane */
  priority: PulsePriority
  /** Retry attempt (0 = first try) */
  attempt: number
  /** Timestamp when enqueued (ms) */
  enqueuedAt: number

  // ─── Phase 3N Step Execution Protocol (all optional, backwards compatible) ───

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

  /** Redis Stream entry metadata used to acknowledge only after lease setup. */
  streamEntry?: {
    streamKey: string
    entryId: string
  }
}

export interface PulseLeaseInfo {
  /** Worker that holds the lease */
  workerId: string
  /** Agent being processed */
  agentId: string
  /** Event being processed */
  eventId: string
  /** Event type */
  eventType: PulseEventType
  /** Retry attempt */
  attempt: number
  /** When the lease was acquired (ISO) */
  claimedAt: string
}

export interface PulseConfig {
  /** Lease TTL in seconds (default 60) */
  leaseTtlSeconds: number
  /** Max jobs to claim per loop iteration */
  claimBatchSize: number
  /** Max concurrent runs per agent (default 3) */
  maxConcurrentPerAgent: number
  /** Max retry attempts before DLQ (default 5) */
  maxAttempts: number
  /**
   * Base retry delay in ms (multiplied by attempt number).
   * INVARIANT: maxAttempts × retryBaseDelayMs MUST be < 300_000 (dedup TTL).
   * With defaults: 5 × 5000 = 25s << 300s. If either is raised, bump dedup TTL.
   */
  retryBaseDelayMs: number
  /** DLQ max length per type (default 1000) */
  dlqMaxLength: number
  /** Orphan detector interval in ms (default 60000) */
  orphanDetectorIntervalMs: number
  /** Sweep safety net interval in ms (default 30000) */
  sweepIntervalMs: number
  /** Wake scanner interval for scheduled tasks in ms (default 10000) */
  wakeScannerIntervalMs: number
  /** XREADGROUP BLOCK timeout in ms (default 2000) */
  blockTimeoutMs: number
}

export const DEFAULT_PULSE_CONFIG: PulseConfig = {
  leaseTtlSeconds: 60,
  claimBatchSize: 5,
  maxConcurrentPerAgent: 3,
  maxAttempts: 5,
  retryBaseDelayMs: 5000,
  dlqMaxLength: 1000,
  orphanDetectorIntervalMs: 60_000,
  sweepIntervalMs: 30_000,
  wakeScannerIntervalMs: 10_000,
  blockTimeoutMs: 2000,
}

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

  /** Daily metrics hash */
  metrics: (date?: string) => {
    const d = date || new Date().toISOString().split('T')[0]
    return `pulse:metrics:${d}`
  },

  /** Orphan detector lock */
  orphanLock: () => 'pulse:orphan:lock',
} as const
