# Routines

Agents and teams use Routines to run at specific times, on recurring intervals, from manual run-now, from PM/webhook/event triggers, or through runtime-managed facets. This enables autonomous operation: agents do not just respond to messages, they can proactively execute governed work with receipts.

## Architecture Direction

Lucid scheduled work must remain one shared, engine/runtime-agnostic system. The canonical implementation path is tracked in [Lucid Cron, Routines, And Task Automation](../../plans/2026-05-15-lucid-cron-routines-task-automation-plan.md).

Routines are the product/control-plane pillar for recurring, one-shot, manual, webhook, event, plugin, PM sync, and runtime-triggered work. Cron is only one trigger type. Pulse remains the queue/admission layer underneath Routines; Routines decide what should run, why it should run, which policies apply, which target owns execution, and how the result appears to operators.

Current production milestone: `routine-control-plane-2026-05-17`.

That milestone shipped the canonical `/api/routines/**` API, Mission Control Routines index/detail, run-now, pause/restore/cancel, schedule simulation, immutable revision history, run receipts, Work Graph/Agent Ops/Browser/Knowledge/EHV/plugin/PM target adapters, native scheduler capability gates, sanitized operator errors, and live Hermes/OpenClaw routine smoke coverage.

Key rules:

- `agent_scheduled_tasks` remains the source of truth for routines; Agent Ops, Work Graph, plugins, Hermes, OpenClaw, shared, dedicated, and BYO/local runtimes must not create parallel schedulers.
- Pulse is the scalable queue/admission layer for due work.
- Worker platform cron jobs in `worker/src/cron/definitions.ts` remain system-maintenance loops. Do not duplicate Knowledge refresh, Brain Ops, Daily Intel, runtime reconcile, PM sync reconcile, Browser QA retention, or cost/compliance maintenance as user routines; link or trigger those services through routine receipts only when product flows need it.
- Work Graph is the product layer for project-visible routine output, goals, kanban cards, evidence, and run receipts.
- Team routines are first-class: a routine can target one assistant, a whole team, a coordinator plus specialists, or a Work Graph card/goal maintained by a team. Team routines must reuse the canonical Team/Crew contract, topology, crew run lifecycle, Team Policy, specialist telemetry, runtime selector, and Agent Ops Team Ops dispatch, not create a second team dispatcher.
- Agent Ops, Browser Operator, Lucid Knowledge/Brain, EHV/HHV/OHV, TrustGate/BYOK, Commerce evidence, and managed packs integrate through the same routine contract.
- Hermes/OpenClaw native scheduler features are represented as runtime capabilities/facets. Product UI must stay capability-driven, not engine-hardcoded.
- BYO/local runtimes may keep a bounded local queue for offline resilience, but they must ACK/refuse/reconcile against Lucid's central routine state.

Target code organization:

- shared contracts: `contracts/routine.ts`
- canonical API: `/api/routines/**`
- app kernel/services: `src/lib/routines/*`
- worker kernel/adapters: `worker/src/routines/*`
- reusable UI: `src/components/routines/*`
- retired compatibility API: `/api/mission-control/tasks/**` must not be reintroduced for first-party clients

Implemented Routine Kernel surface:

- `contracts/routine.ts` defines target, trigger, policy, runtime selector, native scheduler delegation, simulation, and run status vocabulary.
- `/api/routines` lists and creates routines.
- `/api/routines/simulate` validates target/trigger/policy shape and previews next fire time/capability needs.
- `/api/routines/[routineId]` updates, toggles, and cancels routines.
- `/api/routines/[routineId]/run-now` queues a routine for immediate execution through the same central state.
- `/api/routines/[routineId]/runs` exposes the cross-domain run receipt ledger.
- `/api/routines/[routineId]/versions/**` exposes the existing scheduled-task revision/restore workflow under the canonical Routine API.
- `/api/routines/[routineId]/drift` exposes bounded drift checks for pack-managed or imported routines.
- Mission Control has a canonical Routines index at `/{workspace}/mission-control/routines` with filters, simulation, run-now, pause, cancel, and empty/error/loading states.
- Mission Control has a Routine Detail view at `/{workspace}/mission-control/routines/{routineId}` with run receipts, policy, revision restore, and drift checks.
- `use-scheduled-tasks` now calls `/api/routines/**` while keeping the legacy task-panel shape stable for existing agent detail and builder surfaces.
- `/api/mission-control/tasks` has been retired from first-party code. Agent detail, Agent/Team Builder, templates, packs, and tool clients should use Routine services or `/api/routines/**`.
- `/api/workflows/[id]/schedules/**`, `workflow_schedules`, workflow schedule server actions, and `src/components/workflow/schedules/*` have been removed. Workflow automation now goes through Routine targets such as Agent Ops, Browser Procedure, Work Graph, or plugin jobs.
- Mission Control Routines includes presets for Work Graph standups, team weekly review, Browser procedure health, Engine Home snapshots, and PM federation sync. Presets only fill Routine fields; they do not create a second scheduler.
- `worker/src/routines/*` records Routine receipts and starts Team/Crew routines through the existing Crew run lifecycle instead of inventing a second team dispatcher.
- `agent_scheduled_task_runs` is the Routine receipt ledger. It stores cross-domain refs and sanitized evidence only; Agent Ops, Browser Operator, Knowledge, Work Graph, EHV, and Team/Crew keep their own source ledgers.
- `src/lib/routines/registry.ts` now owns explicit target adapter metadata for assistants, teams, Work Graph, Agent Ops, Browser procedures, Knowledge, Engine Home, plugin jobs, and PM sync: validation, execution-assistant requirements, capability requirements, operator notes, and fanout estimates.
- `worker/src/routines/target-context.ts` builds domain-aware execution context and receipt refs for non-assistant targets so scheduled Work Graph, Browser, Knowledge, Engine Home, plugin, PM sync, and Agent Ops routines no longer degrade into opaque assistant prompts.
- `worker/src/routines/domain-adapters.ts` executes real domain-service adapters for Work Graph, Agent Ops, Browser Procedure, Knowledge source refresh/Brain Ops/Think/import/eval ledgers, Engine Home snapshot/diff/export/import/rollback proposal, managed plugin resource checks, and PM sync reconciliation. It writes only bounded refs/summaries to Routine receipts.
- `worker/src/routines/native-scheduler-contract.ts` defines the ACK/reconcile/idempotency gate for native engine scheduler observation, import, and experimental delegation.
- `src/lib/routines/README.md` and `worker/src/routines/README.md` document Routine as a first-class architecture pillar and the expected code ownership boundaries.
- Routine Detail includes Evidence and Adapter tabs so operators can inspect Work Graph, Browser, Agent Ops, Knowledge, Engine Home, TrustGate, dispatch, and sanitized-evidence refs without exposing raw provider logs or secrets.

