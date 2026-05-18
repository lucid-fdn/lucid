# Nerve Phase 4N — DagPlanner (Intelligence Layer) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat `OrchestrationStep` lists with **DAGs of dependent steps**. Agents decompose missions into graphs (research → draft → approval → delivery), execute in parallel where independent, mutate the graph mid-run inside marked expansion zones, and survive crashes via frontier replay. Counter-driven scheduler — never traverses the whole graph.

**Tech Stack:** TypeScript, Vitest, Zod, @upstash/redis, Supabase, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-04-06-nerve-dag-planner-design.md`

**Builds on:** Phase 3N step protocol (executors, orchestration_steps), Pulse universal orchestration

---

## Phase Overview

| Phase | Theme | Effort | Ships |
|-------|-------|--------|-------|
| **4N-0** | Pulse Step-Aware Hardening | 1 wk | Step-safe retry/orphan, single creation authority |
| **4N-a** | Foundation | 1.5 wk | Static template DAGs end-to-end |
| **4N-b** | Mutability | 1 wk | `expand_dag` with CAS + cycle check + audit |
| **4N-c** | Templates UX + Cross-Runtime | 1.5 wk | JSON template editor + StepRunPacket protocol |
| **4N-d** | Budgets + Replay + 5N Hook | 1 wk | Budget reservation, frontier replay, confidence pre-wire |

**Total: ~6 weeks**

---

## File Structure

### Phase 4N-0: Pulse Step-Aware Hardening

| File | Status | Responsibility |
|------|--------|----------------|
| `worker/src/pulse/queue.ts` | Modified | `PulseQueue.fail()` preserves step fields on retry; reuses original PulseJob shape |
| `contracts/pulse.ts` | Modified | Add `dagId?: string`, `dagNodeId?: string` to `PulseJob` so 4N-a scheduler hook can route completions/failures by DAG node (kept here in 4N-0 so the regression test in Task 3 can cover dag fields end-to-end) |
| `worker/src/pulse/orphan-detector.ts` | Modified | Recovers stuck `orchestration_steps` rows alongside lease keys |
| `worker/src/pulse/dag/dag-step-creator.ts` | New | **Single authority** for DAG-backed step creation; consolidates step-tracker.ts + REST enqueue route |
| `worker/src/pulse/executors/step-tracker.ts` | Modified | Delegates create-step path to `DagStepCreator` |
| `src/app/api/runtimes/steps/enqueue/route.ts` | Modified | Delegates create-step path to `DagStepCreator` |
| `supabase/migrations/20260407100000_orchestration_steps_idempotency.sql` | New | Reinforce `(event_id, attempt, step_type)` uniqueness |
| `worker/src/pulse/__tests__/queue-fail-step-fields.test.ts` | New | Regression: retry preserves stepType/stepId/webhookUrl/webhookPayload/approvalConfig |
| `worker/src/pulse/__tests__/orphan-step-recovery.test.ts` | New | Stuck `orchestration_steps` rows reset by orphan detector |
| `worker/src/pulse/dag/__tests__/dag-step-creator.test.ts` | New | Single-path enforcement, dedup, attempt increment |

### Phase 4N-a: Foundation

| File | Status | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260407200000_orchestration_dag_core.sql` | New | 6 new tables + RLS + composite FK + idempotency unique index |
| `supabase/migrations/20260407200100_orchestration_steps_dag_columns.sql` | New | `dag_id`, `dag_node_id`, `runtime_target`, `route_class`, `replay_of_step_id` columns + `(dag_id, dag_node_id, attempt)` unique index |
| `worker/src/pulse/dag/types.ts` | New | `DagSpec`, `DagNode`, `DagEdge`, `DagNodeStatus`, `DagStatus`, `MutationDiff`, `BudgetSnapshot` |
| `worker/src/pulse/dag/planner.ts` | New | `DagPlanner.instantiateFromTemplate()` — writes DAG, computes initial `pending_parent_count` |
| `worker/src/pulse/dag/scheduler.ts` | New | `IncrementalScheduler.onNodeComplete/onNodeFail/onDagCreated` — counter-driven, never scans |
| `worker/src/pulse/dag/cycle-detector.ts` | New | DFS cycle check on (existing edges + proposed edges) |
| `worker/src/pulse/dag/template-loader.ts` | New | Load + Zod-validate template specs from `orchestration_dag_templates` |
| `worker/src/pulse/dag/dag-step-creator.ts` | Modified | Wire to scheduler.onNodeComplete callback |
| `worker/src/pulse/dag/index.ts` | New | Barrel exports |
| `worker/src/agent/runtime-tools/dag-plan.ts` | New | `plan_dag` agent tool (template instantiation only) |
| `worker/src/agent/CommandsAllowlist.ts` | Modified | Register `plan_dag`, gate behind `manage:orchestration` |
| `contracts/dag.ts` | New | Shared types: `DagSpec`, `StepRunPacket`, etc. |
| `worker/src/pulse/dag/__tests__/planner.test.ts` | New | Template → DAG row + initial counters correct |
| `worker/src/pulse/dag/__tests__/scheduler-no-scans.test.ts` | New | Instrumented assertion: only changed neighbors touched |
| `worker/src/pulse/dag/__tests__/scheduler-readiness.test.ts` | New | Readiness rule: counter == 0 + status pending + DAG running |
| `worker/src/pulse/dag/__tests__/cycle-detector.test.ts` | New | DFS cycle detection, self-loop reject |
| `worker/src/pulse/dag/__tests__/template-loader.test.ts` | New | Zod validation, malformed spec rejected |
| `worker/src/pulse/dag/__tests__/e2e-foundation.test.ts` | New | Template → instantiate → execute leaves → completion |

