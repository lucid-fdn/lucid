# Beta Tester Readiness Map

Last updated: 2026-04-22

This document is the current-state tester map for the `LucidMerged` codebase. It is meant to answer:

- what exists in the product today
- what beta testers should actively test
- what is stable enough for broad testing
- what is still partial, feature-gated, transitional, or not ready

This is based on a code-and-doc audit of the current repo, not just roadmap docs.

## Status Legend

- `Ready` — implemented, part of the main product path, and supported by current routes/tests/docs
- `Beta` — implemented and testable, but still needs validation, polish, or broader coverage
- `Limited Beta` — available only in some deployment modes, behind feature flags, or with meaningful caveats
- `Not Ready` — routed or documented in some form, but explicitly incomplete or placeholder-only
- `Out Of Scope` — present in the repo, but not part of the current core beta charter

## Canonical Tester Context

Testers should think about Lucid in this order:

1. `Workspace`
2. `Project`
3. `Agents`
4. `Teams`
5. `Runs`

The canonical UI path is now project-scoped:

- `/{workspace}/projects/{project}`
- `/{workspace}/projects/{project}/agents`
- `/{workspace}/projects/{project}/teams`
- `/{workspace}/projects/{project}/runs`
- `/{workspace}/projects/{project}/inbox`
- `/{workspace}/inbox`

Canonical day-to-day product work now lives in the project shell. Workspace-level Mission Control remains as the cross-project observability and operations layer.

## What Testers Should Focus On First

### 1. Core App Shell And Access

| Area | Main routes | Status | What testers should do | Notes |
|---|---|---:|---|---|
| Login and access gating | `/login`, workspace routes | `Ready` | Sign in, sign out, check redirects to login when unauthenticated | Core route guards are in place |
| Workspace to project routing | `/{workspace}/projects`, `/{workspace}/projects/default/*` | `Ready` | Confirm workspace entry lands in project shell and legacy redirects land correctly | Covered by project shell smoke coverage |
| First-project activation | `/dashboard`, `/{workspace}/new` | `Beta` | Validate the zero-agent dashboard gate, project-start flow, featured templates, and deploy result routing | Project is created implicitly; activation is framed project-first |
| Legacy redirects | removed workspace shims + remaining compatibility links | `Beta` | Verify legacy agent/template links still land in the right project-scoped destination where applicable | Most dead workspace list shims were removed; remaining compatibility routes are intentional |

### 2. Project Shell

| Area | Main routes | Status | What testers should do | Notes |
|---|---|---:|---|---|
| Project overview | `/{workspace}/projects/{project}` | `Ready` | Validate counts, proof loop, runtime posture, recent activity, reliability summary, empty states | This is the top-level operating surface |
| Project inbox | `/{workspace}/projects/{project}/inbox` | `Ready` | Validate approvals, ready work, failures, liveness incidents, and next actions | Canonical project attention surface |
| Project agents | `/{workspace}/projects/{project}/agents` | `Ready` | Create agents, edit agents, verify project scoping, empty state behavior, and project-start activation entry points | Uses the shared assistants list client with project scope and canonical blueprint deploy |
| Project teams | `/{workspace}/projects/{project}/teams` | `Ready` | Create teams, assign agents, inspect runtime packaging, intervention history, and health trends | Team surface is wired into project scope |
| Project runs | `/{workspace}/projects/{project}/runs` | `Ready` | Review recent runs, approvals, failures, drill into operations links | This is the canonical “proof / receipts” surface |
| Project settings | `/{workspace}/projects/{project}/settings` | `Beta` | Verify edits persist and danger-zone actions are correctly scoped | Present and covered by shell-level tests |
| Project resources | `/{workspace}/projects/{project}/resources` | `Not Ready` | Do not treat as a real surface | Currently redirects to agents |

### 2a. Workspace Operator Shell

| Area | Main routes | Status | What testers should do | Notes |
|---|---|---:|---|---|
| Workspace inbox | `/{workspace}/inbox` | `Ready` | Validate cross-project ranking, project hot spots, next actions, ready work, failures, and stalls | Ranked by operator load and degradation, not just flat counts |

### 3. Agents, Chat, And Knowledge

| Area | Main routes | Status | What testers should do | Notes |
|---|---|---:|---|---|
| Agent create/edit | agent list and detail pages | `Beta` | Create new agents from blank, template, and spec input; verify blueprint preview, deploy, and save behavior | Builder now converges on canonical blueprint JSON before deploy |
| AI chat | `/{workspace}/ai/chat` | `Ready` | Test chat with different models, model switching, assistant selection, basic conversation persistence | Main chat path is implemented and model-aware |
| Workspace Brain / Knowledge | `/{workspace}/knowledge` | `Beta` | Add Brain facts, upload documents, add sources, test recall, and confirm agent answers use scoped Brain context | `/{workspace}/ai/knowledge` is compatibility-only and redirects to the Knowledge documents section; do not treat it as a separate RAG surface |
| Long-term memory | agent runtime + Mission Control + channel conversations | `Beta` | Verify user-scoped recall, no cross-user leakage, memory quality over repeated sessions | Memory pipeline exists and has integration coverage, but it is still a quality-sensitive area |

