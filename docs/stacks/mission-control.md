# Mission Control Stack

**Status:** Active
**Stack ID:** `mission_control`

Mission Control is the operator cockpit. It lets users and admins supervise agents, teams, runtime health, approvals, economics, remediation, proofs, replay, and system state.

Mission Control should be thought of as the control surface over AgentOps, Trust, Runtime, Teams, Workflows, and Agent Commerce.

The workspace Mission Control surface now includes two cross-stack operator views:

- **Needs Human** at `/{workspace}/mission-control/inbox`, a unified queue for blocked Agent Ops runs, Knowledge maintenance, Browser Operator alerts, Commerce exceptions, template drift, and unresolved system notices.
- **Lucid Doctor** at `/{workspace}/mission-control/doctor`, a deduped readiness report across Knowledge, Agent Ops, Browser Operator, Commerce, Templates, runtimes, channels, and L2. It consumes existing stack ledgers instead of creating a parallel diagnostics database.

## Owns

- Operator UX and navigation.
- Approval resolution flows.
- Runtime/agent supervision actions.
- Operational status pages and proof views. Public status pages live under `/status/[workspace-slug]/[agent-slug]` so workspace app routes such as `/[workspace-slug]/templates` remain unambiguous.
- Remediation and nudge workflows.
- Project-scoped operational dashboards.

## Does Not Own

- Runtime execution loops.
- Provider SDK calls.
- Raw telemetry contracts.
- Commerce ledger state.

## Current Surfaces

- `src/app/(app)/[workspace-slug]/mission-control/`: legacy-compatible Mission Control UI.
- `src/app/api/mission-control/`: Mission Control API route family.
- `src/lib/mission-control/`: Mission Control types, policies, remediation, health, cost, approval utilities.
- `src/lib/doctor/lucid-doctor.ts`: shared readiness aggregation over existing stack signals.
- `src/lib/mission-control/needs-human.ts`: shared human-action inbox aggregation over existing stack ledgers.
- `supabase/migrations/20260321200000_mission_control_phase1.sql` and related migrations.
- Project-scoped routes in `src/app/(app)/[workspace-slug]/projects/[project-slug]/`.

## Route Contract

New operational UI should target project routes first:

- `/{workspace}/projects/{project}`
- `/{workspace}/projects/{project}/inbox`
- `/{workspace}/projects/{project}/agents`
- `/{workspace}/projects/{project}/teams`
- `/{workspace}/projects/{project}/work`
- `/{workspace}/projects/{project}/runs`

Legacy `/{workspace}/mission-control/*` routes remain compatibility adapters until a deliberate migration is planned.

## Integration Rules

- Mission Control renders AgentOps truth.
- Mission Control resolves Trust approval decisions.
- Mission Control can pause/resume agents, teams, apps, workflows, and Commerce rails through stack APIs.
- Mission Control must not call provider SDKs.
- Mission Control should not invent stack-specific state machines in UI components.
- Mission Control diagnostics must aggregate existing source-of-truth ledgers. Do not create a second Browser alert table, Commerce exception table, Knowledge finding table, or Agent Ops run-state table for Doctor/Inbox views.

## Agent Commerce Responsibilities

Mission Control should provide:

- spend request detail view,
- approval resolution,
- provider health and emergency disable,
- ledger/reconciliation event timeline,
- policy editor surfaces,
- proof and receipt explorer.

## Backlog Direction

- Add Commerce approval surfaces into project Inbox/Work before creating another isolated page family.
- Unify AgentOps traces and Commerce spend events under shared trace IDs.
- Keep Mission Control route migration separate from Agent Commerce launch.