### Phase 4N-b: Mutability

| File | Status | Responsibility |
|------|--------|----------------|
| `worker/src/pulse/dag/mutator.ts` | New | `DagMutator.apply()` — CAS, Redis lock, cycle check, idempotency |
| `worker/src/pulse/dag/__tests__/mutator-cas.test.ts` | New | Two-writer race: one wins, one CONFLICTs, retries |
| `worker/src/pulse/dag/__tests__/mutator-cycle-reject.test.ts` | New | Mutation that introduces cycle is rejected pre-CAS |
| `worker/src/pulse/dag/__tests__/mutator-idempotency.test.ts` | New | Same `idempotency_key` replayed → no-op |
| `worker/src/pulse/dag/__tests__/mutator-barriers.test.ts` | New | Barrier nodes wait for all parents |
| `worker/src/agent/runtime-tools/dag-expand.ts` | New | `expand_dag` agent tool |
| `worker/src/agent/CommandsAllowlist.ts` | Modified | Register `expand_dag` |

### Phase 4N-c: Templates UX + Cross-Runtime

| File | Status | Responsibility |
|------|--------|----------------|
| `src/app/api/dags/templates/route.ts` | New | GET (list) + POST (create) templates |
| `src/app/api/dags/templates/[id]/route.ts` | New | GET / PUT / DELETE (org-scoped, admin gate) |
| `src/app/api/dags/[id]/mutate/route.ts` | New | Operator mutation endpoint (CAS-protected) |
| `src/app/api/runtimes/steps/claim/route.ts` | New | StepRunPacket claim (returns `StepRunPacket`) |
| `src/app/api/runtimes/steps/complete/route.ts` | New | Mark step completed → fires scheduler.onNodeComplete |
| `src/app/api/runtimes/steps/fail/route.ts` | New | Mark step failed → fires scheduler.onNodeFail |
| `src/app/api/runtimes/steps/renew-lease/route.ts` | New | Extend step lease |
| `src/lib/pulse/claim-proxy.ts` | Modified | Add step claim/complete/fail/renew helpers |
| `worker/src/runtime/data-sink.ts` | Modified | `RestDataSink.claimNextStep / completeStep / failStep / renewStepLease` |
| `worker/src/config.ts` | Modified | `STEP_PROTOCOL_ENABLED` flag |
| `worker/src/processors/relay-step.ts` | New | Dedicated runtime step claim loop (mode-switched) |
| `src/components/mission-control/dag/template-editor.tsx` | New | JSON editor (Monaco) + Zod-driven validation |
| `src/components/mission-control/dag/template-visualizer.tsx` | New | ReactFlow read-only renderer |
| `src/app/(app)/[workspace-slug]/mission-control/dags/templates/page.tsx` | New | Template list + CRUD entry |
| `src/lib/db/dag-templates.ts` | New | Server-only template DB layer |
| `supabase/migrations/20260407300000_dag_template_seeds.sql` | New | 3 reference templates: complaint, order, content_pipeline |
| `worker/src/pulse/dag/__tests__/relay-step-protocol.test.ts` | New | Mixed runtime targets execute end-to-end |
| `src/lib/db/__tests__/dag-templates.test.ts` | New | CRUD + RLS isolation |
| `src/components/mission-control/dag/__tests__/template-editor.test.tsx` | New | Validation + save flow |

### Phase 4N-d: Budgets + Replay + 5N Hook

| File | Status | Responsibility |
|------|--------|----------------|
| `worker/src/pulse/dag/budget-ledger.ts` | New | `BudgetLedger.tryReserve / commit / release` — Redis INCRBY + Postgres ledger |
| `worker/src/pulse/dag/replay.ts` | New | `DagReplay.fork(dagId, fromNodeId)` — clones graph, recomputes counters |
| `worker/src/pulse/dag/confidence-gate.ts` | New | Phase 5N hook surface; default `static` source |
| `worker/src/agent/runtime-tools/dag-status.ts` | New | `dag_status` tool — live counters + budget snapshot |
| `src/app/api/dags/[id]/replay/route.ts` | New | Operator-triggered replay |
| `worker/src/pulse/dag/__tests__/budget-ledger.test.ts` | New | Reservation atomicity, over-spend block, release on fail |
| `worker/src/pulse/dag/__tests__/budget-pause-resume.test.ts` | New | Budget exhaust → pause → operator override → resume |
| `worker/src/pulse/dag/__tests__/replay-determinism.test.ts` | New | Frontier replay produces identical leaf execution order |
| `worker/src/pulse/dag/__tests__/confidence-gate.test.ts` | New | Floor enforced, source provenance recorded |
| `worker/src/pulse/dag/__tests__/e2e-full-stack.test.ts` | New | Webhook → template DAG → mixed runtimes → budget → completion |

---

## Phase 4N-0: Pulse Step-Aware Hardening — TODO

> Prerequisite. Fixes Phase 3N bugs that block the DAG layer. No DAG code yet — just makes Pulse step-safe.

### Chunk 1: Fix `PulseQueue.fail()` field preservation

- [ ] **Task 1: Inspect current `fail()` implementation**
  - Read `worker/src/pulse/queue.ts` around the `fail()` method (Codex flagged ~line 352)
  - Confirm: on retry path, the re-enqueued job loses `stepType`, `stepId`, `webhookUrl`, `webhookPayload`, `approvalConfig` because it's reconstructed from a narrowed shape
  - Note exact lines for the fix

