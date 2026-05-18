# Unified Skills UI — Design Spec

**Date**: 2026-03-25
**Status**: Design — approved direction, implementation pending
**Scope**: Merge Plugins, Skills, and Integrations tabs into a single unified "Skills" experience

## 1. Problem Statement

The assistant detail page has three separate tabs for managing agent capabilities:

- **Plugins tab** (`PluginManager`) — 19 embedded MCP plugins from `plugin_catalog`
- **Skills tab** (`SkillManager`) — 58 prompt-only playbooks from `skill_catalog`
- **Integrations tab** (`OAuthToolsTab`) — Legacy `assistant_oauth_bindings` UI for Nango OAuth

Additionally, **built-in platform tools** (Hyperliquid, Polymarket, wallet, DEX, web3-operator — 30+ tools) are hardcoded in `BuiltInToolExecutor.ts` and invisible in the UI entirely.

### Problems

1. **Users don't care about transport** — MCP, Nango, REST, prompt injection are implementation details. Users want "things my agent can do."
2. **Three tabs for one concept** — Plugins, Skills, Integrations are three UIs for capability management. Confusing for users.
3. **Built-in tools are invisible** — Major platform capabilities (Hyperliquid perpetuals, Polymarket predictions, wallet transfers, DEX swaps) don't appear anywhere in the UI.
4. **Integrations tab is stale** — Runtime now goes through plugin governance (Nango unification shipped), but UI still shows legacy `assistant_oauth_bindings`.
5. **Naming mismatch** — Internal "plugins" should be user-facing "skills". Internal "skills" are really "playbooks" (prompt-only, no execution).

### Goal

> **Users manage Skills. The platform manages tools, integrations, MCP, and prompts.**

One tab. One concept. Transport is invisible. Every capability — whether it's an MCP server, a Nango integration, a built-in platform tool, or a prompt playbook — appears in the same unified list.

## 2. Product Model

### 2.1 Single Concept: Skills

"Skill" is the only user-facing category. Everything an agent can do or know is a Skill. The underlying mechanism (MCP transport, Nango OAuth, built-in code, prompt injection) is never exposed.

### 2.2 Four Sections (Not Four Kinds)

Inside the single Skills tab, items are grouped into sections for clarity:

| Section | What's in it | Examples |
|---------|-------------|---------|
| **Core Skills** | Built-in, always on, non-removable | Hyperliquid, Polymarket, Wallet, Web3 Read, Web Search |
| **Connected Skills** | Require OAuth / external account | Slack, Google Sheets, Notion, GitHub |
| **Installed Skills** | Added from catalog, executable | Lucid Trade, Lucid SEO, Lucid Predict |
| **Playbooks** | Prompt-only guides, no execution | Web3 Tools Guide, Trading Best Practices |

> Sections are visual grouping, not a taxonomy exposed to users. They answer: "Where do I look for what I need?"

### 2.3 Card Mental Model

Each skill card answers exactly 5 questions:

1. **What is this?** — Name + short description
2. **What can it do?** — Capability summary (e.g., "Can: read markets, place trades, cancel orders")
3. **Is it active?** — Toggle / status indicator
4. **Does it need connection/setup?** — "Connected" dot or "Connect" button
5. **Can it act or only advise?** — Subtle badge: "Can act" vs "Read only" vs "Guide"

### 2.4 Badges and Status (User-Facing)

Do NOT expose internal kinds (`plugin`, `integration`, `platform`, `guidance`). Use status-oriented labels:

| Badge | Meaning | When shown |
|-------|---------|-----------|
| **Core** | Built into platform, always available | Platform tools section |
| **Connected** | OAuth linked, ready to use | Integration with active connection |
| **Setup required** | Needs OAuth connection | Integration without connection |
| **Active** | Installed and enabled | Any active non-core skill |
| **Guide** | Prompt-only, no execution | Playbook items |
| **Can act** | Can perform write operations | Skills with write/destructive tools |
| **Read only** | Only reads data, no side effects | Skills with read-only tools |

### 2.5 Tool Toggles — Advanced Only

Default UI shows **skill-level enable/disable**. Per-tool toggles live in an **advanced drawer** (expand on click or "Configure" button):

