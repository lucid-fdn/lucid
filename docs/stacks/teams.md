# Teams Stack

**Status:** Active
**Stack ID:** `teams`

Teams are Lucid's multi-agent actor graph. The current implementation is backed by `crew` contracts, routes, tables, and runtime tools. User-facing product copy should say Team, while code migration from `crew` to `team` remains a deliberate future change.

## Owns

- Team topology and membership.
- Coordinator semantics.
- Team run lifecycle.
- Team budget and concurrency limits.
- Team template deployment target.
- Team shared operating context and team context injected into runtimes.

## Does Not Own

- Single-agent setup.
- General workflow/DAG planning.
- Runtime engine internals.
- Commerce provider execution.

## Current Surfaces

- `contracts/crew.ts`: current crew-backed Team topology contracts, including `Team*` aliases and compatibility metadata.
- `src/app/api/crews/`: crew-backed Team APIs.
- `src/app/api/crews/[id]/context/route.ts`: team-scoped shared operating context API on the current Team route.
- `src/components/teams/crew-detail-client.tsx`: project team detail surface, including the Team Context manager.
- `src/components/operating-context/shared-operating-context-manager.tsx`: shared workspace/project/team context editor and inherited-context preview.
- `src/lib/db/crews.ts`: crew read/write helpers plus Team-named compatibility façades over the same tables.
- `src/lib/db/shared-context.ts`: resolved workspace/project/team/agent/user context ladder.
- `src/lib/crews/` and `src/lib/teams/`: role helpers and Team read-model helpers.
- `src/hooks/use-crews.ts`: existing `useCrews` hook plus `useTeams` alias over `/api/crews`.
- `worker/src/agent/runtime-tools/crew-context.ts`: runtime team context and `crew_complete` tool.
- `src/app/(app)/[workspace-slug]/projects/[project-slug]/teams`: project-scoped Teams surface.

## Compatibility Model

- `contracts/crew.ts` remains canonical and exports `Team`, `TeamMember`, `TeamEdge`, `TeamRun`, `TeamTopology`, `CreateTeamSchema`, `UpdateTeamSchema`, member/edge schemas, and `TEAM_COMPATIBILITY`.
- Team schema exports are identity aliases over the existing crew schemas; validation behavior is unchanged.
- `TeamTopology` includes both `team` and `crew` keys so product-facing code can say Team while callers that still expect `crew` can keep working.
- DB helper aliases such as `getTeams`, `getTeam`, `createTeam`, and `startTeamRun` delegate to the existing `crews`, `crew_members`, `crew_edges`, and `crew_runs` storage.
- New product-facing code should prefer Team names at component/domain boundaries while route handlers, migrations, worker context, and low-level persistence can remain crew-named.

## Migration Guardrails

- Do not broadly rename DB tables or API routes from `crews` to `teams` without a dedicated compatibility plan.
- Public copy may say Team while code keeps crew compatibility.
- `Team*` aliases live in `contracts/crew.ts`; do not introduce `contracts/team.ts` until the broader migration plan exists.
- Team topology enforcement must be explicit and tested.
- New Team API calls must pass `project_id`. The default-project fallback exists only for compatibility.
- Teams do not have agent identity documents. Use shared context records for team thesis, signals, feedback, Daily Intel, memory, decisions, policy, risks, and open questions.

## Integration Rules

- Templates instantiate Teams through TeamTemplate specs.
- Runtime injects team context into each member.
- AgentOps records team run and member lifecycle events.
- Shared operating context resolves through workspace → project → team → agent → user. Team context is one layer in that ladder, not a separate memory system.
- Commerce policies can apply at team scope, but execution still routes through Commerce.
- Mission Control is the operator surface for team health and intervention.

## Future Direction

Teams should become a reusable assembly target:

- team roles,
- topology,
- shared objective,
- shared memory policy,
- shared budget,
- approval policy,
- commerce policy,
- eval pack,
- default channels and integrations.
