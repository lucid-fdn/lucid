# Skills Directory

Domain-scoped skill bundles. Each subfolder is a self-contained integration that an agent can use.

## Folder Structure

```
skills/
├── README.md                  # This file
├── lucid-knowledge/           # Shared Memory/Knowledge operation contract guidance
└── polymarket/                # Example: Polymarket prediction markets
    ├── SKILL.md               # Agent guidance (seeded into skill_catalog)
    ├── tools/                 # Tool handlers (polymarket_trade, lucid_hedge, polymarket_automation)
    ├── services/              # Domain logic (CLOB client, CTF executor, trade logger, etc.)
    ├── crons/                 # Periodic jobs (balance sync, automation evaluator)
    ├── routes.ts              # Express endpoints (dashboard data, funding/withdrawal)
    └── __tests__/             # All tests for this skill
```

## SKILL.md Format

Every skill folder must contain a `SKILL.md` — the agent's guide for using the skill's tools. This file is:

1. **Mirrored into `skill_catalog`** for SaaS delivery and activation
2. **Discoverable on the filesystem** for standalone OpenClaw agents
3. **Exported as a canonical package** for MCPGate publication and mirrored back into Lucid as an engine-aware catalog entry

Important:
- the catalog/package layer is portable
- skill behavior is still engine-aware
- do not assume that one skill artifact has identical runtime semantics on every engine

Lucid treats skills as:
- a portable catalog/distribution object where possible
- an engine-native runtime artifact where necessary

That is why package variants and compatibility metadata exist.

### Frontmatter (required)

```yaml
---
slug: my-skill              # Unique identifier, used as skill_catalog.slug
name: My Skill Name         # Human-readable name
description: One-line description of what the skill teaches the agent
category: trading            # Category (trading, web3, productivity, etc.)
version: "1.0"
author: Lucid
---
```

### Frontmatter (recommended for first-party skills)

Use explicit runtime metadata for canonical export instead of relying on exporter defaults:

```yaml
---
trust_tier: lucid_first_party
capability_tier: tool_backed
engine_support:
  - engine: openclaw
    support_level: native
    runtime_flavors: [shared, c1_managed, c2a_autonomous]
    channel_ownership: [lucid_relay, runtime_native]
  - engine: hermes
    support_level: adapted
    runtime_flavors: [shared, c1_managed, c2a_autonomous]
    channel_ownership: [lucid_relay]
---
```

This metadata is used when exporting first-party skills into the canonical catalog. Keep it honest. Do not overstate engine parity.

### Body

Markdown content that teaches the agent **when and how** to use the skill's tools. Should include:

- **Core concepts** the agent needs to understand
- **Tool usage workflows** (step-by-step decision trees)
- **Examples** of correct tool invocations
- **Error handling** and recovery procedures
- **Required Tools** section listing tool names, actions, and descriptions (for standalone compatibility)

## Adding a New Skill

1. **Create the folder**: `worker/src/skills/<name>/`

2. **Write `SKILL.md`**: Agent guidance with YAML frontmatter (see format above)

3. **Add tool handlers** in `tools/`: Each file exports a handler function registered in `BuiltInToolExecutor.ts`

4. **Add services** in `services/`: Domain logic (API clients, executors, etc.)

5. **Add crons** in `crons/` (if needed): Register in `worker/src/cron/definitions.ts`

6. **Add routes** in `routes.ts` (if needed): Register in `worker/src/index.ts`

7. **Register tools**: Add schemas to `CommandsAllowlist.ts`, dispatch in `BuiltInToolExecutor.ts`

8. **Publish / mirror the skill**: Keep the local bundle for warm execution, and publish the canonical package metadata to MCPGate so Lucid can mirror it into `skill_catalog`. Internal admin sync now supports `publish_and_sync`, which exports embedded first-party skills to MCPGate and then mirrors the canonical catalog back locally. Production should call `/api/internal/skills/reconcile` on a schedule so the mirror stays current automatically.

9. **Add tests** in `__tests__/`: Tool smoke tests, service unit tests, cron tests

10. **Update imports**: Any external consumer (e.g., `platform-tools/index.ts`, `cron/definitions.ts`) should import from `skills/<name>/`