- [ ] **Task 2: Reuse the original `PulseJob` shape on retry**
  - Modify `fail()` so the retry path builds the new job by **spreading the original job** (`{ ...originalJob, attempt: originalJob.attempt + 1 }`) instead of reconstructing
  - Make sure `enqueuedAt` is refreshed for delayed score calculation
  - DLQ path is unchanged (DLQ is terminal — fields preserved in DLQ entry)
  - **Contract extension:** Add `dagId?: string` and `dagNodeId?: string` to `PulseJob` in `contracts/pulse.ts`. The spread-on-retry fix preserves them automatically; downstream 4N-a code (Task 30 scheduler hook) and 4N-c (`runtimes/steps/enqueue/route.ts`) will start populating them. No enqueue-site changes required in 4N-0 — fields are optional.

- [ ] **Task 3: Add regression test `worker/src/pulse/__tests__/queue-fail-step-fields.test.ts`**
  - Build a `PulseJob` with all step fields populated (use webhook stepType + payload + approvalConfig + dagId + dagNodeId)
  - Call `fail()` with `retryable: true`
  - Pop the re-enqueued job from the ZSET
  - Assert all step fields equal the original (including `dagId` and `dagNodeId`)
  - Repeat for `stepType: 'approval'` with approvalConfig

- [ ] **Task 4: Run `cd worker && npm run typecheck` and `cd worker && npm run test -- --run pulse/__tests__/queue-fail-step-fields`**

### Chunk 2: Orphan detector — recover stuck `orchestration_steps`

- [ ] **Task 5: Read `worker/src/pulse/orphan-detector.ts` and `supabase/migrations/20260406200000_orchestration_steps.sql`**
  - Map current behavior: orphan-detector resets `assistant_inbound_events` + `assistant_outbound_events` claimed-too-long rows
  - Steps table is missing from the recovery loop
  - **Schema note:** `orchestration_steps` has `started_at` (set when status transitions to `claimed`), NOT `claimed_at`. Use `started_at` as the claim timestamp.

- [ ] **Task 6: Extend orphan-detector with step row reset**
  - Ensure `step-tracker.ts` `updateStepStatus()` writes `started_at = NOW()` whenever status transitions to `'claimed'` (verify and patch if missing — this is the claim-time anchor for orphan detection).
  - Add supporting partial index in the same migration as Task 14: `CREATE INDEX idx_orch_steps_stuck_claimed ON orchestration_steps(started_at) WHERE status = 'claimed'`.
  - After lease scan, run a guarded SQL `UPDATE orchestration_steps SET status = 'pending', attempt = attempt + 1, error_message = 'orphaned-by-detector' WHERE status = 'claimed' AND started_at < NOW() - INTERVAL '2 minutes' RETURNING id, dag_node_id, event_id, run_id`
  - For each returned row, re-enqueue the corresponding Pulse job (look up dag_node payload) — or if dag_node_id is null (Phase 3N step), re-enqueue without DAG context
  - Emit a `mc_feed_events_v` row per recovered step ("Step X recovered by orphan detector") matching Pulse's existing recovery event pattern.
  - Increment `lucid.pulse.orphaned_steps` OTel counter

- [ ] **Task 7: Add `worker/src/pulse/__tests__/orphan-step-recovery.test.ts`**
  - Insert a stuck `orchestration_steps` row (status=claimed, claimed_at = 5 min ago)
  - Run orphan detector tick once
  - Assert row is reset to pending and attempt incremented
  - Assert OTel counter incremented

- [ ] **Task 8: Run typecheck + test**

### Chunk 3: `DagStepCreator` — single authority

- [ ] **Task 9: Identify the two duplicate creation paths**
  - Read `worker/src/pulse/executors/step-tracker.ts` (worker-side `createStep`)
  - Read `src/app/api/runtimes/steps/enqueue/route.ts` (REST-side enqueue)
  - List the differences (idempotency handling, validation, defaults)

- [ ] **Task 10: Create `worker/src/pulse/dag/dag-step-creator.ts`**
  - Class `DagStepCreator` with `create(input: DagStepCreateInput): Promise<{ stepId, isNew }>`
  - Inputs: `dagId | null`, `dagNodeId | null`, `eventId`, `eventType`, `stepType`, `attempt`, `payload`, `runtimeTarget`, `routeClass`
  - Single `INSERT ... ON CONFLICT (event_id, attempt, step_type) DO NOTHING RETURNING id` path
  - Returns `{ stepId, isNew: boolean }` so callers can distinguish create vs dedup
  - All validation lives here (Zod schema)

- [ ] **Task 11: Refactor `step-tracker.ts` to delegate to `DagStepCreator`**
  - Replace its inline insert with a call to `dagStepCreator.create(...)`
  - Keep the public `step-tracker` API stable (other callers unchanged)

- [ ] **Task 12: Refactor `runtimes/steps/enqueue/route.ts` to delegate**
  - Same: replace insert logic with a `DagStepCreator` call
  - Preserve HTTP error contracts

- [ ] **Task 13: Add `worker/src/pulse/dag/__tests__/dag-step-creator.test.ts`**
  - Insert with novel key → `{ isNew: true }`
  - Insert again with same key → `{ isNew: false }`, same stepId returned
  - Bumped `attempt` → new row with `isNew: true`
  - Zod rejects invalid stepType

- [ ] **Task 14: Add orphan-detection index migration**
  - **Note:** The full unique constraint `idx_orch_steps_idempotent ON (event_id, attempt, step_type)` already exists in `20260406200000_orchestration_steps.sql:41`, and `event_id` is `NOT NULL`. No idempotency reinforcement needed.
  - Create `supabase/migrations/20260407100000_orchestration_steps_idempotency.sql` containing only the partial index that supports Task 6's orphan query: `CREATE INDEX IF NOT EXISTS idx_orch_steps_stuck_claimed ON orchestration_steps(started_at) WHERE status = 'claimed';`
  - Apply via `supabase db push` (or commit and let CI apply)

