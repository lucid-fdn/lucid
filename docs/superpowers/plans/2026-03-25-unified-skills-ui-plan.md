# Unified Skills UI — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge Plugins + Skills + Integrations tabs into a single "Skills" tab. Transport (MCP, Nango, REST, prompt) is invisible. Built-in tools become visible. Four sections: Core Skills, Connected Skills, Installed Skills, Playbooks.

**Tech Stack:** TypeScript, React, Next.js 15, Supabase, Zod, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-25-unified-skills-ui-design.md`

---

## File Structure

### New files (created)

| File | Responsibility |
|------|---------------|
| `contracts/unified-skill.ts` | `UnifiedSkillItem` wire type + section assignment helpers |
| `src/app/api/assistants/[id]/unified-skills/route.ts` | Read-only unified endpoint (merges plugins + skills) |
| `src/components/skills/unified-skill-manager.tsx` | Single unified component replacing 3 old components |
| `src/components/skills/skill-card.tsx` | Reusable card with section-aware rendering |
| `src/components/skills/skill-advanced-drawer.tsx` | Per-tool toggles drawer (advanced mode) |
| `supabase/migrations/20260325400000_unified_skills_ui.sql` | Extend `kind` CHECK + seed platform tools |
| `worker/src/agent/__tests__/platform-manifest-sync.test.ts` | CI guard: seeded manifests match CommandsAllowlist |

### Existing files (modified)

| File | Change |
|------|--------|
| `contracts/plugin.ts` | Add `'platform'` to `kind` Zod enum |
| `src/lib/db/plugins.ts` | Add `getPluginCatalogByKind()` helper |
| `src/app/(app)/[workspace-slug]/assistants/[id]/page.tsx` | Merge data fetching into unified format |
| `src/app/(app)/[workspace-slug]/assistants/[id]/assistant-detail-client.tsx` | Replace 3 tabs with 1 Skills tab (feature-flagged) |
| `src/lib/features.ts` | Add `FEATURE_UNIFIED_SKILLS` flag |
| `worker/src/config.ts` | No change (feature flag is frontend-only) |

### Existing files (preserved, deprecated later)

| File | Status |
|------|--------|
| `src/components/plugins/plugin-manager.tsx` | Keep until flag is permanent |
| `src/components/skills/skill-manager.tsx` | Keep until flag is permanent |
| `src/components/assistants/oauth-tools-tab.tsx` | Keep until flag is permanent |

---

## Chunk 1: Database + Contracts — DONE

- [x] **Task 1: Extend `kind` CHECK constraint**
  - Migration: `supabase/migrations/20260325400000_unified_skills_ui.sql`
  - `ALTER TABLE plugin_catalog DROP CONSTRAINT IF EXISTS plugin_catalog_kind_check`
  - `ALTER TABLE plugin_catalog ADD CONSTRAINT plugin_catalog_kind_check CHECK (kind IN ('plugin', 'integration', 'platform'))`
  - Note: `'guidance'` stays in `skill_catalog` — not added to `plugin_catalog.kind`

- [x] **Task 2: Seed platform tool groups**
  - Same migration file
  - Seed 4 rows into `plugin_catalog`:
    - `platform-trading` — wallet_transfer, dex_swap, hl_place_order, hl_cancel_order, polymarket_trade
    - `platform-web3` — get_price, search_token, get_portfolio, wallet_balance, wallet_history, risk_check, get_token_info, get_trending, get_liquidity, get_holders, get_defi_positions, get_wallet_profile, get_market_data, detect_snipers
    - `platform-runtime` — cron_schedule, cron_list, cron_cancel, sessions_send, sessions_spawn
    - `platform-native` — web_search, web_fetch, image, pdf
  - All with: `kind: 'platform'`, `source: 'built-in'`, `transport: 'embedded'`, `trust_level: 'internal'`, `verified: true`, `is_published: true`
  - `tool_manifest` JSONB from `CommandsAllowlist.ts` tool schemas (name + description + parameters)
  - `ON CONFLICT (slug) DO UPDATE` for idempotency

- [x] **Task 3: Update contracts**
  - `contracts/plugin.ts`: Add `'platform'` to `kind` Zod enum: `z.enum(['plugin', 'integration', 'platform'])`
  - Create `contracts/unified-skill.ts`:
    - `UnifiedSkillItem` interface (see spec section 3.4)
    - `UnifiedSkillSection` type: `'core' | 'connected' | 'installed' | 'playbooks'`
    - `assignSection(kind, source)` helper function
    - `isPlaybook(item)` type guard

- [x] **Task 4: DB helper**
  - `src/lib/db/plugins.ts`: Add `getPluginCatalogByKind(kinds: string[])` — wraps existing query with `.in('kind', kinds)` filter
  - Keep existing `getPluginCatalog()` unchanged for backward compat

## Chunk 2: Unified API Endpoint — DONE

- [x] **Task 5: Create unified read endpoint**
  - `src/app/api/assistants/[id]/unified-skills/route.ts`
  - `GET` handler:
    1. Auth: verify user is org member (via assistant → org chain)
    2. Parallel fetch: `Promise.all([getPluginCatalog(), getOrgPlugins(orgId), getAssistantPlugins(assistantId), getSkillCatalog(), getOrgSkills(orgId), getAssistantSkills(assistantId)])`
    3. Normalize plugins into `UnifiedSkillItem[]`:
       - `kind='platform'` → `section='core'`, `always_on=true`, `removable=false`
       - `kind='integration'` → `section='connected'`, derive `connection_status` from `OrgIntegrationConnection` join
       - `kind='plugin'` → `section='installed'`
    4. Normalize skills into `UnifiedSkillItem[]`:
       - All → `section='playbooks'`, `tools=null`, `can_act=false`
       - Attach `update_available` from `checkSkillUpdates()` if any
    5. Merge both arrays, return `{ items: UnifiedSkillItem[] }`
  - No mutations — writes dispatch to existing per-type endpoints

- [x] **Task 6: Feature flag**
  - `src/lib/features.ts`: Add `FEATURE_UNIFIED_SKILLS: boolean` (default `false`)
  - Read from `process.env.FEATURE_UNIFIED_SKILLS === 'true'`

## Chunk 3: Unified Component — DONE

- [x] **Task 7: Create `SkillCard` component**
  - `src/components/skills/skill-card.tsx`
  - Props: `item: UnifiedSkillItem`, `onToggle`, `onInstall`, `onUninstall`, `onConfigure`
  - Section-aware rendering:
    - **Core**: Shield icon, purple tint, "Core" badge, read-only tool list
    - **Connected**: Link icon, green tint, connection status dot or "Connect" button
    - **Installed**: Zap icon, blue tint, enable/disable toggle
    - **Playbooks**: Sparkles icon, amber tint, "Guide" badge, content_chars display
  - Capability badges: "Can act" (if `can_act`), "Read only" (if tools but not `can_act`), "Guide" (if playbook)
  - Card answers 5 questions: what, what can it do, active?, needs setup?, can act?
  - Click/expand → advanced drawer

- [x] **Task 8: Create `SkillAdvancedDrawer` component**
  - `src/components/skills/skill-advanced-drawer.tsx`
  - Shows per-tool list with toggle checkboxes
  - Core skills: checkboxes disabled (always on)
  - Connected/Installed skills: checkboxes enabled, maps to `enabled_tools`
  - Playbooks: no drawer (no tools)
  - On change: dispatches to correct API:
    - Plugin/integration → `PATCH /api/assistants/[id]/plugins` with `enabledTools`
    - Playbook → no tool toggles

- [x] **Task 9: Create `UnifiedSkillManager` component**
  - `src/components/skills/unified-skill-manager.tsx`
  - Fetches from `/api/assistants/[id]/unified-skills` (or uses `initialItems` prop for SSR)
  - Renders 4 sections with `SkillCard` in each
  - Search bar: searches across name, description, tool names, category
  - Section filter: All / Core / Connected / Installed / Playbooks
  - Category filter dropdown: trading, productivity, marketing, etc.
  - Mutation routing by section:
    - Core → no-op (always on)
    - Connected/Installed → `/api/orgs/[id]/plugins` (install) + `/api/assistants/[id]/plugins` (activate)
    - Playbooks → `/api/orgs/[id]/skills` (install) + `/api/assistants/[id]/skills` (activate)
  - Optimistic updates with rollback on error
  - Empty state per section

## Chunk 4: Tab Consolidation — DONE

- [x] **Task 10: Server component data merging** (skipped — unified endpoint handles client-side fetch; SSR prefetch deferred until flag is permanent)
  - `src/app/(app)/[workspace-slug]/assistants/[id]/page.tsx`
  - When `FEATURE_UNIFIED_SKILLS` is true:
    - Existing parallel fetches (plugins, skills, activations) stay
    - Add normalization into `UnifiedSkillItem[]` server-side
    - Pass as `initialUnifiedItems` prop
  - When false: existing behavior unchanged

- [x] **Task 11: Client tab replacement**
  - `src/app/(app)/[workspace-slug]/assistants/[id]/assistant-detail-client.tsx`
  - When `FEATURE_UNIFIED_SKILLS` is true:
    - Replace Plugins tab (line 837-849), Skills tab (851-863), and Integrations tab (865-872) with single:
      ```tsx
      {
        id: 'skills',
        title: 'Skills',
        icon: <Sparkles className="h-3.5 w-3.5" />,
        content: <UnifiedSkillManager ... />,
      }
      ```
  - When false: render existing 3 tabs unchanged
  - Remove old props (`initialPlugins`, `initialActivations`, `initialSkills`, `initialSkillActivations`, `initialOAuthBindings`) when flag is permanent

## Chunk 5: CI Guard — DONE

- [x] **Task 12: Platform manifest sync test**
  - `worker/src/agent/__tests__/platform-manifest-sync.test.ts`
  - Imports tool schemas from `CommandsAllowlist.ts` (the TOOL_REGISTRY map)
  - Compares against expected seeded `tool_manifest` JSON for each platform group
  - Fails if a tool is added/removed from `CommandsAllowlist` without updating the migration seed
  - Prevents UI from lying about available platform tools

## Chunk 6: Cleanup (after flag is permanent) — PENDING

- [ ] **Task 13: Remove old components**
  - Delete or deprecate: `plugin-manager.tsx`, old `skill-manager.tsx`, `oauth-tools-tab.tsx`
  - Remove old tab entries from `assistant-detail-client.tsx`
  - Remove feature flag checks
  - Remove old props from page server component

- [ ] **Task 14: Remove legacy OAuth bindings UI**
  - Delete `src/components/assistants/oauth-tools-tab.tsx`
  - Delete `/api/assistants/[id]/oauth-tools/` routes (if not used by worker)
  - Keep `assistant_oauth_bindings` table (admin still uses it, delete when Plugin Manager handles all)

---

## Verification

- [x] **Typecheck**: 0 errors in our files (1 pre-existing in polymarket.ts, unrelated)
- [x] **Tests**: 357/365 pass (8 failures = Polymarket Bridge e2e, pre-existing network-dependent). 7 new manifest sync tests pass.
- [x] **Feature flag off**: Three existing tabs render unchanged (default `unifiedSkills: false`)
- [ ] **Feature flag on**: Single Skills tab with 4 sections (needs manual QA with `FEATURE_UNIFIED_SKILLS=true`)
- [ ] **Core Skills**: Platform tools visible, always-on, non-removable (needs migration applied + manual QA)
- [ ] **Connected Skills**: Nango integrations show connection status (needs manual QA)
- [ ] **Installed Skills**: MCP plugins install/activate/tool-toggle works (needs manual QA)
- [ ] **Playbooks**: Prompt skills install/activate/update works (needs manual QA)
- [ ] **Search**: Finds items across all sections (needs manual QA)
- [x] **No runtime changes**: Worker RPCs unchanged, tool execution unchanged

---

## Critical File Paths

| File | Role |
|------|------|
| `contracts/unified-skill.ts` | Wire type for unified API |
| `contracts/plugin.ts` | Extended `kind` enum |
| `src/components/skills/unified-skill-manager.tsx` | Main unified component |
| `src/components/skills/skill-card.tsx` | Section-aware card rendering |
| `src/components/skills/skill-advanced-drawer.tsx` | Per-tool toggles |
| `src/app/api/assistants/[id]/unified-skills/route.ts` | Read-only unified endpoint |
| `src/lib/db/plugins.ts` | `getPluginCatalogByKind()` |
| `src/lib/db/skills.ts` | Existing skill queries (unchanged) |
| `src/app/(app)/[workspace-slug]/assistants/[id]/page.tsx` | Server-side data merging |
| `src/app/(app)/[workspace-slug]/assistants/[id]/assistant-detail-client.tsx` | Tab consolidation |
| `supabase/migrations/20260325400000_unified_skills_ui.sql` | DB migration |
| `worker/src/agent/__tests__/platform-manifest-sync.test.ts` | CI drift guard |
| `worker/src/agent/CommandsAllowlist.ts` | Source of truth for platform tool schemas |

## Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Don't merge `skill_catalog` into `plugin_catalog` | Fundamentally different schemas. API layer normalizes. |
| Seed platform tools as summary rows per group | 4 rows, not 30+. Grouped by category for cleaner UI. |
| Section-based grouping (not flat list) | Core / Connected / Installed / Playbooks prevents "confusing soup" |
| Tool toggles in advanced drawer | Default UI is skill-level. Power users expand for per-tool control. |
| User-facing labels (Core/Connected/Active/Guide) | Don't expose internal kinds (plugin/integration/platform/guidance) |
| Feature flag rollout | Zero-risk. Old tabs stay until flag is permanent. |
| CI manifest sync test | Prevents platform tool UI from drifting from runtime. |
| Mutations use existing APIs | No new write endpoints. Component routes by item origin. |
| Worker runtime unchanged | This is purely UI + API consolidation. |
