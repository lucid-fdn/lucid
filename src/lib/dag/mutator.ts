/**
 * DagMutator — control-plane mirror of `worker/src/pulse/dag/mutator.ts`.
 *
 * Used by the operator mutation API (`POST /api/dags/[id]/mutate`) to apply
 * DAG expansions from Mission Control WITHOUT round-tripping through the
 * worker. The worker still owns agent-driven mutations via its in-process
 * mutator; this module runs on Next.js server using the service-role
 * supabase client + the control-plane Pulse Redis client used by claim-proxy.
 *
 * Behavioral parity with the worker mutator is required. The RPC
 * (`dag_apply_expand_mutation`) is the authoritative gate — this module's
 * pre-check, Redis advisory lock, and cycle detection are fast-fail
 * optimizations on top of that RPC, not a replacement.
 *
 * See: `worker/src/pulse/dag/mutator.ts` (source of truth for algorithm)
 *      `docs/superpowers/specs/2026-04-06-nerve-dag-planner-design.md` §4.3
 */

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Redis } from '@upstash/redis'
import type {
  DagMutationType,
  DagMutationSource,
  DagSpecNode,
  DagSpecEdge,
} from '@contracts/dag'
import { detectCycle } from './cycle-detector'

// ─── Errors ────────────────────────────────────────────────────────────────────

export class CasConflictError extends Error {
  constructor(
    public readonly dagId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(
      `[dag-mutator] CAS conflict on ${dagId}: expected ${expectedVersion}, got ${actualVersion}`,
    )
    this.name = 'CasConflictError'
  }
}

export class CycleError extends Error {
  constructor(
    public readonly dagId: string,
    public readonly cycleNodes: string[],
  ) {
    super(`[dag-mutator] cycle detected in ${dagId}: ${cycleNodes.join(' -> ')}`)
    this.name = 'CycleError'
  }
}

export class LockTimeoutError extends Error {
  constructor(public readonly dagId: string) {
    super(`[dag-mutator] could not acquire advisory lock for ${dagId}`)
    this.name = 'LockTimeoutError'
  }
}

