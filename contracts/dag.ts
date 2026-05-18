/**
 * DAG Planner Contract — Phase 4N-a, Task 19.
 *
 * Shared types for the Nerve DAG Planner. Imported by:
 *   - worker/src/pulse/dag/        (planner, scheduler, mutator)
 *   - src/app/api/runtimes/steps/  (cross-runtime relay endpoints, Phase 4N-c)
 *   - src/app/api/dags/...         (operator UI / mission control)
 *
 * Why contracts/: worker tsconfig rootDir = ./src forbids importing from
 * outside worker/src. contracts/ is the only package both halves can read,
 * so type drift between worker and Next.js is impossible.
 *
 * See: docs/superpowers/specs/2026-04-06-nerve-dag-planner-design.md §3.
 */

import { z } from 'zod'

// ----------------------------------------------------------------------------
// Enums (mirror DB CHECK constraints in 20260407220000_orchestration_dag_core.sql)
// ----------------------------------------------------------------------------

export const DAG_NODE_TYPES = [
  'leaf',
  'group',
  'barrier',
  'expansion_zone',
  'approval',
  // Phase 4N Human+PM Integration — human task node. When promoted, the
  // scheduler creates a human_work_items row instead of a Pulse step; the
  // node is marked complete via dag_complete_node when the human (or an
  // external PM webhook) resolves the work item. See
  // docs/plans/2026-04-08-pulse-nerve-human-pm-integration.md
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

// ----------------------------------------------------------------------------
// DagSpec — template shape (operator-authored, validated by template-loader)
// ----------------------------------------------------------------------------

/**
 * Template node spec — what the operator writes when authoring a template.
 * `node_key` is stable within the template; the planner instantiates it into
 * a UUID at DAG creation time and uses node_key only as a lookup map.
 */
export interface DagSpecNode {
  node_key: string
  node_type: DagNodeType
  /** leaf-only: which executor will run this step */
  step_type?: 'inbound' | 'outbound' | 'scheduled' | 'webhook' | 'approval'
  /** shared | dedicated:{runtimeId} | webhook:{url} */
  runtime_target?: string
  route_class?: 'fast' | 'strong' | 'external'
  payload?: unknown
  /** Phase 5N pre-wire: minimum confidence required to execute this node */
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
  /** node_keys that agents may expand into during a run (Phase 4N-b) */
  expansion_zones?: string[]
  metadata?: Record<string, unknown>
}

// ----------------------------------------------------------------------------
// Zod schema — validates the `spec` JSONB column payload + REST API bodies.
// Single source of truth used by:
//   - worker/src/pulse/dag/template-loader.ts (runtime template fetch)
//   - src/lib/db/dag-templates.ts (REST API CRUD)
// ----------------------------------------------------------------------------

// Mirror the leaf step_type CHECK constraint in the migration.
export const DAG_LEAF_STEP_TYPES = [
  'inbound',
  'outbound',
  'scheduled',
  'webhook',
  'approval',
] as const
export type DagLeafStepType = (typeof DAG_LEAF_STEP_TYPES)[number]

export const DAG_ROUTE_CLASSES = ['fast', 'strong', 'external'] as const
export type DagRouteClass = (typeof DAG_ROUTE_CLASSES)[number]

export const dagSpecNodeSchema = z.object({
  node_key: z.string().min(1).max(128),
  node_type: z.enum(DAG_NODE_TYPES),
  step_type: z.enum(DAG_LEAF_STEP_TYPES).optional(),
  runtime_target: z.string().min(1).optional(),
  route_class: z.enum(DAG_ROUTE_CLASSES).optional(),
  payload: z.unknown().optional(),
  confidence_floor: z.number().min(0).max(1).optional(),
})

export const dagSpecEdgeSchema = z.object({
  parent: z.string().min(1),
  child: z.string().min(1),
  edge_kind: z.enum(DAG_EDGE_KINDS).optional(),
})

export const dagSpecSchema = z.object({
  nodes: z.array(dagSpecNodeSchema).min(1),
  edges: z.array(dagSpecEdgeSchema),
  expansion_zones: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// ----------------------------------------------------------------------------
// StepRunPacket — cross-runtime claim payload (Phase 4N-c)
// ----------------------------------------------------------------------------

/**
 * Bounded packet handed to dedicated runtimes when they claim a DAG step.
 * Mirrors the existing C1 RunPacket pattern but step-shaped instead of
 * inbound-message-shaped. Declared here so worker (writer) and Next.js
 * (relay endpoints) share the exact wire shape.
 */
export interface StepRunPacket {
  stepId: string
  dagId: string
  dagNodeId: string
  stepType: 'inbound' | 'outbound' | 'scheduled' | 'webhook' | 'approval'
  attempt: number
  leaseExpiresAt: string
  payload: unknown
  /** Optional pre-loaded agent context for cold-start runtimes */
  agentContext?: {
    soulSnapshot?: string | null
    boardMemorySnapshot?: string | null
  }
  /** Optional bounded assistant config for step executors that run the agent loop. */
  assistantConfig?: {
    id: string
    name: string
    engine?: 'openclaw' | 'hermes'
    systemPrompt: string | null
    soulContent: string | null
    runtimeFlavor?: 'shared' | 'c1_managed' | 'c2a_autonomous'
    modelId: string
    temperature: number
    maxTokens: number
    policyConfig: Record<string, unknown>
    memoryEnabled: boolean
    approvalRequiredTools: string[]
    orgId: string
  }
  memoryInjection?: string[]
  boardMemories?: string[]
  conversationSummary?: string | null
}
