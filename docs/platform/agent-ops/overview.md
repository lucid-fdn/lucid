# Agent Ops Overview

Agent Ops is Lucid's workflow layer for operating agents and teams.

It gives users clear verbs:

- investigate an issue
- plan a change
- review work
- check a page
- research a website
- extract structured data
- monitor a page
- QA a release candidate
- ship a change
- canary a deployment
- run a retro
- audit security posture

Under the hood, Agent Ops uses Lucid's existing projects, agents, teams, runtimes, templates, Mission Control, memory, notifications, and channel surfaces. It is not a separate agent engine.

## What Agent Ops Produces

Every Agent Ops run is designed to produce operator-readable output:

- summary
- findings
- evidence
- risks
- next actions
- provenance
- runtime compatibility
- team dispatch state
- channel launch/report status when launched from a channel

This keeps workflows easy to understand while preserving the operational proof needed for audits, debugging, and replay.

## Workflow Families

Agent Ops is organized around clear workflow families rather than internal runtime terms:

- investigation and office-hours answers
- planning and executive/product plan review
- code, security, design, docs, and release review
- page checks, website research, structured extraction, monitoring, and Browser QA
- ship, canary, retro, release checklist, and model benchmark workflows
- team bootstrap and specialist review workflows

Some workflows run as one focused agent run. Others compile into Lucid's existing orchestration layer when multiple steps, approvals, or specialists are needed.

## Mission Control

Mission Control is the main operator surface for Agent Ops.

It shows:

- run detail
- workflow and run status
- Team Ops dispatch tier
- selected specialists
- runtime compatibility and blocked-runtime reasons
- channel launch/report status
- findings filters
- Browser Operator evidence
- eval history and cross-provider eval receipts
- alert center
- provenance
- learning controls
- quality gates and completion evidence
- Browser Operator procedures and host playbooks
- live browser handoff and sharing state when a workflow needs human help

Use Mission Control when you need to understand what happened, why Lucid made a decision, and what should happen next.

## Work Graph Relationship

Agent Ops can be launched from a Work Graph item without becoming the Work Graph source of truth.

The boundary is:

- Work Graph owns project goals, Kanban projections, dependencies, checkouts, artifact links, planning proposals, external PM field authority, and engine facets.
- Agent Ops owns executable workflows, runtime/team dispatch, run evidence, findings, replay, quality gates, and operator-readable outcomes.
- A Work Graph launch creates an active checkout and attaches `metadata.work_graph` to the Agent Ops run so Mission Control can show why the run exists and what item it is allowed to mutate.
- Runtime differences must be expressed as capabilities/facets. Agent Ops should not branch on Hermes/OpenClaw for product semantics.

Release gates for this bridge are `npm run work-graph:smoke`, `npm run work-graph:drift`, and `npm run agent-ops:quality-gates`.

## Team Ops

Team Ops is the multi-agent coordination layer inside Agent Ops.

It can select a dispatch tier, choose specialists, enforce runtime compatibility, apply project/team policy, and report readiness back to Mission Control.

Team Ops supports:

- simple, medium, heavy, and full dispatch tiers
- specialist profiles
- adaptive dispatch
- required/recommended/optional workflow policy
- runtime selection enforcement
- Team Setup Doctor readiness checks
- failure ownership for QA, ship, canary, and retro workflows

If no compatible runtime exists for a run, Lucid should block the run with a clear reason instead of pretending execution started.

## Operating Loop

Agent Ops has an operating loop so teams can improve how agents work over time.

Mission Control can track:

- review findings and ownership
- project learnings
- decision preferences
- eval results and durable receipt verdicts
- security or trust-guard attempts
- context snapshots
- performance budgets and alerts
- alert resolution history

Learning controls should make it easy to promote useful project knowledge and archive noisy or outdated suggestions.

## Browser Operator

Browser Operator is the browser capability behind Agent Ops browser workflows.

It supports page checks, flow testing, research, extraction, monitoring, issue reproduction, and Browser QA evidence.

Browser QA is one workflow on top of Browser Operator. It is mainly for dev/product quality checks, while Browser Operator can also serve marketing, sales, support, research, and operations workflows.

Browser Operator also supports reusable procedures, host playbooks, trust controls, live handoff, pair-agent browser sharing, merchant account state, and standing purchase policies. Mission Control exposes these through the `/mission-control/browser` cockpit backed by the shared `browserOperator` projection plus Browser Operator account/policy APIs, so operators can activate/quarantine/block learned procedures, review host memory, resolve handoffs, inspect connected merchant accounts, and review buying policies without coupling the UI to a specific browser provider. Those features let a successful browser run become repeatable without turning it into an engine-specific script.

For managed Lucid agents, the product rule is: own the state, rent the browser capacity. Lucid owns user consent, merchant account records, sanitized credential/session refs, purchase policies, approvals, audit logs, revocation, idempotency, receipts, and memory/provenance. Browser providers provide execution, optional profiles/sessions, optional anti-bot/proxy/CAPTCHA, and optional replay infrastructure.

Buying workflows use Browser Operator for web work and Agent Commerce for spend control. A browser run can build a cart, but checkout requires a standing policy or explicit approval, an idempotent spend request, and receipt/evidence capture.

See [Browser Operator And Browser QA](browser-qa.md).

For production validation, use [Agent Ops Production Runbook](production-runbook.md). It covers Railway split-service health, Browser Operator smoke, channel-native page-check smoke, Mission Control Browser verification, and the authenticated UI-smoke boundary.

## Channel-Native Launch

Agent Ops can be launched from supported channels. Channel commands normalize into the same Agent Ops run contract and report the same Team Ops state that Mission Control shows.

Common Browser Operator shortcuts:

