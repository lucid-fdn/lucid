/**
 * Introspection Stream — Shared types between worker and frontend.
 *
 * Product name: "Consciousness Stream" (user-facing)
 * Internal name: "Introspection Stream" (code, DB, types)
 */

export type IntrospectionKind =
  | 'run_start'
  | 'context_loaded'
  | 'routing_decision'
  | 'llm_start'
  | 'llm_end'
  | 'tool_start'
  | 'tool_cache_hit'
  | 'tool_result'
  | 'tool_error'
  | 'approval_wait'
  | 'approval_resolved'
  | 'cost_update'
  | 'memory_load'
  | 'memory_extract'
  | 'subagent_spawn'
  | 'subagent_complete'
  | 'run_end'

export interface IntrospectionEvent {
  id: string
  org_id: string
  agent_id: string
  run_id: string
  kind: IntrospectionKind
  data: Record<string, unknown>
  tool_call_id?: string
  seq: number
  created_at: string
}

/** Emotion states derived from event patterns */
export type IntrospectionEmotion =
  | 'idle'       // No active run — dreaming
  | 'confident'  // Running smoothly, all tools succeeding
  | 'cautious'   // Elevated tool or approval gate pending
  | 'strained'   // Errors, retries, high cost
  | 'learning'   // Memory extraction in progress
