# Lucid Knowledge

Lucid Knowledge is the shared brain for a workspace. It combines assistant memory, project facts, team operating knowledge, organization policy, documents, evidence, and source controls so agents can reuse what the team has already learned.

It is designed to work across channels, runtimes, and agent engines. OpenClaw, Hermes, Browser Operator, shared cloud runtimes, dedicated runtimes, and BYO runtimes consume bounded knowledge packets instead of each building a separate memory system.

The simple user-facing surface is **Workspace Brain** at `/<workspace>/knowledge`. The runtime-facing contract is the Brain facade in `src/lib/brain/*`. Both use the same existing Knowledge and Context stores; neither should introduce a parallel memory system.

The active claim governance surface includes create/list/get, status updates, supersede, evidence, explain, semantic indexing status, semantic conflict findings, channel-native `claims`, and channel-native `forget <id>` for archiving a claim by id.

Knowledge Claims can also carry typed metrics through `claim_metric`, `claim_value`, `claim_unit`, `claim_period`, and `observed_at`. These fields turn evidence-backed claims into queryable trajectories without creating a second analytics store. Runtime recall still receives bounded Knowledge packets; Mission Control and Brain Ops use the metric layer for scorecards, regressions, and operator findings.

## What Lucid Remembers

Lucid separates memory into clear labels:

- **Workspace Brain** is the product surface where users teach the workspace facts, documents, sources, and operating guidance.
- **Assistant memory** stores user or assistant-specific preferences, facts, and context.
- **Team brain** stores how a team works, who owns what, handoffs, and recent outcomes.
- **Project brain** stores project facts, decisions, evidence, and current truths.
- **Org policy** stores organization-wide rules, preferences, alerts, and recurring context.
- **Knowledge Claims** store evidence-backed facts, claims, hunches, bets, decisions, risks, and preferences with confidence, weight, holder, status, and lifecycle history.
- **Shared operating context** stores thesis, signals, feedback, Daily Intel, shared memory, decisions, policy, risks, and open questions across workspace, project, team, agent, and user scopes.
- **Documents** are source material from the knowledge base and connected systems.
- **Evidence** links knowledge back to runs, messages, files, URLs, screenshots, approvals, logs, transcripts, diffs, Commerce events, or proofs.
- **L2 proof** is reserved for verifiable or decentralized provenance when proof mode requires it.

Agent identity is separate from Lucid Knowledge. Agent identity documents describe the agent itself (`SOUL`, `USER`, `HEARTBEAT`, `MEMORY_POLICY`, `ACCESS_POLICY`, `TOOL_POLICY`, `CURRENT_CONTEXT`). Shared operating context describes the company, project, team, or work around the agent.

See [Agent Identity And Operating Context](../agents/operating-context.md) for the full scope model and API guide.

## Shared Operating Context

Shared operating context is the structured layer for current company and project knowledge that should influence agents without becoming agent identity.

Supported context scopes:

- `workspace`
- `project`
- `team`
- `agent`
- `user`

Supported record types:

- `thesis`
- `signal`
- `feedback`
- `daily_intel`
- `memory`
- `decision`
- `policy`
- `risk`
- `open_question`

At runtime, Lucid resolves an inherited context ladder from workspace to project to team to agent to user. Broader context provides defaults. More specific context can add or narrow policy and operating instructions. The resolved context is injected after agent identity and before volatile conversation context.

This lets a workspace carry company beliefs, a project carry current decisions, a team carry handoff rules, and an agent carry task-local feedback without mixing those layers into one unreviewable prompt blob.

## Lucid-L2 Proof Bridge

Lucid-L2 is a proof and portability backend, not the hot recall store. Normal answers read from local Knowledge first so latency and availability stay stable.

When `LUCID_KNOWLEDGE_L2_PROJECTION_ENABLED` is enabled on the shared worker, local Knowledge writes can enqueue safe projections to Lucid-L2 after the local write succeeds. The default policy is commitment-only for private, team, and project data. Public payload projection requires explicit opt-in, high trust, and federated/org visibility. Encrypted payload projection is supported when an encrypted payload is provided.

The bridge stores local proof pointers for Mission Control:

- namespace
- scoped user id and agent passport id when provided
- Lucid-L2 memory id
- content hash
- receipt hash
- snapshot CID
- anchor epoch id and transaction hash
- anchor and verification status