- Slack: `/lucid check <url>`, `/lucid research <url>`, `/lucid extract <what> from <url>`, `/lucid monitor <url>`
- Slack buying: `/lucid buy weekly groceries under $120 from Carrefour`
- Telegram: `/check <url>`, `/buy <request>`, `/research <url>`, `/extract <what> from <url>`, `/monitor <url>`
- WhatsApp, Teams, and iMessage: `check <url>`, `buy <request>`, `research <url>`, `extract <what> from <url>`, `monitor <url>`
- Discord: `/ops` with workflow choices from the shared Agent Ops registry

Slack only needs one `/lucid` slash command. Empty `/lucid` opens the Slack-native Agent Ops picker.

For the common page-check canary, use:

| Channel | Command |
|---|---|
| Slack | `/lucid check https://www.lucid.foundation` |
| Telegram | `/check https://www.lucid.foundation` |
| Discord | `/ops workflow:check-page target:https://www.lucid.foundation` |
| WhatsApp | `check https://www.lucid.foundation` |
| Teams | `check https://www.lucid.foundation` |
| iMessage | `check https://www.lucid.foundation` |

Page-check commands map to workflow `check-page`; buying commands map to `buy-stuff`. Both use Browser Operator capability and should create exactly one Mission Control run with `metadata.team_ops.channelLaunchStatus` showing the launch/report state for that channel.

## Quality Gates And Completion Evidence

Lucid tracks Agent Ops readiness through shared quality gates and a completion matrix.

Quality gates cover release checks, eval registry checks, host-pack integrity, app and worker channel smoke, local web smoke, worker/runtime readiness, stress and latency checks, diff hygiene, and production preflight signals. Worker readiness first builds the shared runtime package prerequisites so OpenClaw/Hermes worker compilation does not depend on stale local `dist` files.

The completion matrix maps shipped Agent Ops areas to their source, tests, docs, and evidence. This keeps product claims tied to code instead of drifting into separate templates, host packs, or runtime forks.

## External Host Packs

External host packs package Lucid's Agent Ops method for coding-agent hosts such as Codex, OpenClaw, Hermes, Claude Code, Cursor, and OpenCode-style environments.

Host packs are distribution UX. Lucid Cloud and Mission Control remain the source of truth for workflow state, evidence, approvals, runtime compatibility, and channel status.

## Managed Packs

Managed packs install repeatable setup bundles for agents, teams, workflows, routines, Knowledge sources, browser procedures, host playbooks, skills, docs, policies, and channel commands.

They are setup UX, not a second runtime, template engine, or source of Agent Ops truth. A pack manifest declares stable resource keys, resource kind, management policy, and spec. Lucid stores install state in `lucid_pack_installs` and reconciles resource state through `lucid_pack_managed_resources`.

Reconcile behavior is deterministic:

- `managed` resources can be updated from the pack manifest.
- `fork_on_edit` resources preserve local edits by marking the resource forked.
- `advisory` resources surface drift for operator review.
- removed or uninstalled resources are archived, not deleted, so run history, evidence, reconcile reasons, and hash provenance remain intact.

Pack manifests must reference secrets through `secret://`, `vault://`, `env:`, or `${{ secrets.* }}` style references. Literal API keys, cookies, private keys, tokens, and passwords are rejected before the pack is created.

Mission Control makes pack governance reviewable. Operators can inspect installed packs, see managed resources and drift, reconcile safe updates, fork drifted `fork_on_edit` resources instead of overwriting local edits, and uninstall packs by archiving managed resources with actor, reason, hash, and previous-status provenance. This keeps packs useful as repeatable setup while preserving the local decisions and run evidence that happened after installation.

## Templates Relationship

Agent Ops does not duplicate templates.

Templates package reusable setup. Agent Ops runs operational workflows.

For example:

- a template can install a support agent or a launch team
- Agent Ops can run `Check page`, `Review`, `Canary`, or `Retro` using that project/team context

Both can reference the same project, agents, teams, tools, and runtime capabilities.

## Runtime Relationship

Agent Ops is runtime-agnostic.

Workflows declare capabilities. Runtime selection and compatibility checks decide whether shared, dedicated, OpenClaw, Hermes, Browser Operator, or BYO paths can safely execute the run.

Product code should not branch directly on engine internals.

## Design, Decisions, And Taste

Agent Ops includes design review, taste/profile support, and decision pacing.

The rule is simple: low-risk decisions can be paced so agents do not interrupt constantly, while one-way-door, security-sensitive, billing, auth, migration, privacy, and similar decisions remain explicit and auditable.

## Run Again And Recurring Work

Mission Control exposes:

- **Run again** to replay a proven workflow with the same scope and input
- **Make recurring** to promote useful runs into the shared Routine Kernel

Lucid uses the canonical Routine Kernel for recurring work. Agent Ops does not own a separate scheduler.

Recurring routines are stored in `agent_scheduled_tasks`, versioned through `agent_scheduled_task_versions`, executed through Pulse/worker admission, and reported through `agent_scheduled_task_runs`. Every create, update, cancel, delete, and restore records a bounded scheduler-definition snapshot with a stable hash and actor provenance. The snapshot is intentionally definition-only: runtime counters, last-run timestamps, transient errors, and raw webhook URLs are excluded or redacted, so routine history is safe and does not create false stale conflicts after normal executions. Operators can open history from the routine panel, restore a previous definition, and Lucid will create a new `restored` revision. Restores include stale-conflict protection: if the current routine definition changed since the history drawer loaded, the API returns `409` instead of overwriting newer edits.

## What Agent Ops Is Not

Agent Ops is not:

- a visual workflow-builder replacement
- a separate runtime
- a separate template system
- a replacement for Mission Control
- a browser-only QA tool
- a channel-specific command system

It is the operator-friendly workflow layer above Lucid's existing platform.