- [ ] **Task 15: Run full worker test suite — `cd worker && npm run test -- --run`**
  - Verify no Phase 3N regressions
  - Verify all 4N-0 tests pass

---

## Phase 4N-a: Foundation — TODO

> Static template DAGs work end-to-end. Counter-driven scheduler. No mutability yet.

### Chunk 4: Schema migrations

- [ ] **Task 16: Write `supabase/migrations/20260407200000_orchestration_dag_core.sql`**
  - Create `orchestration_dags` table (per spec §3.1) — include `graph_version`, `pending_parent_count` is on nodes not here, `total_nodes`/`completed_nodes`/`failed_nodes`/`ready_nodes`
  - Create `orchestration_dag_nodes` (§3.2) — include `pending_parent_count`, composite `UNIQUE (dag_id, id)`
  - Create `orchestration_dag_edges` (§3.3) — composite FK enforcing same-DAG (`FOREIGN KEY (dag_id, parent_node_id) REFERENCES orchestration_dag_nodes(dag_id, id)`)
  - Create `orchestration_dag_templates` (§3.4)
  - Create `orchestration_dag_mutations` (§3.5) — include `expected_graph_version`, `applied_graph_version`, `idempotency_key` UNIQUE
  - Create `orchestration_dag_budget_events` (§3.6)
  - Add indexes per spec
  - Enable RLS on all 6 tables with org-scoped policies (see spec §3.1-§3.6 for exact policy SQL)

- [ ] **Task 17: Write `supabase/migrations/20260407200100_orchestration_steps_dag_columns.sql`**
  - `ALTER TABLE orchestration_steps ADD COLUMN dag_id UUID REFERENCES orchestration_dags(id), ADD COLUMN dag_node_id UUID REFERENCES orchestration_dag_nodes(id), ADD COLUMN runtime_target TEXT, ADD COLUMN route_class TEXT, ADD COLUMN replay_of_step_id UUID REFERENCES orchestration_steps(id)`
  - `CREATE INDEX idx_orch_steps_dag ON orchestration_steps(dag_id) WHERE dag_id IS NOT NULL`
  - `CREATE UNIQUE INDEX idx_orch_steps_dag_attempt ON orchestration_steps(dag_id, dag_node_id, attempt) WHERE dag_id IS NOT NULL`

- [ ] **Task 18: Apply migrations locally and verify**
  - `supabase db push` (or stage in `migrations/`)
  - Verify with `\d orchestration_dag_nodes` that composite UNIQUE exists and FK on edges resolves to it

### Chunk 5: DAG types + contract

- [ ] **Task 19: Create `contracts/dag.ts`**
  - Export `DagNodeType = 'leaf' | 'group' | 'barrier' | 'expansion_zone' | 'approval'`
  - Export `DagNodeStatus`, `DagStatus`, `MutationType`, `MutationSource`, `BudgetEventType` enums
  - Export `DagSpec` interface (template shape: nodes, edges, expansion_zones, metadata)
  - Export `StepRunPacket` interface (Phase 4N-c uses it; declare here for shared use)

- [ ] **Task 20: Create `worker/src/pulse/dag/types.ts`**
  - Re-export from `contracts/dag.ts`
  - Add internal types: `DagInstance` (DB row shape), `DagNodeRow`, `MutationDiff`, `BudgetSnapshot`, `IncrementalSchedulerCallbacks`

### Chunk 6: Template loader

- [ ] **Task 21: Create `worker/src/pulse/dag/template-loader.ts`**
  - Function `loadTemplateBySlug(orgId, slug, version?)` → fetches from `orchestration_dag_templates`
  - Zod schema `DagSpecSchema` validating `spec` JSONB shape (nodes have node_key, node_type, optional step_type/runtime_target/payload/confidence_floor; edges have parent/child node_keys + edge_kind; expansion_zones is array of node_keys)
  - Throws `TemplateValidationError` with field path on failure

- [ ] **Task 22: Add `template-loader.test.ts` — happy path + 3 malformed cases (missing node, dangling edge, cycle)**

### Chunk 7: DagPlanner — instantiation

- [ ] **Task 23: Create `worker/src/pulse/dag/planner.ts`**
  - `DagPlanner.instantiateFromTemplate({ template, agentId, orgId, rootEventId, rootEventType }): Promise<{ dagId, nodeIds }>`
  - In a single transaction:
    1. INSERT into `orchestration_dags` (status='pending', graph_version=1, total_nodes=spec.nodes.length)
    2. Bulk INSERT into `orchestration_dag_nodes` mapping node_key → uuid; compute `pending_parent_count` per node from incoming edges (one-time, in-memory, bounded by template size)
    3. Bulk INSERT into `orchestration_dag_edges` resolving node_keys → uuids
    4. UPDATE `orchestration_dags SET ready_nodes = (count of nodes with pending_parent_count = 0)`
  - Returns `{ dagId, rootNodeIds }`
  - Never scans the graph at runtime — counts come from in-memory iteration over the template spec

- [ ] **Task 24: Add `planner.test.ts`**
  - 3-node linear template → 1 root with count=0, 2 with count=1
  - Diamond template (1 root, 2 mid, 1 join) → root count=0, mids count=1, join count=2
  - Template with disconnected components → all roots count=0

### Chunk 8: Incremental scheduler

