/**
 * DAG Planner Types — Phase 4N-a, Task 20.
 *
 * Mirror of `contracts/dag.ts`. The canonical source lives in contracts/
 * (imported by Next.js src/), but the worker tsconfig has `rootDir: ./src`
 * so it cannot import value modules from outside worker/src. Both copies
 * MUST stay byte-equivalent — `worker/src/pulse/__tests__/contract-sync.test.ts`
 * enforces this.
 *
 * Internal-only types (DagInstance, DagNodeRow, etc.) live below the mirror
 * region — they describe DB row shapes and scheduler internals that the
 * Next.js side never touches.
 */

// ============================================================================
// MIRROR REGION (must match contracts/dag.ts byte-for-byte)
// ============================================================================

export const DAG_NODE_TYPES = [
  'leaf',
  'group',
  'barrier',
  'expansion_zone',
  'approval',
  // Phase 4N Human+PM Integration — human task node. When promoted,
  // the scheduler creates a human_work_items row instead of a Pulse step
  'human_task',
] as const
export type DagNodeType = (typeof DAG_NODE_TYPES)[number]

export const DAG_NODE_STATUSES = [
  'pending',
  'ready',
  'running',
  'completed',
  'failed',
  'skipped',
  'superseded',
  'cancelled',
] as const
export type DagNodeStatus = (typeof DAG_NODE_STATUSES)[number]

export const DAG_STATUSES = [
  'pending',
  'running',
  'blocked',
  'paused',
  'completed',
  'failed',
  'cancelled',
] as const
export type DagStatus = (typeof DAG_STATUSES)[number]

export const DAG_SOURCES = ['template', 'agent_authored', 'hybrid'] as const
export type DagSource = (typeof DAG_SOURCES)[number]

export const DAG_EDGE_KINDS = ['data', 'order', 'barrier'] as const
export type DagEdgeKind = (typeof DAG_EDGE_KINDS)[number]

export const DAG_MUTATION_TYPES = [
  'expand',
  'cancel',
  'supersede',
  'budget_rebalance',
] as const
export type DagMutationType = (typeof DAG_MUTATION_TYPES)[number]

export const DAG_MUTATION_SOURCES = ['agent', 'operator', 'system'] as const
export type DagMutationSource = (typeof DAG_MUTATION_SOURCES)[number]

export const DAG_BUDGET_EVENT_TYPES = [
  'tokens',
  'usd',
  'tool_call',
  'wall_seconds',
  'reservation',
  'release',
] as const
export type DagBudgetEventType = (typeof DAG_BUDGET_EVENT_TYPES)[number]

export const DAG_CONFIDENCE_SOURCES = ['static', 'router', 'self_report'] as const
export type DagConfidenceSource = (typeof DAG_CONFIDENCE_SOURCES)[number]

export interface DagSpecNode {
  node_key: string
  node_type: DagNodeType
  step_type?: 'inbound' | 'outbound' | 'scheduled' | 'webhook' | 'approval'
  runtime_target?: string
  route_class?: 'fast' | 'strong' | 'external'
  payload?: unknown
  confidence_floor?: number
}

export interface DagSpecEdge {
  parent: string
  child: string
  edge_kind?: DagEdgeKind
}

export interface DagSpec {
  nodes: DagSpecNode[]
  edges: DagSpecEdge[]
  expansion_zones?: string[]
  metadata?: Record<string, unknown>
}

export interface StepRunPacket {
  stepId: string
  dagId: string
  dagNodeId: string
  stepType: 'inbound' | 'outbound' | 'scheduled' | 'webhook' | 'approval'
  attempt: number
  leaseExpiresAt: string
  payload: unknown
  agentContext?: {
    soulSnapshot?: string | null
    boardMemorySnapshot?: string | null
  }
}

// ============================================================================
// INTERNAL-ONLY TYPES (worker scheduler/planner internals — not mirrored)
// ============================================================================

/** DB row shape for orchestration_dags. */
export interface DagInstance {
  id: string
  org_id: string
  agent_id: string
  source: DagSource
  template_id: string | null
  root_event_id: string | null
  root_event_type: 'inbound' | 'outbound' | 'scheduled' | 'webhook' | null
  status: DagStatus
  graph_version: number
  total_nodes: number
  completed_nodes: number
  failed_nodes: number
  ready_nodes: number
  budget_max_tokens: number | null
  budget_max_usd: string | null
  budget_max_wall_seconds: number | null
  budget_max_tool_calls: number | null
  replay_of_dag_id: string | null
  replay_from_node_id: string | null
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  created_at: string
  updated_at: string
}

/** DB row shape for orchestration_dag_nodes. */
export interface DagNodeRow {
  id: string
  dag_id: string
  node_key: string
  node_type: DagNodeType
  step_type: string | null
  runtime_target: string | null
  route_class: string | null
  payload: unknown
  confidence_floor: number | null
  confidence_observed: number | null
  confidence_source: DagConfidenceSource | null
  pending_parent_count: number
  status: DagNodeStatus
  step_id: string | null
  superseded_at: string | null
  superseded_by_node_id: string | null
  ready_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Diff shape stored in `orchestration_dag_mutations.payload`.
 *
 * The mutator RPC writes the rows it INSERTed into nodes/edges via
 * `jsonb_build_object('added_nodes', p_new_nodes, 'added_edges', p_new_edges)`,
 * so the JSON keys are flat (`added_nodes` / `added_edges`) and each element
 * carries the full row shape — including the minted `id` UUID and the
 * normalized empty-string defaults for missing optional columns. Replay
 * decodes these back into `DagSpecNode` / `DagSpecEdge` via the helpers in
 * `replay.ts`.
 */
export interface StoredMutationNode {
  id: string
  node_key: string
  node_type: string
  step_type: string | null
  runtime_target: string | null
  route_class: string | null
  payload: unknown
  /** Stored as a numeric string by the RPC ("" when unset). */
  confidence_floor: string | null
}

export interface StoredMutationEdge {
  parent_node_id: string
  child_node_id: string
  edge_kind: string | null
}

export interface MutationDiff {
  added_nodes?: StoredMutationNode[]
  added_edges?: StoredMutationEdge[]
  removed_node_ids?: string[]
  removed_edge_ids?: string[]
  changed?: Record<string, unknown>
}

/** Live budget snapshot — read from Redis on the hot path, mirrored to DB. */
export interface BudgetSnapshot {
  tokens_used: number
  usd_used: number
  tool_calls_used: number
  wall_seconds_used: number
}

