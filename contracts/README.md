# Contracts

Shared TypeScript types for the worker ↔ app boundary. Both `src/` (Next.js) and `worker/src/` import from here.

**Import alias**: `@contracts/` (configured in tsconfig). Never use relative `../../contracts/`.

## Files

| File | Exports | Used By |
|------|---------|---------|
| `assistants.ts` | `AssistantConfig`, `AssistantStatus` | Agent runtime, Mission Control |
| `channels.ts` | `ChannelType`, `ChannelConfig` | Channel adapters, MC integrations page |
| `crew.ts` | `CrewConfig`, `CrewRunStatus` | Crew mode (v1a-v1c) |
| `events.ts` | `InboundEvent`, `OutboundEvent`, `FeedEvent` | Processors, Mission Control feed |
| `integration.ts` | `IntegrationConfig`, `NangoProvider` | OAuth tools, Nango actions |
| `introspection.ts` | `IntrospectionResult` | Agent debugging |
| `launchpad.ts` | `LaunchedAgent`, `TradeEvent` | Lucid Launch |
| `oauth-tools.ts` | `OAuthToolDefinition` | Nango tool execution |
| `oauth-tools-catalog.ts` | `OAuthToolCatalog` | Available OAuth actions |
| `plugin.ts` | `PluginManifest`, `PluginWireFormat`, `toWireToolName()` | Plugin system (3-tier) |
| `skill.ts` | `SkillRow`, `SkillActivation` | Skill catalog |
| `unified-skill.ts` | `UnifiedSkillItem`, `assignSection()` | Unified Skills UI |
| `runtime-capability.ts` | Adapter identity, native capabilities, runtime services, probes, parser status, command spec, EHV policy | Mission Control, worker heartbeat, BYO bridge, runtime adapters |
| `runtime-execution.ts` | Runtime execution context, runtime flavor, channel ownership, engine identity | App/worker runtime routing |
| `engine-home.ts` | Engine Home snapshot, diff, archive, commit, rollback contracts | EHV/HHV/OHV, runtime management commands |

## Rules

- **No runtime code** — types and pure functions only (no DB, no side effects)
- **No breaking changes without coordination** — both app and worker consume these
- **Barrel export** via `index.ts` — always import from `@contracts/` not individual files
- **Capability-first runtime UX** — product code should consume runtime capabilities, services, probes, parser status, EHV policy, and command states instead of hardcoding OpenClaw/Hermes behavior.
- **EHV boundaries** — engine-local home state crosses app/worker/runtime boundaries through `engine-home.ts` contracts only. Do not add one-off Hermes/OpenClaw file payloads to unrelated contracts.