Projection is asynchronous through `knowledge_l2_projection_outbox`. The shared worker retries failed projections, requeues stale projecting rows, detects projected rows without receipts, and marks stale pending anchors for operator attention. If Lucid-L2 is unavailable or not configured, local Knowledge remains usable.

## Engine Homes

Lucid separates shared product knowledge from engine-native home state.

- **Lucid Knowledge** is authoritative for cross-channel and cross-runtime recall.
- **Hermes Engine Home** is HHV-local state such as `memories/MEMORY.md`, `memories/USER.md`, and local skill metadata.
- **OpenClaw Engine Home** is OHV state and remains evaluation/export-only until OpenClaw persistence is explicitly approved.
- **Lucid-L2 Proof** is the verifiable proof and portability layer.

Engine-home resources do not enter hot recall automatically. They are classified into safe resource types, summarized into redacted candidates, and shown in Mission Control for review. Operators can promote, reject, or ignore candidates. Promotion writes through the same Lucid Knowledge policies, role gates, provenance, and audit paths as manual knowledge corrections.

This prevents engine homes from bypassing channel ownership, runtime compatibility, source policy, plugin policy, approval policy, RLS, or encryption boundaries.

## Memory Quality Moat

Lucid Knowledge enriches every prompt packet with compact quality metadata so agents can answer with traceable context instead of invisible memory.

Each packet can explain:

- which layers were used, such as assistant memory, team brain, project brain, org policy, documents, evidence, engine home candidates, or L2 proof
- whether first-class Knowledge Claims were included as a separate `claims` layer with their own prompt budget
- the operational context ladder, including latest message, current run or task, project, team, org policy, owner, blocker, and next action when available
- confidence and source freshness for each memory item
- citation coverage, average confidence, stale-source count, contradiction count, and recommended quality status
- cost controls, including layer budgets, source quotas, TTL and retention hints, compaction and dedup recommendations, and storage-growth signals

This is implemented through the shared `KnowledgePromptPacket` contract, so channels and engines do not build their own memory scoring systems.

Mission Control shows a Memory Quality Moat panel with citation coverage, continuity coverage, correction actions, and benchmark status. This gives operators a short answer to "why does the agent believe this?" without exposing raw prompt internals.

## Corrections And Contradictions

Lucid treats memory correction as a governed operation, not a hidden rewrite.

Safe actions include:

- **Forget** for obsolete or unwanted facts
- **Correct** for replacing a wrong fact with auditable history
- **Promote** for moving reviewed evidence into a stronger layer
- **Demote** for lowering trust or reducing prompt priority
- **Archive** for keeping history while excluding live recall
- **Make verifiable** for projecting approved knowledge to Lucid-L2 proof flows

Contradiction candidates are detected across memory layers, project and team brain, org policy, engine-home candidates, and L2 proof references. Detection is deterministic and bounded; Lucid surfaces candidates for review instead of auto-rewriting shared truth.

Knowledge Claims also carry semantic governance metadata. Active claims can store a semantic fingerprint, semantic cluster key, embedding provider/model metadata, and embedding readiness status. Brain Ops uses that metadata to surface claim semantic-index findings when a claim is missing or blocked from semantic indexing, and semantic claim-conflict findings when nearby active claims in the same cluster disagree or compete for the same operational truth. Mission Control shows cluster identifiers, semantic index status, and conflict findings so operators can resolve, supersede, or archive claims with evidence instead of letting duplicate truths accumulate.

Metric-backed claims power the Knowledge Intelligence layer:

- `/api/knowledge/trajectory` returns deterministic time-series points, trend direction, weighted confidence, and regression alerts for a subject/metric.
- `/api/knowledge/scorecards` builds profile-specific entity scorecards for founders, companies, projects, agents, wallets, tokens, customers, and merchants.
- Founder scorecards combine evidence depth, consistency, freshness, trajectory quality, growth momentum, execution signals, red flags, and recommendations.
- Lucid Doctor includes metric regressions as Brain Ops findings so worsening trends reach the same operator queue as source, indexing, runtime, Browser, Commerce, and template issues.

## Mission Control Knowledge

Workspace operators can open **Mission Control → Knowledge** to see and manage the brain.

This page shows:

- scoped project and team knowledge
- source health and retrieval inclusion
- graph entities and capped relationship expansion
- Brain Ops maintenance findings
- evidence labels that explain why Lucid believes a fact
- memory quality, layer usage, confidence, freshness, continuity, and benchmark status
- Lucid-L2 proof receipts, snapshot lineage, and anchor status when projections exist
- Hermes/OpenClaw engine-home candidates that require review before promotion
- Knowledge Claims, Knowledge Think output, import jobs, eval receipts, external Knowledge client setup state, and global search matches where available
- typed claim trajectories, entity scorecards, founder scorecard signals, and regression warnings when metric-backed claims exist

