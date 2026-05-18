# Brain Runtime Contract

The Brain runtime is the canonical interface for storing and retrieving workspace knowledge across Lucid UI, agents, runtimes, and future engines.

It does not create a second knowledge system. It routes to the existing stores:

- Operating guidance: `shared_context_records`
- Facts and lightweight memory: `org_board_memory`
- Documents and chunks: RAG ingestion and `knowledge_pages`
- Sources and provenance: `knowledge_sources`
- Graph and evidence: `knowledge_entities`, `knowledge_relationships`, `knowledge_operation_events`

## Design Rules

- Engines call Brain through a stable contract, not direct tables.
- UI flows call the same contract as runtime flows.
- Brain writes are reviewable, provenanced, and reversible.
- Source routing is explicit when possible and falls back to the workspace default.
- Runtime callers are audited as external-agent surfaces so OpenClaw, Hermes, BYO, and future engines remain implementation-agnostic.

## Query

`POST /api/brain/query`

Returns a `KnowledgePromptPacket` plus resolved operating guidance.

Inputs:

- `org_id`
- `project_id`, `team_id`, `assistant_id`
- `source_id` or `source_key`
- `query`
- `layers`: `facts`, `guidance`, `documents`, `sources`, `graph`, `evidence`
- `budget`: latency, token, and item bounds

The implementation delegates to `retrieveKnowledgeContext()` and `resolveSharedContext()`.

Compatibility note: legacy `knowledge.retrieve_context` operation clients are still supported for worker tools, MCP-style tools, and external agents, but the operation executor now routes those reads through `queryBrain()` and returns only the packet for backward compatibility. New app/runtime code should call `queryBrain()` directly.

## Remember

`POST /api/brain/remember`

Writes to the correct existing store based on `kind`:

- `fact`: board memory
- `guidance`: operating context
- `document`: RAG ingestion
- `source`: source registry
- `recall_test`: not stored as memory

The workspace Brain intake UI also commits through this same path via `rememberBrain()`.

## Intake

`POST /api/brain/intake/classify`

Classifies one drop/paste payload into a structured preview before commit. The intake pipeline is:

1. deterministic extraction of text, URLs, and file metadata
2. optional AI planner behind `LUCID_BRAIN_INTAKE_AI_PLANNER_ENABLED`
3. duplicate/overlap detection
4. trust, freshness, priority, scope, and recommended-action ranking
5. source validation for unsafe/private URLs
6. review-sheet preview with warnings, citations, extracted facts, and recall impact

`POST /api/brain/intake/extract`

Extracts server-readable files for intake preview. Current production-safe extraction covers text, CSV, JSON, YAML, Markdown, and DOCX. PDFs and unsupported binary files return metadata-only items and require asynchronous document ingestion before they are searchable.

`POST /api/brain/intake/commit`

Commits selected preview items through `rememberBrain()`. Items recommended as `skip` are not stored. Recall tests open the recall path instead of becoming memory.

Design constraints:

- AI planning is additive and bounded; deterministic intake must work without it.
- Intake ranking is a preview/commit aid. Runtime ranking remains `queryBrain()` / `KnowledgePromptPacket`.
- No Brain intake code may write directly to Knowledge tables.
- No binary file may be silently saved as searchable knowledge unless text was actually extracted.

Verification:

```bash
npm run knowledge:brain-intake:check
```

The command first runs deterministic Brain intake unit/stress coverage, then executes `scripts/brain-intake-acceptance.mjs` against `SMOKE_BASE_URL` / `PLAYWRIGHT_BASE_URL` or `localhost:3000`. It requires `E2E_AUTH_STATE` or `.playwright/auth/user.json`, service-role Supabase credentials, and a running app. The acceptance path creates a temporary workspace, tests multi-destination classification, file extraction behavior, commit semantics, skipped recall tests, and the final `queryBrain()` packet.

## Source Routing

Source routing lives in `src/lib/brain/source-routing.ts`.

Resolution order:

1. Explicit `source_id` or `source_key`
2. Project/team scoped source
3. Workspace default source
4. Virtual `workspace/default`

This preserves GBrain-style source awareness without adding a parallel source table.

## Health

`GET /api/brain/health?orgId=...`

Returns a compact readiness report covering:

- Source registry
- Knowledge seed
- Guidance seed
- Source freshness
- Graph coverage
- Provenance coverage

This is for UI health states and Brain Ops triage, not a replacement for Knowledge Ops maintenance jobs.

## Files

- Runtime schemas: `src/lib/brain/schemas.ts`
- Query facade: `src/lib/brain/query.ts`
- Write facade: `src/lib/brain/remember.ts`
- Source routing: `src/lib/brain/source-routing.ts`
- Health facade: `src/lib/brain/health.ts`
- Intake planner/ranker/validator: `src/lib/brain-intake/*`
- Intake classify API: `src/app/api/brain/intake/classify/route.ts`
- Intake extraction API: `src/app/api/brain/intake/extract/route.ts`
- UI intake commit: `src/app/api/brain/intake/commit/route.ts`
- Boundary guard: `src/lib/brain/__tests__/brain-boundary.test.ts`
