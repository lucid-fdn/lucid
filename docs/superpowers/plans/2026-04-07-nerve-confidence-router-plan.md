# Nerve Phase 5N — Confidence Router Implementation Plan

**Spec:** `docs/superpowers/specs/2026-04-07-nerve-confidence-router-design.md`
**Status:** Draft (awaiting spec approval)
**Prerequisite:** Phase 4N-d shipped (`worker/src/pulse/dag/confidence-gate.ts` exists as static stub; scheduler calls `evaluateConfidence`)
**Feature flag:** `FEATURE_CONFIDENCE_ROUTER` in `worker/src/config.ts` (default `false`)

Total: **~25-35 new tests, 1 migration, ~5-6 working days**.

---

## Chunk 1: Scoring primitives

### Task 1: Add feature flag to config

- [ ] Edit `worker/src/config.ts`:
  - Add `FEATURE_CONFIDENCE_ROUTER: boolean` to `WorkerConfig` interface
  - Parse from env (`process.env.FEATURE_CONFIDENCE_ROUTER === 'true'`), default `false`
  - Add to the feature flag section next to `FEATURE_DAG_PLANNER`

### Task 2: Create `worker/src/pulse/dag/confidence-router/version.ts`

- [ ] Export `ROUTER_VERSION = 'v1-2026-04-07'`
- [ ] Add a 1-line comment: "Bump when scoring table or signals change; written to confidence_router_version for replay."

### Task 3: Create `worker/src/pulse/dag/confidence-router/types.ts`

- [ ] Define:
  ```ts
  export type RouteClass = 'fast' | 'strong' | 'external'
  export type StepType = 'inbound' | 'outbound' | 'scheduled' | 'webhook' | 'approval'

  export interface RouterInput {
    node: DagNode
    parentResults: ParentResult[]
  }

  export interface RouterNote {
    route: RouteClass
    base: number
    delta: number
    observed: number
    signalHits: string[]
  }

  export interface ConfidenceDecision {
    observed: number
    source: 'static' | 'router' | 'self_report'
    routerVersion: string | null
    upgradedTo?: RouteClass | null
    failed?: boolean
    reason?: string
    notes?: RouterNote[]
  }
  ```
- [ ] Import `DagNode` and `ParentResult` from `worker/src/pulse/dag/types.ts`

### Task 4: Create `worker/src/pulse/dag/confidence-router/scoring-table.ts`

- [ ] Export `BASE_SCORES: Record<StepType, Record<RouteClass, number>>` per the spec table
- [ ] Add `getBaseScore(stepType, route): number` with strict typing
- [ ] Throw on unknown step_type (fail loud in dev, fall back to 0.5 in prod with logger.warn)

### Task 5: Create `worker/src/pulse/dag/confidence-router/signals.ts`

- [ ] Export 5 pure-function signals, each typed as `(input: RouterInput, route: RouteClass) => { delta: number, hit: boolean, name: string }`:
  - `hasLongInput` — `-0.05` on fast lane when payload JSON length > 4k chars
  - `requiresToolCalls` — `-0.08` on fast lane when payload has `tool_names: string[]` non-empty
  - `parentHadLowConfidence` — `-0.10` when any `parentResults[].confidence_observed < 0.7`
  - `payloadHasStrictSchema` — `+0.03` when payload has `schema: {...}` key
  - `isApprovalStep` — `0` (no delta — just forces hit for logging)
- [ ] Export `applySignals(input, route, notes): number` that sums deltas and pushes signal names into the current `RouterNote.signalHits`
- [ ] Each signal has bounded range — assert in test

### Task 6: Unit tests — `worker/src/pulse/dag/confidence-router/__tests__/scoring-table.test.ts`

- [ ] Assert every `(stepType, route)` pair returns a number in `[0, 1]`
- [ ] Assert monotonic ordering: `fast <= strong <= external` for every step type
- [ ] Assert unknown step_type throws (or returns fallback with warn)

### Task 7: Unit tests — `worker/src/pulse/dag/confidence-router/__tests__/signals.test.ts`

- [ ] 1 test per signal covering: hits fire, miss returns 0, bounds respected
- [ ] `applySignals` aggregate test: multiple signals compose, notes populated
- [ ] Edge case: empty parentResults → `parentHadLowConfidence` returns 0