- [ ] **Task 25: Create `worker/src/pulse/dag/scheduler.ts`**
  - Class `IncrementalScheduler` with constructor injecting `supabase`, `dagStepCreator`, optional callbacks
  - `onDagCreated(dagId)`: single atomic `UPDATE orchestration_dag_nodes SET status = 'ready', ready_at = NOW() WHERE dag_id = $1 AND pending_parent_count = 0 AND status = 'pending' RETURNING id, node_type`; for each leaf in `RETURNING`, hand to `dagStepCreator.create()`
  - `onNodeComplete(dagId, nodeId)`:
    1. UPDATE the completed node `status='completed', completed_at = NOW()`
    2. **Atomic decrement-and-claim:** single SQL — `WITH decremented AS (UPDATE orchestration_dag_nodes SET pending_parent_count = pending_parent_count - 1 WHERE id IN (SELECT child_node_id FROM orchestration_dag_edges WHERE dag_id = $1 AND parent_node_id = $2) RETURNING id, pending_parent_count, status) UPDATE orchestration_dag_nodes SET status = 'ready', ready_at = NOW() FROM decremented WHERE orchestration_dag_nodes.id = decremented.id AND decremented.pending_parent_count = 0 AND decremented.status = 'pending' RETURNING orchestration_dag_nodes.id, orchestration_dag_nodes.node_type`
    3. **Why one statement:** under concurrent two-parent completions of a join node, the row-level lock on the join node's UPDATE serializes the decrement, and the `RETURNING` of the second UPDATE only fires for the writer that observes `pending_parent_count = 0`. Two statements (UPDATE then SELECT) would race because the SELECT in writer A could observe count=0 set by writer B's earlier UPDATE, leading to double-enqueue.
    4. For each leaf in `RETURNING`, enqueue via `dagStepCreator.create()`
    5. UPDATE `orchestration_dags SET completed_nodes = completed_nodes + 1` and check completion
  - `onNodeFail(dagId, nodeId, retryable)`: if not retryable, propagate cancel down via children fan-out (BFS bounded by failed-node descendants, not whole graph)
  - **Never** runs a full-DAG SELECT

- [ ] **Task 26: Add `scheduler-no-scans.test.ts`**
  - Build a 100-node DAG manually
  - Use a Supabase mock that records every query
  - Trigger `onNodeComplete` for one mid-node
  - Assert: only the targeted UPDATE + edge-bounded CTE fired — **no `SELECT … FROM orchestration_dag_nodes WHERE dag_id = $1` without an `id IN (...)` filter**
  - **Concurrent-join test:** Build a diamond DAG (A → B, A → C, {B,C} → J). Fire `onNodeComplete(B)` and `onNodeComplete(C)` from two simulated workers in parallel via `Promise.all`. Assert: J is enqueued via `dagStepCreator.create()` exactly once (use a spy on `create()` and assert call count = 1 for J).

- [ ] **Task 27: Add `scheduler-readiness.test.ts`**
  - Cover the readiness rule predicate: counter==0, status==pending, dag status==running, budget reservation succeeds
  - Each negative case (paused dag, non-zero counter, already running) → not transitioned

### Chunk 9: Cycle detector

- [ ] **Task 28: Create `worker/src/pulse/dag/cycle-detector.ts`**
  - Pure function `detectCycle(existingEdges, proposedEdges): { hasCycle: boolean, cycleNodes?: string[] }`
  - DFS with three-color marking (white/gray/black)
  - Returns the offending cycle for diagnostics

- [ ] **Task 29: `cycle-detector.test.ts` — linear, diamond, self-loop, indirect cycle, large random DAG**

### Chunk 10: Wire to Pulse + agent tool

- [ ] **Task 30: Wire `DagStepCreator.create()` callback to scheduler**
  - When BaseWorker completes a step that has `dag_id`, call `scheduler.onNodeComplete(dagId, nodeId)`
  - When BaseWorker fails a step (terminal) with dag_id, call `scheduler.onNodeFail(dagId, nodeId, retryable=false)`
  - Add hook in `worker/src/pulse/workers/base-worker.ts` after `executor.execute()` resolves/rejects

- [ ] **Task 31: Create `worker/src/agent/runtime-tools/dag-plan.ts`**
  - Tool definition: `plan_dag(template_slug: string, payload?: object): { dagId, nodeCount }`
  - Resolves agent's org_id from runtime context
  - Calls `templateLoader` → `dagPlanner.instantiateFromTemplate()` → returns dagId
  - Errors mapped to structured tool result

- [ ] **Task 32: Register `plan_dag` in `CommandsAllowlist.ts`**
  - Category: `runtime`, capability: `manage:orchestration` (add to capability list if not present)
  - Schema: template_slug (required string), payload (optional JSON)

### Chunk 11: E2E foundation test

- [ ] **Task 33: Create `e2e-foundation.test.ts`**
  - Seed a 4-node template (research → draft → deliver, with `approval` between draft and deliver)
  - Call `dagPlanner.instantiateFromTemplate()`
  - Simulate root completion → assert second node becomes ready
  - Simulate approval completion → assert deliver becomes ready
  - Assert final DAG status='completed', counters match

- [ ] **Task 34: Run full worker test suite + typecheck**

---

## Phase 4N-b: Mutability — TODO

> Agents can expand DAGs mid-run inside expansion zones. CAS + cycle check + idempotency.

### Chunk 12: DagMutator core

