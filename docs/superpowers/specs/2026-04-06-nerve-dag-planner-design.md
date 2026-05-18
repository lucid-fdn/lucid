# Nerve Phase 4N — DagPlanner (Intelligence Layer) Design Spec — v2

**Status:** Draft v2 (post-Codex review, awaiting approval)
**Author:** Kevin + Claude + Codex (synthesized POVs)
**Date:** 2026-04-06
**Builds on:** Nerve Phases 1N-3N (Pulse Universal Orchestration)
**Bridges to:** Nerve Phase 5N (Confidence Routing)

**Changelog v1 → v2:**
- Added Phase **4N-0** "Pulse Step-Aware Hardening" — fixes Phase 3N retry/orphan/idempotency bugs that block DAG layer
- Added **RLS** to all 6 new tables (Codex Blocker #1)
- Added **composite FK + integrity constraint** so edges cannot cross DAGs (Codex Blocker #1)
- Added **`(dag_id, dag_node_id, attempt)` unique index** on `orchestration_steps` (Codex Blocker #1)
- Added **`pending_parent_count` counter column** on nodes — kills "no whole-graph scans" concern (Codex Blocker #2)
- Added **`graph_version` column + optimistic CAS** for mutations (Codex Blocker #3)
- Added **Redis-counter budget reservation** with bounded-N race semantics (Codex Blocker #5)
- Reframed cross-runtime: extracted **`StepRunPacket` v2** + dedicated-runtime step claim protocol (Codex Blocker #6)
- Added **§11 Lifecycle** — explicit state machines + endpoint ownership matrix (Codex Blocker #10)
- Fixed **§4.3 typo** (`budget_floor` → `confidence_floor`) and added `confidence_source` provenance (Codex #7)
- Reframed sub-phases: **5 sub-phases** (was 4) with hardening as 4N-0
- Locked **Q1/Q2/Q3** answers (JSON-first, static floors, leaf agent_runs + rollup view)

---

## 1. Goal

Replace flat `OrchestrationStep` lists with **DAGs of steps** so an agent can decompose a mission ("handle this complaint") into a graph of dependent units (research → draft → approval → delivery), execute them in parallel where possible, mutate the graph mid-run as new information arrives, and survive worker crashes by replaying from the frontier.

**Non-goals (explicit):**
- Not a workflow engine for humans (Workflows tab stays separate)
- Not a replacement for cron (scheduled tasks still own time-based triggering)
- Not LLM-pre-planning-as-primary (pure pre-step decomposition is rejected)

---

## 2. Design Decisions (Locked)

| Decision | Choice | Rationale |
|---|---|---|
| Origin model | **Hybrid:** operator templates as backbone + agent-authored expansion via tool call | Templates give deterministic baseline for known missions; agent expansion handles novel/edge cases. Pure LLM pre-planning is rejected (non-deterministic, non-replayable). |
| Mutability | **Append-only mutations in marked expansion zones**, with explicit barrier nodes for parent-child waits, gated by `graph_version` CAS | Immutable baseline = replay-deterministic; expansion zones = adapt to runtime info; barriers = correctness without distributed locking; CAS = safe under concurrent writers |
| Pulse integration | **Only runnable leaf steps become Pulse jobs.** Bookkeeping/barrier/group nodes never enter the queue | Keeps Pulse semantics unchanged; DAG is a layer above Pulse, not inside it |
| Schema separation | **6-table model + steps extension** | Cleaner long-term, lets graph evolve independently of execution history |
| Sub-phase slicing | **5 phases** — 4N-0 (Hardening) → 4N-a (Foundation) → 4N-b (Mutability) → 4N-c (Templates UX + Cross-Runtime) → 4N-d (Budgets + Replay + 5N hook) | Hardening unblocks DAG layer; rest ships independently |
| Scheduler architecture | **Event-driven + materialized counters** — readiness driven by `pending_parent_count` decrement, never graph traversal | Hard requirement. Scales to 10k concurrent DAGs without N² behavior |
| Template authoring | **JSON-first** in Mission Control, ReactFlow as read-only visualizer | Operators are technical; problem is validation/versioning/replay, not drag UX |
| Confidence floor source | **Static per-node** in template, with `confidence_source` provenance for 5N | Predictable, replayable, diffable. 5N router compares dynamic confidence against static floor. |
| `agent_runs` granularity | **One row per leaf** + DAG-level rollup view | Matches existing claim/complete model; doesn't break dashboards |

---

## 3. Data Model (6 New Tables + 1 Extension)

### 3.1 `orchestration_dags` — DAG instances
```sql
CREATE TABLE orchestration_dags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,

  -- Origin
  source TEXT NOT NULL CHECK (source IN ('template', 'agent_authored', 'hybrid')),
  template_id UUID REFERENCES orchestration_dag_templates(id),
  root_event_id UUID,
  root_event_type TEXT CHECK (root_event_type IN ('inbound','outbound','scheduled','webhook')),

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','blocked','paused','completed','failed','cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Concurrency control (Codex Blocker #3)
  graph_version INTEGER NOT NULL DEFAULT 1,         -- monotonic; increments on every applied mutation

  -- Counters for fast progress reads (Codex Blocker #2)
  total_nodes INTEGER NOT NULL DEFAULT 0,
  completed_nodes INTEGER NOT NULL DEFAULT 0,
  failed_nodes INTEGER NOT NULL DEFAULT 0,
  ready_nodes INTEGER NOT NULL DEFAULT 0,

  -- Budget snapshot (frozen at creation; live consumption in budget_events; live reservation in Redis)
  budget_max_tokens INTEGER,
  budget_max_usd NUMERIC(10,4),
  budget_max_wall_seconds INTEGER,
  budget_max_tool_calls INTEGER,

  -- Replay
  replay_of_dag_id UUID REFERENCES orchestration_dags(id),
  replay_from_node_id UUID,                         -- FK added after orchestration_dag_nodes exists

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orch_dags_agent ON orchestration_dags(agent_id, created_at DESC);
CREATE INDEX idx_orch_dags_status ON orchestration_dags(status) WHERE status IN ('pending','running','blocked','paused');
CREATE INDEX idx_orch_dags_org ON orchestration_dags(org_id, created_at DESC);

-- RLS (Codex Blocker #1)
ALTER TABLE orchestration_dags ENABLE ROW LEVEL SECURITY;
CREATE POLICY orchestration_dags_org_isolation ON orchestration_dags
  FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
```

### 3.2 `orchestration_dag_nodes` — Graph nodes
```sql
CREATE TABLE orchestration_dag_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dag_id UUID NOT NULL REFERENCES orchestration_dags(id) ON DELETE CASCADE,

  -- Node identity
  node_key TEXT NOT NULL,                           -- stable within DAG
  node_type TEXT NOT NULL CHECK (node_type IN (
    'leaf', 'group', 'barrier', 'expansion_zone', 'approval'
  )),

  -- Execution target (only for leaf nodes)
  step_type TEXT,                                   -- inbound | outbound | scheduled | webhook | approval
  runtime_target TEXT,                              -- shared | dedicated:{runtimeId} | webhook:{url}
  route_class TEXT,                                 -- fast | strong | external
  payload JSONB,

  -- Confidence contract (Phase 5N pre-wire — Codex #7)
  confidence_floor NUMERIC(3,2),                    -- min required to execute (NULL = no gate)
  confidence_observed NUMERIC(3,2),                 -- actual at execution time
  confidence_source TEXT CHECK (confidence_source IN ('static','router','self_report')),

  -- Readiness counter (Codex Blocker #2 — kills whole-graph scans)
  pending_parent_count INTEGER NOT NULL DEFAULT 0,  -- decremented atomically when a parent completes

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','running','completed','failed','skipped','superseded','cancelled')),
  step_id UUID REFERENCES orchestration_steps(id),
  superseded_at TIMESTAMPTZ,
  superseded_by_node_id UUID REFERENCES orchestration_dag_nodes(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (dag_id, node_key),
  -- Composite key to enable cross-DAG integrity FK on edges (Codex Blocker #1)
  UNIQUE (dag_id, id)
);
CREATE INDEX idx_dag_nodes_dag_status ON orchestration_dag_nodes(dag_id, status);
CREATE INDEX idx_dag_nodes_ready ON orchestration_dag_nodes(dag_id) WHERE status = 'ready';
-- Fast lookup of nodes whose readiness needs recheck after a mutation
CREATE INDEX idx_dag_nodes_pending ON orchestration_dag_nodes(dag_id) WHERE pending_parent_count > 0 AND status = 'pending';

ALTER TABLE orchestration_dag_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY orchestration_dag_nodes_org_isolation ON orchestration_dag_nodes
  FOR ALL TO authenticated
  USING (dag_id IN (
    SELECT id FROM orchestration_dags
    WHERE org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ));
```

### 3.3 `orchestration_dag_edges` — Dependencies
```sql
CREATE TABLE orchestration_dag_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dag_id UUID NOT NULL REFERENCES orchestration_dags(id) ON DELETE CASCADE,
  parent_node_id UUID NOT NULL,
  child_node_id UUID NOT NULL,
  edge_kind TEXT NOT NULL DEFAULT 'data'
    CHECK (edge_kind IN ('data','order','barrier')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite FK enforces both nodes belong to the same DAG (Codex Blocker #1)
  FOREIGN KEY (dag_id, parent_node_id) REFERENCES orchestration_dag_nodes(dag_id, id) ON DELETE CASCADE,
  FOREIGN KEY (dag_id, child_node_id)  REFERENCES orchestration_dag_nodes(dag_id, id) ON DELETE CASCADE,

  UNIQUE (parent_node_id, child_node_id),
  CHECK (parent_node_id <> child_node_id)
);
CREATE INDEX idx_dag_edges_parent ON orchestration_dag_edges(parent_node_id);
CREATE INDEX idx_dag_edges_child ON orchestration_dag_edges(child_node_id);

ALTER TABLE orchestration_dag_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY orchestration_dag_edges_org_isolation ON orchestration_dag_edges
  FOR ALL TO authenticated
  USING (dag_id IN (
    SELECT id FROM orchestration_dags
    WHERE org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ));
```

### 3.4 `orchestration_dag_templates` — Operator-authored backbones
```sql
CREATE TABLE orchestration_dag_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,

  spec JSONB NOT NULL,                              -- { nodes, edges, expansion_zones }
  schema_version INTEGER NOT NULL DEFAULT 1,

  trigger_intents TEXT[],
  mission_type TEXT,

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, slug, version)
);
CREATE INDEX idx_dag_templates_intent ON orchestration_dag_templates USING gin(trigger_intents);

ALTER TABLE orchestration_dag_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY orchestration_dag_templates_visibility ON orchestration_dag_templates
  FOR SELECT TO authenticated
  USING (
    org_id IS NULL  -- global templates visible to all
    OR org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );
CREATE POLICY orchestration_dag_templates_write ON orchestration_dag_templates
  FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('admin','owner')));
```

### 3.5 `orchestration_dag_mutations` — Audit log
```sql
CREATE TABLE orchestration_dag_mutations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dag_id UUID NOT NULL REFERENCES orchestration_dags(id) ON DELETE CASCADE,

  mutation_type TEXT NOT NULL CHECK (mutation_type IN (
    'expand', 'cancel', 'supersede', 'budget_rebalance'
  )),
  source TEXT NOT NULL CHECK (source IN ('agent','operator','system')),
  source_run_id UUID,
  target_node_id UUID REFERENCES orchestration_dag_nodes(id),

  -- Optimistic concurrency (Codex Blocker #3)
  expected_graph_version INTEGER NOT NULL,          -- snapshot the mutation was validated against
  applied_graph_version INTEGER NOT NULL,           -- new version after apply
  idempotency_key TEXT NOT NULL,                    -- for safe agent-side retries

  payload JSONB NOT NULL,                           -- diff: { added, removed, changed }
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by_worker TEXT,

  UNIQUE (dag_id, idempotency_key)
);
CREATE INDEX idx_dag_mutations_dag ON orchestration_dag_mutations(dag_id, applied_at);

ALTER TABLE orchestration_dag_mutations ENABLE ROW LEVEL SECURITY;
CREATE POLICY orchestration_dag_mutations_org_isolation ON orchestration_dag_mutations
  FOR ALL TO authenticated
  USING (dag_id IN (
    SELECT id FROM orchestration_dags
    WHERE org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ));
```

### 3.6 `orchestration_dag_budget_events` — Live consumption ledger
```sql
CREATE TABLE orchestration_dag_budget_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dag_id UUID NOT NULL REFERENCES orchestration_dags(id) ON DELETE CASCADE,
  node_id UUID REFERENCES orchestration_dag_nodes(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('tokens','usd','tool_call','wall_seconds','reservation','release')),
  delta NUMERIC(12,4) NOT NULL,
  cumulative NUMERIC(12,4) NOT NULL,                -- post-event snapshot for fast reads
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dag_budget_dag ON orchestration_dag_budget_events(dag_id, recorded_at);

ALTER TABLE orchestration_dag_budget_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY orchestration_dag_budget_events_org_isolation ON orchestration_dag_budget_events
  FOR ALL TO authenticated
  USING (dag_id IN (
    SELECT id FROM orchestration_dags
    WHERE org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  ));
```

### 3.7 Extension to `orchestration_steps`
```sql
ALTER TABLE orchestration_steps
  ADD COLUMN dag_id UUID REFERENCES orchestration_dags(id),
  ADD COLUMN dag_node_id UUID REFERENCES orchestration_dag_nodes(id),
  ADD COLUMN runtime_target TEXT,
  ADD COLUMN route_class TEXT,
  ADD COLUMN replay_of_step_id UUID REFERENCES orchestration_steps(id);

CREATE INDEX idx_orch_steps_dag ON orchestration_steps(dag_id) WHERE dag_id IS NOT NULL;

-- Strengthened idempotency (Codex Blocker #1) — replaces weak Phase 3N key
CREATE UNIQUE INDEX idx_orch_steps_dag_attempt
  ON orchestration_steps(dag_id, dag_node_id, attempt)
  WHERE dag_id IS NOT NULL;
```

`parent_step_id` (reserved in Phase 3N) is superseded by `dag_node_id`. Kept for backward compat in 4N, droppable in 5N.

### 3.8 Redis state (for hot-path fields not suited to Postgres)
```
dag:{dagId}:budget:tokens     INTEGER     -- live reservation counter
dag:{dagId}:budget:usd        NUMERIC     -- (Lua-encoded for atomic ops)
dag:{dagId}:graph_version     INTEGER     -- mirror of DB column for fast CAS pre-check
dag:{dagId}:lock              STRING      -- short-lived (5s) advisory lock for mutation apply
```

All keys hash-tagged with `{dagId}` for cluster-slot co-location.

---

## 4. Component Architecture

### 4.1 New module: `worker/src/pulse/dag/`
```
worker/src/pulse/dag/
├── index.ts                  # Barrel exports
├── types.ts                  # DagSpec, DagNode, DagEdge, MutationDiff, BudgetSnapshot
├── planner.ts                # DagPlanner: instantiate from template, attach to event
├── scheduler.ts              # IncrementalScheduler: counter-driven readiness, no scans
├── mutator.ts                # DagMutator: validate (CAS) + apply expansion/cancel/supersede
├── budget-ledger.ts          # BudgetLedger: Redis reservation + Postgres ledger
├── confidence-gate.ts        # Phase 5N hook: gate execution on confidence_floor
├── cycle-detector.ts         # DFS cycle check on every mutation (pre-CAS)
├── replay.ts                 # Frontier replay
├── template-loader.ts        # Load + validate template specs from DB
├── dag-step-creator.ts       # SINGLE AUTHORITY for DAG-backed step creation (4N-0)
└── __tests__/...
```

### 4.2 Agent tools
| Tool | Purpose | Source |
|---|---|---|
| `plan_dag` | Instantiate DAG from template OR author inline | `worker/src/agent/runtime-tools/dag-plan.ts` |
| `expand_dag` | Add children to expansion_zone (CAS-gated, cycle-checked) | `worker/src/agent/runtime-tools/dag-expand.ts` |
| `dag_status` | Read current DAG state (live counters + budget snapshot) | same |

Both gated behind `manage:orchestration` capability.

### 4.3 Scheduler model (counter-driven, NEVER whole-graph scans)

**Initial state:** When `DagPlanner.instantiate()` writes a DAG, it computes `pending_parent_count` for each node from the edge list (one-time, at creation, bounded by template size — not a runtime scan).

**Triggers and their O() cost:**

| Trigger | What happens | Cost |
|---|---|---|
| `onNodeComplete(nodeId)` | Lookup direct children via `idx_dag_edges_parent` → atomic `UPDATE nodes SET pending_parent_count = pending_parent_count - 1, status = CASE WHEN pending_parent_count = 1 AND confidence_floor <= ... THEN 'ready' ELSE status END WHERE id IN (children)` | O(out-degree) |
| `onNodeFail(nodeId)` | Mark node failed; if not retryable, propagate cancel down via children fan-out | O(descendants of failed node), bounded |
| `onMutation(dagId, expectedVersion)` | Apply mutation under Redis lock + DB CAS; bump `graph_version`; for newly-added nodes, set `pending_parent_count` from new edges and mark ready any with count=0 | O(nodes added by this mutation) |
| `onBudgetEvent(dagId, delta)` | Update Redis counter, check cap, pause DAG if exceeded | O(1) |
| `onDagCreated(dagId)` | Mark all nodes with `pending_parent_count = 0` as ready | O(root nodes), known at instantiation |

**Readiness rule (corrected from v1):**
```
node becomes 'ready' iff:
  pending_parent_count == 0
  AND status == 'pending'
  AND (confidence_floor IS NULL OR all parents have confidence_observed >= node.confidence_floor)
  AND DAG status NOT IN ('paused','cancelled','failed','blocked')
  AND budget reservation succeeds (Redis INCRBY check)
```

**Mutation flow under concurrency (Codex Blocker #3):**
```
1. Agent calls expand_dag(dagId, expansion_zone, additions, idempotency_key, expected_version)
2. SELECT graph_version FROM orchestration_dags WHERE id = dagId
3. If graph_version != expected_version → return CONFLICT (agent retries with fresh state)
4. Acquire Redis advisory lock dag:{dagId}:lock NX EX 5
5. Re-check graph_version under lock (DB SELECT)
6. Run cycle-detector against (current edges + proposed additions)
7. UPDATE orchestration_dags SET graph_version = graph_version + 1
   WHERE id = dagId AND graph_version = expected_version
   → if 0 rows: another writer won, release lock, return CONFLICT
8. INSERT new nodes + edges in same transaction
9. INSERT mutation row with applied_graph_version
10. Release Redis lock
11. Fire onMutation() for newly-ready nodes
```

`UNIQUE (dag_id, idempotency_key)` on mutations table makes step 9 the idempotency boundary — duplicate agent retries become no-ops.

### 4.4 Pulse integration
```
DAG node becomes 'ready' (leaf type only)
  → BudgetLedger.tryReserve(dagId, estimatedCost)
    → if reservation fails → mark node 'pending', wait for budget_event
  → DagStepCreator.create(node) → orchestration_steps row
    → routes through SINGLE authority (fixes step-tracker.ts vs REST route duplication)
  → resolve runtime_target → pick PulseQueue (shared) OR enqueue StepRunPacket via REST (dedicated)
  → on complete → release reservation excess back to budget
  → on fail → release full reservation, scheduler.onNodeFail
```

Bookkeeping nodes (group, barrier, expansion_zone) **never enter Pulse**. They are pure scheduler state, advanced by `onNodeComplete` callbacks.

### 4.5 Cross-runtime step protocol (StepRunPacket — extends C1 relay)

**Codex Blocker #6 fix.** Current C1 relay only handles `assistant_inbound_events`. We extend it.

**New relay endpoints (Phase 4N-c):**
```
POST /api/runtimes/steps/claim       → claims next ready step for runtime, returns StepRunPacket
POST /api/runtimes/steps/complete    → marks step completed, fires DAG scheduler callback
POST /api/runtimes/steps/fail        → marks step failed, fires DAG scheduler callback
POST /api/runtimes/steps/renew-lease → extends step lease (for long-running steps)
```

**`StepRunPacket` shape:**
```ts
{
  stepId: string
  dagId: string
  dagNodeId: string
  stepType: 'inbound' | 'outbound' | 'scheduled' | 'webhook' | 'approval'
  payload: JsonValue
  attempt: number
  leaseExpiresAt: string
  // Optional embedded context for runtime
  agentContext?: { soulSnapshot, boardMemorySnapshot }
}
```

`RestDataSink` extended with `claimNextStep()`, `completeStep()`, `failStep()`, `renewStepLease()`.

The dedicated runtime's worker loop becomes mode-switched: if `STEP_PROTOCOL_ENABLED=true`, claim from steps endpoint; else fall back to current `messages/claim-inbound` path.

---

## 5. Sub-Phase Slicing (5 Phases)

### Phase 4N-0: Pulse Step-Aware Hardening (1 week) ⚠️ NEW
**Prerequisite for everything else.** Fixes Phase 3N bugs that block DAG layer.
- **Fix `PulseQueue.fail()`** to preserve step-specific fields on retry (Codex finding from queue.ts:352)
- **Extend orphan-detector** to know about `orchestration_steps` and reset stuck step rows
- **Introduce `DagStepCreator`** as single authority — consolidate `worker/src/pulse/executors/step-tracker.ts` and `src/app/api/runtimes/steps/enqueue/route.ts` into one path
- **Strengthen step idempotency** with `(event_id, attempt, step_type)` unique index reinforcement
- Tests: regression coverage for retry-preserves-step-fields, orphan-resets-steps, single-creation-path
- **Demo:** Phase 3N step retry now preserves payload through DLQ; orphan detector recovers stuck `orchestration_steps` rows.

### Phase 4N-a: Foundation (1.5 weeks)
**Ships:** Static DAGs work end-to-end with templates only.
- Migrations: 6 new tables + steps extension + RLS + composite FK + idempotency unique index
- `worker/src/pulse/dag/`: planner, scheduler (counter-driven), cycle-detector, dag-step-creator integration
- `plan_dag` tool (template instantiation only)
- Pulse integration: ready leaf → DagStepCreator → enqueue → complete → counter-driven readiness propagation
- Tests: unit + e2e for "template → graph → execution → completion"
- **Demo:** Operator authors a "complaint handler" template; agent calls `plan_dag(template='complaint_handler')`; DAG runs research → draft → deliver in parallel; row in `orchestration_dags`, leaves in `orchestration_steps`, scheduler proves no scans via instrumented test.

### Phase 4N-b: Mutability (1 week)
**Ships:** Agents can expand DAGs mid-run with safe concurrency.
- `expand_dag` tool with cycle-detector + graph_version CAS + Redis lock
- `orchestration_dag_mutations` audit trail with idempotency_key
- Barrier nodes for parent-child waits
- Tests: "two agents try to expand same zone → one wins, one CAS-conflicts → retry → both resolve"
- **Demo:** Concurrent mutation attempt logged with CAS retry; cycle attempt rejected with structured error.

### Phase 4N-c: Templates UX + Cross-Runtime (1.5 weeks)
**Ships:** Operators browse/author templates; nodes target dedicated runtimes via StepRunPacket protocol.
- `orchestration_dag_templates` CRUD API + Mission Control JSON editor + ReactFlow read-only visualizer
- `StepRunPacket` v2 protocol: 4 new `/api/runtimes/steps/*` endpoints
- `RestDataSink` extension: `claimNextStep`, `completeStep`, `failStep`, `renewStepLease`
- Worker mode switch: shared worker uses BaseWorker callback path; dedicated runtime uses REST step protocol
- Template seeding for 3 reference missions (complaint, order, content_pipeline)
- Tests: "DAG with mixed runtime targets (shared + dedicated) executes end-to-end via both protocols"
- **Demo:** Template with one shared-worker leaf and one dedicated-runtime leaf executes; both call back into DAG scheduler.

### Phase 4N-d: Budgets + Replay + 5N Hook (1 week)
**Ships:** Per-DAG budget enforcement, frontier replay, confidence pre-wire.
- `BudgetLedger` with Redis reservation + Postgres ledger
- `dag_status` tool returns live budget snapshot
- Frontier replay: clone DAG from any node, mark as `replay_of_dag_id`
- Confidence contract: `confidence_floor` enforced as scheduler gate; `confidence_source` provenance
- Tests: "budget exhausted → DAG pauses → operator approves overrun → resumes"; "replay from node N produces identical leaf execution order"
- **Demo:** Budget cap triggers pause; operator overrides; replay produces deterministic re-run.

**Total: ~6 weeks** (was 4.5 in v1; +1 week for 4N-0, +0.5 for 4N-c relay protocol).

---

## 6. The 8 "300% Ahead" Bets

(Unchanged from v1.)

1. **DAG as data, not code** — graphs in Postgres, replayable across deploys
2. **Mutable mid-run** — agent reshapes plan based on what it learns, in safe expansion zones with CAS-protected audit trail
3. **Speculative parallelism** — independent branches concurrent by default
4. **Confidence-driven replan** — Phase 5N hook ready
5. **Cross-runtime steps in one DAG** — research on shared, signing on dedicated, delivery via webhook
6. **Per-DAG budgets as a first-class gate** — Redis reservation prevents over-spend
7. **Replay-deterministic** — immutable baseline + audited mutations + frozen graph_version
8. **Human approval as a DAG node** — first-class node type

---

## 7. Risks & Mitigations (expanded post-Codex review)

| Risk | Mitigation | Phase |
|---|---|---|
| Duplicate step-creation paths | `DagStepCreator` single authority | 4N-0 |
| Weak step idempotency amplified by mutations | `(dag_id, dag_node_id, attempt)` unique + `(event_id, attempt, step_type)` | 4N-0 + 4N-a |
| Pulse retry/orphan not step-aware | Fix `PulseQueue.fail()` field preservation + extend orphan detector | 4N-0 |
| Multi-tenant data leak via missing RLS | RLS + policies on all 6 tables + composite FK for edges | 4N-a |
| Cross-DAG edge integrity | Composite FK `(dag_id, node_id)` enforced at DB level | 4N-a |
| Concurrent mutation race / lost update | `graph_version` CAS + Redis advisory lock + idempotency_key | 4N-b |
| Whole-graph scans destroying throughput | `pending_parent_count` counters; mutation handles only added nodes | 4N-a + 4N-b |
| Budget over-spend race | Redis reservation INCRBY-then-check; bounded N ≈ concurrent worker count, not unbounded | 4N-d |
| Cross-runtime steps don't compose with C1 relay | `StepRunPacket` v2 protocol + dedicated `/api/runtimes/steps/*` endpoints | 4N-c |
| `dedicated:{runtimeId}` undefined behavior | Mode switch in worker loop: `STEP_PROTOCOL_ENABLED` flag | 4N-c |
| Confidence contract incomplete for 5N | `confidence_source` provenance column; write timing defined in §11 | 4N-a + 4N-d |
| Agent infinite cycle via expand_dag | DFS cycle-detector pre-CAS in mutator | 4N-b |
| Spec underspecification → engineer divergence | §11 lifecycle + state machine + endpoint ownership matrix | 4N-a |

---

## 8. Locked Q&A (was open in v1)

| Question | Locked Answer |
|---|---|
| Template authoring UX | **JSON editor in Mission Control**, ReactFlow as read-only visualizer. Source of truth = JSON. |
| Confidence floor source | **Per-node static** in template, `confidence_source='static'`. Phase 5N router writes `confidence_observed` with `confidence_source='router'`. |
| `agent_runs` granularity | **One row per leaf** (existing pattern preserved) + DAG-level rollup view computed from `orchestration_steps.dag_id`. |

---

## 9. What Stays Out of Scope

- Distributed locking across DAGs (intra-DAG handled via graph_version + Redis lock)
- Cross-DAG dependencies (DAGs are independent units; chain via webhook/event)
- Versioned in-flight upgrades (mutations are append-only; full replay is the upgrade path)
- Visual graph editor (deferred to 4N-e or later)
- Phase 5N router itself (only the contract is pre-wired here)
- Multi-region orchestration (single Postgres + single Upstash assumed)

---

## 10. Verification Strategy

- **4N-0:** Regression tests for `PulseQueue.fail()` field preservation; orphan-detector recovers stuck steps; single step-creation path
- **4N-a:** Template instantiation, single-runtime execution, completion path, RLS isolation, no-scans assertion (instrument scheduler)
- **4N-b:** Cycle detection, expansion audit, barrier waits, **concurrent mutation CAS** (two-writer race test)
- **4N-c:** Mixed runtime targets via StepRunPacket protocol, runtime failover, JSON template validation
- **4N-d:** Budget cap enforcement, pause/resume, override flow, frontier replay determinism
- **Integration:** full E2E (inbound webhook → template-driven DAG → multi-leaf execution → completion → MC visualization)
- **Stress:** 10k concurrent DAGs, scheduler operates only on changed neighbors (instrumented assertion), Redis budget reservation under contention

Target: ~120-150 new tests across the 5 sub-phases (was 80-100 in v1).

---

## 11. Lifecycle & Endpoint Ownership (NEW — Codex Blocker #10)

### 11.1 DAG state machine
```
pending → running → blocked (waiting on approval/budget/external)
       → running → paused (operator override)
       → running → completed (all leaves complete)
       → running → failed (non-retryable leaf failure or budget exhaustion)
       → pending → cancelled (operator cancel before start)
```

### 11.2 Node state machine
```
pending → ready → running → completed
       → ready → running → failed → (retry: ready) | (terminal: failed)
       → pending → skipped (parent failed, propagate)
       → pending → superseded (mutation replaced this node)
       → any    → cancelled (operator or parent cancel)
```

### 11.3 Endpoint / module ownership matrix

| Operation | Shared worker (BaseWorker) | Dedicated runtime (REST) | Owner module |
|---|---|---|---|
| Claim leaf | `PulseQueue.claim()` | `POST /api/runtimes/steps/claim` | `dag/scheduler.ts` (callback target) |
| Complete leaf | `PulseQueue.complete()` → `scheduler.onNodeComplete()` | `POST /api/runtimes/steps/complete` → `claim-proxy.ts` → `scheduler.onNodeComplete()` | `dag/scheduler.ts` |
| Fail leaf | `PulseQueue.fail()` → `scheduler.onNodeFail()` | `POST /api/runtimes/steps/fail` → `claim-proxy.ts` → `scheduler.onNodeFail()` | `dag/scheduler.ts` |
| Renew lease | `PulseLease.renew()` | `POST /api/runtimes/steps/renew-lease` | `pulse/lease.ts` |
| Mutate DAG | `DagMutator.apply()` direct call (worker context) | `POST /api/dags/[id]/mutate` (REST, with auth) | `dag/mutator.ts` |
| Pause / resume DAG | Operator → DB UPDATE | Operator → DB UPDATE | UI / `dag/mutator.ts` |
| Replay from frontier | `DagReplay.fork(dagId, fromNodeId)` | `POST /api/dags/[id]/replay` | `dag/replay.ts` |
| Orphan detection | `OrphanDetector` cron — extended in 4N-0 to know about steps | (same; runs on control plane) | `pulse/orphan-detector.ts` |

### 11.4 Confidence contract write timing
- `confidence_floor` — written **once** at node creation (template instantiation OR mutation). Immutable.
- `confidence_observed` — written **at execution time** by whoever runs the leaf. Source recorded in `confidence_source`:
  - `'static'` — Phase 4N: defaults to `confidence_floor` value (no router yet)
  - `'router'` — Phase 5N: written by router after model selection
  - `'self_report'` — agent self-reports confidence after running (optional, future)

### 11.5 Operator override mechanics
- **Pause DAG**: UPDATE `orchestration_dags SET status='paused'` → scheduler skips ready nodes until resumed
- **Resume DAG**: UPDATE `orchestration_dags SET status='running'` → scheduler re-evaluates ready set
- **Approve budget overrun**: insert `budget_event` with `event_type='reservation'` and operator-supplied delta → bumps cap effectively
- **Cancel DAG**: UPDATE `orchestration_dags SET status='cancelled'` → cascade-cancel all pending/ready nodes

### 11.6 Replay cloning semantics
- `DagReplay.fork(dagId, fromNodeId)` creates new `orchestration_dags` row with `replay_of_dag_id` set
- Nodes upstream of `fromNodeId` are cloned with `status='completed'` and `replay_of_step_id` pointing to original
- Nodes downstream of `fromNodeId` are cloned with `status='pending'` and `pending_parent_count` recomputed from edges
- Mutations from original DAG are replayed in `applied_graph_version` order
- New `graph_version` starts at 1

---

## 12. Approval Gate

This v2 spec addresses all 6 Codex blockers + 3 needs-revisions. Once approved:
1. Invoke `writing-plans` skill to produce `docs/superpowers/plans/2026-04-06-nerve-dag-planner-plan.md`
2. Plan will break each of the 5 sub-phases into 2-5 minute tasks with checkboxes
3. Implementation begins on Phase 4N-0 (the hardening prerequisite)