Commerce events are first-class evidence. Agent Commerce writes lifecycle events to `agent_commerce_events` and mirrors them into Knowledge operation evidence with `evidence_kind: commerce_event`. When the Commerce entity is available, provenance includes project, assistant, run, request id, provider event id, budget reservation, ledger id, seller grant, idempotency key, outcome, status, amount, currency, and a bounded entity snapshot. Operators can find these through Global Search's `commerce` scope, inspect the Commerce detail drawer, attach the event to workspace/project/team context as thesis, signal, feedback, Daily Intel, risk, or memory evidence, and let manual Daily Intel generation include recent Commerce evidence in its input set.

Operators can also:

- add organization memory with **Remember this**
- remove obsolete organization memory with **Forget this**
- correct project or team knowledge with an auditable correction event
- search graph entities and expand direct relationships for provenance review
- run Brain Ops maintenance now through the shared worker job-control path
- synthesize scoped answers with Knowledge Think
- create, resolve, dismiss, archive, or supersede Knowledge Claims
- create, preview, and commit Knowledge import jobs for transcripts, artifacts, documents, and sessions
- replay active retrieval eval cases through the shared Knowledge retrieval path
- optionally attach durable eval receipts to Knowledge Think answers, with at least two successful judges required before Lucid records an authoritative pass/fail
- refresh due scheduled sources through the shared worker source-refresh job
- pause, archive, or exclude sources from retrieval
- acknowledge, resolve, or dismiss Brain Ops findings

## Self-Serve Knowledge Manager

Most users should start from **Workspace → Knowledge** at `/<workspace>/knowledge`.

This is the simple product surface for day-to-day Brain and Knowledge work:

- teach the workspace with one Brain intake that can classify text, readable files, URLs, and recall questions
- review suggested destinations before saving: operating guidance, facts, documents, sources, or recall tests
- add, edit, archive, or delete scoped facts
- choose an explicit workspace, project, team, or agent-facing scope when creating governed knowledge
- upload or paste documents into the existing RAG ingestion pipeline
- see clear indexing, failed-indexing, retrieval, paused, and archived states
- add, edit, approve, or archive sources with trust, visibility, federation, retention, and refresh policy
- test recall before agents answer customers

The self-serve manager does not create a second memory system. Brain Intake commits through `rememberBrain()`. Facts write to `org_board_memory`, operating guidance writes to `shared_context_records`, documents use RAG ingestion, sources use `knowledge_sources`, and recall tests call the shared retrieval path. Mission Control remains the advanced layer for graph exploration, L2 proof receipts, retrieval evals, Brain Ops findings, and engine-home candidate review.

Legacy `/<workspace>/ai/knowledge` traffic redirects to the new manager's document tab.

## Brain Runtime Contract

The Brain runtime facade is the stable interface for UI, OpenClaw, Hermes, BYO runtimes, local agents, and future engines.

Primary files:

- `src/lib/brain/schemas.ts`
- `src/lib/brain/query.ts`
- `src/lib/brain/remember.ts`
- `src/lib/brain/source-routing.ts`
- `src/lib/brain/health.ts`

Primary APIs:

- `POST /api/brain/query`
- `POST /api/brain/remember`
- `GET /api/brain/sources`
- `GET /api/brain/health`
- `POST /api/brain/intake/classify`
- `POST /api/brain/intake/commit`

Runtime behavior:

- `queryBrain()` delegates to `retrieveKnowledgeContext()` and `resolveSharedContext()` so agents receive a bounded `KnowledgePromptPacket` plus inherited operating guidance.
- `rememberBrain()` routes writes to the existing fact, guidance, source, and document stores.
- Source routing prefers explicit `source_id` or `source_key`, then project/team scoped sources, then workspace defaults, then virtual `workspace/default`.
- Runtime callers are audited through Knowledge operation events instead of engine-specific ledgers.
- Brain health summarizes source registry, knowledge seed, guidance seed, freshness, graph coverage, and provenance coverage for UI readiness states.

See [Brain Runtime Contract](brain-runtime.md) for the focused implementation guide.

## Project And Team Knowledge