- [ ] **Task 35: Create `worker/src/pulse/dag/mutator.ts`**
  - Class `DagMutator` with `apply(input: { dagId, expectedVersion, idempotencyKey, mutationType, source, sourceRunId, additions, targetNodeId? })`
  - Implements the **11-step flow from spec §4.3 (verbatim)**:
    1. Entry: receive `expand_dag(dagId, expansion_zone, additions, idempotency_key, expected_version)` from agent tool / operator API
    2. Pre-check: `SELECT graph_version FROM orchestration_dags WHERE id = $dagId`
    3. If `graph_version != expected_version` → return `CasConflictError` (agent retries with fresh state) — *no DB writes, no lock acquired*
    4. Acquire Redis advisory lock `dag:{dagId}:lock NX EX 5` — on failure → `LockTimeoutError`
    5. Re-check `graph_version` under lock (fresh DB SELECT) — if changed → release lock, return `CasConflictError`
    6. Run cycle-detector against `(current edges ∪ proposed additions)` — on cycle → release lock, return `CycleError(offendingCycle)`
    7. Atomic CAS `UPDATE orchestration_dags SET graph_version = graph_version + 1 WHERE id = $dagId AND graph_version = $expectedVersion` — if 0 rows affected → release lock, return `CasConflictError`
    8. INSERT new nodes + edges in **same transaction** as step 7 (rollback on any failure releases the Redis lock via `finally`)
    9. INSERT mutation row with `applied_graph_version` — `UNIQUE(dag_id, idempotency_key)` constraint makes this the idempotency boundary; on conflict, swallow as `IdempotencyReplayError` and return previously-applied version (no-op)
    10. Release Redis lock (in `finally` block — guarantees release on commit *and* on rollback paths)
    11. Fire `scheduler.onMutation(dagId, addedNodeIds)` outside the lock — sets `pending_parent_count` on new nodes from new edges and transitions any with count=0 to 'ready'
  - All errors typed: `CasConflictError`, `CycleError`, `LockTimeoutError`, `IdempotencyReplayError`
  - **Transaction boundary:** steps 7+8+9 run in one Postgres transaction. Step 11 (`onMutation`) runs after commit + lock release so a slow scheduler can't deadlock other mutators.

- [ ] **Task 36: Add `scheduler.onMutation(dagId, addedNodeIds)` method**
  - For each added node, set `pending_parent_count` from incoming edges (single SQL using the just-inserted edges) — bounded by added subgraph
  - Transition any with count=0 to 'ready'
  - Enqueue ready leaves via `dagStepCreator`

### Chunk 13: Mutator tests

- [ ] **Task 37: `mutator-cas.test.ts`**
  - Two concurrent `apply()` calls with same `expectedVersion`
  - Assert: one succeeds with `applied_graph_version = expected + 1`, one returns `CasConflictError`
  - Loser retries with refreshed version → succeeds with `applied_graph_version = expected + 2`

- [ ] **Task 38: `mutator-cycle-reject.test.ts`**
  - DAG: A→B→C
  - Try to add edge C→A
  - Assert: `CycleError`, no DB rows added, `graph_version` unchanged

- [ ] **Task 39: `mutator-idempotency.test.ts`**
  - Apply mutation with key `k1` → success
  - Apply same key + same payload → no-op (returns previous applied_graph_version)
  - Apply same key + different payload → still no-op (key wins, not payload)

- [ ] **Task 40: `mutator-barriers.test.ts`**
  - Mutation adds a barrier node with N parents
  - Complete N-1 parents → barrier still pending
  - Complete Nth parent → barrier ready, downstream propagates

### Chunk 14: `expand_dag` agent tool

- [ ] **Task 41: Create `worker/src/agent/runtime-tools/dag-expand.ts`**
  - Tool: `expand_dag(dag_id, expansion_zone_node_key, additions, idempotency_key, expected_version)`
  - Calls `dagMutator.apply(...)`
  - Maps `CasConflictError` → structured error telling agent to refresh state and retry
  - Maps `CycleError` → structured error pointing to offending cycle

- [ ] **Task 42: Register `expand_dag` in `CommandsAllowlist.ts`** (same capability as `plan_dag`)

- [ ] **Task 43: Add agent-tool e2e test — `dag-expand-tool.test.ts`**
  - Plan DAG, complete first node, expand zone with 2 additions, complete those, assert DAG completes

- [ ] **Task 44: Run typecheck + tests**

---

## Phase 4N-c: Templates UX + Cross-Runtime — TODO

> Operators author templates via JSON editor. Steps can target dedicated runtimes via StepRunPacket protocol.

### Chunk 15: Template REST API

- [ ] **Task 45: Create `src/lib/db/dag-templates.ts`**
  - `import 'server-only'`
  - `listTemplates(orgId)`, `getTemplate(orgId, id)`, `createTemplate(orgId, input)`, `updateTemplate(orgId, id, input)`, `deleteTemplate(orgId, id)`, `seedGlobalTemplates()`
  - Validates spec against `DagSpecSchema` from template-loader

- [ ] **Task 46: Create `src/app/api/dags/templates/route.ts`**
  - GET: list (filtered by org membership via RLS)
  - POST: create (admin/owner only)

- [ ] **Task 47: Create `src/app/api/dags/templates/[id]/route.ts`** — GET / PUT / DELETE

- [ ] **Task 48: Add `dag-templates.test.ts` — CRUD + RLS isolation (cross-org leak test)**

### Chunk 16: Operator mutation API

- [ ] **Task 49: Create `src/app/api/dags/[id]/mutate/route.ts`**
  - Auth: org admin/owner
  - Body: `{ expectedVersion, idempotencyKey, additions, targetNodeId? }`
  - Calls `dagMutator.apply(...)` (server-side mutator instance, not worker)
  - Returns CONFLICT 409 with current version on CAS failure

### Chunk 17: StepRunPacket protocol — control plane

- [ ] **Task 50: Extend `src/lib/pulse/claim-proxy.ts`**
  - Add `claimNextStep(runtimeId)` — atomic step claim from `orchestration_steps WHERE runtime_target = 'dedicated:{runtimeId}' AND status = 'ready' LIMIT 1 FOR UPDATE SKIP LOCKED`, returns `StepRunPacket`
  - Add `completeStep(runtimeId, stepId, result)` — verifies runtime ownership, marks completed, fires `scheduler.onNodeComplete()` if `dag_id` is set
  - Add `failStep(runtimeId, stepId, errorMessage, retryable)` — same wiring
  - Add `renewStepLease(runtimeId, stepId)` — bumps `lease_expires_at`

