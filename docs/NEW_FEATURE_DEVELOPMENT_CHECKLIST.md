# New Feature Development Checklist

**Status:** Active developer routing checklist

Use this before starting any new feature or substantial product change. The goal is to route work into the right Lucid stack, reuse the existing contract/service layer, and pick the smallest validation gate that proves the change.

This is not a backlog. Use it as the first pass before implementation.

## 1. Classify The Feature

Identify the owning stack before touching code:

| Feature area | Start here |
| --- | --- |
| Agent spend, buying, payments, seller grants | `docs/stacks/commerce.md` |
| Runs, findings, quality gates, operator workflows | `docs/stacks/agentops.md` |
| Mission Control UI and operator cockpit | `docs/stacks/mission-control.md` |
| Teams, team topology, specialists, dispatch | `docs/stacks/teams.md` |
| Templates, packs, deployable setup bundles | `docs/stacks/templates.md` |
| OpenClaw, Hermes, shared/dedicated/BYO execution | `docs/stacks/runtime.md` |
| Generated/hosted app services | `docs/stacks/app-service.md` |
| Auth, approvals, policy, secrets, entitlements | `docs/stacks/trust.md` |
| Migrations, queues, ledgers, durable state | `docs/stacks/data.md` |
| External provider adapters and manifests | `docs/stacks/providers.md` |

If the feature crosses stacks, name the source of truth and the read-only consumers. Do not let two stacks own the same durable state.

## 2. Check Existing Intent

Look for existing roadmap or backlog context before creating a new plan:

- `docs/BACKLOG.md` for cross-cutting product, architecture, security, and integration TODOs.
- `docs/plans/INDEX.md` for active plans, shipped milestones, deferred work, and references.
- `docs/platform/README.md` for current user-facing docs ownership.
- `CLAUDE.md` for durable engineering guardrails and naming boundaries.

If the feature is already covered, update the existing backlog item or plan instead of creating a parallel TODO.

## 3. Choose The Canonical Boundary

Prefer existing contracts and services:

| Need | Canonical boundary |
| --- | --- |
| Shared schema between app, worker, runtimes, packages | `contracts/*` |
| Database CRUD | `src/lib/db/*` |
| Product domain logic | `src/lib/<domain>/*` |
| API surface | `src/app/api/<domain>/**` |
| Worker execution | `worker/src/<domain-or-runtime>/*` |
| Reusable SDK/runtime package | `packages/*` |
| UI primitive | `src/components/ui/*` |
| Product/domain UI | `src/components/<domain>/*` |
| Decorative/composite chat UI | `src/ui/components/*` |
| Database migration | `supabase/migrations/YYYYMMDDHHMMSS_description.sql` |

Do not add a new table, route family, scheduler, provider client, or UI primitive until the existing owner cannot reasonably support the feature.

## 4. Apply Naming And Product Boundaries

Keep these migration contracts intact:

- User-facing copy should say `Agent`; shared types should use `@/types/agent`. `@/types/assistant` is compatibility-only.
- User-facing copy may say `Team`, but Team APIs are still crew-backed. Use `/api/crews`, `contracts/crew.ts`, and crew tables until a deliberate migration exists.
- Routines are the product/control-plane model for scheduled work. Do not add feature-specific schedulers or permanent cron-style product paths.
- Work Graph owns goals, Kanban projections, dependencies, checkouts, PM federation, and work-item state.
- Agent Ops owns executable workflows, run evidence, findings, replay, quality gates, and operator outcomes.
- Browser QA is one workflow on top of Browser Operator, not the whole browser capability.
- Workspace Brain uses the existing Knowledge and shared context stores. Do not create a second memory system.

## 5. Plan The Smallest Safe Change

Before implementation, write down:

- Owning stack and secondary stacks.
- Contract/service/API/UI files expected to change.
- Whether a migration is required.
- Rollout flag or kill switch, if the blast radius is non-trivial.
- Existing tests or domain gate that should catch regressions.
- Documentation that must change with the behavior.

For small changes, this can be a short note in the PR or implementation summary. For larger work, update the relevant backlog item or plan.

## 6. Validate By Domain

Always run the narrowest meaningful gate, then widen if the feature crosses boundaries.

| Area | Command |
| --- | --- |
| TypeScript contracts/app | `npm run typecheck` |
| Standard PR gate | `npm run check:pr` |
| Docs-only | `git diff --check` |
| Work Graph | `npm run work-graph:production-hardening` |
| Agent Ops | `npm run agent-ops:quality-gates` |
| Knowledge/Brain | `npm run check:knowledge` |
| Channels | `npm run test:channels:smoke` |
| Worker channels | `npm run test:channels:smoke:full` |
| Browser smoke | `npm run test:e2e:smoke` |
| Self-host | `npm run selfhost:doctor` |
| Test inventory changes | `npm run test:inventory` |

Use `docs/TEST_MATRIX.md` when choosing deeper or staged gates.

## 7. Update The Right Docs

Update durable docs when behavior changes:

- Public/user behavior: `docs/platform/**`
- Stack ownership or dependency rules: `docs/stacks/**`
- Architecture contracts: `docs/architecture/**`
- Cross-cutting TODOs: `docs/BACKLOG.md`
- Active plan status: `docs/plans/INDEX.md`
- Generated Agent Ops capability docs: run `npm run agent-ops:capability-docs:check`

Do not hand-edit files in `docs/generated/`.

## Done Means

A new feature is ready for handoff when:

- It has one clear owning stack.
- It reuses the canonical contract/service boundary.
- It does not create duplicate durable state or duplicate product vocabulary.
- The relevant gate passes.
- The docs that describe shipped behavior match the code.