**Default card view:**
```
Hyperliquid                                    [Core]
Perpetual futures trading on Hyperliquid DEX
Can: read markets, view positions, place trades
```

**Advanced drawer (click to expand):**
```
Tools:
  hl_account_info      Read account state       [always on]
  hl_place_order       Place perpetual order     [always on]
  hl_cancel_order      Cancel open order         [always on]
```

For user-managed skills (installed/connected), tool toggles are checkboxes. For core skills, they're read-only (always on).

### 2.6 Tool Cap UX — shipped guardrail

The unified skills experience now also carries a product-level configuration guardrail:

- hard cap: **100 active tools per agent**
- applies across active plugin-backed skills on the agent
- enforced in both UI and API

Shipped UX requirements:
- persistent top-level counter: `X / 100 tools`
- inline projected count on inactive plugin cards before enabling:
  - example: `Adds 12 tools • 87/100 after enabling`
- blocking toast + inline message when an action would exceed the cap
- cap-reached banner with the biggest active tool contributors
- direct path back to the installed/active list so the user can turn tools off first

Operator behavior:
- the API returns `409` with an `assistant_tool_cap` alert payload
- the server emits an internal warning event for observability

This guardrail is intentionally separate from runtime/provider tool budgeting. The cap exists to keep agent configuration understandable even when runtime pruning is available.

## 3. Architecture

### 3.1 DB Strategy — Normalize at API Layer

> Do NOT merge `skill_catalog` into `plugin_catalog` at the DB level.

The two tables have fundamentally different schemas:
- `plugin_catalog`: `tool_manifest` JSONB, `transport`, `execution_mode`, `trust_level`, semver `version`
- `skill_catalog`: `sanitized_content` TEXT, `frontmatter` JSONB, `content_hash`, integer `version`

Merging would create a bloated super-table. Instead, the **API layer** normalizes both into a common wire format (`UnifiedSkillItem`).

### 3.2 Built-In Tools — Seed Summary Rows

Seed 4-5 rows in `plugin_catalog` with `kind: 'platform'` representing built-in tool groups:

| Slug | Name | Tools | Source |
|------|------|-------|--------|
| `platform-trading` | Trading | wallet_transfer, dex_swap, hl_place_order, hl_cancel_order, polymarket_trade | `CommandsAllowlist.ts` |
| `platform-web3` | Web3 Intelligence | get_price, search_token, get_portfolio, wallet_balance, risk_check, etc. | `CommandsAllowlist.ts` |
| `platform-runtime` | Agent Runtime | cron_schedule, cron_list, cron_cancel, sessions_send, sessions_spawn | `CommandsAllowlist.ts` |
| `platform-native` | Web & Media | web_search, web_fetch, image, pdf | OpenClaw native |

These have `source: 'built-in'`, `trust_level: 'internal'`, `verified: true`. They do NOT use org installations or assistant activations — they are always-on.

### 3.3 Manifest Sync — Don't Drift

The platform tool manifests seeded in `plugin_catalog` must stay in sync with `CommandsAllowlist.ts`. Two options:

1. **CI validation** — A test asserts that seeded manifests match the runtime tool schemas
2. **Runtime generation** — A startup function generates the manifests from the allowlist

Option 1 is simpler and catches drift at PR time. A test in `worker/src/agent/__tests__/` compares `CommandsAllowlist` tool schemas against the seeded `plugin_catalog` rows.

### 3.4 Unified Wire Format

```typescript
interface UnifiedSkillItem {
  id: string
  slug: string
  name: string
  description: string | null
  category: string

  // Section placement (drives UI grouping)
  section: 'core' | 'connected' | 'installed' | 'playbooks'

  // State
  installed: boolean
  is_active: boolean
  installation_id: string | null
  activation_id: string | null

  // Tools (null for playbooks)
  tools: PluginToolDef[] | null
  enabled_tools: string[] | null
  tool_count: number

  // Capability badges
  can_act: boolean              // has write/destructive tools
  always_on: boolean            // true for core skills
  removable: boolean            // false for core skills

  // Connection (only for connected skills)
  connection_status: 'connected' | 'setup_required' | null
  auth_provider: string | null

  // Playbook data (only for playbooks)
  content_chars: number | null

  // Metadata
  version: string
  author: string | null
  source: string
  verified: boolean
  min_plan?: string
  update_available?: {
    installed_version: number
    catalog_version: number
    changelog: string | null
  } | null
}
```