- [ ] **Task 51: Create `src/app/api/runtimes/steps/claim/route.ts`**
  - Runtime API key auth
  - Calls `claimNextStep` → returns 200 + `StepRunPacket` JSON, or 204 if nothing ready

- [ ] **Task 52: Create `src/app/api/runtimes/steps/complete/route.ts`**
  - Body Zod-validated: `{ stepId, result?, durationMs? }`
  - Verifies step belongs to caller's runtime
  - Calls `completeStep` → 200 OK

- [ ] **Task 53: Create `src/app/api/runtimes/steps/fail/route.ts`** (analogous to complete)

- [ ] **Task 54: Create `src/app/api/runtimes/steps/renew-lease/route.ts`** (analogous)

### Chunk 18: StepRunPacket protocol — runtime

- [ ] **Task 55: Extend `worker/src/runtime/data-sink.ts`**
  - Add to `DataSink` interface: `claimNextStep`, `completeStep`, `failStep`, `renewStepLease`
  - Implement on `RestDataSink` (HTTP calls to new endpoints with runtime API key)
  - On `SupabaseDataSink`, throw "not supported in shared mode" (shared worker uses BaseWorker callback path)

- [ ] **Task 56: Create `worker/src/processors/relay-step.ts`**
  - Loop: `dataSink.claimNextStep()` → execute via local executor → `dataSink.completeStep()` or `failStep()`
  - Heartbeat lease renewal (every 15s)
  - Backoff on empty claim (exponential 100ms→5s)

- [ ] **Task 57: Add `STEP_PROTOCOL_ENABLED` flag in `worker/src/config.ts`** (default false)