### 4. Templates

| Area | Main routes | Status | What testers should do | Notes |
|---|---|---:|---|---|
| Template gallery | `/{workspace}/projects/{project}/templates` | `Beta` | Browse templates, inspect metadata, validate category/tag filtering and starter/onboarding relevance | This is a real surface, not just docs |
| Template deploy | template deploy flow + `/api/templates/*` and org blueprint deploy | `Beta` | Deploy agent and team templates with valid and invalid params, confirm rollback on failure, verify resulting agents/teams | Backed by canonical template specs, shared blueprint deploy logic, and template deployment accounting on template-backed blueprint deploys |
| Save as template | agent/team to template flow | `Beta` | Test only if exposed in current UI build | The platform docs describe it, but UI exposure may vary by surface |
| Deployment history | settings-level history | `Not Ready` | Do not include in tester checklist yet | Docs explicitly mark this as “coming soon” |

### 5. Mission Control, Approvals, And Operations

| Area | Main routes | Status | What testers should do | Notes |
|---|---|---:|---|---|
| Mission Control workspace ops | `/{workspace}/mission-control/*` subpages | `Beta` | Validate fleet health, replay, canvas, economics, integrations, system, and work queue as cross-project monitoring surfaces | Mission Control is now explicitly workspace-wide observability, not the canonical per-agent editing surface |
| Approvals | Mission Control approvals + runtime approvals APIs | `Beta` | Force approval-required tools, approve/deny, confirm timeout behavior, confirm runs resume or stop correctly | Strong backend coverage; important high-priority beta path |
| Replay / proofs / economics / system | Mission Control detail subpages | `Beta` | Validate load states, workspace context, navigation, and empty states | Real features, but testers should treat them as ops beta, not core GA surfaces |

## Channel And Integration Matrix

### Recommended Channel Test Priority

1. Web chat
2. Telegram
3. Discord
4. WhatsApp
5. Slack
6. Teams

### Current Channel Status

| Channel | Status | What testers should do | Caveats |
|---|---:|---|---|
| Web chat | `Ready` | Test normal chat, multi-turn context, assistant switching, auth-scoped usage | Internal first-party transport; not shown as an external channel row |
| Telegram BYOB | `Beta` | Add a bot token, verify webhook setup, send messages, test media and voice notes | Good candidate for active beta testing |
| Telegram hosted multi-agent | `Beta` | Test deep links, switch-agent UX, mini app/control room, hosted replies, private-chat behavior | One of the most complete hosted multi-agent channel paths |
| Discord BYOB | `Beta` | Connect a Discord bot, test mention routing, DMs, thread behavior | Route tests exist for BYOB connect flow |
| Discord hosted/shared bot | `Beta` | Test install, binding, shared-bot routing, switching if enabled in deployment | Supported in architecture, but still should be treated as beta |
| WhatsApp BYOB | `Beta` | Test webhook verification, inbound/outbound text, media, voice note handling | Good test target; no hosted multi-agent layer |
| WhatsApp hosted | `Beta` | Test hosted bind/connect flow if deployment has hosted creds configured | Hosted webhook bind path has tests, but depends on env setup |
| Slack BYOB | `Limited Beta` | Test only if deployment is configured for it | Supported path exists, but product direction favors hosted/shared app |
| Slack hosted/shared app | `Limited Beta` | Test install/bind only if the deployment enables it | Route explicitly returns `501` when hosted Slack is disabled via feature flag |
| Microsoft Teams BYOB/native | `Limited Beta` | Test only in runtimes that support native/adapter paths | Teams exists in architecture and native adapter layer |
| Microsoft Teams hosted one-click connect | `Not Ready` | Do not assign to beta testers yet | Route explicitly says hosted Teams still needs callback/binding/credential injection work |

## Dedicated Runtimes And Engine Status

| Area | Status | What testers should do | Caveats |
|---|---:|---|---|
| Dedicated runtime provisioning | `Beta` | Create runtime, inspect status, verify heartbeat/health, assign an agent | Worth testing for admin/operator users |
| Runtime maintenance | `Beta` | Test maintenance actions, verify audit trail and error handling | Backed by route tests |
| OpenClaw engine | `Ready` | Use for standard shared execution and approval-gated tools | Engine capabilities are explicitly marked stable |
| Hermes engine | `Limited Beta` | Test only if you want to validate experimental shared execution and tool runtime behavior | Engine capabilities are explicitly marked experimental |

## Admin, Billing, And Keys