Project pages show a **Project Knowledge** card with compiled project facts, evidence count, trust level, graph entities, and Brain Ops findings.

Team pages show **Team Knowledge** for crew objectives, roles, handoffs, and recent outcomes. Refreshing Team Knowledge seeds durable context from the team configuration and recent runs.

## Knowledge Graph

Lucid extracts deterministic graph entities and relationships from scoped knowledge so agents can use relationship-aware context without relying only on text similarity.

Mission Control includes an **Entity Graph** explorer. Operators can search people, projects, repos, URLs, agents, decisions, integrations, and topics, then expand direct inbound and outbound relationships. Expansion is capped and read-only. It uses the shared graph APIs instead of building a separate visualization store.

The graph is used as a retrieval boost, not as an unrestricted prompt dump. Runtime graph expansion remains bounded by source policy, scope, confidence, and prompt budget.

## Source Governance

Each knowledge source can carry visibility, trust level, federation policy, retention policy, refresh state, and retrieval inclusion. This helps Lucid avoid mixing private, stale, untrusted, or archived sources into agent prompts.

If a source is paused, archived, errored, or excluded from retrieval, it should not influence live recall.

Shared Knowledge operations also validate source URLs before governed writes. Localhost, private network ranges, cloud metadata hosts, and unsupported protocols are rejected by default so external/local agents cannot turn Knowledge ingestion into an SSRF or private-network access path.

Scheduled source refresh runs in the shared worker when `LUCID_KNOWLEDGE_SOURCE_REFRESH_ENABLED` is enabled. URL sources receive bounded metadata checks with HEAD requests, ETags, refresh windows, and stale markers. If a URL changes, Lucid marks the source stale so Brain Ops and operators can review or re-ingest it before high-confidence recall depends on it. Unsupported scheduled source types fail visibly instead of silently pretending to refresh.

## Transcript And Artifact Imports

Knowledge imports are a preview-first path for bringing external work products into Lucid without turning memory into a raw transcript dump.

Supported sources include Codex sessions, Claude Code sessions, Cursor exports, channel transcripts, browser artifacts, meeting notes, repo docs, CSV/TSV exports, and manual uploads.

The current flow is:

1. Create an import job with org/project/team scope and source type.
2. Preview the import through `/api/knowledge/imports/[id]/preview`.
3. Lucid parses raw text, structured items, JSON/JSONL, markdown/text, and CSV/TSV rows into bounded chunks, computes content hashes, dedupes duplicate payload content and previously imported content, and redacts likely secrets.
4. Operators inspect the preview summary in Mission Control Knowledge.
5. Commit through `/api/knowledge/imports/[id]/commit`.

The app routes, external HTTP endpoint, MCP facade, worker tools, and Agent Ops actions all dispatch import preview/commit through `executeKnowledgeOperation`. This keeps redaction, dedupe, lifecycle checks, and claim commit behavior identical across hosted, BYO, C2A, local, OpenClaw, Hermes, and future runtimes.

Commit currently writes previewed items as evidence-backed Knowledge Claims. Raw pasted content is not stored as the claim source; the commit uses redacted/capped preview content with provenance metadata linking back to the import job and item. This keeps imported knowledge reviewable, reversible, and safer than directly injecting pasted artifacts into live RAG retrieval.

Secret scanning covers private key blocks, authorization and cookie headers, OpenAI keys, Slack tokens, GitHub tokens, AWS access keys, Stripe keys, JWT-like tokens, npm tokens, Google API keys, and common `api_key`/`token`/`secret`/`password` assignments. Redaction metadata stores labels and offsets, not the original secret value.

## Brain Ops

Brain Ops is Lucid's maintenance loop for knowledge quality. It detects stale or failed sources, missing citations, stale compiled truth, stale/expired/evidence-free claims, claim semantic-index gaps, semantic claim conflicts, orphan graph entities, orphan relationships, contradiction candidates, degraded vector indexes, embedding dimension/provider drift, Lucid-L2 projection lag, and weekly briefing opportunities.

The source doctor writes `source_stale` and `source_sync_failed` findings into the same maintenance ledger. The embedding doctor uses the database-side `knowledge_embedding_doctor_stats` diagnostic function so workers can check missing embeddings and vector drift without selecting raw vectors. Claim semantic scans use bounded claim metadata and active-claim clusters to avoid unbounded vector reads in operator paths. L2 projection lag is also reported as a Brain Ops finding; local Knowledge remains usable, but proof freshness is marked degraded until the outbox recovers.

