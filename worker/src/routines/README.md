# Worker Routine Runtime

`worker/src/routines` executes Routine runs after Pulse admission. It is intentionally split from app/API code so shared, dedicated, and BYO workers can run the same target contract without depending on Next.js server modules.

Execution rules:

- `target-context.ts` builds engine/runtime-neutral prompts and receipt refs.
- `domain-adapters.ts` executes domain services directly when a Routine target has a canonical ledger: Work Graph, Agent Ops, Browser Procedure, Knowledge, Engine Home, plugin jobs, and PM sync.
- Assistant/team fallbacks still use the normal runtime execution path, but receipts remain Routine-shaped.
- `native-scheduler-contract.ts` gates native scheduler observation/import/delegation. Delegation is not allowed unless the runtime advertises ACK, reconcile, idempotency, and a writable delegate capability.
- Domain adapters must record bounded refs, sanitized evidence, and human-readable summaries. Raw provider logs, secrets, and engine-local private paths should not enter Routine receipts.

## Domain Adapter Ownership

Worker Routine adapters are thin bridges into existing domain services:

| Target | Worker behavior |
| --- | --- |
| Assistant | Use the normal worker runtime execution path and preserve TrustGate/model policy. |
| Team | Start through the existing Crew/Team lifecycle and store one parent routine receipt. |
| Work Graph | Write/update card or goal state through Work Graph helpers and attach artifact refs. |
| Agent Ops | Start Agent Ops workflows and link the Agent Ops run id. |
| Browser Procedure | Trigger Browser Operator procedure runs and link procedure/session/evidence refs. |
| Knowledge/Brain | Call existing refresh, Brain Ops, Think, import, and eval ledgers. |
| Engine Home | Call EHV/HHV/OHV snapshot, diff, export, import, and rollback-proposal services. |
| Plugin job | Reconcile managed pack/plugin jobs into canonical routine rows and refs. |
| PM sync | Call PM federation sync/reconcile services and link provider/work refs. |

Adapters should be boring: validate, call the domain service, summarize, and return refs. Complex domain logic belongs in the owning package.

## Native Scheduler Observe/Import

Native engine schedules are handled through the Engine Home routine adapter:

- observe mode normalizes runtime-provided schedules or bounded schedule manifest files and writes an `engine_home_diff_candidates` review candidate.
- import mode writes the same review candidate and materializes disabled `agent_scheduled_tasks` rows with `source_kind='import'`, `native_schedule_review=true`, and `delegation_allowed=false`.
- imported rows are idempotent on stable native schedule identity so repeated imports update candidates instead of duplicating routines.

This gives Hermes/OpenClaw local-first visibility without letting native schedulers silently become Lucid's source of truth. Delegated native execution is still gated by `native-scheduler-contract.ts`.

## Failure And Timeout Rules

- Timeouts must close the worker agent run with a bounded error, not leave it indefinitely running.
- Refused, blocked, stale, dead-letter, and local-policy-denied states are first-class receipt states.
- Dedicated/BYO errors must be sanitized before they reach operator UI; do not leak provider IDs, raw env vars, image names, machine paths, API keys, or cloud logs.
- Native scheduler delegation remains gated by `native-scheduler-contract.ts` until ACK/reconcile/idempotency/restart/offline tests pass for that adapter version.

When adding a target, update `contracts/routine.ts`, `src/lib/routines/registry.ts`, this worker package, tests, and docs together.
