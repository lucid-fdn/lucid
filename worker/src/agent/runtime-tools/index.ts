/**
 * Runtime Tools -- Agent primitives tightly coupled to the worker.
 *
 * These 5 tools exist because agents need infrastructure to operate as agents:
 * - Temporal autonomy (scheduler)
 * - Inter-agent communication (messaging)
 * - Recursive delegation (subagent)
 *
 * Everything else is a domain capability that belongs in the plugin system.
 */

// Scheduling
export { toolScheduleTask, toolListScheduledTasks, toolCancelScheduledTask } from './scheduler.js'

// Cross-agent messaging
export { toolSendMessageToAgent } from './messaging.js'

// Subagent orchestration
export { toolSpawnSubagent } from './subagent.js'

// DAG planning (Phase 4N-a)
export { toolPlanDag } from './dag-plan.js'

// DAG expansion (Phase 4N-b)
export { toolExpandDag } from './dag-expand.js'

// DAG status (Phase 4N-d)
export { toolDagStatus } from './dag-status.js'

// Identity
export { toolSoulEdit, clearRunEditCount } from './soul.js'

// Human work items (Phase 6)
export { toolCreateWorkItem } from './work-items.js'

// Feed events
export { emitAgentFeedEvent } from './feed-events.js'

// Types
export type { RuntimeToolContext } from './types.js'
