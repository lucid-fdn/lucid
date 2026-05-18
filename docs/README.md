# Lucid Documentation

This directory contains Lucid's current public docs, engineering docs, architecture notes, and implementation plans.

## Public Start Here

If you are reading the open-source repository for the first time, use this path:

1. [Quick Start](QUICKSTART.md) for the shortest Docker-first setup.
2. [Self-Hosting Guide](SELF_HOSTING.md) for production deployment, auth, networking, upgrade, and recovery notes.
3. [Environment Reference](ENV_REFERENCE.md) for provider keys, generated secrets, and deployment variables.
4. [Open Source Export](OPEN_SOURCE_EXPORT.md) for what is included, what stays private, and how the public repo is generated.
5. [Contributing](../CONTRIBUTING.md) for branch, test, and PR expectations.

The public repository intentionally includes some engineering history and implementation plans. Treat [platform/](platform/) and the files above as the canonical public documentation path; treat older plans, audits, and historical implementation notes as context unless a current guide links to them directly.

For product-facing platform documentation, start in [platform/README.md](platform/README.md).

For engineering guardrails, use the repository-level [CLAUDE.md](../CLAUDE.md).

For new feature work, start with [NEW_FEATURE_DEVELOPMENT_CHECKLIST.md](NEW_FEATURE_DEVELOPMENT_CHECKLIST.md).

For strategy and implementation history, use [plans/INDEX.md](plans/INDEX.md).

## Current Product Architecture

Lucid is organized around:

- **Projects** as the primary operating context.
- **Agents** as the default setup and work unit.
- **Teams / Team Ops** as optional multi-agent coordination with dispatch tiers, specialist profiles, policies, runtime compatibility, and setup readiness.
- **Agent Ops** as the verb-based workflow layer for investigate, plan, review, check, research, extract, monitor, QA, ship, canary, retro, and security audit.
- **Browser Operator** as the browser capability behind page checks, flow tests, research, extraction, monitoring, and Browser QA evidence.
- **Agent Identity + Operating Context** as the separation between versioned agent identity documents, agent heartbeat, optional Web3 provenance, and inherited workspace/project/team/agent/user shared context.
- **Mission Control** as the workspace-wide operations surface for runs, findings, evidence, alerts, eval history, quality gates, provenance, and learning controls.
- **Channels** as normalized surfaces for web, Slack, Telegram, Discord, WhatsApp, Teams, and iMessage.
- **Pulse/Nerve/runtimes** as the execution rails below the product UX.

Agent Ops channel commands are native per platform while sharing one run contract. The common Browser Operator page-check canary is Slack `/lucid check https://www.lucid.foundation`, Telegram `/check https://www.lucid.foundation`, Discord `/ops workflow:check-page target:https://www.lucid.foundation`, and WhatsApp/Teams/iMessage `check https://www.lucid.foundation`.

The Memory/Knowledge plan is incremental. Shipped pieces now include assistant memory, board memory, RAG, Mission Control evidence, Agent Ops learning surfaces, scoped semantic assistant recall, engine-neutral KnowledgePromptPacket consumption, optional durable memory extraction jobs, Team/Project Brain compiled-truth surfaces, source/federation policy APIs, scheduled source refresh jobs, shared hybrid Knowledge retrieval fusion, Knowledge Claims as a first-class retrieval layer, claim evidence/explain/supersede/resolve/archive governance, semantic claim fingerprints/clusters/embedding status, semantic claim-index and semantic claim-conflict Brain Ops findings, deterministic Knowledge Think synthesis, the first entity/relationship graph substrate, Mission Control graph exploration, Brain Ops maintenance findings, the self-serve `/<workspace>/knowledge` manager, the Mission Control Knowledge operator page, the shared Knowledge operation contract for app/worker/MCP-style/external-agent callers, deterministic retrieval evals, one-click retrieval eval replay from Mission Control, eval receipts, CSV/TSV-aware import job ledgers with broad secret scanning, external Knowledge client tokens, Commerce events mirrored as Knowledge evidence and attachable to context/Daily Intel, the local-first Lucid-L2 projection bridge, the EHV/HHV/OHV engine-home projection candidate layer, Lucid Pack fork/uninstall governance, the Memory Quality Moat, the production-hardening gate/runbook, the live staging retrieval-load harness, and worker-triggered manual Brain Ops runs from Mission Control. Use `npm run knowledge:engine-home:check`, `npm run knowledge:memory-moat:check`, `npm run knowledge:production-hardening:check`, `npm run knowledge:staging-load -- --org-id <org-id>`, and `node scripts/knowledge-ui-local-e2e.mjs` for the newest deterministic, UI, and live gates.

The operating-context model is implemented at the contract/API/runtime layer and has product UI at all active scopes: **Workspace Brain** on the workspace dashboard, **Project Brain** in project settings, **Team Context** on project team detail, and **Operating Context** in the agent command center. Agent identity documents are agent-only (`SOUL`, `USER`, `HEARTBEAT`, `MEMORY_POLICY`, `ACCESS_POLICY`, `TOOL_POLICY`, `CURRENT_CONTEXT`). Workspace/project/team context is represented by editable shared context records (`thesis`, `signal`, `feedback`, `daily_intel`, `memory`, `decision`, `policy`, `risk`, `open_question`) with archive, resolve, supersede, evidence-link, Daily Intel generation, merged-policy, and override-warning support.

## Documentation Map

