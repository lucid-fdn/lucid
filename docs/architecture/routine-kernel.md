# Routine Kernel Architecture

The Routine Kernel is Lucid's canonical product/control-plane layer for recurring, one-shot, manual, webhook, event, plugin, PM-sync, runtime-triggered, and operator-promoted work.

It replaces "cron as a product concept" with a small, composable Routine contract:

```text
Routine definition
  -> trigger validation and simulation
  -> policy and runtime eligibility
  -> target adapter
  -> Pulse admission
  -> worker execution
  -> run receipt with domain refs
```

## Boundary

Routines own intent, trigger, target, policy, runtime selector, simulation, run-now, pause/restore, and operator-visible receipts.

Routines do not own domain internals:

- Work Graph owns goals, cards, kanban, dependencies, and PM authority.
- Agent Ops owns workflow runs, Team Ops dispatch, evidence, and findings.
- Browser Operator owns procedures, sessions, replay, screenshots, and Trust Shield evidence.
- Knowledge/Brain owns source refresh, claim governance, Think, memory quality, and Brain Ops findings.
- EHV/HHV/OHV owns engine-home snapshots, diffs, exports, imports, and rollback candidates.
- TrustGate owns model routing, BYOK/Lucid-managed inference mode, keys, cost policy, and audit.
- Pulse owns admission, leases, retries, backpressure, and worker wakeups.
- `worker/src/cron` owns platform maintenance loops only.

Routine receipts link to those ledgers with bounded refs and sanitized summaries. They do not copy raw provider logs, secrets, webhook URLs, local file paths, or engine-private payloads.

## Code Map

| Layer | Files |
| --- | --- |
| Shared contract | `contracts/routine.ts` |
| App service/kernel | `src/lib/routines/*` |
| Canonical API | `src/app/api/routines/**` |
| UI components | `src/components/routines/*` |
| Mission Control pages | `src/app/(app)/[workspace-slug]/mission-control/routines/**` |
| Worker target adapters | `worker/src/routines/*` |
| Pulse admission | `worker/src/pulse/enqueue/scheduled.ts`, `worker/src/pulse/workers/scheduled-worker.ts` |
| Legacy processor boundary | `worker/src/processors/scheduled.ts` |
| Platform cron only | `worker/src/cron/*` |

Retired product scheduler surfaces:

- `/api/mission-control/tasks/**`
- `/api/workflows/[id]/schedules/**`
- `workflow_schedules`
- `src/components/workflow/schedules/*`
- workflow schedule server actions in `src/lib/forms/actions.ts`

Do not reintroduce them. If a workflow, pack, template, PM sync, Browser procedure, Knowledge job, Engine Home job, assistant, team, or runtime needs automation, model it as a Routine target and store domain evidence in the owning ledger.

## Storage

`agent_scheduled_tasks` remains the canonical definition table. The Routine Kernel extends it with target, trigger, policy, runtime selector, Work Graph, managed-resource, and source metadata.

`agent_scheduled_task_versions` stores immutable definition snapshots with stable hashes and actor provenance. Snapshots exclude counters, timestamps, secrets, provider logs, raw webhook URLs, and evidence blobs.

`agent_scheduled_task_runs` is the cross-domain receipt ledger. It stores status, timing, runtime/engine/flavor, summary, sanitized error, and bounded refs such as `work_graph_refs`, `browser_refs`, `knowledge_refs`, `engine_home_refs`, `team_refs`, `trustgate_refs`, and `mutation_refs`.

## Runtime And Engine Neutrality

Shared, dedicated, and BYO/local runtimes consume the same Routine definition and receipt contract.

Hermes, OpenClaw, and future engines expose optional behavior through capabilities and facets:

- `scheduled.run`
- `scheduled.ack`
- `scheduled.local_queue`
- `scheduled.native_scheduler.observe`
- `scheduled.native_scheduler.import`
- `scheduled.native_scheduler.delegate`
- `work_graph.update`
- `browser.procedure.run`
- `knowledge.source.refresh`
- `engine_home.snapshot`
- `engine_home.diff`
- `engine_home.export`
- `engine_home.rollback`
- `trustgate.inference.route`

Product code should branch on capabilities and policy, not engine names. Engine-specific logic belongs in adapter packages and worker runtime adapters.

Native Hermes/OpenClaw scheduler execution is allowed only when the adapter proves ACK, refusal, idempotency, reconnect reconciliation, durable status reporting, and sanitized evidence. Until then, native jobs can be observed, imported, reviewed, and represented as facets while Lucid-managed routines remain centrally scheduled.

## Production Milestone

The `routine-control-plane-2026-05-17` milestone shipped:

- canonical `/api/routines/**`
- first-party API cleanup: `/api/mission-control/tasks/**` retired; new code must use `/api/routines/**`
- workflow schedule cleanup: direct `workflow_schedules` routes, server actions, and UI components retired; Routine Kernel is now the only product scheduler path
- Routine index and detail views
- Routine create UX presets for Work Graph standups, team weekly review, Browser procedure health, Engine Home snapshots, and PM federation sync
- Routine presets now include native schedule import as an Engine Home review flow, not a direct delegation switch
- run-now wake correctness fix
- worker timeout closure for timed-out assistant runs
- sanitized Routine Detail/operator errors
- domain target adapters for Work Graph, Agent Ops, Browser Procedure, Knowledge/Brain, EHV, plugin jobs, and PM sync
- native scheduler observe/import: runtime schedules normalize into EHV review candidates and disabled Routine candidates; native execution delegation remains gated
- Routine drift gates covering scheduler bypasses, hardcoded engine/runtime assumptions, and Node 20-era GitHub Action pins
- live Hermes and OpenClaw routine smoke with successful run receipts and runtime command ACKs

## Add A New Routine Target

1. Add or extend the target type in `contracts/routine.ts`.
2. Register metadata in `src/lib/routines/registry.ts`.
3. Validate and simulate through `src/lib/routines/service.ts`.
4. Execute in `worker/src/routines/domain-adapters.ts` or a small adapter module it calls.
5. Store domain source-of-truth data in the owning domain service.
6. Return only bounded refs and sanitized summary data to `agent_scheduled_task_runs`.
7. Add unit/integration tests and update the public/internal docs.

Do not create a new scheduler table, route family, queue, or background loop for a product routine.