- [ ] **Task 58: Wire `relay-step` loop in `worker/src/index.ts`** (parallel to existing relay-inbound, NOT a replacement)
  - Coexistence model: When `IS_DEDICATED_RUNTIME && STEP_PROTOCOL_ENABLED`, BOTH loops run in parallel:
    - `relay-inbound` (existing): continues handling channel-originated messages from `assistant_inbound_events`. Unchanged. Its `processInboundEvent` completion path is what creates the DAG root step via `dagStepCreator.create()` (see Task 25 hook).
    - `relay-step` (new): handles DAG-internal steps from `orchestration_steps` via `dataSink.claimNextStep()` → `dataSink.completeStep()`/`failStep()`. Distinct claim semantics — never claims rows from `assistant_inbound_events`.
  - The two loops have disjoint claim domains (different tables, different DataSink methods), so they cannot double-claim the same work.
  - When `STEP_PROTOCOL_ENABLED=false`: only `relay-inbound` runs (today's behavior). DAG features unavailable on that runtime.
  - Graceful shutdown drains both loops independently.

- [ ] **Task 59: Add `relay-step-protocol.test.ts`**
  - Mocked control plane HTTP
  - Runtime claims, executes, completes
  - Mixed-runtime DAG (one shared leaf, one dedicated leaf) executes end-to-end

### Chunk 19: Mission Control template editor

- [ ] **Task 60: Create `src/components/mission-control/dag/template-editor.tsx`**
  - Monaco editor (already in deps, check via `Glob "**/monaco-editor*"`)
  - Live Zod validation against `DagSpecSchema` — surface errors inline
  - Save → POST/PUT to `/api/dags/templates`

- [ ] **Task 61: Create `src/components/mission-control/dag/template-visualizer.tsx`**
  - Reuses `ReactFlowCanvas` from `src/components/shared/`
  - Read-only render of nodes + edges from current spec
  - Color nodes by `node_type`

- [ ] **Task 62: Create page `src/app/(app)/[workspace-slug]/mission-control/dags/templates/page.tsx`**
  - List + create + edit
  - Sidebar entry: gated behind `manage:orchestration` capability

- [ ] **Task 63: Add `template-editor.test.tsx` — validation surfaces, save calls API**

### Chunk 20: Reference template seeds

- [ ] **Task 64: Create `supabase/migrations/20260407300000_dag_template_seeds.sql`**
  - 3 templates inserted with `org_id = NULL` (global): `complaint_handler`, `order_fulfillment`, `content_pipeline`
  - Each has 4-6 nodes including at least one `expansion_zone` and one `approval`

- [ ] **Task 65: Run typecheck + full worker test suite + frontend test suite**

---

## Phase 4N-d: Budgets + Replay + 5N Hook — TODO

> Per-DAG budget enforcement, frontier replay, confidence pre-wire.

### Chunk 21: Budget ledger

- [ ] **Task 66: Create `worker/src/pulse/dag/budget-ledger.ts`**
  - Class `BudgetLedger` with Redis client + supabase injected
  - `tryReserve(dagId, estimatedCost): Promise<boolean>`:
    - Lua script: `local v = redis.call('INCRBY', KEYS[1], ARGV[1]); if v > tonumber(ARGV[2]) then redis.call('DECRBY', KEYS[1], ARGV[1]); return 0 end; return 1`
    - Cap from `orchestration_dags.budget_max_*`
    - Returns true if reserved, false if would overflow
  - `commit(dagId, nodeId, actualCost)`: INSERT into `orchestration_dag_budget_events` (event_type='tokens'/'usd'), if actualCost < reserved → release the diff via DECRBY
  - `release(dagId, nodeId, reserved)`: full release on failure via DECRBY + INSERT release event
  - All keys hash-tagged with `{dagId}`

- [ ] **Task 67: Wire `BudgetLedger.tryReserve` into scheduler readiness rule**
  - When transitioning a leaf node to 'ready', call `tryReserve` first
  - If false → leave as 'pending', schedule a retry on next budget event

- [ ] **Task 68: Add `budget-ledger.test.ts` — atomic reserve, over-spend block, release on fail, cumulative ledger correctness**

- [ ] **Task 69: Add `budget-pause-resume.test.ts` — exhaust budget → DAG paused → operator INSERTs reservation event with operator-supplied delta → DAG resumes**

### Chunk 22: Frontier replay

- [ ] **Task 70: Create `worker/src/pulse/dag/replay.ts`**
  - `DagReplay.fork(originalDagId, fromNodeId): Promise<{ newDagId }>`
  - Single transaction:
    1. INSERT new `orchestration_dags` row with `replay_of_dag_id = originalDagId`, `replay_from_node_id = fromNodeId`, `graph_version = 1`
    2. Clone all nodes — upstream of `fromNodeId` set to `status='completed'` + `replay_of_step_id` populated; `fromNodeId` and downstream set to `status='pending'`
    3. Recompute `pending_parent_count` for cloned downstream nodes from cloned edges
    4. Replay mutations from original (in `applied_graph_version` order) into the new DAG via `dagMutator.apply` — each gets fresh `idempotency_key` derived from `(originalMutationId, newDagId)`
  - Returns new dagId; new DAG starts in 'pending', will be picked up by `scheduler.onDagCreated`

- [ ] **Task 71: Create `src/app/api/dags/[id]/replay/route.ts` — operator-triggered**

- [ ] **Task 72: Add `replay-determinism.test.ts`**
  - Build DAG, run to completion with mocked deterministic step executor that records leaf execution order
  - Fork from a mid-node
  - Run forked DAG to completion with same executor
  - Assert: leaf execution order downstream of fork point matches original

### Chunk 23: Confidence gate (5N hook)

- [ ] **Task 73: Create `worker/src/pulse/dag/confidence-gate.ts`**
  - Function `evaluateConfidence(node, parentResults): { observed: number, source: 'static' | 'router' | 'self_report' }`
  - Phase 4N: returns `{ observed: node.confidence_floor ?? 1.0, source: 'static' }`
  - Phase 5N will swap in the router; this file owns the surface

- [ ] **Task 74: Wire `evaluateConfidence` into scheduler readiness**
  - When transitioning to ready, write `confidence_observed` + `confidence_source` on the node
  - If `confidence_observed < confidence_floor` → mark node 'failed' with reason='confidence_floor'

- [ ] **Task 75: Add `confidence-gate.test.ts` — floor enforced, source recorded, NULL floor = always pass**

### Chunk 24: `dag_status` tool

- [ ] **Task 76: Create `worker/src/agent/runtime-tools/dag-status.ts`**
  - Tool: `dag_status(dag_id)` → `{ status, total, completed, failed, ready, budget: { tokensUsed, tokensCap, usdUsed, usdCap }, recentMutations: [...] }`
  - Reads counters directly from `orchestration_dags` row (no graph scan)
  - Reads budget from Redis live counter, cumulative from `orchestration_dag_budget_events`

- [ ] **Task 77: Register `dag_status` in `CommandsAllowlist.ts`** (read-only, capability `read:orchestration`)

### Chunk 25: Full-stack integration test

- [ ] **Task 78: Create `e2e-full-stack.test.ts`**
  - Seed `complaint_handler` template
  - Trigger via webhook (relay-inbound path)
  - Agent calls `plan_dag('complaint_handler')` → DAG instantiated
  - Steps execute across mixed runtimes (mock dedicated runtime + shared)
  - Budget cap enforced (set low on purpose) → DAG pauses → operator approval → resumes
  - Final DAG status='completed', all `agent_runs` rows present (one per leaf), DAG-level rollup view returns expected aggregates

- [ ] **Task 79: Add stress test — 1000 concurrent DAGs**
  - Use sqlite-backed test if mocking; or skip and add to manual test plan
  - Assert scheduler operations are O(out-degree) not O(N) via instrumentation

- [ ] **Task 80: Run full frontend + worker test suites — `npm run test -- --run` and `cd worker && npm run test -- --run`**

- [ ] **Task 81: Update CLAUDE.md with DAG section under "Lucid Pulse"**

---

## Verification Checklist (Post-Phase)

After each phase:
1. `cd worker && npm run typecheck`
2. `cd worker && npm run test -- --run` (full suite)
3. `npm run typecheck` (frontend, if any frontend touched)
4. `npm run test -- --run` (frontend, if any frontend touched)

After 4N-d:
5. Manual: seed `complaint_handler`, trigger via test webhook, watch run in MC
6. Manual: kill worker mid-run, restart, verify orphan recovery + frontier resume
7. Manual: trigger CAS conflict by parallel `expand_dag` from two test agents
8. Manual: exceed budget cap, verify pause + override + resume
9. Manual: replay from mid-node, verify deterministic re-execution

---

## Rollout

- All Phase 4N code is gated behind feature flag `FEATURE_DAG_PLANNER` (default `false`) in `worker/src/config.ts`
- `STEP_PROTOCOL_ENABLED` (Phase 4N-c) is independently flaggable per runtime
- Templates can be authored before flag flip (templates table is independent)
- Rollback: set `FEATURE_DAG_PLANNER=false` on Railway → workers ignore DAG-bound steps; DB rows remain harmless

---

## Out of Scope (Phase 4N+)

- Visual graph editor (read-only ReactFlow only in 4N-c)
- Cross-DAG dependencies
- Distributed locking across DAGs
- Versioned in-flight upgrades (replay is the upgrade path)
- Phase 5N router itself (only the contract is wired in 4N-d)
- Multi-region orchestration
