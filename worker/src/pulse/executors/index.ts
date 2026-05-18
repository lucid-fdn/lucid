/**
 * Pulse Executors — Barrel Exports
 *
 * Pluggable step execution for Pulse jobs.
 * ProcessorExecutor wraps existing processors (zero behavior change).
 */

export type { StepExecutor, StepExecutionContext, StepType } from './types.js'
export { ExecutorRegistry } from './registry.js'
export { ProcessorExecutor } from './processor.js'
export { WebhookExecutor, generateCallbackToken, verifyCallbackToken } from './webhook.js'
export { ApprovalExecutor, estimateRiskLevel } from './approval.js'
export { PmSyncOutboundExecutor } from './pm-sync-outbound.js'
export { LinearAgentSessionExecutor } from './linear-agent-session.js'
export { createStep, updateStepStatus, getStepById } from './step-tracker.js'

import { ExecutorRegistry } from './registry.js'
import { ProcessorExecutor } from './processor.js'
import { WebhookExecutor } from './webhook.js'
import { ApprovalExecutor } from './approval.js'
import { PmSyncOutboundExecutor } from './pm-sync-outbound.js'
import { LinearAgentSessionExecutor } from './linear-agent-session.js'

/**
 * Create the default executor registry.
 * Order: specialized executors first, ProcessorExecutor last as catch-all.
 */
export function createDefaultRegistry(): ExecutorRegistry {
  const registry = new ExecutorRegistry()
  registry.register(new WebhookExecutor())
  registry.register(new ApprovalExecutor())
  registry.register(new PmSyncOutboundExecutor())
  registry.register(new LinearAgentSessionExecutor())
  registry.register(new ProcessorExecutor())
  return registry
}
