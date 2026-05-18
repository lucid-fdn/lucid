/**
 * DagMutator — Phase 4N-b, Task 35.
 *
 * Implements the spec §4.3 11-step mutation flow:
 *
 *   1. Receive mutation input from agent tool / operator API.
 *   2. Pre-check: SELECT current `graph_version`.
 *   3. If version mismatch → return CasConflictError (no DB writes,
 *      no Redis lock acquired).
 *   4. Acquire Redis advisory lock `dag:{dagId}:lock NX EX 5`. On
 *      failure → LockTimeoutError.
 *   5. Re-check `graph_version` under the lock (fresh SELECT).
 *   6. Run cycle-detector on (current edges ∪ proposed additions). On
 *      cycle → CycleError(offendingCycle).
 *   7+8+9. Single Postgres transaction (`dag_apply_expand_mutation` RPC):
 *      - CAS UPDATE `graph_version`
 *      - INSERT new nodes + edges
 *      - INSERT mutation row (UNIQUE(dag_id, idempotency_key) =
 *        idempotency boundary)
 *  10. Release Redis lock in `finally` (covers commit + rollback).
 *  11. Caller (or this method, after the lock release) fires
 *      `scheduler.onMutation(dagId, addedNodeIds)` to set
 *      `pending_parent_count` on the new nodes from the just-inserted
 *      edges and promote any with count=0 to 'ready'.
 *
 * Why the 11-step dance:
 *   - The pre-check (step 2) is a fast-fail optimization so misordered
 *     agents don't even acquire the lock.
 *   - The Redis advisory lock narrows the contention window for the
 *     CAS update (step 7), reducing wasted work under heavy
 *     concurrent expansion.
 *   - The cycle check is intentionally *outside* the DB transaction —
 *     it's pure CPU and we want it to abort early on bad input
 *     instead of opening a TX that will roll back.
 *   - Step 11 runs OUTSIDE the lock so a slow scheduler cannot
 *     deadlock other mutators.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { detectCycle } from './cycle-detector.js'
import type { DagSpecNode, DagSpecEdge, DagMutationType, DagMutationSource } from './types.js'
import type { IPulseRedisAdapter } from '../adapters/types.js'
import { PLAIN_CONDITIONAL_DEL_LUA } from '../lua-scripts.js'

// ─── Errors ────────────────────────────────────────────────────────────────────

export class CasConflictError extends Error {
  constructor(
    public readonly dagId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(`[dag-mutator] CAS conflict on ${dagId}: expected ${expectedVersion}, got ${actualVersion}`)
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

export class IdempotencyReplayError extends Error {
  constructor(
    public readonly dagId: string,
    public readonly idempotencyKey: string,
    public readonly priorAppliedVersion: number,
  ) {
    super(`[dag-mutator] idempotent replay of ${idempotencyKey} on ${dagId}`)
    this.name = 'IdempotencyReplayError'
  }
}

/**
 * HP3 — raised when an edge endpoint in `additions.edges` is neither a
 * node_key for one of the new nodes in the same mutation nor a valid UUID
 * for an existing DAG node. Without this, bogus strings from the agent
 * tool layer would fall through `resolveEndpoint` and surface as opaque
 * FK violations from the RPC (or, worse, as silent no-ops).
 */
export class InvalidEdgeEndpointError extends Error {
  constructor(
    public readonly dagId: string,
    public readonly endpoint: string,
    public readonly role: 'parent' | 'child',
  ) {
    super(
      `[dag-mutator] edge ${role} "${endpoint}" on ${dagId} is neither a new node_key nor a valid UUID`,
    )
    this.name = 'InvalidEdgeEndpointError'
  }
}

/**
 * RFC 4122 UUID shape (any version). Used to validate edge endpoints that
 * fall through `resolveEndpoint` — those MUST be UUIDs of existing nodes,
 * not arbitrary strings. The mutator does NOT verify the UUID actually
 * exists in `orchestration_dag_nodes`; that's the RPC's FK constraint.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  /** Anchor node the agent claims to be expanding under. Audit-only — the mutator does not enforce containment. */
  targetNodeId?: string | null
  additions: DagMutatorAdditions
  /** Worker identifier stamped into `applied_by_worker` for audit. */
  workerId?: string
}

export interface DagMutatorResult {
  appliedGraphVersion: number
  /** UUIDs of the newly-inserted nodes, in template order. Empty on idempotent replay. */
  addedNodeIds: string[]
  /** Map from caller node_key → minted UUID. Empty on idempotent replay. */
  nodeIdsByKey: Map<string, string>
  /** True when the call collided with a prior idempotency_key — caller should treat as no-op. */
  idempotent: boolean
}

type UuidFn = () => string
const defaultUuid: UuidFn = () => globalThis.crypto.randomUUID()

interface DagMutatorOptions {
  /** Override for tests — defaults to crypto.randomUUID() */
  uuid?: UuidFn
  /** Lock TTL in seconds. Spec calls for `EX 5` — short to bound deadlock blast radius. */
  lockTtlSeconds?: number
}

