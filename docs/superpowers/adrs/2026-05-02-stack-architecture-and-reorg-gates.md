# ADR: Stack Architecture And Reorg Gates

**Date:** 2026-05-02
**Status:** Accepted
**Related backlog:** `REORG-P2-001`, `REORG-P2-002`, `REORG-P2-004`
**Related docs:** `docs/stacks/README.md`, `src/config/lucid-stacks.ts`, `scripts/validate-stack-boundaries.ts`

## Context

LucidMerged now has multiple large product stacks: Agent Commerce, App Service, Runtime, Templates / Assemblies, Teams, Mission Control, AgentOps, Trust, Data, and Providers. The codebase needs GStack-style capability clarity, but it also has live historical surfaces: `src/app/api/crews`, `contracts/crew.ts`, runtime tools, Supabase migrations, generated app routes, and Commerce ledgers.

A broad physical reorganization right now would create a lot of churn exactly where we need stability: money-moving ledgers, runtime tools, generated public routes, and Team compatibility. The useful boundary is logical first: shared stack IDs, rich stack metadata, docs, import-boundary tests, and migration plans.

## Decision

LucidMerged stays a single coherent monorepo for now.

Agent Commerce must not be split into a separate repo before these interfaces are stable:

- provider-neutral contracts,
- ledger and entitlement migrations,
- public/internal/webhook API route contracts,
- runtime commerce tools,
- provider adapter interfaces,
- reconciliation and launch gates,
- operational dashboards and security review gates.

Broad physical moves are gated. Do not move route families, shared contracts, worker runtime tools, or stack libraries just to make the tree look cleaner. A physical move requires:

- an ADR or migration note explaining the move,
- stack docs updated before the move,
- import-boundary tests updated before the move,
- backwards-compatible route/export aliases where callers already depend on old names,
- a rollback path for migrations or generated app route surfaces,
- a focused test plan that covers affected public/internal/runtime boundaries.

Do not introduce a top-level physical `stacks/` layout yet. `docs/stacks/` remains the canonical stack map. Code continues to live in the existing layout:

- `contracts/` for framework-free schemas,
- `src/lib/<domain>/` for control-plane domain logic,
- `src/app/api/<route-family>/` for route surfaces,
- `worker/src/<runtime-area>/` for runtime execution,
- `packages/` for publishable SDKs and reusable runtime surfaces,
- migrations under existing migration directories.

## Consequences

Good:

- Keeps Agent Commerce and App Service close to existing auth, billing, runtime, and migration surfaces.
- Preserves deploy/test ergonomics while contracts stabilize.
- Reduces the risk of breaking generated app routes, runtime tool imports, or money-moving paths.
- Gives open source contributors clear stack boundaries without asking them to learn a brand-new physical tree.

Tradeoffs:

- The repo remains historically named in places such as `crews`.
- Product-facing Team names and code-facing crew compatibility coexist for a while.
- Some files remain physically outside their logical stack until a future migration is worth the churn.

## Revisit Triggers

Revisit a physical stack layout only after all of the following are true:

- Commerce, App Service, Runtime, and Templates have stable contracts and stack metadata.
- Boundary scripts run in CI and cover shared contracts, runtime tools, generated app routes, Commerce execution paths, and Lucid-L2 P0 exclusion.
- Crew-to-Team compatibility has a migration plan covering routes, tables, types, redirects, API compatibility, data migration, telemetry, and rollback.
- At least one release has shipped with the logical stack boundaries without repeated developer confusion.
- A concrete move proposal shows lower long-term complexity than maintaining the current layout.

Until then, optimize for composable contracts, explicit ownership, and small safe moves.