---

## Chunk 2: Router class + upgrade loop

### Task 8: Create `worker/src/pulse/dag/confidence-router/router.ts`

- [ ] Export class `ConfidenceRouter` with method `score(input: RouterInput): ConfidenceDecision`
- [ ] Implement the upgrade loop from spec §4.3:
  - Walk `['fast','strong','external']` starting at `node.route_class ?? 'fast'`
  - For each route: get base + apply signals + clamp → observed
  - If `observed >= floor` (or floor is null) → return success with `upgradedTo` set if route changed
  - If exhausted → return `{ failed: true, reason: 'confidence_floor' }`
- [ ] Respect `external` opt-in: only upgrade to `external` if `node.payload.allow_external_upgrade === true`
- [ ] Always set `routerVersion: ROUTER_VERSION` on decision

### Task 9: Create `worker/src/pulse/dag/confidence-router/index.ts`

- [ ] Barrel export: `ConfidenceRouter`, `ROUTER_VERSION`, all types
- [ ] Export a module-level singleton `confidenceRouter = new ConfidenceRouter()`

### Task 10: Unit tests — `worker/src/pulse/dag/confidence-router/__tests__/router.test.ts`

- [ ] "fast route meets floor → no upgrade, returns observed with source='router'"
- [ ] "fast route fails floor → upgrades to strong → meets floor → upgradedTo='strong'"
- [ ] "fast + strong fail, external not allowed → returns failed=true"
- [ ] "fast + strong fail, external allowed via payload flag → upgrades to external"
- [ ] "null confidence_floor → returns immediately with base score, no upgrade"
- [ ] "approval step_type → always returns 1.0"
- [ ] "router version stamped on every decision"
- [ ] Determinism test: call `score()` twice with same input → strictly equal output (JSON.stringify compare)

---

## Chunk 3: Wire into scheduler + migration

### Task 11: Migration — `supabase/migrations/20260407100000_confidence_router.sql`

- [ ] Add columns to `orchestration_dag_nodes`:
  ```sql
  ALTER TABLE orchestration_dag_nodes
    ADD COLUMN confidence_router_version TEXT,
    ADD COLUMN confidence_router_notes JSONB;
  ```
- [ ] Run locally: `supabase db reset` or equivalent — verify no errors
- [ ] No index needed (debug columns, not query-path)

### Task 12: Replace `worker/src/pulse/dag/confidence-gate.ts` body

- [ ] Change signature to `async` and accept `ctx: { config: WorkerConfig }` param (threading config from scheduler)
- [ ] Early return static behavior when `!ctx.config.FEATURE_CONFIDENCE_ROUTER`:
  ```ts
  if (!ctx.config.FEATURE_CONFIDENCE_ROUTER) {
    return {
      observed: node.confidence_floor ?? 1.0,
      source: 'static',
      routerVersion: null,
    }
  }
  ```
- [ ] When flag is on: `return confidenceRouter.score({ node, parentResults })`
- [ ] Keep exported function name `evaluateConfidence` so scheduler wiring from 4N-d is untouched

### Task 13: Update scheduler readiness transition

- [ ] Edit `worker/src/pulse/dag/scheduler.ts` where Task 74 from 4N-d called `evaluateConfidence`:
  - Thread `ctx.config` into the call
  - On `decision.failed` → UPDATE node to `status='failed'`, `error_message=decision.reason`, `confidence_observed=decision.observed`, `confidence_source='router'`, `confidence_router_version=decision.routerVersion`, `confidence_router_notes=decision.notes` (JSONB)
  - On success with `decision.upgradedTo` → also UPDATE `route_class=decision.upgradedTo` AND re-call `BudgetLedger.tryReserve(dagId, upgradedEstimate)`; if reservation fails → leave node `pending`, do NOT advance to `ready`
  - On success without upgrade → write confidence columns + advance to `ready`
- [ ] All updates in a single transaction per node

### Task 14: Integration test — `worker/src/pulse/dag/__tests__/confidence-router-integration.test.ts`

