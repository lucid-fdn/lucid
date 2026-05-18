# Mission Control Overview

Scope: Mission Control is workspace-global. Project pages expose project-native creation, work, agents, teams, and review surfaces. Use project pages to change behavior inside one project; use Mission Control for fleet-wide health, global runtime/system detail, cross-project activity, approvals, replay, and raw operations tooling.

Mission Control is the operational dashboard for managing your AI agent fleet. It provides real-time visibility, control, and trust — everything you need to confidently run autonomous agents.

## The Core Promise

**"I can see it, I can stop it, I can approve it."**

Mission Control answers three critical questions:
1. **What are my agents doing right now?** — Real-time event feed, status, and health scores
2. **Can I stop something if it goes wrong?** — Pause, kill, and escalate controls
3. **Do I approve this action?** — Hard approval gates for sensitive operations

## Dashboard Pages

| Page | Purpose |
|------|---------|
| **Command Center** | Single-screen operational view with live feed, agent list, and controls |
| **Needs Human** | Unified queue for blocked runs, Knowledge maintenance, Browser alerts, Commerce exceptions, template drift, and unresolved system notices |
| **Lucid Doctor** | Readiness report across Knowledge, Agent Ops, Browser Operator, Commerce, Templates, runtimes, channels, and L2 |
| **Agent Ops** | Workflow cockpit for Agent Ops runs, Team Ops dispatch, findings, evidence, evals, alerts, quality gates, and replay |
| **Routines** | Recurring, one-shot, manual, webhook, team, Work Graph, Browser, Knowledge, EHV, plugin, PM sync, and runtime-triggered work |
| **Knowledge** | Workspace brain cockpit for project/team knowledge, org memory, evidence, source governance, graph entities, typed metric trajectories, entity/founder scorecards, and Brain Ops findings |
| **Agents** | Fleet table with health scores, status, and cost data |
| **Agent Detail** | Deep dive into a specific agent (runtime, channels, plugins, memory, tasks, health, guardrails) |
| **Conversations** | Conversation volume, engagement metrics, memory pipeline health |
| **Integrations** | Channel health grid and plugin status |
| **Commerce** | Spend requests, lifecycle events, provenance drawer, ledger/provider details, and context attachment |
| **Spend** | Cost breakdown, billing, optimization recommendations |
| **System** | Worker health, database status, error log, dedicated runtimes |
| **Proposed Changes** | Review native and engine-memory candidates before promotion |
| **Canvas** | Visual topology of your agent fleet |
| **Replay** | Browse and replay past conversations step-by-step |
| **Experiments** | A/B test management for agent configurations |
| **Proof Receipts** | Audit log of agent actions with verifiable receipts |

## Getting Started

Mission Control is available from the sidebar. Click **Mission Control** to open the Command Center — the default landing page that shows everything at a glance.

### What You See on First Load

- **Agent List** (left) — All agents with status dots, cost, and health scores
- **Live Feed** (center) — Real-time stream of events (tool calls, errors, approvals)
- **Context Pane** (right) — Details about the selected agent
- **Controls Bar** (bottom) — Action buttons for the selected agent

## Key Features

### Real-Time Monitoring

The live feed shows events as they happen:
- Tool calls and their results
- Errors and failures
- Approval requests (pulsing amber)
- Agent start/stop events

### Fleet Health Scores

Each agent gets a 0-100 health score computed hourly from:
- Response latency
- Error rate
- Memory health
- Tool reliability
- User satisfaction
- Cost efficiency

### Cost Controls

Set spending limits at the per-run, daily, and monthly level. When limits are hit, agents pause automatically.

### Approvals

Configure specific tools to require owner approval before execution. Critical for financial operations (swaps, transfers) and other high-stakes actions.

## Agent Ops Cockpit

Mission Control is also the operator surface for Agent Ops.

Use it to inspect:

- workflow and run status
- Team Ops dispatch tier and selected specialists
- runtime compatibility and blocked-runtime reasons
- channel launch/report status
- Browser Operator evidence
- Browser Operator procedures, host playbooks, handoff, and sharing state
- findings, risks, and failure ownership
- eval history
- alert center and alert resolution history
- provenance links back to project, agent, run, deploy, template, channel, or timeline events
- learning controls for promoting, archiving, or rejecting project learnings
- managed pack install/reconcile/fork/uninstall state
- quality-gate and completion-matrix coverage
- external host-pack and runtime/channel capability coverage
- runtime adapter identity, probes, commands, services, transcript parser status, and EHV state where available

Agent Ops runs can also be launched from supported channels such as Slack, Telegram, Discord, WhatsApp, Teams, and iMessage. Channel-launched runs still appear in Mission Control with the same run id and Team Ops state.

## Project Work Graph

Project Work is the canonical operator surface for project-native PM and execution state. Mission Control observes and audits it rather than owning a separate task model.

Work Graph adds:

- goals and goal-to-work-item links
- Kanban board projections over `human_work_items`
- dependencies and relation edges
- active checkouts for humans, agents, teams, and external owners
- artifact/evidence links to runs, approvals, docs, URLs, commits, and external PM records
- AI/deterministic planning proposals with commit review
- external PM federation state and field authority
- optional engine facets for Hermes/OpenClaw/runtime-specific capabilities