| Area | Start Here | Notes |
|---|---|---|
| New feature development | [NEW_FEATURE_DEVELOPMENT_CHECKLIST.md](NEW_FEATURE_DEVELOPMENT_CHECKLIST.md) | Routing checklist for stack ownership, canonical boundaries, validation, and docs updates |
| Open source export | [OPEN_SOURCE_EXPORT.md](OPEN_SOURCE_EXPORT.md) | Public-safe export boundary, CI, generated public repo smoke, lockfile, license, and secret scanning model |
| Open source release ops | [platform/open-source-release-ops.md](platform/open-source-release-ops.md) | Private operator runbook for the public repo target, sync token, first sync, and rotation |
| Public platform docs | [platform/README.md](platform/README.md) | User-facing docs for RAG ingestion or a standalone docs site |
| How Lucid works | [platform/getting-started/how-lucid-works.md](platform/getting-started/how-lucid-works.md) | Public conceptual guide for Lucid's workspace/project/agent/team/run/evidence operating model |
| Agent Ops | [platform/agent-ops/overview.md](platform/agent-ops/overview.md) | Current workflow surface and evidence model |
| Browser Operator | [platform/agent-ops/browser-qa.md](platform/agent-ops/browser-qa.md) | Browser Operator plus Browser QA workflow details |
| Mission Control | [platform/mission-control/overview.md](platform/mission-control/overview.md) | Workspace-wide operations and Agent Ops cockpit |
| Lucid Knowledge | [platform/knowledge-base/lucid-knowledge.md](platform/knowledge-base/lucid-knowledge.md) | User-facing memory, project/team brain, source governance, and Brain Ops guide |
| Agent identity and operating context | [platform/agents/operating-context.md](platform/agents/operating-context.md) | User and API guide for agent identity docs, heartbeat, optional Web3 identity, shared context records, and Daily Intel |
| Knowledge production runbook | [platform/knowledge-base/production-hardening-runbook.md](platform/knowledge-base/production-hardening-runbook.md) | Operator checklist for stress, latency, queue pressure, staging RLS, L2 failures, eval regressions, and accidental memory capture |
| Channels | [platform/agents/channels.md](platform/agents/channels.md) | Canonical channel architecture |
| Channel support matrix | [channels/support-matrix.md](channels/support-matrix.md) | Current transport and command support |
| Billing/runtime model | [platform/billing/runtime-model-matrix.md](platform/billing/runtime-model-matrix.md) | Public runtime tier copy and internal matrix |
| Runtime parity verification | [platform/mission-control/runtime-parity-verification-2026-05-08.md](platform/mission-control/runtime-parity-verification-2026-05-08.md) | Current OpenClaw/Hermes parity, EHV/HHV/OHV, re-home, command matrix, BYO, TrustGate/BYOK, and Runtime Detail verification record |
| Agent Ops implementation plan | [plans/2026-04-28-gstack-agent-ops-saas-plan.md](plans/2026-04-28-gstack-agent-ops-saas-plan.md) | Historical implementation plan and rollout context |
| GStack completion map | [plans/2026-05-02-gstack-complete-fit-gap-implementation-plan.md](plans/2026-05-02-gstack-complete-fit-gap-implementation-plan.md) | Remaining/follow-on fit-gap map |
| Memory/Knowledge plan | [plans/2026-04-28-gbrain-memory-and-knowledge-plan.md](plans/2026-04-28-gbrain-memory-and-knowledge-plan.md) | Shipped assistant-memory, Team/Project Brain, hybrid retrieval, graph, Brain Ops, Mission Control Knowledge UX, operation contract, retrieval evals, Lucid-L2 proof bridge, engine-home review, Memory Quality Moat, and production-hardening gates |
| GBrain local extras disposition | [plans/2026-05-12-gbrain-local-extras-disposition.md](plans/2026-05-12-gbrain-local-extras-disposition.md) | Final decision matrix for GBrain recipes, auto-think/dream, book mirror, cross-modal evals, BYO-local patterns, Lucid-native feature backlog, and explicit non-goals |
| External Agent OS patterns | [plans/2026-05-07-external-agent-os-patterns-implementation-plan.md](plans/2026-05-07-external-agent-os-patterns-implementation-plan.md) | Latest Paperclip/GStack/GBrain implementation roadmap and status ledger for global search, run modes, system notices, Knowledge claims/Think/semantic drift, external local-agent connector, packs, routine history, Browser Operator, channel-native access, runtime capability registry, and security hardening |

## Public Docs Conventions

- Public docs describe what users can do and what behavior they can expect.
- Avoid leaking low-level implementation details unless the user needs them to configure a feature.
- Do not claim planned Memory/Knowledge capabilities are shipped until the implementation exists.
- Treat Browser QA as one workflow on top of Browser Operator, not the whole browser capability.
- Treat Agent Ops as the product workflow layer, not as a replacement for templates, Pulse, Nerve, runtimes, or Mission Control.

## Engineering Docs Conventions

- Put durable engineering rules in [CLAUDE.md](../CLAUDE.md).
- Put current user-facing platform docs in [platform/](platform/).
- Put implementation history and plans in [plans/](plans/).
- Put generated docs in `docs/generated/`; do not hand-edit generated files.
- When changing Agent Ops capabilities, update the source of truth in code and run `npm run agent-ops:capability-docs:check`.

## Validation

Documentation-only changes should at least pass:

```bash
git diff --check
```

For Agent Ops capability or public support changes, also run:

```bash
npm run agent-ops:capability-docs:check
npm run agent-ops:quality-gates -- --dry-run
```
