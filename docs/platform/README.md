# Lucid Platform Documentation

User-facing documentation for the Lucid AI platform. Structured for RAG ingestion, export as a standalone docs site, or inclusion in a separate repository.

## Structure

```
platform/
├── getting-started/          # Onboarding & first steps
│   ├── quickstart.md
│   ├── workspaces.md
│   ├── how-lucid-works.md
│   └── your-first-agent.md
├── agents/                   # AI agent creation & management
│   ├── overview.md
│   ├── create-and-configure.md
│   ├── channels.md
│   ├── memory.md
│   ├── operating-context.md
│   ├── models.md
│   └── scheduled-tasks.md
├── plugins/                  # Plugin & integration system
│   ├── overview.md
│   ├── install-and-activate.md
│   └── built-in-plugins.md
├── knowledge-base/           # RAG knowledge base
│   ├── overview.md
│   ├── lucid-knowledge.md
│   ├── external-agents.md
│   ├── manage-documents.md
│   └── production-hardening-runbook.md
├── release-notes/            # Release evidence and operator-facing change notes
│   └── 2026-05-17-routine-control-plane.md
├── mission-control/          # Fleet operations
│   ├── overview.md
│   ├── command-center.md
│   ├── approvals.md
│   ├── health-scores.md
│   ├── cost-controls.md
│   ├── dedicated-runtimes.md
│   └── runtime-parity-verification-2026-05-08.md
├── ops-safety.md             # Developer guardrails for external exec and safe removal
├── agent-ops/                # Operating workflows and evidence
│   ├── overview.md
│   ├── browser-qa.md
│   └── production-runbook.md
├── integrations/             # Channel setup guides
│   ├── telegram.md
│   ├── discord.md
│   ├── teams.md
│   ├── whatsapp.md
│   ├── imessage.md
│   ├── slack.md
│   └── web-chat.md
├── workflows/                # Visual workflow builder
│   └── overview.md
├── billing/                  # Plans, limits, runtime model & payments
│   ├── plans-and-limits.md
│   └── runtime-model-matrix.md
└── api/                      # API reference
    └── overview.md
```

## Conventions

- Each file is a self-contained document with a clear title and purpose.
- Headings follow a consistent hierarchy (`#` title, `##` sections, `###` subsections).
- Written for end users, not developers.
- No internal implementation details — focus on what users can do and how.
- Structured for optimal RAG chunking (one concept per section, ~200-500 words per heading).
- Agent Ops docs should describe the product workflow layer and link to Mission Control for evidence/replay.
- Browser Operator docs should make clear that Browser QA is one workflow on top of the broader browser capability.
- Agent Ops production docs should keep the current Railway split-service shape, Browser Operator smoke, channel launch smoke, and authenticated UI-smoke boundary explicit.
- Agent identity and operating context docs should keep agent-only identity documents separate from workspace/project/team shared context. Workspaces, projects, and teams do not have `SOUL`, `USER`, `HEARTBEAT`, `MEMORY_POLICY`, `ACCESS_POLICY`, `TOOL_POLICY`, or `CURRENT_CONTEXT` identity documents.
- Heartbeat docs must distinguish Pulse orchestration, runtime heartbeat, and agent heartbeat. Do not rename agent `HEARTBEAT` to check-in or operating state.
- Channel-native Agent Ops docs should use each platform's native command shape: Slack `/lucid check <url>` / `/lucid buy <request>`, Telegram `/check <url>` / `/buy <request>`, Discord `/ops workflow:check-page target:<url>` / `/ops workflow:buy target:<request>`, and WhatsApp/Teams/iMessage `check <url>` / `buy <request>`. Do not imply every platform has a literal `/lucid check` command.
- Memory/Knowledge plan items should not be described as shipped platform behavior until implementation docs and product surfaces exist. Currently shipped capabilities include scoped semantic assistant recall, KnowledgePromptPacket engine consumption, optional durable memory extraction jobs, Team/Project Brain compiled-truth surfaces, source/federation policy APIs, scheduled source refresh jobs, shared hybrid Knowledge retrieval fusion, Knowledge Claims with evidence/explain/supersede/resolve/archive, semantic claim fingerprints/clusters/embedding status, claim semantic-index and semantic-conflict Brain Ops findings, CSV/TSV-aware import preview with broader secret scanning, the entity/relationship graph substrate, Mission Control graph exploration, Brain Ops maintenance findings, a Mission Control Knowledge operator page with worker-triggered manual Brain Ops runs and one-click retrieval eval replay, a shared Knowledge operation contract, deterministic retrieval evals with scrubbed opt-in capture, Commerce events mirrored as Knowledge evidence and attachable to shared context, Daily Intel generation with recent Commerce evidence inputs, the local-first Lucid-L2 projection bridge, EHV/HHV/OHV engine-home candidate review, Lucid Pack fork/uninstall governance, the Memory Quality Moat for layer citations, context-ladder explanations, confidence/freshness scoring, contradiction candidates, correction actions, continuity checks, benchmarks, and cost controls, plus the production-hardening gate/runbook and live staging retrieval-load harness for retrieval stress, queue pressure, noisy-channel dedupe, degraded dependency behavior, migration/RLS staging checks, and operator recovery.
- Knowledge Intelligence docs may describe typed metric claims, trajectories, founder/entity scorecards, Lucid Doctor, and Needs Human as shipped platform behavior. Keep those docs clear that Doctor/Inbox aggregate existing ledgers rather than creating parallel diagnostic state.
- Developer ops docs should route external command execution and destructive cleanup through `@lucid/ops-safety`; keep `npm run audit:external-exec` and `npm run audit:safe-remove` green before release.
- Runtime docs should use the 2026-05-08 runtime parity record as the current verification source for OpenClaw/Hermes, shared/dedicated/BYO, EHV/HHV/OHV, management commands, re-home, TrustGate/BYOK, Runtime Detail, and sanitizer behavior.
- Routine docs should treat `docs/architecture/routine-kernel.md` and `docs/platform/release-notes/2026-05-17-routine-control-plane.md` as the current source for scheduled work. `cron` is a trigger/storage compatibility term; Routine is the product/control-plane term.

## Ingestion

Platform docs are ingested as system-scope RAG documents visible to all organizations:

```bash
npx tsx scripts/ingest-platform-docs.ts
```

## License

AGPL-3.0 — see [LICENSE](../../LICENSE) in the repository root.
