# 2026-05-08 Knowledge, Brain Ops, and Pack Governance Release Notes

## Scope

This release closes the semantic Knowledge, Brain Ops, policy inheritance, and Lucid Pack governance phase.

- Knowledge claims now carry semantic fingerprints, cluster keys, embedding provider/model metadata, and embedding readiness status.
- Brain Ops now emits claim semantic-index findings and semantic claim-conflict findings.
- Workspace, project, team, and agent operating context surfaces show inherited policy previews and override warnings.
- Agent operating context now shows the merged policy block that is actually fed into runtime prompt sections.
- Mission Control Knowledge now shows semantic claim conflicts, claim cluster identifiers, and semantic index status.
- Lucid Pack installs can reconcile, uninstall with audit preservation, and fork drifted managed resources before local ownership.
- Mission Control Agent Ops now keeps managed pack governance visible even when full Agent Ops workflows are plan-gated.
- Knowledge import preview supports CSV/TSV rows and broader secret redaction before commit.
- Agent Commerce GA evidence was refreshed for the 2026-05-08 rollout packet.

## Database Migrations

Applied to the active linked Supabase project:

- `supabase/migrations/20260508100000_knowledge_claim_semantic_governance.sql`
- `supabase/migrations/20260508101000_lucid_pack_fork_uninstall_audit.sql`

The linked Supabase dry-run reported the remote database up to date after application.

## Verification

Passed on the final worktree:

- `npm run typecheck`
- `npm --prefix worker run typecheck`
- Focused Vitest:
  - `src/lib/db/__tests__/knowledge-claims-semantic.test.ts`
  - `src/lib/knowledge/__tests__/imports.test.ts`
  - `src/app/api/agent-ops/packs/__tests__/route.test.ts`
  - `src/lib/db/__tests__/shared-context-daily-intel.test.ts`
- Worker Brain Ops Vitest:
  - `npm --prefix worker run test -- --run src/jobs/__tests__/brain-ops.test.ts`
- `npm run test:app-smoke:spawned`
- Authenticated Playwright:
  - `operating-context-brain-flow.spec.ts`
  - `commerce-context-evidence.spec.ts`
  - `agent-ops-pack-fork.spec.ts`
- `npm run knowledge:production-hardening:check`
- `AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_REQUIRE_READY=true npm run agent-commerce:ga-final-local-gate`
- `npm run build`

## Notes

- The previous spawned dev smoke flake was fixed by using `GET /login` instead of `HEAD /login`, matching how the login route is compiled and served in Next dev.
- The first production build attempt compiled successfully but failed page-data collection due to stale generated `.next` state. Clearing `.next` and rerunning produced a clean production build.
- Agent Commerce final local gate requires explicit evidence-file env vars; this run used `ops/agent-commerce/evidence/rollout-2026-05-08/ga-release-dossier-verification.json` and wrote `ops/agent-commerce/evidence/rollout-2026-05-08/ga-final-local-gate.json`.
