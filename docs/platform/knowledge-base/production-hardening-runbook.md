# Lucid Knowledge Production Hardening Runbook

This runbook is for operators preparing Lucid Knowledge for staging or production promotion.

Use it when changing assistant memory, Team Brain, Project Brain, Org Brain, source governance, retrieval fusion, Knowledge Claims, Brain Ops, Lucid-L2 projection, engine-home projection, Commerce evidence, shared operating context, or Memory Quality Moat behavior.

## Fast Gate

Run the deterministic local gate first:

```bash
npm run knowledge:production-hardening:check
```

This gate covers:

- mixed retrieval stress across assistant memory, Team Brain, Project Brain, Org Brain, RAG, and graph expansion
- retrieval eval scoring and hybrid fusion regressions
- durable memory extraction queue behavior
- Lucid-L2 projection outage/retry behavior
- Brain Ops maintenance scans, including source, embedding, claim semantic, and L2 projection-lag doctors
- Commerce evidence inclusion in shared context and Daily Intel inputs
- noisy-channel duplicate memory job suppression

If this fails, fix code before touching staging.

## Staging Migration And RLS Check

Before production promotion, verify all Knowledge migrations are applied in staging:

- `20260506120000_assistant_memory_knowledge_safety.sql`
- `20260506123000_memory_extraction_jobs.sql`
- `20260506130000_knowledge_team_project_brain.sql`
- `20260506133000_knowledge_source_federation_policy.sql`
- `20260506140000_knowledge_entity_relationship_graph.sql`
- `20260506143000_knowledge_brain_ops_maintenance.sql`
- `20260506150000_knowledge_operation_events.sql`
- `20260506153000_knowledge_retrieval_evals.sql`
- `20260506160000_knowledge_l2_projection_bridge.sql`
- `20260506163000_knowledge_engine_home_projection_candidates.sql`
- `20260506193000_fix_org_board_memory_created_by_profile_fk.sql`
- `20260506193100_fix_knowledge_eval_runs_created_by_profile_fk.sql`
- `20260506193200_fix_engine_home_candidates_reviewed_by_profile_fk.sql`
- `20260507103000_agent_commerce_idempotency_updated_at.sql`
- `20260507110000_agent_identity_documents.sql`
- `20260507111000_shared_context_records.sql`
- `20260507121000_runtime_capability_plane.sql`
- `20260507130000_external_agent_os_foundations.sql`
- `20260507132000_knowledge_claim_brain_ops_maintenance.sql`
- `20260507133000_knowledge_import_items_content_hash_index.sql`
- `20260507134000_lucid_pack_resource_kinds_and_indexes.sql`
- `20260507135000_scheduled_task_versions.sql`
- `20260507136000_knowledge_embedding_doctor_stats.sql`
- `20260507137000_fix_assistant_memory_knowledge_safety_columns.sql`
- `20260507190000_runtime_maintenance_rehome_action.sql`
- `20260508100000_knowledge_claim_semantic_governance.sql`
- `20260508101000_lucid_pack_fork_uninstall_audit.sql`

RLS expectations:

- service role can enqueue and process memory extraction jobs
- service role can process L2 projection outbox rows and receipts
- members can read allowed Knowledge surfaces through product APIs
- admin/owner can mutate source governance, Brain Ops findings, corrections, and engine-home reviews
- non-admin members cannot mutate shared Knowledge governance
- users cannot read another org, project, team, assistant, scoped user, channel, or source-isolated memory
- shared context records, identity documents, Lucid packs, pack installs, pack resources, scheduled task versions, external Knowledge clients, imports, claims, claim evidence, and claim events stay org-scoped

## Retrieval Stress And Latency

Use mixed data during staging smoke:

- assistant memory for one scoped user
- Team Brain page
- Project Brain page
- org board memory
- at least one RAG document/chunk
- at least one graph entity and relationship

Expected behavior:

- hot recall returns within the configured packet latency budget
- prompt packet stays under `maxPromptTokens`
- no layer performs an unbounded scan
- graph expansion is capped
- L2 proof and engine-home projection do not block hot recall
- degraded embeddings or RAG timeout still produce bounded fallback context when local knowledge exists

Run the live read-only staging harness against the target Supabase environment:

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
OPENAI_API_KEY=... \
npm run knowledge:staging-load -- \
  --target staging \
  --org-id <org-id> \
  --project-id <project-id> \
  --iterations 50 \
  --concurrency 5 \
  --warmup-iterations 5 \
  --max-p95-ms 900 \
  --required-layers project_brain,org_brain
