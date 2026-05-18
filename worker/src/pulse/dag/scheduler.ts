/**
 * IncrementalScheduler — Phase 4N-a, Task 25.
 *
 * Drives the counter-driven readiness model from spec §4.2:
 *
 *   - `onDagCreated(dagId)` atomically flips every root node
 *     (pending_parent_count = 0) from `pending` → `ready` and enqueues
 *     each leaf via DagStepCreator.
 *
 *   - `onNodeComplete(dagId, nodeId)` performs the single-statement
 *     decrement-and-claim: for every child of the completed node, it
 *     decrements `pending_parent_count` and — in the SAME statement —
 *     flips to `ready` any child whose counter drops to 0. The
 *     `RETURNING` clause identifies which children were actually
 *     promoted, and the scheduler enqueues just those leaves.
 *
 *     Why one statement matters: under concurrent two-parent
 *     completions on a join node, a two-statement pattern
 *     (UPDATE+SELECT) races — both writers could observe count=0 after
 *     the other's UPDATE and double-enqueue. Collapsing into a single
 *     CTE makes the row-level lock on the child serialize the decrement
 *     and the promotion together.
 *
 *   - `onNodeFail(dagId, nodeId, retryable)` marks the node failed and
 *     (when non-retryable) propagates a cancel down to the subtree via
 *     BFS bounded by the failed node's descendants. It NEVER issues a
 *     full-DAG scan.
 *
 * The scheduler is Supabase-powered because we're inside the worker,
 * but every SQL statement is emitted through the `rpc()` helper so
 * tests can mock a single method instead of chaining query builders.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BudgetLedger } from './budget-ledger.js'
import {
  evaluateConfidence,
  type ConfidenceParentResults,
} from './confidence-gate.js'
import type { DagStepCreator, DagStepCreateInput } from './dag-step-creator.js'
import { dispatchHumanTaskNode } from './human-task-dispatch.js'
import type { DagNodeType, DagStatus } from './types.js'
import { onDagNodeCompleteLinearHook } from '../../pm-sync/adapters/linear/dag-plan-hook.js'

/**
 * Feature flags the scheduler reads at ready-transition time. A strict
 * subset of the worker's full config so tests can pass a trivial
 * object. `undefined` is treated as the flag being off.
 */
export interface SchedulerFeatureFlags {
  FEATURE_CONFIDENCE_ROUTER?: boolean
  FEATURE_LINEAR_AGENT?: boolean
}

export interface SchedulerCallbacks {
  onDagCompleted?: (input: { dagId: string }) => Promise<void>
  onDagFailed?: (input: { dagId: string; reason: string }) => Promise<void>
  onDagPaused?: (input: { dagId: string; reason: string }) => Promise<void>
  /**
   * Phase 6: called when a human_task node is dispatched with
   * `external_mirror` set. The scheduler delegates PM sync enqueue
   * to the caller so it doesn't need to import PulseQueue directly.
   */
  onHumanTaskNeedsPmSync?: (input: {
    workItemId: string
    orgId: string
    agentId: string
  }) => Promise<void>
}

/**
 * Subset of the row columns the scheduler needs back from promotion
 * statements. `run_id` / `event_id` come from the dag row so leaves can
 * be routed into the existing step pipeline.
 */
interface PromotedNode {
  id: string
  node_key: string
  node_type: DagNodeType
  step_type: string | null
  runtime_target: string | null
  route_class: string | null
  confidence_floor: number | null
  /**
   * Phase 5N: payload is returned in the same promotion RPC response
   * so the confidence router can read signals off it (tool_names,
   * schema, allow_external_upgrade) without a follow-up SELECT per
   * leaf. Nullable because non-leaf nodes skip the gate entirely.
   */
  payload?: unknown
  /**
   * Phase 5N replay determinism: when a promoted node comes from a
   * frontier replay (`DagReplay.fork()`), we preserve the original
   * router version so the gate can detect version drift and stamp a
   * `driftFromVersion` note. Null on fresh nodes (first scoring).
   */
  confidence_router_version?: string | null
}