- [ ] Fixture: DAG with 3 leaf nodes, floors 0.65 / 0.85 / 0.99
- [ ] Feature flag ON: assert
  - Node 1 (floor 0.65) → stays on `fast`, `source='router'`, `observed >= 0.65`
  - Node 2 (floor 0.85) → upgrades to `strong`, `route_class` updated, `upgradedTo='strong'` in notes
  - Node 3 (floor 0.99) → fails with `reason='confidence_floor'`, `status='failed'`, notes populated
- [ ] Budget re-check: set cap such that upgrade would overflow → node 2 stays `pending`, never `ready`
- [ ] Feature flag OFF: all three nodes get `source='static'`, floors enforced per 4N-d behavior

### Task 15: Regression — confirm Phase 4N-d `confidence-gate.test.ts` still passes under flag OFF

- [ ] Run: `cd worker && npm run test -- --run worker/src/pulse/dag/__tests__/confidence-gate.test.ts`
- [ ] Should be green with no changes needed

---

## Chunk 4: Replay + rollout polish

### Task 16: Replay reproducibility test — `worker/src/pulse/dag/confidence-router/__tests__/replay-determinism.test.ts`

- [ ] Build DAG with 5 leaf nodes, mix of floors
- [ ] Run scheduler readiness pass with `FEATURE_CONFIDENCE_ROUTER=true` → record all `confidence_observed` + `confidence_router_version` values
- [ ] Fork the DAG via `DagReplay.fork` (from 4N-d)
- [ ] Run the forked DAG's readiness pass
- [ ] Assert: for every cloned node, `confidence_observed` matches original exactly (pure function property)

### Task 17: Version mismatch handling

- [ ] In `router.ts`, if caller passes an `expectedVersion` (optional) and it differs from `ROUTER_VERSION`:
  - Log `console.warn('[confidence-router] version drift on replay: expected=%s actual=%s', expected, ROUTER_VERSION)`
  - Still execute with current version
  - Add `driftFromVersion: expected` to notes
- [ ] Unit test: drift path records warning + note

### Task 18: Update CLAUDE.md

- [ ] Under `## Lucid Pulse — Distributed Agent Orchestration Engine`, add a subsection `### Confidence Router (Phase 5N)`:
  - 1-paragraph summary of what the router does
  - Feature flag name + default
  - Link to `docs/superpowers/specs/2026-04-07-nerve-confidence-router-design.md`
  - Pointer to `worker/src/pulse/dag/confidence-router/` module

### Task 19: Run full typecheck + worker test suite

- [ ] `cd worker && npm run typecheck` — must pass
- [ ] `cd worker && npm run test -- --run` — full suite must pass
- [ ] Watch for any P0/P1 regressions in 4N scheduler / budget tests

### Task 20: Run frontend typecheck (only if frontend touched — should be none for 5N)

- [ ] `npm run typecheck` — only if any `src/` file was edited; not expected for 5N

---

## Verification Checklist (Post-Phase)

1. `cd worker && npm run typecheck` ✔
2. `cd worker && npm run test -- --run` ✔ (full suite)
3. New columns visible via `supabase db inspect` on `orchestration_dag_nodes`
4. Feature flag toggle verified: flag off → static path; flag on → router path
5. Replay determinism test green
6. Router P99 overhead < 1ms measured via simple benchmark in integration test
7. Manual: flip `FEATURE_CONFIDENCE_ROUTER=true` on a staging worker, trigger a template DAG with mixed floors, verify notes populated in `confidence_router_notes`

---

## Rollout

- Default flag `false` on both staging and prod
- Enable on staging first for ~48h; watch `orchestration_dag_nodes` rows with `status='failed' AND error_message='confidence_floor'` metric
- If false-fail rate > 1% of DAG leaves → tune `BASE_SCORES` in git, bump `ROUTER_VERSION`, redeploy
- Promote to prod once false-fail rate is below target

Rollback: set `FEATURE_CONFIDENCE_ROUTER=false` on Railway → scheduler calls static path on next transition. In-flight nodes already evaluated by router keep their recorded values (they're historical rows, not re-evaluated).

---

## Out of Scope (Phase 6N+)

- Adaptive scoring (learned weights from telemetry)
- `confidence_source='self_report'` from agents
- LLM-based scoring for complex nodes
- Cost-aware tie-breaking between eligible routes
- Operator per-node force-upgrade mutation type
- Router scoring diff viewer in Mission Control UI