```

The harness runs warmup samples before measured samples by default so cold TLS/DB/cache-fill cost is visible but does not distort steady-state p95. Set `--warmup-iterations 0` only when intentionally testing cold-start retrieval.

The harness calls the shared `retrieveKnowledgeContext()` path, records p50/p95/max latency, failure rate, empty packets, timeouts, fallback usage, and layer coverage. It is read-only by default and fails if required layers are missing, p95 is over budget, timeouts occur, or packets are empty unless `--allow-empty` is explicitly passed.

## Queue Backpressure

Watch durable job queues before increasing concurrency:

- pending depth
- failed depth
- claimed jobs older than the lease timeout
- dead-letter rows
- retry pressure
- oldest pending age

Safe behavior:

- duplicate enqueue returns `duplicate`, not an error
- repeated external channel messages reuse the same idempotency key
- failed jobs use capped backoff
- dead-letter rows stay visible for operator triage
- stale claimed jobs are reset before new claims

If backlog grows:

1. Keep user-facing memory extraction off the reply latency path.
2. Lower worker concurrency or batch size if retry pressure is high.
3. Inspect `last_error` and `result_summary`.
4. Fix the upstream failure before requeueing dead letters.
5. Do not bypass idempotency keys to "catch up" faster.

## Knowledge Source Cleanup

Use source cleanup when a source is stale, noisy, untrusted, or should no longer influence recall.

Preferred actions:

- pause a source for temporary exclusion
- archive a source when it should stay in history but leave live recall
- set `include_in_retrieval=false` for sources that should remain visible but not injected
- correct compiled truth with an auditable event instead of editing history silently
- preserve source evidence labels so future answers can explain provenance

Do not delete source rows as the first response unless retention policy requires deletion.

## Eval Regression

When retrieval quality regresses:

1. Capture the failing query as a scrubbed eval case.
2. Add expected item ids, citation keys, required layers, and failure class.
3. Replay with `npm run knowledge:retrieval-evals:check`.
4. Inspect failures for missing source, wrong source, stale fact, cross-scope leak, no citation, bad citation, or slow retrieval.
5. Fix fusion, source policy, graph expansion, or prompt-packet ranking with deterministic tests.

Never store raw prompts or unbounded retrieved content in eval capture rows.

## Claim Semantic Governance

Use this when Knowledge Claims become duplicated, contradictory, or hard to retrieve.

Expected behavior:

- active claims can carry a semantic fingerprint, semantic cluster key, embedding metadata, and embedding readiness status
- missing or blocked semantic indexing appears as a Brain Ops claim semantic-index finding
- nearby active claims with conflicting titles, bodies, statuses, or confidence levels appear as semantic claim-conflict findings
- Mission Control shows semantic status and conflict findings without selecting raw vectors
- operators resolve by superseding, resolving, archiving, or lowering trust; Lucid does not silently merge claims

If claim conflict noise grows:

1. Check import jobs and channel `remember` usage for duplicate source payloads.
2. Inspect claim evidence and explain output before changing status.
3. Prefer `superseded` with a replacement link when a better claim now exists.
4. Prefer `resolved` for handled risks or open questions.
5. Add focused eval cases for claims that should remain retrievable.

## Failed Lucid-L2 Projection

Lucid-L2 is a proof and portability backend, not the hot recall path.

If projection fails:

- verify `LUCID_KNOWLEDGE_L2_PROJECTION_ENABLED`
- verify `LUCID_KNOWLEDGE_L2_API_URL`
- verify token/auth only if the endpoint requires it
- inspect `knowledge_l2_projection_outbox.last_error`
- inspect attempts and `next_attempt_at`
- verify receipts exist for projected rows
- verify stale pending anchors are marked for review

Safe fallback:

- local Lucid Knowledge remains authoritative
- projection failures should not block answers
- private/team/project data should remain commitment-only or encrypted unless explicit public projection policy is approved

## Accidental Memory Capture

Use this when sensitive, wrong, or unwanted information was remembered.

Immediate response:

1. Identify the layer: assistant memory, Team Brain, Project Brain, Org Brain, source page, engine-home candidate, or L2 proof pointer.
2. Use the safest action: forget, correct, demote, archive, or source-exclude.
3. Preserve an audit event for shared/team/project/org knowledge.
4. If L2 projection exists, mark the local pointer and receipt state; do not assume decentralized data can be erased.
5. Add a retrieval eval or Brain Ops finding if the issue could recur.

Do not silently rewrite shared memory without provenance.

## Production Promotion Checklist

- `npm run knowledge:production-hardening:check` passes
- `npm run knowledge:memory-moat:check` passes
- `npm run knowledge:engine-home:check` passes
- `npm run knowledge:l2-projection:check` passes if projection code changed
- staging migrations are applied
- staging RLS checks pass
- noisy-channel replay does not duplicate extraction jobs
- degraded embedding/RAG/L2/DB scenarios do not block hot recall
- Mission Control Knowledge shows evidence, quality, source policy, Brain Ops findings, claim semantic status/conflicts, L2 receipts, and engine-home candidates correctly
- Mission Control Commerce shows event provenance and context attachment correctly when Commerce changed
- Daily Intel previews include recent Commerce evidence when relevant
- Lucid Pack fork/uninstall audit surfaces remain visible if pack governance changed

## Latest Accepted Live Load Shape

The live load gate should stay read-only and use `retrieveKnowledgeContext()` through `npm run knowledge:staging-load`. A representative production-ready command is:

```bash
npm run knowledge:staging-load -- --org-id <org-id> --project-id <project-id> --iterations 50 --concurrency 5 --required-layers project_brain,org_brain
```

Accepted 2026-05-07 Railway-backed smoke shape:
- 50 iterations
- concurrency 5
- required layers `project_brain` and `org_brain`
- 0 failures
- 0 fallback-only recalls
- p95 around 551 ms, with one cold/max sample around 1337 ms

Keep the exact budget environment-specific, but investigate sustained p95 regressions, fallback-only recalls, duplicate memory jobs, L2 projection failures, RLS errors, or source-policy bypasses before promotion.

`generateEmbedding()` has a short promise-coalesced cache for repeated hot recall queries. This is a latency guard, not a semantic cache for Knowledge results. Set `LUCID_EMBEDDING_CACHE_TTL_MS=0` only when diagnosing uncached provider behavior.