interface DagHeader {
  id: string
  org_id: string
  agent_id: string
  root_event_id: string | null
  status: DagStatus
  total_nodes: number
  completed_nodes: number
  failed_nodes: number
  budget_max_tokens: number | null
}

export class IncrementalScheduler {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly dagStepCreator: DagStepCreator,
    private readonly callbacks: SchedulerCallbacks = {},
    private readonly budgetLedger: BudgetLedger | null = null,
    /**
     * Phase 5N: runtime-routing config. When
     * `FEATURE_CONFIDENCE_ROUTER === true`, `applyConfidenceGate` routes
     * through `ConfidenceRouter`; otherwise it stays on the Phase 4N-d
     * static gate. Defaults to an empty object so existing callers
     * (tests, Phase 4N code paths) don't need to pass anything.
     */
    private readonly config: SchedulerFeatureFlags = {},
  ) {}

  /**
   * Called once per DAG right after `DagPlanner.instantiateFromTemplate()`.
   * Promotes every root node (pending_parent_count = 0) to ready and
   * enqueues leaves. Uses a SINGLE UPDATE … RETURNING statement — no
   * SELECT of the whole node set.
   */
  async onDagCreated(dagId: string): Promise<void> {
    const dag = await this.loadDagHeader(dagId)
    if (!dag) throw new Error(`[dag-scheduler] dag ${dagId} not found`)

    // Flip dag to running.
    await this.supabase
      .from('orchestration_dags')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', dagId)

    const { data, error } = await this.supabase.rpc('dag_promote_roots', {
      p_dag_id: dagId,
    })
    if (error) {
      throw new Error(`[dag-scheduler] dag_promote_roots failed: ${error.message}`)
    }

    const promoted = (data ?? []) as PromotedNode[]
    await this.enqueuePromoted(dag, promoted)
  }

  /**
   * Called by BaseWorker after a step completes successfully. Uses the
   * single-statement decrement-and-claim CTE to atomically drop
   * `pending_parent_count` on every child and promote any that hit 0.
   *
   * State-machine guard (§4.2): the scheduler only advances the DAG when
   * `dag.status === 'running'`. Three bands:
   *
   *   1. **Terminal** (`completed` / `failed` / `cancelled`) — no-op.
   *      The dag is done; a late node completion is ignored because the
   *      node row is either already stamped or will be reaped by the
   *      cancel-subtree path.
   *
   *   2. **Paused / blocked / pending** — stamp the node as `completed`
   *      (the truth: a worker finished this work) but do NOT promote
   *      children or bump the dag counter. This is the operator pause
   *      contract: once a dag is paused, no new work is enqueued from
   *      it until something flips it back to `running`. On resume, a
   *      resume handler re-drives promotion from the current node state.
   *
   *   3. **Running** — full flow: stamp → decrement-and-claim CTE →
   *      enqueue promoted leaves → bump counter → maybe finalize.
   *
   * Why stamp on pause? Not stamping would leave the node row in
   * `running` status forever once the dag resumes, and the orphan
   * detector would eventually reap it as stuck. Stamping keeps the
   * node state truthful and preserves `completed_at` for observability.
   */
  async onNodeComplete(dagId: string, nodeId: string): Promise<void> {
    const dag = await this.loadDagHeader(dagId)
    if (!dag) return

    // Band 1: terminal — the dag is done, nothing to advance.
    if (dag.status === 'completed' || dag.status === 'failed' || dag.status === 'cancelled') {
      return
    }

    // Blocker #1 (idempotent completion, Codex 2026-04-08 audit): under
    // at-least-once Pulse semantics (lease expiry → orphan re-claim,
    // worker crash after work but before ack, BYO runtime retry),
    // `onNodeComplete` can fire twice for the same node. Without a
    // guard, we'd:
    //   1. stamp `completed` twice (harmless)
    //   2. call `dag_complete_node` twice → double-decrement child
    //      `pending_parent_count` counters (CORRUPTS readiness)
    //   3. call `dag_bump_completed` twice → double-bump
    //      `completed_nodes` (prematurely finalizes the dag)
    //
    // Fix: atomically claim the parent transition via a conditional
    // UPDATE with `.neq('status', 'completed')` + `.select('id')`. The
    // second caller's UPDATE matches zero rows, `claimed` is empty, and
    // we bail out BEFORE touching the decrement RPC or the completed
    // counter. This uses the same row-lock serialization Postgres
    // applies to any concurrent UPDATE on the same row, and it's a
    // single round-trip instead of SELECT-then-UPDATE (no TOCTOU).
    const { data: claimed, error: claimErr } = await this.supabase
      .from('orchestration_dag_nodes')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', nodeId)
      .eq('dag_id', dagId)
      .neq('status', 'completed')
      .select('id')
    if (claimErr) {
      throw new Error(`[dag-scheduler] stamp complete failed: ${claimErr.message}`)
    }
    if (!claimed || claimed.length === 0) {
      // Duplicate delivery OR unknown node — either way, another caller
      // already advanced this parent (or there is nothing to advance).
      // Child counters + completed counter already moved; safe no-op.
      return
    }

    // Bands 2 & 3 both run the atomic decrement-and-claim CTE so child
    // `pending_parent_count` counters stay truthful and any child that
    // hit 0 is flipped to `ready` in the DB. The DIFFERENCE between the
    // bands is whether we ENQUEUE the promoted children as steps:
    //
    //   Band 2 (paused/blocked/pending): decrement + promote in DB,
    //     but DO NOT enqueue. The promoted nodes sit in `ready` state
    //     without a corresponding `orchestration_steps` row. On resume,
    //     `onDagResume` picks them up via the orphan-ready query and
    //     runs them through the gate + budget reserve for the first time.
    //     We still bump the completed counter so a dag that finishes its
    //     last node while paused can finalize cleanly.
    //
    //   Band 3 (running): full advance — decrement, promote, enqueue,
    //     bump counter, maybe finalize.
    //
    // Why decrement on pause? Skipping the decrement is exactly the
    // wedge that strands children forever — `dag_promote_roots` (used
    // by resume) only matches `pending_parent_count = 0 AND status =
    // 'pending'`, so a child whose parent completed during pause but
    // never had its counter decremented stays at count > 0 and can
    // never be promoted.
    const { data, error } = await this.supabase.rpc('dag_complete_node', {
      p_dag_id: dagId,
      p_node_id: nodeId,
    })
    if (error) {
      throw new Error(`[dag-scheduler] dag_complete_node failed: ${error.message}`)
    }
    const promoted = (data ?? []) as PromotedNode[]

    if (dag.status !== 'running') {
      // Band 2: keep the counter truthful so we can still finalize a
      // paused dag whose last node just completed, but skip enqueue.
      await this.bumpCompletedCounter(dagId)
      return
    }

    // Band 3: full advance.
    await this.enqueuePromoted(dag, promoted)
    await this.bumpCompletedCounter(dagId)

    // Linear Agents API: fire-and-forget plan progress update
    if (this.config.FEATURE_LINEAR_AGENT) {
      onDagNodeCompleteLinearHook(this.supabase, dagId, nodeId).catch((err) => {
        console.warn(
          `[dag-scheduler] Linear plan hook failed for dag=${dagId} node=${nodeId}:`,
          err instanceof Error ? err.message : err,
        )
      })
    }
  }

  /**
   * Called by DagMutator after `apply()` commits and the Redis advisory
   * lock is released. Performs Phase 11 of the spec §4.3 mutation flow:
   *
   *   - Bound the work to `addedNodeIds` only (never a full-DAG scan).
   *   - Compute `pending_parent_count` for each new node from its real
   *     incoming edges, skipping parents already in a terminal state
   *     (`completed` / `skipped`) — they cannot block a fresh child.
   *   - Promote any added node whose count is now 0 and is still
   *     `pending` to `ready`, returning the promoted rows.
   *   - Enqueue the promoted leaves via `dagStepCreator`.
   *
   * State-machine band guard: like `onNodeComplete`, this method is a
   * no-op when the DAG is terminal or paused. The promotion side of a
   * mutation should NOT advance a paused DAG — operators expect the
   * pause to mean "no new work". Resume re-drives promotion via
   * `onNodeComplete` once the DAG flips back to `running`.
   *
   * Runs OUTSIDE the mutator's Redis advisory lock so a slow scheduler
   * cannot deadlock other concurrent mutators.
   */
  async onMutation(dagId: string, addedNodeIds: string[]): Promise<void> {
    if (addedNodeIds.length === 0) return // idempotent replay or no-op mutation

    const dag = await this.loadDagHeader(dagId)
    if (!dag) return

    // Same band guard as onNodeComplete: no promotion outside `running`.
    // A paused/pending/blocked dag must not advance on mutation either —
    // the resume path re-drives promotion via onNodeComplete / onDagResume.
    if (dag.status !== 'running') {
      return
    }

    const { data, error } = await this.supabase.rpc('dag_promote_added_subgraph', {
      p_dag_id: dagId,
      p_node_ids: addedNodeIds,
    })
    if (error) {
      throw new Error(`[dag-scheduler] dag_promote_added_subgraph failed: ${error.message}`)
    }

    const promoted = (data ?? []) as PromotedNode[]
    await this.enqueuePromoted(dag, promoted)
  }

  /**
   * Called by BaseWorker when a step terminally fails. When
   * `retryable=false`, propagates a cancel down through children via
   * BFS bounded by the failed node's reachable descendants.
   */
  async onNodeFail(
    dagId: string,
    nodeId: string,
    retryable: boolean,
    reason: string,
  ): Promise<void> {
    await this.supabase
      .from('orchestration_dag_nodes')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', nodeId)
      .eq('dag_id', dagId)

    if (retryable) return

    // Bounded BFS over descendants via a DB-side RPC. The RPC walks
    // `orchestration_dag_edges` from the failed node outward and marks
    // every reachable unfinished descendant as `cancelled`. Never scans
    // the entire node set.
    const { error } = await this.supabase.rpc('dag_cancel_subtree', {
      p_dag_id: dagId,
      p_root_node_id: nodeId,
    })
    if (error) {
      throw new Error(`[dag-scheduler] dag_cancel_subtree failed: ${error.message}`)
    }

    // Mark dag as failed.
    await this.supabase
      .from('orchestration_dags')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        failed_nodes: 1,
      })
      .eq('id', dagId)

    await this.callbacks.onDagFailed?.({ dagId, reason })
  }

  /**
   * Phase 6: called by `dag-advance-listener` when a webhook completion
   * on the control plane promoted children via `dag_complete_node`. Scans
   * for `ready` nodes that don't have a corresponding `orchestration_steps`
   * row and runs them through the standard gate + budget + enqueue path.
   */
  async onExternalAdvance(dagId: string): Promise<void> {
    const dag = await this.loadDagHeader(dagId)
    if (!dag) return
    if (dag.status !== 'running') return

    const orphanReady = await this.loadOrphanReadyNodes(dagId)
    if (orphanReady.length > 0) {
      await this.enqueuePromoted(dag, orphanReady)
    }
  }

  // --------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------

  private async loadDagHeader(dagId: string): Promise<DagHeader | null> {
    const { data, error } = await this.supabase
      .from('orchestration_dags')
      .select(
        'id, org_id, agent_id, root_event_id, status, total_nodes, completed_nodes, failed_nodes, budget_max_tokens',
      )
      .eq('id', dagId)
      .maybeSingle()
    if (error) {
      throw new Error(`[dag-scheduler] loadDagHeader failed: ${error.message}`)
    }
    return (data as DagHeader | null) ?? null
  }

  private async enqueuePromoted(dag: DagHeader, promoted: PromotedNode[]): Promise<void> {
    const blocked: PromotedNode[] = []

    // Phase 5N (HP1): when the confidence router is active, fetch parent
    // `confidence_observed` for every promoted leaf in a single round-trip
    // so the router's `parentHadLowConfidence` signal sees real data. One
    // SELECT per promotion event (not per tick) — negligible hot-path impact.
    //
    // When the router is disabled (Phase 4N static gate), parent results
    // are unused, so we skip the query entirely. This also keeps the
    // existing scheduler unit tests — which mock only the RPC surface —
    // from having to stub the `orchestration_dag_edges` select chain.
    const parentResultsByNode = this.config.FEATURE_CONFIDENCE_ROUTER
      ? await this.fetchParentConfidences(
          dag.id,
          promoted
            .filter((n) => n.node_type === 'leaf' && n.step_type)
            .map((n) => n.id),
        )
      : new Map<string, ConfidenceParentResults>()

    for (const node of promoted) {
      // Phase 2 — Human task nodes become `human_work_items` rows, NOT
      // Pulse steps. They bypass the confidence gate and the budget
      // ledger (humans aren't scored, humans aren't priced in tokens).
      // The dispatcher is idempotent on (dag_id, dag_node_id) so a
      // double-fire is safe.
      if (node.node_type === 'human_task') {
        const result = await dispatchHumanTaskNode(this.supabase, dag, {
          id: node.id,
          node_key: node.node_key,
          node_type: node.node_type,
          payload: node.payload,
        })
        if (result?.needsPmSync && this.callbacks.onHumanTaskNeedsPmSync) {
          await this.callbacks.onHumanTaskNeedsPmSync({
            workItemId: result.workItemId,
            orgId: dag.org_id,
            agentId: dag.agent_id,
          }).catch((err) => {
            console.warn(
              `[dag-scheduler] PM sync enqueue failed for work item ${result.workItemId}:`,
              err instanceof Error ? err.message : err,
            )
          })
        }
        continue
      }
      if (node.node_type !== 'leaf' && node.node_type !== 'approval') continue
      if (!node.step_type) continue // non-executable (group/barrier) — skip

      // Confidence gate (Phase 4N-d, Task 74): evaluate before budget
      // reservation so a gated-out node never consumes token headroom.
      // Phase 4N returns a static evaluation; Phase 5N uses the router
      // with real parent confidence (HP1).
      const gateOutcome = await this.applyConfidenceGate(
        dag.id,
        node,
        parentResultsByNode.get(node.id) ?? [],
      )
      if (!gateOutcome.admitted) continue

      // Budget gate (Phase 4N-d, Task 67): try to reserve this leaf's
      // estimated cost against the DAG's token cap before we hand it to
      // the step creator. On failure, leave the node pending so the
      // resume path (`onDagResume`) can re-promote it once headroom is
      // released back into the live counter.
      if (this.budgetLedger && dag.budget_max_tokens != null) {
        const estimate = this.budgetLedger.getDefaultEstimatedTokens()
        const reserved = await this.budgetLedger.tryReserve(
          dag.id,
          estimate,
          dag.budget_max_tokens,
        )
        if (!reserved) {
          blocked.push(node)
          continue
        }
      }

      // Phase 5N (Blocker #3): honor the router's upgrade decision at
      // execution time. When the router upgraded the node off its
      // declared route (fast → strong, strong → external), the step
      // row must carry the upgraded route so downstream workers pick
      // the right model lane. Otherwise the entire upgrade loop is a
      // no-op at runtime and we're just paying for scoring.
      const effectiveRouteClass =
        gateOutcome.upgradedTo ??
        ((node.route_class as 'fast' | 'strong' | 'external' | null) ?? null)

      const input: DagStepCreateInput = {
        eventId: dag.root_event_id ?? dag.id,
        attempt: 0,
        stepType: node.step_type as DagStepCreateInput['stepType'],
        executorType: node.step_type,
        agentId: dag.agent_id,
        orgId: dag.org_id,
        runId: `dag:${dag.id}:${node.id}`,
        initialStatus: 'pending',
        dagId: dag.id,
        dagNodeId: node.id,
        runtimeTarget: (node.runtime_target as 'shared' | 'dedicated' | null) ?? null,
        routeClass: effectiveRouteClass,
        input: node.payload && typeof node.payload === 'object'
          ? node.payload as Record<string, unknown>
          : undefined,
      }
      await this.dagStepCreator.create(input)
    }

    if (blocked.length > 0) {
      await this.pauseForBudget(dag.id, blocked)
    }
  }

  /**
   * Handle a budget-blocked batch: revert each blocked node back to
   * 'pending' (so `dag_promote_roots` will re-pick it on resume) and
   * flip the dag to 'paused' with a budget reason. Operators restore
   * headroom by inserting a 'reservation' event (positive delta) and
   * then calling `onDagResume(dagId)`.
   */
  private async pauseForBudget(dagId: string, blocked: PromotedNode[]): Promise<void> {
    for (const node of blocked) {
      await this.supabase
        .from('orchestration_dag_nodes')
        .update({ status: 'pending' })
        .eq('id', node.id)
        .eq('dag_id', dagId)
    }

    await this.supabase
      .from('orchestration_dags')
      .update({ status: 'paused' })
      .eq('id', dagId)

    await this.callbacks.onDagPaused?.({ dagId, reason: 'budget_exhausted' })
  }

  /**
   * Resume a paused DAG. Two recovery paths run in sequence so both
   * pause sources (budget exhaustion + operator pause-during-completion)
   * are unwedged with one entry point:
   *
   *   1. `dag_promote_roots` re-picks nodes whose
   *      `pending_parent_count = 0 AND status = 'pending'` — i.e. the
   *      budget-blocked nodes that `pauseForBudget` reverted.
   *
   *   2. Orphan-ready scan: nodes that were promoted to `ready` while
   *      the dag was paused (Band 2 of `onNodeComplete` decrements +
   *      promotes in the DB but skips enqueue) but have no
   *      `orchestration_steps` row yet. These bypassed the gate +
   *      budget reserve entirely, so we feed them through
   *      `enqueuePromoted` exactly once. Pre-pause `ready` nodes that
   *      already had a step row are excluded by the existence filter,
   *      so we never double-enqueue or double-reserve budget.
   *
   * Assumes the operator has already inserted a 'reservation' event
   * (or otherwise released headroom on the Redis counter) before
   * calling this method when the pause reason was budget.
   */
  async onDagResume(dagId: string): Promise<void> {
    await this.supabase
      .from('orchestration_dags')
      .update({ status: 'running' })
      .eq('id', dagId)

    const dag = await this.loadDagHeader(dagId)
    if (!dag) return

    const { data, error } = await this.supabase.rpc('dag_promote_roots', {
      p_dag_id: dagId,
    })
    if (error) {
      throw new Error(`[dag-scheduler] onDagResume dag_promote_roots failed: ${error.message}`)
    }
    const promoted = (data ?? []) as PromotedNode[]
    await this.enqueuePromoted(dag, promoted)

    // Pick up nodes that were promoted to `ready` during the pause but
    // never enqueued (Band 2 of onNodeComplete). These are stranded
    // until something runs them through the gate + budget reserve.
    const orphanReady = await this.loadOrphanReadyNodes(dagId)
    if (orphanReady.length > 0) {
      await this.enqueuePromoted(dag, orphanReady)
    }
  }

  /**
   * Find nodes in `ready` state that have no corresponding
   * `orchestration_steps` row yet. These are the result of a child
   * being promoted while the DAG was paused — Band 2 of
   * `onNodeComplete` decrements + promotes in the DB but skips the
   * enqueue path that would normally create the step row. Pre-pause
   * ready nodes with an existing step row are filtered out so resume
   * never double-enqueues.
   *
   * Two-query approach (no LEFT JOIN in PostgREST): fetch all ready
   * nodes for the DAG, then subtract any whose id appears as a
   * `dag_node_id` in `orchestration_steps`. Both queries are bounded
   * by the DAG header so the cost is proportional to the DAG size.
   */
  private async loadOrphanReadyNodes(dagId: string): Promise<PromotedNode[]> {
    const { data: readyRows, error: readyErr } = await this.supabase
      .from('orchestration_dag_nodes')
      .select(
        'id, node_key, node_type, step_type, runtime_target, route_class, confidence_floor, payload, confidence_router_version',
      )
      .eq('dag_id', dagId)
      .eq('status', 'ready')
    if (readyErr) {
      throw new Error(`[dag-scheduler] loadOrphanReadyNodes ready select failed: ${readyErr.message}`)
    }
    const ready = (readyRows ?? []) as PromotedNode[]
    if (ready.length === 0) return []

    // Exclude nodes that already have an orchestration_steps row (agent nodes)
    // OR a human_work_items row (human_task nodes) — both indicate the node
    // was already dispatched. Without the human_work_items check, every ready
    // human_task node would be re-dispatched on every call (idempotent but
    // wasteful and triggers spurious PM sync enqueue attempts).
    const nodeIds = ready.map((n) => n.id)

    const [stepRes, workItemRes] = await Promise.all([
      this.supabase
        .from('orchestration_steps')
        .select('dag_node_id')
        .eq('dag_id', dagId)
        .in('dag_node_id', nodeIds),
      this.supabase
        .from('human_work_items')
        .select('dag_node_id')
        .eq('dag_id', dagId)
        .in('dag_node_id', nodeIds),
    ])

    if (stepRes.error) {
      throw new Error(`[dag-scheduler] loadOrphanReadyNodes step select failed: ${stepRes.error.message}`)
    }
    if (workItemRes.error) {
      throw new Error(`[dag-scheduler] loadOrphanReadyNodes work_items select failed: ${workItemRes.error.message}`)
    }

    const dispatched = new Set<string>()
    for (const r of (stepRes.data ?? []) as Array<{ dag_node_id: string | null }>) {
      if (r.dag_node_id) dispatched.add(r.dag_node_id)
    }
    for (const r of (workItemRes.data ?? []) as Array<{ dag_node_id: string | null }>) {
      if (r.dag_node_id) dispatched.add(r.dag_node_id)
    }
    return ready.filter((n) => !dispatched.has(n.id))
  }

  /**
   * Fetch `confidence_observed` for every parent of every promoted
   * leaf in a single batched query. Returns a map from child node id
   * to the list of parent confidence records (in edge-row order —
   * order is not semantically meaningful to the router, which only
   * reads the lowest parent confidence).
   *
   * Empty childIds → empty map, no query.
   *
   * Parents whose `confidence_observed` is NULL are still included
   * with `confidence_observed: null` — the router's
   * `parentHadLowConfidence` signal treats NULL as high confidence
   * (no signal fires), so passing them through preserves that
   * behavior without a caller-side filter.
   */
  private async fetchParentConfidences(
    dagId: string,
    childIds: string[],
  ): Promise<Map<string, ConfidenceParentResults>> {
    const byChild = new Map<string, ConfidenceParentResults>()
    if (childIds.length === 0) return byChild

    const { data, error } = await this.supabase
      .from('orchestration_dag_edges')
      .select('child_node_id, parent:parent_node_id ( confidence_observed )')
      .eq('dag_id', dagId)
      .in('child_node_id', childIds)
    if (error) {
      throw new Error(`[dag-scheduler] fetchParentConfidences failed: ${error.message}`)
    }

    for (const row of (data ?? []) as Array<{
      child_node_id: string
      parent: { confidence_observed: number | null } | { confidence_observed: number | null }[] | null
    }>) {
      // Supabase's relational select returns either an object or an
      // array depending on the FK cardinality inference; normalize
      // to a single record because parent_node_id is a scalar FK.
      const parent = Array.isArray(row.parent) ? row.parent[0] : row.parent
      if (!parent) continue
      const list = byChild.get(row.child_node_id) ?? []
      list.push({ confidence_observed: parent.confidence_observed })
      byChild.set(row.child_node_id, list)
    }
    return byChild
  }

  /**
   * Evaluate the confidence gate for a freshly-promoted leaf. Writes
   * `confidence_observed` and `confidence_source` on the node in every
   * case so downstream observers see a truthful record of what was
   * scored. When `observed < confidence_floor`, flips the node to
   * `failed` with `reason='confidence_floor'` and returns
   * `{ admitted: false }` so the caller skips enqueue + budget reserve.
   *
   * NULL floor = always admit (observed defaults to 1.0 in the gate).
   *
   * Phase 4N uses the static gate — `observed === floor` — which always
   * admits. Phase 5N will swap in the router and this path becomes
   * meaningful without touching the scheduler.
   */
  private async applyConfidenceGate(
    dagId: string,
    node: PromotedNode,
    parentResults: ConfidenceParentResults = [],
  ): Promise<{ admitted: boolean; upgradedTo: 'fast' | 'strong' | 'external' | null }> {
    const evaluation = evaluateConfidence({
      node: {
        step_type: node.step_type,
        route_class: node.route_class,
        confidence_floor: node.confidence_floor,
        payload: node.payload ?? null,
      },
      parentResults,
      featureRouterEnabled: this.config.FEATURE_CONFIDENCE_ROUTER === true,
      // Phase 5N replay determinism: if the promoted node carries a
      // router version from a prior run (frontier replay), pass it
      // in so the router can stamp a driftFromVersion note on the
      // last audit entry when versions diverge. Null on fresh nodes.
      expectedVersion: node.confidence_router_version ?? null,
    })

    // Phase 5N: the router can explicitly mark a decision failed when
    // every permitted route flunks the floor. The static gate never
    // does this (observed === floor), so the explicit `failed` flag is
    // the only thing that blocks admission on the router path. We also
    // keep the legacy `observed < floor` check so a buggy/partial gate
    // can't silently admit under-confident nodes.
    const floor = node.confidence_floor
    const admitted =
      !evaluation.failed && (floor == null || evaluation.observed >= floor)

    // Build the stamp once so both admit + reject paths write the same
    // columns (observed + source + optional router replay tags).
    const stamp: Record<string, unknown> = {
      confidence_observed: evaluation.observed,
      confidence_source: evaluation.source,
    }
    if (evaluation.source === 'router') {
      stamp.confidence_router_version = evaluation.routerVersion
      stamp.confidence_router_notes = evaluation.notes
    }

    await this.supabase
      .from('orchestration_dag_nodes')
      .update(stamp)
      .eq('id', node.id)
      .eq('dag_id', dagId)

    if (admitted) {
      return { admitted: true, upgradedTo: evaluation.upgradedTo }
    }

    // Gate rejected the node. We do NOT cancel the subtree here —
    // treat this as a terminal leaf failure via onNodeFail so existing
    // cancel/propagation logic owns the blast radius. `reason` comes
    // from the router when it provided one, otherwise the canonical
    // `confidence_floor` tag.
    await this.onNodeFail(
      dagId,
      node.id,
      false,
      evaluation.reason ?? 'confidence_floor', /* reason may be null on synthetic gate-off path */
    )
    return { admitted: false, upgradedTo: null }
  }

  private async bumpCompletedCounter(dagId: string): Promise<void> {
    const { data, error } = await this.supabase.rpc('dag_bump_completed', {
      p_dag_id: dagId,
    })
    if (error) {
      throw new Error(`[dag-scheduler] dag_bump_completed failed: ${error.message}`)
    }
    const row = normalizeRpcSingleRow<{ completed_nodes: number; total_nodes: number }>(data)
    if (row && row.completed_nodes >= row.total_nodes) {
      await this.supabase
        .from('orchestration_dags')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', dagId)
      await this.callbacks.onDagCompleted?.({ dagId })
    }
  }
}

function normalizeRpcSingleRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null
  return (data as T | null) ?? null
}