| Area | Main routes | Status | What testers should do | Notes |
|---|---|---:|---|---|
| Provider keys (BYOK) | gateway/settings surfaces | `Beta` | Add provider keys, rotate/remove, confirm direct model access works | Available on all plans in current UI copy |
| Gateway keys | `/{workspace}/settings/gateway` | `Limited Beta` | Test if your workspace capability allows it | Capability-gated |
| Spend analytics | gateway settings | `Beta` | Verify per-key and per-model usage visibility | Depends on gateway data being present |
| Billing dashboard | `/settings/billing` | `Beta` | Validate checkout entry points, portal links, plan display, empty states | Real UI exists, but billing behavior depends on configured providers |
| Payment providers | Stripe / Coinbase / NOWPayments paths | `Beta` | Test only with configured provider env | Provider registry is implemented and tested |

## Workflows

| Area | Main routes | Status | What testers should do | Caveats |
|---|---|---:|---|---|
| Workflow list | `/{workspace}/workflows` | `Beta` | Create, open, delete workflows; verify draft lifecycle | Implemented and usable |
| Workflow editor | `/{workspace}/workflows/{id}` | `Beta` | Test node editing, save, versions, schedules, variables, webhooks | Large surface; needs real-world testing |
| Project integration with workflows | project shell counts and routing | `Limited Beta` | Do not make this a core tester requirement yet | Current list page is still personal-workflows-first and not fully project-centered |

## Out Of Scope For The Current Beta Charter

These areas exist in the repo, but should not be treated as core beta scope unless we explicitly want them in the test program:

- `launchpad` consumer/trading surfaces
- `oracle` cloud/oracle surfaces
- retail preview funnel pages
- video templates / renders
- styleguide, countdown, marketing CMS, blog infrastructure

Reason: they are specialized product lines or supporting surfaces, while the current canonical product story is the workspace/project/agent/team/run path.

## Explicitly Not Ready Or Placeholder Areas

| Area | Current state |
|---|---|
| Telegram logs page | Placeholder-only: “Telegram logs coming soon.” |
| Hosted Teams connect | Explicitly returns `501` and describes missing implementation work |
| Hosted Slack connect on deployments without the flag | Explicitly returns `501` when disabled |
| Template deployment history in settings | Documented as coming soon |
| Project resources page | Redirects to agents, not a standalone resource manager |

## Recommended Beta Test Plan

### Tier 1: Must Test

- sign in and enter the workspace/project shell
- complete the zero-agent dashboard path into the project-start chooser
- open the workspace inbox and verify the hottest project ordering makes sense
- open a project inbox and verify approvals / ready work / failures / liveness signals
- create a first project from the chooser and deploy either a personal assistant or a team
- create or edit an agent
- run AI chat in the web app
- upload documents into the knowledge base and verify they affect answers
- deploy at least one template
- create at least one team and inspect its runs, intervention history, and health trend
- trigger at least one approval-required action and resolve it
- connect Telegram or Discord and verify end-to-end message flow

### Tier 2: Strongly Recommended

- test BYOK provider keys and model switching
- test WhatsApp if env/config is ready
- test dedicated runtime heartbeat and assignment flow
- test Mission Control command-center and system pages
- test workflow creation, save, variables, schedules, and webhook setup

### Tier 3: Optional / Controlled Access

- hosted Slack
- hosted Discord shared-bot flows
- Hermes-engine execution
- runtime maintenance operations

## Evidence Used For This Assessment

Primary implementation and test anchors:

- `README.md`
- `docs/platform/*`
- `src/app/(app)/[workspace-slug]/inbox/page.tsx`
- `src/app/(app)/[workspace-slug]/assistants/assistants-list-client.tsx`
- `src/app/(app)/[workspace-slug]/projects/[project-slug]/*`
- `src/app/(workflow)/[workspace-slug]/workflows/*`
- `contracts/project-blueprint.ts`
- `src/lib/projects/blueprint-deploy.ts`
- `src/app/api/templates/*`
- `src/app/api/assistants/[id]/channels/route.ts`
- `src/app/api/assistants/[id]/slack-connect/route.ts`
- `src/app/api/assistants/[id]/msteams-connect/route.ts`
- `src/app/api/webhooks/telegram/hosted/__tests__/route.test.ts`
- `src/app/api/webhooks/whatsapp/hosted/__tests__/route.test.ts`
- `tests/src/app/api/assistants/channels/discord-byob-route.test.ts`
- `src/lib/templates/__tests__/deploy.test.ts`
- `src/app/(app)/[workspace-slug]/projects/[project-slug]/__tests__/shell-pages.test.tsx`
- `src/lib/workspace/attention.ts`
- `src/lib/teams/read-model.ts`
- `src/lib/projects/read-model.ts`
- `worker/src/agent/engines/OpenClawEngineRunner.ts`
- `worker/src/agent/engines/HermesEngineRunner.ts`

Targeted verification run during this audit:

- 31 tests passed across project shell, templates, workspace project APIs, payments, and Discord BYOB channel routes
- 47 tests passed across runtimes, Telegram hosted, WhatsApp hosted, and runtime maintenance routes

## Maintainer Note

When product status changes, update this file first and treat `docs/plans/*` as historical design context unless the implementation has caught up.
