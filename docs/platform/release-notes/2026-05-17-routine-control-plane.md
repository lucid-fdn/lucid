# 2026-05-17 Routine Control Plane Release Notes

## Scope

This release turns Lucid's older scheduled-task/cron surface into the Routine Kernel: a centralized, engine/runtime-agnostic automation layer for recurring, one-shot, manual, webhook, event, plugin, PM sync, runtime-triggered, assistant, team, Work Graph, Browser, Knowledge, and Engine Home work.

Release tag: `routine-control-plane-2026-05-17`.

## What Shipped

- Canonical Routine API under `/api/routines/**`.
- First-party task clients cut over to `/api/routines/**`; the older `/api/mission-control/tasks/**` route family is retired from the app bundle.
- The older workflow scheduler stack is removed: `/api/workflows/[id]/schedules/**`, `workflow_schedules`, workflow schedule server actions, and `src/components/workflow/schedules/*` no longer exist as product scheduler paths.
- Mission Control Routines create UX includes presets for Work Graph standups, team weekly review, Browser procedure health, Engine Home snapshots, and PM federation sync; presets fill Routine fields and keep the same central receipt path.
- Routine contract in `contracts/routine.ts` for triggers, targets, policy, runtime selectors, native scheduler facets, simulation, and run status.
- App-side Routine service in `src/lib/routines/*`.
- Worker-side Routine execution adapters in `worker/src/routines/*`.
- Mission Control Routines index and detail pages.
- Routine Detail tabs for runs, evidence, adapter refs, policy/runtime data, history, drift, and team dispatch.
- Run-now, pause, restore, cancel, create, edit, simulate, empty, loading, error, blocked/refused, stale, and dead-letter state coverage.
- `agent_scheduled_task_runs` as the cross-domain run receipt ledger.
- Domain adapters for Work Graph, Agent Ops, Browser Procedure, Knowledge/Brain, EHV/HHV/OHV, plugin jobs, and PM sync.
- Team routines through the existing Crew/Team lifecycle rather than a separate team scheduler.
- Native Hermes/OpenClaw scheduler observe/import/delegation contract gates.
- Native scheduler observe/import now has an implemented review path: runtime schedules become EHV review candidates and disabled Routine candidates; they do not execute until an operator enables a central Routine.
- Runtime/engine-neutral capability handling for shared, dedicated, and BYO/local paths.
- `lucid-runtime run` is now the first-party BYO/local bridge entrypoint for Hermes and OpenClaw. It reports capability identity/services/EHV policy, runs one-shot or daemon bridge sessions, executes management commands delivered on heartbeat, and ACKs command outcomes back to Mission Control.
- Sanitized Routine Detail/operator errors so provider IDs, env vars, raw logs, and machine paths do not leak.
- Run-now wake correctness fix: due-task scanning no longer depends on stale `next_wake_at`.
- Worker timeout closure: timed-out assistant runs now close with a bounded error instead of remaining indefinitely running.
- GitHub Actions were moved to Node 24-compatible action/runtime pins, with a Routine drift gate preventing Node 18/20-era scheduler CI from returning.

## Architecture Rules

Routine is the product/control-plane model. Pulse is the queue/admission model. `worker/src/cron` is platform maintenance only.

Do not add new product schedulers for Agent Ops, Browser, Knowledge, EHV, plugin jobs, PM sync, Hermes, OpenClaw, teams, or Work Graph. Add a Routine target adapter and link to the owning domain ledger instead.

Domain services remain authoritative:

- Work Graph owns goals, cards, dependencies, kanban, and PM authority.
- Agent Ops owns workflow runs, findings, evidence, and Team Ops dispatch.
- Browser Operator owns browser procedures, sessions, replay, screenshots, and Trust Shield events.
- Knowledge/Brain owns source refresh, claim governance, Think, memory quality, and Brain Ops findings.
- EHV/HHV/OHV owns engine-home snapshots, diffs, exports, imports, and rollback candidates.
- TrustGate owns model routing, BYOK/Lucid-managed mode, keys, cost policy, and audit.

Routine receipts store bounded refs and sanitized summaries only.

## Production Verification

Final local verification for the milestone included:

- `npm run typecheck`
- `npm --prefix worker run typecheck`
- focused app Routine/API tests
- focused worker Pulse/Routine/domain-adapter/native-scheduler tests
- run-now wake scanner tests
- worker run timeout tests

Production smoke covered:

- Hermes dedicated routine run succeeded with a Routine receipt.
- OpenClaw dedicated routine run succeeded with a Routine receipt.
- Hermes and OpenClaw runtime command ACKs applied for adapter probes.
- Local BYO CLI smoke covered `lucid-runtime run --smoke` wiring and management command ACK handling for Hermes and OpenClaw.
- Authenticated production Runtime Detail click-through was verified for BYO Hermes and BYO OpenClaw rows. Capability heartbeat, services, parser status, EHV policy, command history, logs fallback, and UI-queued command ACKs rendered correctly.
- The local Hermes CLI executable is present and callable; a full Hermes model turn currently fails at provider connectivity (`Connection error`) rather than at Lucid executable discovery. The repo-bundled OpenClaw CLI path is available through `packages/openclaw-core/openclaw.mjs` and through `lucid-runtime run --engine openclaw` in a LucidMerged checkout.
- Mission Control Runtime Detail remained sanitized.
- Mission Control Routine Detail showed sanitized failures after deployment.

## Operator QA Checklist

For future releases, click through:

- Mission Control -> Routines index
- create routine
- simulate draft
- edit trigger, target, policy, timezone, retry, catch-up, concurrency, and runtime selector
- run now
- pause and restore
- revision restore and stale-conflict state
- Routine Detail tabs: runs, evidence, adapter, policy, history, drift, team dispatch
- failed routine with sanitized error
- Runtime Detail command ACKs and capability status
- Hermes and OpenClaw managed runtimes
- BYO/local heartbeat, command ACK/refuse, and reconnect state when a local bridge is running

## Follow-Ups

- Keep `/api/routines/**` as the only first-party product API for scheduled work; do not reintroduce `/api/mission-control/tasks/**` or domain-specific scheduler route families.
- Keep workflow automation on Routine targets. Do not reintroduce `workflow_schedules` or a workflow-local schedule UI/API.
- Promote native Hermes/OpenClaw scheduler execution only after the adapter version proves ACK, idempotency, reconnect reconciliation, restart recovery, and sanitized evidence.
- Expand live BYO/local matrix whenever provider credentials/network allow real Hermes/OpenClaw model turns from the local bridge environment.
- Keep static drift gates active so new scheduler tables, route families, or feature-specific loops cannot bypass the Routine Kernel.
