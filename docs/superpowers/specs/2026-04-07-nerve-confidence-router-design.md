# Nerve Phase 5N — Confidence Router Design Spec — v1

**Status:** Draft v1 (awaiting approval)
**Author:** Kevin + Claude
**Date:** 2026-04-07
**Builds on:** Nerve Phase 4N (DAG Planner) — specifically the 4N-d confidence-gate hook
**Bridges to:** Future Phase 6N (Self-Report Confidence, Adaptive Floors)

---

## 1. Goal

Replace the static confidence-gate placeholder shipped in Phase 4N-d with a **dynamic Confidence Router** that, at the moment a DAG leaf becomes ready, estimates how likely the chosen model/route can actually meet the node's `confidence_floor`, writes that estimate as `confidence_observed` with `confidence_source='router'`, and either admits the node to execution, upgrades the route class (fast → strong → external), or fails the node with `reason='confidence_floor'`.

The router is the **single decision point** that turns `confidence_floor` from a declarative contract into an enforced runtime gate. It does not change the DAG shape, does not retry, and does not choose tools — it only decides: *which route, at what estimated confidence, should run this node right now?*

**Non-goals (explicit):**
- Not a model-quality benchmarking framework (uses existing route classes)
- Not a cost optimizer (that's the Cost Optimizer cron — router stays correctness-first)
- Not a self-learning system in v1 (static scoring tables only; adaptive scoring is 6N)
- Not a replacement for `model-router.ts` on the chat path (that's inference routing; this is DAG-step routing)
- Not LLM-based meta-reasoning (deterministic scoring only — replayable)

---

## 2. Design Decisions (Locked Candidates)

| Decision | Choice | Rationale |
|---|---|---|
| Scoring model | **Deterministic lookup table + capability flags** (no LLM call) | Replay-safe; no added latency; no API cost; diffable in git |
| Route classes | **Reuse existing `route_class`** column (`fast`, `strong`, `external`) already on `orchestration_dag_nodes` | Zero schema churn; router just picks among what the template/agent authored |
| Upgrade path | Router may only **upgrade** route class (fast → strong → external), never downgrade | Downgrade would bypass operator intent; upgrade is always safer |
| Confidence floor enforcement | **Hard gate**: if estimated < floor after upgrade attempts → mark node `failed` with `error_message='confidence_floor'` | Matches scheduler readiness rule from 4N-d; behavior is identical, only the *source* of `confidence_observed` changes |
| Determinism | **Pure function** of `(node.payload_fingerprint, node.route_class, node.step_type, router_table_version)` — no wall-clock, no random | Replay-deterministic; same fork → same decisions |
| Provenance | Write `confidence_source='router'` + new `confidence_router_version` column on node | Lets replay reproduce the exact router table used |
| Feature flag | `FEATURE_CONFIDENCE_ROUTER` (default `false`) | Ships as drop-in replacement for 4N-d static gate; flip per-org for rollout |
| Scope of v1 | **Read-only inputs** — router reads node + parent node results; writes only `confidence_observed`, `confidence_source`, `confidence_router_version`, and `route_class` (upgrade only) | Minimal surface; easy to reason about |

---

## 3. Data Model

No new tables. Two new columns on `orchestration_dag_nodes`:

```sql
ALTER TABLE orchestration_dag_nodes
  ADD COLUMN confidence_router_version TEXT,     -- e.g. 'v1-2026-04-07', for replay reproducibility
  ADD COLUMN confidence_router_notes JSONB;      -- optional: route upgrades applied, rule hits, for debugging
```

The existing 4N columns remain the contract surface:
- `confidence_floor NUMERIC(3,2)` — unchanged; set at template instantiation, immutable
- `confidence_observed NUMERIC(3,2)` — Phase 4N wrote `floor ?? 1.0` with `source='static'`; 5N writes router score with `source='router'`
- `confidence_source TEXT` — adds `'router'` as the dominant value in 5N-enabled orgs
- `route_class TEXT` — router may overwrite via upgrade

No migration required on existing rows — the two new columns are nullable and `confidence_router_notes` is debug-only.

---

## 4. Component Architecture

### 4.1 Replaced file: `worker/src/pulse/dag/confidence-gate.ts`

Phase 4N-d shipped a stub:
```ts
export function evaluateConfidence(node, parentResults) {
  return { observed: node.confidence_floor ?? 1.0, source: 'static' }
}
```

Phase 5N replaces the body with a router call behind a feature flag. File path stays the same so the scheduler wiring from 4N-d is untouched.

```ts
export async function evaluateConfidence(
  node: DagNode,
  parentResults: ParentResult[],
  ctx: { config: WorkerConfig }
): Promise<ConfidenceDecision> {
  if (!ctx.config.FEATURE_CONFIDENCE_ROUTER) {
    return { observed: node.confidence_floor ?? 1.0, source: 'static', routerVersion: null }
  }
  return confidenceRouter.score(node, parentResults)
}
```

### 4.2 New module: `worker/src/pulse/dag/confidence-router/`

```
worker/src/pulse/dag/confidence-router/
├── index.ts                  # Barrel — exports ConfidenceRouter + types
├── router.ts                 # ConfidenceRouter class: score(), upgradeIfNeeded()
├── scoring-table.ts          # Static lookup table (step_type × route_class → base confidence)
├── signals.ts                # Pure feature extractors from node + parent results
├── types.ts                  # ConfidenceDecision, RouterInput, RouterNote
├── version.ts                # ROUTER_VERSION constant (e.g. 'v1-2026-04-07')
└── __tests__/
    ├── router.test.ts
    ├── scoring-table.test.ts
    ├── signals.test.ts
    └── replay-determinism.test.ts
```

### 4.3 Scoring model (deterministic)

The router produces a score in `[0.0, 1.0]` from three components:

1. **Base score** — `scoring-table.ts` keyed by `(step_type, route_class)`. Hand-tuned starting floors, versioned in git:
   ```ts
   // v1-2026-04-07
   const BASE: Record<StepType, Record<RouteClass, number>> = {
     inbound:   { fast: 0.70, strong: 0.88, external: 0.95 },
     outbound:  { fast: 0.72, strong: 0.90, external: 0.95 },
     scheduled: { fast: 0.75, strong: 0.92, external: 0.97 },
     webhook:   { fast: 0.85, strong: 0.95, external: 0.98 },
     approval:  { fast: 1.00, strong: 1.00, external: 1.00 }, // approvals are human-gated
   }
   ```

2. **Signal adjustments** — pure functions in `signals.ts` that inspect node payload and parent results and return bounded deltas:
   - `hasLongInput(payload) → -0.05 on fast lane` (fast model struggles with big contexts)
   - `requiresToolCalls(payload) → -0.08 on fast lane`
   - `parentHadLowConfidence(parentResults) → -0.10` (uncertainty compounds)
   - `payloadHasStrictSchema(payload) → +0.03` (structured output is easier)
   - Each signal is a pure function `(input) => number` with a bounded range; all signals sum into the base score, clamped to `[0, 1]`.

3. **Upgrade loop** — if `score < confidence_floor` and current route is `fast`, retry scoring at `strong`. If still below and `external` is allowed by the template, retry at `external`. If still below after all upgrades → hard fail.

Pseudo-code:
```ts
function score(node, parents): ConfidenceDecision {
  const routes: RouteClass[] = ['fast', 'strong', 'external']
  const startIdx = routes.indexOf(node.route_class ?? 'fast')
  const notes: RouterNote[] = []

  for (let i = startIdx; i < routes.length; i++) {
    const route = routes[i]
    const base = BASE[node.step_type][route]
    const delta = applySignals(node, parents, route, notes)
    const observed = clamp(base + delta, 0, 1)
    notes.push({ route, base, delta, observed })

    if (node.confidence_floor == null || observed >= node.confidence_floor) {
      return {
        observed,
        source: 'router',
        routerVersion: ROUTER_VERSION,
        upgradedTo: route !== node.route_class ? route : null,
        notes,
      }
    }
  }

  // Exhausted upgrades → fail
  return {
    observed: notes[notes.length - 1].observed,
    source: 'router',
    routerVersion: ROUTER_VERSION,
    failed: true,
    reason: 'confidence_floor',
    notes,
  }
}
```

### 4.4 Scheduler integration (unchanged from 4N-d)

The scheduler's readiness rule already calls `evaluateConfidence` from 4N-d Task 74. 5N only changes the body of that function. Specifically:

1. Scheduler transitions node to `ready` candidate.
2. Calls `evaluateConfidence(node, parentResults, ctx)`.
3. If `decision.failed` → UPDATE node to `status='failed'`, `error_message='confidence_floor'`, write notes to `confidence_router_notes`.
4. Otherwise → UPDATE node with `confidence_observed`, `confidence_source`, `confidence_router_version`, and if upgraded, new `route_class`. Status advances to `ready`.

One subtle addition: when the router upgrades `route_class`, the scheduler must re-check the **budget reservation** because upgraded routes typically cost more. If the upgraded reservation fails, the node stays `pending` (same fallback as 4N-d budget gate). This is a one-line addition in the scheduler — no new budget logic.

### 4.5 Replay reproducibility

Because the router is a pure function of `(node, parentResults, ROUTER_VERSION)`:
- Replay clones the node with `confidence_router_version` set.
- Scheduler calls `evaluateConfidence` on the cloned node during replay.
- Router checks `ROUTER_VERSION === node.confidence_router_version`:
  - Match → rerun scoring → identical result.
  - Mismatch → log warning, use current version, still record both for audit.

This gives us a forward-compatible replay: DAGs recorded under v1 replay deterministically under v1, and replaying under v2 explicitly records the version drift in `confidence_router_notes`.

---

## 5. Feature Flag Rollout

- `FEATURE_CONFIDENCE_ROUTER=false` (default) → `evaluateConfidence` falls through to the 4N-d static behavior. No code path touches new router module. Zero risk.
- `FEATURE_CONFIDENCE_ROUTER=true` on a staging org → router active for that org's DAGs only (checked in `evaluateConfidence` via `ctx.config`).
- Per-org override: not required in v1 — flag is worker-wide. If needed, add `orchestration_dags.router_enabled BOOLEAN` later.

Rollback: set flag to `false` on Railway → next scheduler transition uses static behavior. No DB migration to revert. Existing rows with `confidence_source='router'` remain valid historical data.

---

## 6. Sub-Phase Slicing (Single Phase, 4 Chunks)

Phase 5N is small enough to ship in one go (~1 week). No sub-phases.

**Chunk 1 — Scoring primitives (2 days)**
- `scoring-table.ts`, `signals.ts`, `version.ts`, `types.ts`
- Unit tests for each signal (pure functions, easy to cover)
- Unit tests for scoring table bounds

**Chunk 2 — Router class + upgrade loop (1.5 days)**
- `router.ts` with `score()` method
- Upgrade loop tests (fast → strong → external → fail)
- Determinism test: same input twice → same output

**Chunk 3 — Wire into confidence-gate.ts + scheduler (1 day)**
- Replace `evaluateConfidence` body with flag-gated router call
- Migration: 2 new columns on `orchestration_dag_nodes`
- Scheduler update: honor upgrade, re-check budget, write router notes
- Integration test: end-to-end node eval with feature flag on

**Chunk 4 — Replay + rollout polish (1 day)**
- Replay reproducibility test (clone DAG, verify same router output)
- Version mismatch warning path
- CLAUDE.md update under "Lucid Pulse → Confidence Router"
- Full worker typecheck + test suite

**Total: ~5-6 working days** for one engineer.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Hand-tuned scoring table is wrong → too many false-fails | Start with floors chosen so floors rarely trip unless operator sets a high bar; monitor `failed + reason='confidence_floor'` metric; iterate table in git |
| Upgrades inflate cost without operator consent | `external` route only chosen if the template explicitly lists it as allowed (stored in payload); default upgrade ceiling is `strong` |
| Router logic drifts from replay behavior | `ROUTER_VERSION` constant + `confidence_router_version` column + replay test |
| Feature flag on/off produces different DAG outcomes mid-run | Decision is locked at the moment of `ready` transition and persisted on the row; flipping the flag mid-run doesn't affect already-decided nodes |
| Budget re-check on upgrade is missed | Integration test: fast→strong upgrade with budget at cap → node stays pending, not ready |
| Router becomes a hidden bottleneck | Pure in-process function, no IO, no API calls — sub-millisecond latency, strictly bounded |
| Signals grow into a dumping ground | Cap at 10 signals in v1; anything more requires promotion to its own review |

---

## 8. Out of Scope (Phase 6N+)

- **Adaptive scoring**: learning signal weights from past run outcomes (requires telemetry pipeline and offline training loop)
- **Self-reported confidence**: agent returns a confidence score from its own reasoning — written as `confidence_source='self_report'`
- **LLM-based router**: calling a small model to score complex nodes (breaks determinism unless temperature=0 and we cache by fingerprint)
- **Cost-aware routing**: preferring cheaper routes when multiple meet the floor (Cost Optimizer owns this)
- **Per-node confidence overrides from operators**: operator force-upgrades a specific node — add via dedicated mutation type in 6N, not generic router

---

## 9. Verification Strategy

- **Unit**: scoring table bounds, each signal's output range, clamping, upgrade loop traversal, version mismatch handling
- **Integration**: scheduler call path with flag on → router writes `confidence_observed`, upgrades route, re-checks budget, writes notes; flag off → falls through to static
- **Replay**: fork DAG at mid-node → replay runs router at same ROUTER_VERSION → identical decisions
- **Regression**: Phase 4N-d existing tests (confidence-gate.test.ts) must still pass under `FEATURE_CONFIDENCE_ROUTER=false`
- **Stress**: 10k scheduler readiness transitions per second with router on — assert P99 latency delta vs. static is < 1ms

Target: ~25-35 new tests for Phase 5N.

---

## 10. Approval Gate

Once approved:
1. Invoke `writing-plans` skill to produce `docs/superpowers/plans/2026-04-07-nerve-confidence-router-plan.md`
2. Plan will break the 4 chunks into 2-5 minute tasks with checkboxes
3. Implementation begins after Phase 4N-d ships (4N-d shipped the hook file `confidence-gate.ts` which 5N replaces; without 4N-d there is nothing to wire into)