export class DagMutator {
  private readonly uuid: UuidFn
  private readonly lockTtlSeconds: number

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly redis: IPulseRedisAdapter | null,
    opts: DagMutatorOptions = {},
  ) {
    this.uuid = opts.uuid ?? defaultUuid
    this.lockTtlSeconds = opts.lockTtlSeconds ?? 5
  }

  async apply(input: DagMutatorInput): Promise<DagMutatorResult> {
    // ─── Step 2: pre-check graph_version ─────────────────────────────────────
    const preCheck = await this.fetchGraphVersion(input.dagId)
    if (preCheck === null) {
      throw new Error(`[dag-mutator] dag ${input.dagId} not found`)
    }
    // Step 3: fail fast before lock acquisition.
    if (preCheck !== input.expectedVersion) {
      throw new CasConflictError(input.dagId, input.expectedVersion, preCheck)
    }

    // ─── Step 4: acquire Redis advisory lock ─────────────────────────────────
    // Without Redis we still proceed — the DB-side row lock inside the
    // RPC is the authoritative gate. The advisory lock is an
    // optimization that narrows the contention window so concurrent
    // mutators don't waste cycles bouncing off the CAS.
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
      // ─── Step 5: re-check graph_version under the lock ─────────────────────
      const underLock = await this.fetchGraphVersion(input.dagId)
      if (underLock === null) {
        throw new Error(`[dag-mutator] dag ${input.dagId} disappeared mid-mutation`)
      }
      if (underLock !== input.expectedVersion) {
        throw new CasConflictError(input.dagId, input.expectedVersion, underLock)
      }

      // ─── Step 6: cycle check on (current edges ∪ additions) ────────────────
      // We need the existing edges + the new edges to detect a cycle the
      // additions would introduce. Pulling all edges is bounded by DAG
      // size (typically <100 nodes per spec §3.4) — acceptable.
      const existingEdges = await this.fetchExistingEdgeKeys(input.dagId)
      const proposedEdges = input.additions.edges.map((e) => ({
        parent: e.parent,
        child: e.child,
      }))
      // Existing edges live as UUIDs in the DB; proposed edges live as
      // node_keys in the spec. We feed both to the cycle detector — they
      // share a key space because new edges that connect to existing
      // nodes MUST reference those nodes by UUID. The agent tool layer
      // is responsible for resolving its node_keys to UUIDs before
      // calling the mutator (and wiring them through `additions.edges`
      // as either UUIDs for existing nodes or new node_keys for fresh
      // ones). We treat both as opaque strings here.
      const cycle = detectCycle(existingEdges, proposedEdges)
      if (cycle.hasCycle) {
        throw new CycleError(input.dagId, cycle.cycleNodes ?? [])
      }

      // ─── Steps 7+8+9: atomic CAS + node/edge/mutation insert ──────────────
      // Pre-mint UUIDs for new nodes so we can return them deterministically
      // and so the RPC can use them as both insert IDs and edge endpoints.
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
        confidence_floor: node.confidence_floor != null ? String(node.confidence_floor) : '',
      }))

      // Edge endpoints in `additions.edges` may reference either an
      // existing node UUID or a new node by node_key. Resolve new ones
      // through nodeIdsByKey; anything else MUST be a UUID for an
      // existing node. Without this guard, the agent tool layer could
      // smuggle bogus strings through (HP3) and the only signal would be
      // an opaque FK violation from the RPC — or a silent no-op if the
      // RPC happened to accept the string.
      const resolveEndpoint = (key: string, role: 'parent' | 'child'): string => {
        const minted = nodeIdsByKey.get(key)
        if (minted) return minted
        if (!UUID_REGEX.test(key)) {
          throw new InvalidEdgeEndpointError(input.dagId, key, role)
        }
        return key
      }

      const newEdgesPayload = input.additions.edges.map((edge) => ({
        parent_node_id: resolveEndpoint(edge.parent, 'parent'),
        child_node_id: resolveEndpoint(edge.child, 'child'),
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
        // Translate Postgres error codes to typed mutator errors.
        // 40001 = serialization_failure (we raise it on CAS mismatch)
        if (error.code === '40001' || /cas_conflict/i.test(error.message ?? '')) {
          // Re-fetch the actual version for the caller's benefit.
          const actual = await this.fetchGraphVersion(input.dagId)
          throw new CasConflictError(input.dagId, input.expectedVersion, actual ?? -1)
        }
        // 23505 = unique_violation on (dag_id, idempotency_key) — a
        // concurrent caller raced past the early short-circuit. Treat
        // as idempotent replay.
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

      // RPC returns a single row table.
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
      // ─── Step 10: release Redis lock ─────────────────────────────────────
      // Fenced release — only DEL if our token still matches.
      // Without fencing: if TTL expires mid-mutation, another mutator
      // acquires the lock, and we'd delete their lock on exit.
      if (lockHeld && this.redis) {
        try {
          await this.redis.eval(PLAIN_CONDITIONAL_DEL_LUA, [lockKey], [lockToken])
        } catch {
          // Ignore — lock will TTL out.
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