### 3.5 Data Flow

```
GET /api/assistants/[id]/unified-skills
  → Promise.all([
      getPluginCatalog(),                // plugin_catalog (plugins + integrations + platform)
      getOrgPlugins(orgId),              // org_plugin_installations
      getAssistantPlugins(assistantId),  // assistant_plugin_activations
      getSkillCatalog(),                 // skill_catalog (playbooks)
      getOrgSkills(orgId),              // org_skill_installations
      getAssistantSkills(assistantId),  // assistant_skill_activations
    ])
  → normalize into UnifiedSkillItem[]
  → assign sections:
      kind='platform'     → section='core'
      kind='integration'  → section='connected'
      kind='plugin'       → section='installed'
      from skill_catalog  → section='playbooks'
  → return { items: UnifiedSkillItem[] }
```

Mutations dispatch to existing endpoints based on item origin:
- Plugin/integration/platform → `/api/orgs/[id]/plugins` + `/api/assistants/[id]/plugins`
- Playbook → `/api/orgs/[id]/skills` + `/api/assistants/[id]/skills`

### 3.6 Component Structure

```
UnifiedSkillManager
├── SearchBar + CategoryFilter + SectionFilter
├── CoreSkillsSection
│   └── SkillCard (read-only, always-on badge, tool list in advanced drawer)
├── ConnectedSkillsSection
│   └── SkillCard (connect/disconnect, tool toggles, connection status dot)
├── InstalledSkillsSection
│   └── SkillCard (install/activate, tool toggles, per-tool checkboxes in drawer)
└── PlaybooksSection
    └── SkillCard (install/activate, content preview, update badge)
```

## 4. What Changes

### UI (frontend)

| Change | File | Impact |
|--------|------|--------|
| New unified component | `src/components/skills/unified-skill-manager.tsx` (create) | Main implementation |
| New wire type | `contracts/unified-skill.ts` (create) | Shared type definition |
| Tab consolidation | `assistant-detail-client.tsx` | Replace 3 tabs with 1 |
| Server data fetch | `assistants/[id]/page.tsx` | Merge 6 parallel fetches into unified format |
| New API route | `src/app/api/assistants/[id]/unified-skills/route.ts` (create) | Read-only unified endpoint |

### DB

| Change | File | Impact |
|--------|------|--------|
| Extend `kind` CHECK | New migration | Add `'platform'`, `'guidance'` |
| Seed platform tools | Same migration | 4 rows in `plugin_catalog` |
| Update contracts | `contracts/plugin.ts` | Extend Zod kind enum |

### What Does NOT Change

- **Worker runtime** — Zero changes. `get_assistant_active_plugins` and `get_assistant_active_skills` RPCs stay the same.
- **Existing APIs** — All mutation endpoints stay. The unified endpoint is read-only and additive.
- **Plugin governance** — 3-tier model (catalog → org install → assistant activate) unchanged.
- **Skill governance** — Same 3-tier model, unchanged.
- **PluginBridge dispatch** — No runtime changes.

## 5. Rollout

- **Feature flag**: `FEATURE_UNIFIED_SKILLS` (default `false`)
- When `false`: three existing tabs render as today
- When `true`: single Skills tab with unified component
- Old components kept until flag is permanently enabled
- Mission Control agent detail page adopts unified view in follow-up

## 6. Naming Summary

| Internal term | DB field | User-facing label | Section |
|---|---|---|---|
| Plugin (MCP) | `kind: 'plugin'` | Skill | Installed Skills |
| Integration (Nango) | `kind: 'integration'` | Skill | Connected Skills |
| Platform tool (built-in) | `kind: 'platform'` | Skill | Core Skills |
| Prompt skill (playbook) | `skill_catalog` | Skill | Playbooks |

> **One word for users: Skills.** Everything else is platform plumbing.
