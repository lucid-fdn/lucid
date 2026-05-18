# Crew To Team Compatibility Migration

**Date:** 2026-05-02
**Status:** Planned / gated
**Related backlog:** `TEAMS-P1-001`, `REORG-P2-003`
**Canonical contract today:** `contracts/crew.ts`

## Goal

Move product language from Crew to Team without breaking existing routes, tables, runtime context, generated app bindings, worker tools, or customer URLs.

This migration is deliberately staged. The current delivered state is a compatibility alias layer:

- `contracts/crew.ts` exports `Team*` type and schema aliases.
- `src/lib/db/crews.ts` exports Team-named helper aliases over existing crew tables.
- `src/hooks/use-crews.ts` exports `useTeams` over `/api/crews`.
- `src/lib/teams/read-model.ts` exports Team read-model aliases.
- `contracts/team.ts` does not exist.

Compatibility invariant: contracts/team.ts does not exist.

## Non-Goals

- No immediate table rename from `crews` to `teams`.
- No immediate route rename from `/api/crews` to `/api/teams`.
- No generated app or runtime tool breakage.
- No broad worker prompt rename while `crew_complete` and `crew-context` remain runtime contracts.

## Compatibility Matrix

| Layer | Current stable surface | Future product-facing alias | Migration rule |
| --- | --- | --- | --- |
| Shared contracts | `contracts/crew.ts` | `Team*` exports from `contracts/crew.ts` | Keep aliases in the canonical crew file until route/table migration is complete. |
| New contract file | none | `contracts/team.ts` | Blocked by boundary tests until this spec is upgraded to an execution plan. |
| API list/create | `/api/crews` | `/api/teams` | Add `/api/teams` only as a compatibility wrapper after route tests cover both paths. |
| API detail | `/api/crews/:id` | `/api/teams/:id` | Preserve `/api/crews/:id`; add redirects or wrappers, never a hard cutover first. |
| API members | `/api/crews/:id/members` | `/api/teams/:id/members` | Preserve request/response shape; response may include both `crew` and `team` keys during migration. |
| API edges | `/api/crews/:id/edges` | `/api/teams/:id/edges` | Keep topology fields stable: `source_member_id`, `target_member_id`, `direction`. |
| API runs | `/api/crews/:id/runs` | `/api/teams/:id/runs` | Preserve run state machine and idempotency semantics. |
| Tables | `crews`, `crew_members`, `crew_edges`, `crew_runs`, `crew_run_members` | optional views or later renamed tables | Start with read-only SQL views if needed; physical rename requires downtime/rollback plan. |
| Worker context | `crew-context`, `crew_complete` | Team wording in prompts | Keep tool names stable until runtime tool aliasing is released and observed. |
| UI URLs | `/mission-control/crews/*`, project `/teams/*` | `/mission-control/teams/*` | Add redirects and route tests before removing old paths. |
| AgentOps | `team_lifecycle` event class with crew event types | Team event types | Add new event types as aliases, keep old event parsing. |

## Migration Phases

### Phase 0: Alias Layer

Status: delivered.

- Product-facing code can import `Team`, `TeamMember`, `TeamRun`, `CreateTeamSchema`, and related aliases from `@contracts/crew`.
- DB helpers expose `getTeams`, `getTeam`, `createTeam`, `startTeamRun`, and related aliases.
- Boundary tests block `contracts/team.ts`.

### Phase 1: Route Alias Preview

Add `/api/teams` route wrappers that delegate to existing `/api/crews` handlers or shared services.

Acceptance:

- `/api/crews` remains canonical and tested.
- `/api/teams` returns the same status codes, auth behavior, validation behavior, and response payloads.
- Tests cover list/create/detail/update/delete/members/edges/runs on both route families.
- OpenAPI/docs call `/api/teams` product-facing while noting `/api/crews` compatibility.

### Phase 2: Response Shape Bridge

Return `team` aliases in new route payloads while keeping `crew` keys where existing clients expect them.

Acceptance:

- New route payloads can include `{ team, crew }` during the bridge.
- Existing `/api/crews` clients do not need code changes.
- Generated app and runtime operator routes use Team wording at boundaries but preserve internal IDs.

### Phase 3: Optional DB View Layer

If SQL ergonomics justify it, add compatibility views:

- `teams` view over `crews`,
- `team_members` view over `crew_members`,
- `team_edges` view over `crew_edges`,
- `team_runs` view over `crew_runs`,
- `team_run_members` view over `crew_run_members`.

Acceptance:

- Views are read-only unless explicit write rules are tested.
- RLS behavior is equivalent to base tables.
- Existing queries against base tables remain untouched.
- Rollback is dropping views only.

### Phase 4: Physical Rename Decision

Only consider a physical table/route/contract rename after at least one release has shipped with route aliases and response bridge telemetry.

Acceptance:

- All callers have moved to Team names.
- API analytics show no meaningful `/api/crews` external use.
- Worker tools have Team aliases and backwards-compatible `crew_complete`.
- A migration plan includes RLS, foreign keys, indexes, triggers, functions, generated types, rollback, and downtime risk.
- The boundary script is updated in the same PR.

## Required Tests Before Any Rename

- Contract alias tests: Team schemas remain compatible with crew schemas.
- Route alias tests: `/api/teams` and `/api/crews` produce equivalent validation/auth behavior.
- DB migration tests: RLS, indexes, triggers, and RPCs still work.
- Runtime tests: `crew-context` and future Team aliases both resolve active membership.
- AgentOps tests: old and new event names classify into `team_lifecycle`.
- UI routing tests: old URLs redirect or render a compatibility page.

## Rollback Policy

The first rollback line is aliases, not data movement.

- Route aliases can be removed only while `/api/crews` remains.
- View aliases can be dropped without touching base tables.
- `contracts/team.ts` can only be introduced after `contracts/crew.ts` keeps re-export compatibility for a full release window.

The migration is successful when product-facing code can say Team everywhere while old crew-backed integrations continue to run without awareness of the rename.