Brain Ops findings are operator-visible and auditable. Lucid does not automatically rewrite project knowledge, merge entities, or change source policy without an operator-approved follow-up action.

## Operation Contract

Lucid Knowledge has a shared operation contract for app APIs, worker tools, MCP-style tools, Agent Ops actions, and external agents.

The contract includes operations to retrieve context, think with Knowledge, explain knowledge, list/create/update Knowledge Claims, write project knowledge, write team knowledge, remember or forget organization context, list/create/preview/commit Knowledge imports, list or govern sources, inspect graph entities, expand graph neighbors, and triage Brain Ops findings.

This keeps every runtime and channel aligned. External agents should call the Knowledge operation API instead of directly reading memory tables, RAG chunks, source records, graph tables, evidence records, or L2 receipts.

Read operations are membership-gated. Write and governance operations require an admin or owner. `knowledge.think` is read-only by default, but persisting a claim from a Think result is treated as an admin/owner write.

## External Agents And Local Runtimes

BYO, C2A, local, and MCP-style agents should connect through scoped external Knowledge clients instead of using database credentials.

External clients receive:

- a scoped token
- allowed operation scopes such as `knowledge:read`, `knowledge:claims`, or `agent_ops:launch`
- optional project/team binding
- revocation state
- operation audit through the shared Knowledge operation/event path
- HTTP and MCP-style endpoints backed by the same operation runner
- a Mission Control setup card with one-time token display, copyable MCP config, and verify-connection action

The external operation endpoint can retrieve context, run Knowledge Think, create claims, and launch Agent Ops runs while preserving org/project/team scope and Mission Control provenance.

## Retrieval Evals

Lucid can measure Knowledge retrieval quality with retrieval eval cases and replay runs.

Eval cases define a scoped query, expected result ids, expected citation keys, required layers, and category. Supported categories are assistant preference, project fact, organization policy, source conflict, and evidence-heavy answers.

Replay runs measure:

- Precision@k
- Recall@k
- MRR
- nDCG
- citation accuracy
- top-1 stability
- latency delta

Failure types include missing source, wrong source, stale fact, cross-scope leak, no citation, bad citation, and slow retrieval.

Live query capture is opt-in. When enabled, Lucid stores a query hash, scrubbed preview, result ids, layers, citation keys, metrics, latency, and failure classes. It does not store raw prompts or unbounded retrieved content.

Operators can replay active eval cases from **Mission Control -> Knowledge**. The replay button calls the same `/api/knowledge/evals/replay` endpoint used by automation and records the run through the shared Knowledge eval tables, so UI, API, worker, and future channel launches measure recall the same way.

## Continuity And Benchmarks

Lucid Knowledge is designed for continuity across channels and runtimes.

Approved memory should follow the same scoped Knowledge contract across Discord, Telegram, Slack, WhatsApp, Teams, web, and future channels without leaking across users, teams, projects, or organizations.

OpenClaw, Hermes, Browser Operator, shared cloud, dedicated runtimes, and BYO runtimes should consume the same bounded `KnowledgePromptPacket` instead of reading memory, documents, evidence, engine homes, or L2 receipts directly.

Lucid keeps deterministic benchmark checks for recall quality, evidence, correction flows, cross-channel continuity, cross-runtime continuity, and cost visibility. These benchmarks are not marketing claims; they are regression guards that keep Memory/Knowledge product behavior tied to code.

## Production Hardening

Lucid Knowledge has a deterministic production-hardening gate:

```bash
npm run knowledge:production-hardening:check
```

This gate stress-checks mixed retrieval, hybrid fusion, retrieval evals, durable extraction jobs, Lucid-L2 projection behavior, Brain Ops scans, source/embedding/claim-semantic doctor coverage, noisy-channel duplicate suppression, and degraded dependency behavior.

Operators should use the [Knowledge production hardening runbook](production-hardening-runbook.md) before staging or production promotion. The runbook covers migration/RLS checks, live staging retrieval load with `npm run knowledge:staging-load`, queue backpressure, source cleanup, eval regressions, failed L2 projections, and accidental memory capture.

## Safety Model

Lucid Knowledge is not a raw transcript dump. Runtime state, browser sessions, engine-local memory, and private channel messages stay in their proper systems. Only compact, scoped, provenanced, policy-approved information should become shared knowledge.

This keeps memory useful without making it leaky, ambiguous, or tied to one specific agent engine.