Production controls:

- feature flags: `workGraph`, `workGraphBoards`, `workGraphGoals`, `workGraphAiPlanning`, `workGraphExternalPmFederation`, `workGraphEngineFacets`
- rollback: `WORK_GRAPH_KILL_SWITCH=true`
- local gates: `npm run work-graph:drift`, `npm run work-graph:smoke`, `npm run work-graph:production-hardening`

Work Graph remains engine/runtime agnostic. Hermes/OpenClaw differences are surfaced as capabilities and facets, not separate Mission Control concepts.

## Knowledge Cockpit

Mission Control also includes a **Knowledge** page for operating Lucid's shared memory and brain system.

Use it to inspect:

- versioned project and team knowledge with evidence labels
- organization memory and policy entries
- source health, trust, federation, retention, and retrieval inclusion
- graph entities extracted from project/team knowledge
- Brain Ops maintenance findings such as stale sources, missing citations, semantic claim-index gaps, semantic claim conflicts, and contradiction candidates

Metric-backed Knowledge Claims add trajectory intelligence without a second analytics store. Claims with `claim_metric`, `claim_value`, `claim_unit`, `claim_period`, and `observed_at` can power trend direction, regression warnings, and profile-specific scorecards for founders, companies, projects, agents, wallets, tokens, customers, and merchants.

Operators can remember new org context, forget obsolete memory, correct project/team knowledge with an auditable event, pause/archive sources, exclude sources from retrieval, inspect scorecard signals, and resolve Brain Ops findings.

## Needs Human And Lucid Doctor

Mission Control includes two cross-stack triage surfaces:

- **Needs Human** gathers existing actionable records into one operator queue. It does not create a new state machine; it reads blocked/failed Agent Ops runs, Knowledge maintenance events, Browser Operator alerts, Commerce exceptions, template drift, and unresolved system notices.
- **Lucid Doctor** builds a deduped readiness report over the same ledgers. It includes Knowledge trajectory regressions when metric-backed claims show worsening signals.

These surfaces should stay aggregator-only. Browser alerts remain in Browser Operator tables, Commerce events remain in Agent Commerce, Knowledge findings remain in Knowledge maintenance/claims, and Agent Ops run state remains in Agent Ops.

## Commerce Evidence

Mission Control Commerce is the operator surface for Agent Commerce evidence.

Use it to inspect:

- spend request and lifecycle event status
- Knowledge evidence row linked to the Commerce event
- event payload summary and bounded entity snapshot
- run id, request id, provider event id, idempotency key, budget reservation, seller grant, ledger id, amount, currency, and provider
- context records already linked to the event

Operators can attach a Commerce event to workspace, project, or team context as thesis, signal, feedback, Daily Intel, risk, or memory evidence. After attachment, Mission Control shows a direct context link. Manual Daily Intel generation includes recent Commerce evidence for the selected scope, so financial and entitlement changes can influence the next operating digest without exposing provider secrets.

## Operator Actions

Mission Control exposes loop-closing actions for Agent Ops and Routines:

- **Run again** replays a proven workflow with the same scope and input.
- **Make recurring** promotes a useful run into Lucid's canonical Routine Kernel.
- **Run now** queues a Routine immediately without relying on the next cron tick.
- **Pause/restore** stops or re-enables a Routine while preserving revision history.
- **Simulate** previews next fire times, target fit, policy/routing notes, and capability requirements before enabling.

These actions reuse the existing Agent Ops run contract, `agent_scheduled_tasks`, Pulse admission, and `agent_scheduled_task_runs` receipts. They do not create a second workflow engine or scheduler.

## Routines

Routines are the Mission Control surface for product automation. Cron is one trigger type, not the product model.

Operators can use Routines to inspect:

- trigger, timezone, retry, catch-up, concurrency, and runtime selector policy
- target type: assistant, team, Work Graph, Agent Ops, Browser Procedure, Knowledge/Brain, Engine Home, plugin job, or PM sync
- run receipts and sanitized error messages
- Work Graph, Browser, Knowledge, EHV, TrustGate, PM/plugin, team dispatch, and runtime command refs
- revision history, restore conflicts, drift state, and managed-pack ownership
- blocked, refused, stale, dead-letter, empty, loading, and error states

Hermes, OpenClaw, shared, dedicated, and BYO/local differences appear through runtime capabilities and adapter status. The UI should not branch on engine names except when displaying adapter-provided capabilities.

## Runtime And BYOK Controls

Mission Control and assistant detail share the same engine/runtime-agnostic contract:

- OpenClaw and Hermes can run through shared, Lucid dedicated, or BYO runtime paths when compatibility allows it.
- Runtime Detail shows Lucid-branded sanitized data for Lucid-operated runtimes and user-owned adapter metadata for BYO runtimes.
- Proposed Changes shows reviewable native and engine-memory candidates so local-first/runtime-local changes do not silently become durable platform state.
- Assistant detail exposes TrustGate inference mode: Auto, Lucid managed, and BYOK only.
- Settings -> Provider Keys manages BYOK provider keys; browser responses never include plaintext or encrypted keys.