Implementation quality bar:

- keep the Routine Kernel small: validate, simulate, execute, summarize, receipt
- keep domain logic in domain services such as Agent Ops, Crew, Browser Operator, Knowledge, EHV, PM federation, and Commerce
- use typed registries and small target/trigger adapters, not a custom workflow framework
- use server-side filtering, cursor pagination, partial indexes, idempotent run inserts, and compact health summaries for Routine index/detail performance
- delete temporary compatibility wrappers after parity; do not keep a legacy scheduler fallback

Clean cutover rule:

- current Agent/Team Builder `default_schedules`, `cron_schedule` tools, `use-scheduled-tasks`, `AgentTasksPanel`, version restore, one-shot `run_at`, recurring `cron_expression`, channel delivery, webhook delivery, and worker execution must keep working through Routine services.
- compatibility-shaped components are allowed only when they call `/api/routines/**` or `src/lib/routines/*`; old scattered scheduler APIs and domain-specific scheduler tables should be deleted rather than preserved as fallbacks.
- native Hermes/OpenClaw scheduler delegation is implemented as a capability-gated experimental path first. It becomes default-eligible only after ACK/reconcile/idempotency/restart/offline/EHV-diff contract tests pass for that adapter/runtime version.

## How Scheduled Tasks Work

An agent can create scheduled tasks during any conversation. The agent uses the built-in scheduling tools to:

1. **Create a task** with a prompt, schedule, and optional recurrence
2. The task is stored in the database with an outbox pattern
3. The worker picks up tasks at their scheduled time
4. The agent runs with the task prompt as its input
5. Results are logged and the task is marked complete (or rescheduled for recurring tasks)

## Types of Schedules

### One-Shot Tasks

Run once at a specific time:
- "Check the ETH price at 9 AM tomorrow and send me an alert if it's below $3000"
- "Generate a weekly report next Monday at 8 AM"

### Recurring Tasks (Cron)

Run on a repeating schedule using cron expressions:
- "Check portfolio balance every hour"
- "Send a daily market summary at 7 AM UTC"
- "Monitor competitor pricing every 15 minutes"

## Managing Routines

Agents can manage their own routines using built-in tools. The tool names are retained for model compatibility, but they write to the Routine Kernel:

| Tool | Purpose |
|------|---------|
| `cron_schedule` | Create a new one-shot or recurring routine |
| `cron_list` | View active routines for the agent |
| `cron_cancel` | Cancel a routine |

You can also view and manage agent routines in the agent detail page's **Routines** tab.

For the full product surface, use **Mission Control -> Routines**. The agent detail Routines tab is a compact compatibility-shaped UI over the same Routine Kernel and calls `/api/routines/**`.

## Native Engine Schedules

Hermes/OpenClaw local schedules are supported as reviewed facets:

- **Observe** reads sanitized native schedule metadata into Engine Home review evidence.
- **Import** creates disabled Routine candidates so an operator can review, simulate, edit, and enable them in Lucid.
- **Delegate execution** stays off by default until the runtime proves ACK, refusal, idempotency, reconnect reconciliation, restart recovery, and sanitized receipts.

This keeps Lucid's control plane central while preserving engine-native value and BYO/local visibility.

## Webhook Delivery

Scheduled tasks can optionally POST their output to an external URL on completion. Add a `webhook_url` when creating a task:

- **HTTPS required** — HTTP URLs are rejected for security
- **Fire-and-forget** — The webhook is delivered with a 10-second timeout; failures are logged but don't affect task completion
- **Payload**: `{ task_id, task_name, assistant_id, output, run_count, completed_at }`

This enables integrations like posting summaries to Slack, triggering downstream workflows, or notifying external monitoring systems.

## Task Reliability

- **At-least-once delivery** — Tasks use a claim-based outbox pattern. If a worker crashes mid-task, another worker picks it up.
- **Dead-letter queue** — Tasks that fail repeatedly are moved to a dead-letter state after maximum retries.
- **Retry with backoff** — Failed tasks are retried with exponential backoff.

## Use Cases

- **Monitoring** — Periodic checks on prices, portfolios, system health
- **Reporting** — Automated daily/weekly summaries
- **Alerts** — Threshold-based notifications
- **Maintenance** — Routine cleanup or data processing tasks
- **Content** — Scheduled social media posts or newsletter drafts
