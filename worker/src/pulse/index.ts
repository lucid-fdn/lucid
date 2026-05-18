/**
 * Pulse — Distributed Agent Orchestration Engine
 *
 * Barrel exports for the Pulse module.
 * Replaces polling loops with event-driven priority queue + Redis TTL leases.
 */

// Core
export { PulseQueue } from './queue.js'
export { OrphanDetector } from './orphan-detector.js'
export { RetryDrainer } from './retry-drainer.js'
export { getPulseRedis, resetPulseRedis, shutdownPulseRedis, bootstrapConsumerGroups } from './redis.js'
export type { IPulseRedisAdapter, IPulsePipeline } from './adapters/types.js'
export { RedisHealthProbe, type CircuitState, type RedisHealthStatus, type RedisHealthConfig } from './redis-health.js'
export { CLAIM_LUA, CONDITIONAL_DEL_LUA, PLAIN_CONDITIONAL_DEL_LUA, FLOOR_DECR_LUA, RENEW_LEASE_LUA } from './lua-scripts.js'

// Types
export {
  type PulseJob,
  type PulseEventType,
  type PulsePriority,
  type PulseRunStatus,
  type PulseLeaseInfo,
  type PulseConfig,
  DEFAULT_PULSE_CONFIG,
  PulseKeys,
} from './types.js'

// Workers
export { BaseWorker } from './workers/base-worker.js'
export { InboundWorker } from './workers/inbound-worker.js'
export { OutboundWorker } from './workers/outbound-worker.js'
export { ScheduledWorker } from './workers/scheduled-worker.js'

// Agent Runs
export { initAgentRuns, recordClaim, recordComplete, recordFail, recordDlq } from './agent-runs.js'

// Executors (Phase 3N)
export type { StepExecutor, StepExecutionContext, StepType } from './executors/types.js'
export { ExecutorRegistry } from './executors/registry.js'
export { ProcessorExecutor } from './executors/processor.js'
export { WebhookExecutor, generateCallbackToken, verifyCallbackToken } from './executors/webhook.js'
export { ApprovalExecutor, estimateRiskLevel } from './executors/approval.js'
export { createStep, updateStepStatus, getStepById } from './executors/step-tracker.js'
export { createDefaultRegistry } from './executors/index.js'

// Enqueuers
export { enqueueInboundEvent, sweepPendingInboundEvents } from './enqueue/inbound.js'
export { enqueueOutboundEvent, sweepPendingOutboundEvents } from './enqueue/outbound.js'
export { scanAndEnqueueScheduledTasks } from './enqueue/scheduled.js'