export class DagNotFoundError extends Error {
  constructor(public readonly dagId: string) {
    super(`[dag-mutator] dag ${dagId} not found`)
    this.name = 'DagNotFoundError'
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface DagMutatorAdditions {
  nodes: DagSpecNode[]
  edges: DagSpecEdge[]
}

export interface DagMutatorInput {
  dagId: string
  expectedVersion: number
  idempotencyKey: string
  mutationType: DagMutationType
  source: DagMutationSource
  sourceRunId?: string | null
  /** Audit-only — the mutator does not enforce containment. */
  targetNodeId?: string | null
  additions: DagMutatorAdditions
  /** Worker/operator identifier stamped into `applied_by_worker`. */
  workerId?: string
}

export interface DagMutatorResult {
  appliedGraphVersion: number
  /** UUIDs of newly inserted nodes in template order. Empty on idempotent replay. */
  addedNodeIds: string[]
  /** caller node_key → minted UUID. Empty on idempotent replay. */
  nodeIdsByKey: Map<string, string>
  idempotent: boolean
}

type UuidFn = () => string
const defaultUuid: UuidFn = () => globalThis.crypto.randomUUID()

interface DagMutatorOptions {
  uuid?: UuidFn
  lockTtlSeconds?: number
}

export class DagMutator {
  private readonly uuid: UuidFn
  private readonly lockTtlSeconds: number

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly redis: Redis | null,
    opts: DagMutatorOptions = {},
  ) {
    this.uuid = opts.uuid ?? defaultUuid
    this.lockTtlSeconds = opts.lockTtlSeconds ?? 5
  }

  async apply(input: DagMutatorInput): Promise<DagMutatorResult> {
    // Step 2: pre-check graph_version (fast-fail before touching Redis)
    const preCheck = await this.fetchGraphVersion(input.dagId)
    if (preCheck === null) {
      throw new DagNotFoundError(input.dagId)
    }
    if (preCheck !== input.expectedVersion) {
      throw new CasConflictError(input.dagId, input.expectedVersion, preCheck)
    }

    // Step 4: acquire Redis advisory lock (optional — RPC is authoritative)
    const lockKey = `dag:${input.dagId}:lock`
    const lockToken = this.uuid()
    let lockHeld = false
    if (this.redis) {
      const acquired = await this.redis.set(lockKey, lockToken, {
        nx: true,
        ex: this.lockTtlSeconds,
      })
      if (acquired !== 'OK') {
        throw new LockTimeoutError(input.dagId)
      }
      lockHeld = true
    }

    try {
      // Step 5: re-check under the lock
      const underLock = await this.fetchGraphVersion(input.dagId)
      if (underLock === null) {
        throw new DagNotFoundError(input.dagId)
      }
      if (underLock !== input.expectedVersion) {
        throw new CasConflictError(input.dagId, input.expectedVersion, underLock)
      }

      // Step 6: cycle check (pure CPU, intentionally outside the DB tx)
      const existingEdges = await this.fetchExistingEdgeKeys(input.dagId)
      const proposedEdges = input.additions.edges.map((e) => ({
        parent: e.parent,
        child: e.child,
      }))
      const cycle = detectCycle(existingEdges, proposedEdges)
      if (cycle.hasCycle) {
        throw new CycleError(input.dagId, cycle.cycleNodes ?? [])
      }

      // Steps 7+8+9: CAS + insert nodes/edges + insert mutation (single RPC tx)
      const nodeIdsByKey = new Map<string, string>()
      for (const node of input.additions.nodes) {
        nodeIdsByKey.set(node.node_key, this.uuid())
      }

      const newNodesPayload = input.additions.nodes.map((node) => ({
        id: nodeIdsByKey.get(node.node_key)!,
        node_key: node.node_key,
        node_type: node.node_type,
        step_type: node.step_type ?? '',
        runtime_target: node.runtime_target ?? '',
        route_class: node.route_class ?? '',
        payload: node.payload ?? null,
        confidence_floor:
          node.confidence_floor != null ? String(node.confidence_floor) : '',
      }))

      // Edge endpoints may reference either an existing node UUID or a new
      // node by node_key. Resolve new ones via nodeIdsByKey; pass through
      // existing-node UUIDs as-is.
      const resolveEndpoint = (key: string): string => nodeIdsByKey.get(key) ?? key

      const newEdgesPayload = input.additions.edges.map((edge) => ({
        parent_node_id: resolveEndpoint(edge.parent),
        child_node_id: resolveEndpoint(edge.child),
        edge_kind: edge.edge_kind ?? 'data',
      }))

      const { data, error } = await this.supabase.rpc('dag_apply_expand_mutation', {
        p_dag_id: input.dagId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_mutation_type: input.mutationType,
        p_source: input.source,
        p_source_run_id: input.sourceRunId ?? null,
        p_target_node_id: input.targetNodeId ?? null,
        p_applied_by_worker: input.workerId ?? null,
        p_new_nodes: newNodesPayload,
        p_new_edges: newEdgesPayload,
      })

      if (error) {
        // 40001 = serialization_failure (raised by the RPC on CAS mismatch)
        if (error.code === '40001' || /cas_conflict/i.test(error.message ?? '')) {
          const actual = await this.fetchGraphVersion(input.dagId)
          throw new CasConflictError(
            input.dagId,
            input.expectedVersion,
            actual ?? -1,
          )
        }
        // 23505 = duplicate (dag_id, idempotency_key) → idempotent replay
        if (error.code === '23505' || /duplicate key/i.test(error.message ?? '')) {
          const prior = await this.fetchPriorMutation(input.dagId, input.idempotencyKey)
          return {
            appliedGraphVersion: prior?.applied_graph_version ?? input.expectedVersion,
            addedNodeIds: [],
            nodeIdsByKey: new Map(),
            idempotent: true,
          }
        }
        throw new Error(`[dag-mutator] dag_apply_expand_mutation failed: ${error.message}`)
      }

      const row = Array.isArray(data) ? data[0] : data
      if (!row) {
        throw new Error('[dag-mutator] dag_apply_expand_mutation returned no row')
      }

      const idempotent = row.idempotent === true
      return {
        appliedGraphVersion: row.applied_graph_version,
        addedNodeIds: idempotent ? [] : (row.added_node_ids ?? []),
        nodeIdsByKey: idempotent ? new Map() : nodeIdsByKey,
        idempotent,
      }
    } finally {
      // Step 10: release Redis lock on every exit path
      if (lockHeld && this.redis) {
        try {
          await this.redis.del(lockKey)
        } catch {
          // Ignore — lock TTL will clean up.
        }
      }
    }
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  private async fetchGraphVersion(dagId: string): Promise<number | null> {
    const { data, error } = await this.supabase
      .from('orchestration_dags')
      .select('graph_version')
      .eq('id', dagId)
      .maybeSingle()
    if (error) {
      throw new Error(`[dag-mutator] fetchGraphVersion failed: ${error.message}`)
    }
    return (data?.graph_version as number | undefined) ?? null
  }

  private async fetchExistingEdgeKeys(
    dagId: string,
  ): Promise<{ parent: string; child: string }[]> {
    const { data, error } = await this.supabase
      .from('orchestration_dag_edges')
      .select('parent_node_id, child_node_id')
      .eq('dag_id', dagId)
    if (error) {
      throw new Error(`[dag-mutator] fetchExistingEdgeKeys failed: ${error.message}`)
    }
    return (data ?? []).map((row: { parent_node_id: string; child_node_id: string }) => ({
      parent: row.parent_node_id,
      child: row.child_node_id,
    }))
  }

  private async fetchPriorMutation(
    dagId: string,
    idempotencyKey: string,
  ): Promise<{ applied_graph_version: number } | null> {
    const { data } = await this.supabase
      .from('orchestration_dag_mutations')
      .select('applied_graph_version')
      .eq('dag_id', dagId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    return (data as { applied_graph_version: number } | null) ?? null
  }
}

// ─── Input validation schema (for API routes) ──────────────────────────────────

import { z } from 'zod'
import { DAG_NODE_TYPES, DAG_EDGE_KINDS } from '@contracts/dag'

const nodeAdditionSchema = z.object({
  node_key: z.string().min(1).max(128),
  node_type: z.enum(DAG_NODE_TYPES),
  step_type: z
    .enum(['inbound', 'outbound', 'scheduled', 'webhook', 'approval'])
    .optional(),
  runtime_target: z.string().min(1).optional(),
  route_class: z.enum(['fast', 'strong', 'external']).optional(),
  payload: z.unknown().optional(),
  confidence_floor: z.number().min(0).max(1).optional(),
})

const edgeAdditionSchema = z.object({
  parent: z.string().min(1),
  child: z.string().min(1),
  edge_kind: z.enum(DAG_EDGE_KINDS).optional(),
})

export const mutateDagInputSchema = z.object({
  expectedVersion: z.number().int().min(1),
  idempotencyKey: z.string().min(1).max(256),
  mutationType: z.enum(['expand', 'cancel', 'supersede', 'budget_rebalance']).optional(),
  targetNodeId: z.string().uuid().nullable().optional(),
  additions: z.object({
    nodes: z.array(nodeAdditionSchema),
    edges: z.array(edgeAdditionSchema),
  }),
})

export type MutateDagInput = z.infer<typeof mutateDagInputSchema>
