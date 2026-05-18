# Routine Kernel

`src/lib/routines` is the product/control-plane side of Lucid Routines. It is the canonical automation layer for scheduled, one-shot, webhook, event, PM-sync, assistant, team, Work Graph, Browser, Knowledge, Engine Home, and plugin jobs.

The app-side kernel owns validation, simulation, service orchestration, snapshots, run-now, pause/restore/cancel, and API response shaping. It does not execute domain work directly; worker-side adapters execute and return receipts.

Keep this package engine and runtime agnostic:

- Store product definitions in `agent_scheduled_tasks` through the Routine contract in `contracts/routine.ts`.
- Add new targets in `registry.ts` first, then implement worker execution in `worker/src/routines`.
- Keep `/api/routines/**` as the canonical API. Do not add product behavior under `/api/mission-control/tasks/**`; first-party UI, templates, packs, and tools should call Routine services or `/api/routines/**`.
- Treat native engine schedulers as facets: observe, import, and review first. Execution delegation requires ACK, reconcile, idempotency, and receipt proof.
- Put provider-specific behavior behind adapters. UI and API code should talk in Routine, Work Graph, EHV, Knowledge, Browser, PM, and TrustGate terms.

## Files

| File | Purpose |
| --- | --- |
| `types.ts` | App-facing Routine DTOs and row normalization helpers. |
| `registry.ts` | Target metadata, capability requirements, operator notes, and target summaries. |
| `service.ts` | Canonical create/list/update/cancel/run-now/simulate/read-runs service. |
| `drift.ts` | Bounded drift checks for pack-managed/imported routines. |

## API Ownership

`/api/routines/**` is canonical. The old Mission Control task API and workflow schedule API have been retired for first-party code; compatibility-shaped UI hooks such as `use-scheduled-tasks` must still read and write through `/api/routines/**`.

`use-scheduled-tasks` can keep its compatibility shape while reading/writing through Routine services. New UI should prefer `use-routines` and `src/components/routines/*`.

Routine presets live in `src/components/routines/routine-presets.ts`. Presets are UI affordances only: they set target, trigger, policy, prompt, and config defaults, then create normal Routine definitions through `src/lib/routines/service.ts`.

## Native Engine Schedules

Hermes, OpenClaw, and future runtimes may expose their own local schedules. Lucid treats those schedules as runtime facets, not as a second scheduler:

- `native_scheduler.observe` reads sanitized schedule metadata and stores an Engine Home review candidate.
- `native_scheduler.import` creates disabled Routine candidates through the Engine Home adapter so operators can review, simulate, edit, and explicitly enable them.
- execution delegation remains disabled until the runtime proves ACK, refusal, idempotency, restart/reconnect reconciliation, and sanitized receipt evidence.

Imported native schedules must not bypass `/api/routines/**`, `agent_scheduled_tasks`, Pulse, TrustGate, Work Graph, EHV review, or Routine receipts.

## Receipt Rules

Routine runs write to `agent_scheduled_task_runs`. Put only bounded, human-readable refs in receipt JSON:

- Work Graph refs
- Agent Ops refs
- Browser Procedure refs
- Knowledge/Brain refs
- EHV/HHV/OHV refs
- PM/plugin refs
- TrustGate routing refs
- runtime command refs

Never store plaintext secrets, encrypted key material, raw provider logs, raw webhook URLs, engine-home file paths, or local-machine private paths in Routine receipts.

Do not create new product scheduler tables or route families for individual domains. Domain-specific evidence belongs in the domain ledger and is referenced from Routine receipts.

## Drift Gates

`npm run routine:drift` is the fast anti-sprawl gate. It blocks new product scheduler routes/tables outside Routine Kernel ownership, hardcoded engine/runtime routine branches outside adapters, and Node 20-era GitHub Action pins. `npm run routine:smoke` runs the focused Routine app and worker adapter tests.
