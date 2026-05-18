# DB-Backed Skill Import Pipeline

**Date:** 2026-03-12
**Status:** Approved
**Scope:** Tight vertical slice — SKILL.md to system prompt

## Goal

Enable OpenClaw ecosystem skills in the Lucid SaaS platform without filesystem scanning. Skills flow from vendored SKILL.md files through a curated DB pipeline into the OpenClaw system prompt at runtime.

**Key invariant:** The DB is the control plane, not a replacement runtime. OpenClaw still consumes skills through its runtime interfaces (`skillsSnapshot`). We do not invent a proprietary skill format.

## Prerequisites

### BLOCKING: V2 Runtime Lockdown (Active Security Gap)

`worker/src/agent/runtime/embedded.ts` (`EmbeddedRuntime.runTurn()`) currently does NOT pass `skillsSnapshot`, `skills.load.disabled`, or `plugins.enabled: false` to `runEmbeddedPiAgent`. When `FEATURE_RUNTIME_V2=true`, filesystem skill discovery and plugin auto-loading are not disabled — **this is an active security vulnerability**.

**This must be fixed before any DB skill work goes live.** The fix:

- Build a **per-run immutable config** (never mutate shared config):
  ```
  skills: { load: { extraDirs: [], disabled: true } }
  plugins: { enabled: false, installs: [] }
  ```
- Pass controlled `skillsSnapshot` (from DB or `{ resolvedSkills: [] }` fallback) to `runEmbeddedPiAgent`.
- Both legacy and v2 paths must prevent ALL filesystem skill/plugin discovery.

The legacy path (`OpenClawAgent.ts` lines 432-441) already does this correctly. The v2 path must match.

## Architecture

```
packages/openclaw-core/extensions/*/skills/*/SKILL.md
                    │
                    ▼
         Import Pipeline (CLI script)
         scan → parse → validate → sanitize → flag → upsert
                    │
                    ▼
              skill_catalog (status = 'draft')
                    │
              manual approval (status = 'approved')
                    │
                    ▼
           org_skill_installations (org admin installs)
                    │
                    ▼
        assistant_skill_activations (assistant creator activates)
                    │
                    ▼
         get_assistant_active_skills() RPC
                    │
                    ▼
    fetchActiveSkills() → buildSkillsSnapshotFromRows()
                    │
                    ▼
              SkillSnapshot { prompt, skills, resolvedSkills }
                    │
                    ▼
          runEmbeddedPiAgent(params.skillsSnapshot)
                    │
                    ▼
          "## Skills (mandatory)" in system prompt
```

## Compatibility

This design stays compatible with the future full OpenClaw gateway migration:

- **Skills:** DB replaces filesystem as the loading source. The format (`SkillSnapshot`) and consumption path (OpenClaw runtime) are unchanged. Self-hosted OpenClaw reads filesystem; our SaaS reads DB. Clean substitution.
- **Plugins:** The capability classification model works with both embedded and gateway runtimes. SaaS-safe stateless tools stay on current path. Privileged Lucid tools stay Lucid-owned. Hook/filesystem plugins enabled later only in the right runtime class.
- **Runtime seam:** As long as `buildToolSurface()`, stable tool names, ownership metadata, and the `AgentRuntime` interface are preserved, switching from embedded to gateway runtime remains clean.

---

## Section 1: DB Schema

Three tables mirroring the existing plugin 3-tier pattern, plus one RPC.

### `skill_catalog` — Global registry

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `slug` | TEXT UNIQUE NOT NULL | Derived from relative path (e.g. `acpx-acp-router`). See slug derivation rules. Current slice uses globally unique slug; source-scoped override semantics (e.g. manual skill shadowing an OpenClaw skill) are intentionally out of scope. |
| `name` | TEXT NOT NULL | Display name from frontmatter |
| `description` | TEXT | One-line description from frontmatter |
| `raw_content` | TEXT NOT NULL | Exact imported SKILL.md (provenance, re-review) |
| `sanitized_content` | TEXT NOT NULL | What enters `skillsSnapshot` — runtime only reads this |
| `frontmatter` | JSONB NOT NULL DEFAULT '{}' | Parsed YAML frontmatter (all fields preserved, including unknown) |
| `source` | TEXT NOT NULL | `'openclaw'` or `'manual'` |
| `source_path` | TEXT | Relative path within vendored repo. Nullable for manual skills. |
| `source_commit` | TEXT | Git hash at import time. Nullable for manual skills. |
| `content_hash` | TEXT NOT NULL | SHA-256 of raw content (change detection) |
| `status` | TEXT NOT NULL DEFAULT 'draft' | `'draft'` / `'approved'` / `'deprecated'` |
| `content_chars` | INT NOT NULL | Character count of `sanitized_content` |
| `import_warnings` | JSONB | Array of `{ pattern, line, snippet, severity }` from flag scan |
| `approved_at` | TIMESTAMPTZ | Nullable — set on approval |
| `approved_by` | UUID FK → profiles | Nullable — who approved |
| `review_notes` | TEXT | Nullable — reviewer comments |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ DEFAULT now() | |

### `org_skill_installations` — Org-scoped installation

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `org_id` | UUID NOT NULL FK → organizations ON DELETE CASCADE | |
| `skill_id` | UUID NOT NULL FK → skill_catalog ON DELETE CASCADE | |
| `installed_at` | TIMESTAMPTZ DEFAULT now() | |
| `installed_by` | UUID FK → profiles | |
| UNIQUE | `(org_id, skill_id)` | |

### `assistant_skill_activations` — Per-assistant activation

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `assistant_id` | UUID NOT NULL FK → ai_assistants ON DELETE CASCADE | |
| `installation_id` | UUID NOT NULL FK → org_skill_installations ON DELETE CASCADE | |
| `is_active` | BOOLEAN DEFAULT true | |
| `sort_order` | INT DEFAULT 100 | Controls prompt ordering |
| `activated_at` | TIMESTAMPTZ DEFAULT now() | |
| UNIQUE | `(assistant_id, installation_id)` | |

### RPC: `get_assistant_active_skills(p_assistant_id UUID)`

Returns approved, active skills for an assistant, ordered by `sort_order ASC`.

```sql
RETURNS TABLE (
  skill_slug TEXT,
  skill_name TEXT,
  skill_description TEXT,
  sanitized_content TEXT,
  frontmatter JSONB,
  sort_order INT,
  content_chars INT
)
```

Joins: `assistant_skill_activations` → `org_skill_installations` → `skill_catalog`
Filters: `is_active = true` AND `status = 'approved'`
Order: `sort_order ASC, skill_name ASC`

**Security:** `SECURITY DEFINER` with explicit org ownership check and hardened `search_path`. The function body must `SET search_path = public` to prevent search-path hijacking (standard hardening for privileged Postgres functions). It joins `ai_assistants` to resolve the assistant's `org_id`, then verifies it matches the installation's `org_id` via `org_skill_installations`. This prevents cross-org skill leakage.

### RLS Policies

| Table | Read | Write |
|-------|------|-------|
| `skill_catalog` | Authenticated users (read-only catalog browsing) | Service role only (import script + admin approval) |
| `org_skill_installations` | Org members (via `organizations` membership) | Org admins only |
| `assistant_skill_activations` | Assistant owner or org admin | Assistant owner or org admin |

The RPC function runs as `SECURITY DEFINER` (service role) so it can join across tables regardless of row-level policies, but it enforces org ownership in the query itself.

---

## Section 2: Import Pipeline

`worker/src/agent/skills/import-openclaw-skills.ts` — CLI script.

### Steps

1. **Scan** vendored SKILL.md files (three glob patterns):
   - `packages/openclaw-core/extensions/*/skills/*/SKILL.md` (standard extension skills)
   - `packages/openclaw-core/skills/*/SKILL.md` (top-level skills)
   - `packages/openclaw-core/extensions/*/SKILL.md` (extension-root skills, e.g. `lobster`)

2. **Parse** each file — extract YAML frontmatter + markdown body.

3. **Derive slug** using this algorithm (given relative path after `packages/openclaw-core/`, strip trailing `/SKILL.md`):
   - If frontmatter contains a `slug` field: use it directly.
   - Else if path matches `extensions/{ext}/skills/{name}`: slug = `{ext}-{name}` (e.g. `acpx-acp-router`)
   - Else if path matches `skills/{name}`: slug = `{name}` (e.g. `diffs`)
   - Else if path matches `extensions/{ext}` (extension-root skill): slug = `{ext}` (e.g. `lobster`)
   - Reject on slug collision (two files producing the same slug).
   - Note: files without frontmatter (like `extensions/lobster/SKILL.md`) fail required field validation — they import as `draft` with warnings if `name`/`description` can be inferred from content, or are skipped with a logged error if not.

4. **Validate frontmatter:**
   - Required fields: `name`, `description` — hard-reject if missing.
   - Known fields validated with per-field limits:
     - `name`: max 120 chars
     - `description`: max 1,000 chars
     - `homepage`: max 2,048 chars
     - `emoji`: max 10 chars
     - Array fields (`os`, `requires.bins`, etc.): max 50 items
     - `install`/`command-*` fields: preserved but marked as SaaS-unsupported
   - Unknown fields: preserved in `frontmatter` JSONB, flagged with warning, skill imports as `draft`.

5. **Sanitize** (non-destructive, formatting only):
   - CRLF → LF
   - Strip trailing whitespace per line
   - Ensure single trailing newline
   - Strip BOM if present
   - Do NOT strip or rewrite content.

6. **Flag** for prompt injection patterns:
   - Regex scan in **prose blocks only** — skip fenced code blocks (`` ``` ``), inline code (`` ` ``), and blockquotes (`>`).
   - Patterns: `(?i)(ignore (all )?previous|you are now|<\/?system>|## System Prompt|forget (all )?instructions|disregard|override.*instructions)`
   - If matched, store in `import_warnings`: `{ pattern, line, snippet (50 chars context), severity }`
   - Skill still imports — flagged for reviewer attention.

7. **Size guard:** Reject files > 256KB (`maxSkillFileBytes`).

8. **Upsert** into `skill_catalog`:
   - Match on `slug`
   - Set `source = 'openclaw'`, `source_path`, `source_commit` (the **LucidMerged repo commit SHA** representing the vendored OpenClaw subtree state at import time — i.e. `git rev-parse HEAD` from the LucidMerged root, not the upstream OpenClaw commit), `content_hash` (SHA-256 of raw content)
   - **Unchanged** (`content_hash` matches): skip, log as unchanged
   - **New**: insert as `status = 'draft'`
   - **Changed** (hash differs): update `raw_content`, `sanitized_content`, `content_hash`, `content_chars`, `import_warnings`, reset `status = 'draft'` for re-review
   - **Removed upstream** (previously imported slug not found in scan): mark `status = 'deprecated'`, do NOT delete. Existing org installations and assistant activations continue working.

### `--dry-run` flag

When invoked with `--dry-run`, the script:
- Runs the full scan → parse → validate → flag pipeline
- Prints a summary: new / changed / unchanged / deprecated / flagged counts with details
- Writes nothing to DB

### Invocation

```bash
# Full import
npx tsx worker/src/agent/skills/import-openclaw-skills.ts

# Dry run
npx tsx worker/src/agent/skills/import-openclaw-skills.ts --dry-run
```

Run manually after upstream sync, or as a post-sync step in `.github/workflows/sync-openclaw.yml`.

---

## Section 3: Runtime Integration

The v2 lockdown is a blocking prerequisite (see Prerequisites section above). This section covers the DB-backed `skillsSnapshot` builder.

### Key Design Decision: Custom Inline Formatter (Not `formatSkillsForPrompt`)

OpenClaw's `Skill` type requires `filePath` and `baseDir` fields. The built-in `formatSkillsForPrompt()` renders these as paths and instructs the LLM to `read` the SKILL.md file at that path. In SaaS:

- The `read` tool is denied (filesystem access blocked).
- There is no real file path for DB-sourced skills.

**Decision:** Write a **custom inline formatter** that renders `sanitized_content` directly into the prompt instead of emitting file path references. The `resolvedSkills` array uses synthetic values for required `Skill` fields:

```
filePath: "db://skills/{slug}"
baseDir: "db://skills"
```

These synthetic paths prevent OpenClaw from attempting filesystem reads. The `prompt` field in `SkillSnapshot` is built by our custom formatter (not `formatSkillsForPrompt()`), which inlines each skill's content directly.

**Prompt format** (intentional divergence from upstream `formatSkillsForPrompt()` which emits `<location>` file paths and instructs the LLM to "use the read tool" — neither works in SaaS):

```
The following skills are activated for this assistant. Use the matching skill when the task fits its description.

<available_skills>
<skill name="{slug}" description="{description}">
{sanitized_content}
</skill>
...
</available_skills>
```

This gives the LLM the skill content inline — no `read` tool call needed. The `## Skills (mandatory)` system prompt header (which OpenClaw injects) still tells the LLM to scan `<available_skills>`, so the integration is seamless. The upstream preamble ("Use the read tool to load a skill's file") must NOT be included.

### Skill Snapshot Builder

Two functions in separate modules for testability:

**`worker/src/agent/skills/fetch-active-skills.ts`**

```
fetchActiveSkills(supabase, assistantId) → ActiveSkillRow[]
```

Calls `get_assistant_active_skills()` RPC. Returns typed rows. On failure: logs warning, emits Sentry event with assistant/org tags, returns empty array.

**`worker/src/agent/skills/snapshot-builder.ts`**

```
buildSkillsSnapshotFromRows(rows: ActiveSkillRow[]) → SkillSnapshot
```

1. Rows arrive pre-sorted by `sort_order ASC`.
2. Iterate rows, accumulate `content_chars`.
3. Stop when hitting **30,000 total chars** or **150 skills** (OpenClaw's runtime budget).
4. Build `resolvedSkills` array — map each row to OpenClaw's `Skill` type (with synthetic `filePath`/`baseDir`).
5. Build `skills` array — map each row to `{ name: slug, primaryEnv: frontmatter.primaryEnv, requiredEnv: frontmatter.requires?.env }`. Extract these from the `frontmatter` JSONB column.
6. Render `prompt` string using the **custom inline formatter** (NOT `formatSkillsForPrompt()`).
7. Return `{ prompt, skills, resolvedSkills }`.

**Type safety note:** The `SkillSnapshot.resolvedSkills` field is typed as optional (`resolvedSkills?: Skill[]`). The builder function should return a narrower type where `resolvedSkills` is required, or use an explicit `as const` assignment to ensure the invariant is enforced in code, not just documentation.

**Critical invariant:** `resolvedSkills` must always be an array (`[]`), never `undefined`. When `resolvedSkills` is `undefined`, OpenClaw falls back to filesystem scanning (`skills-runtime.ts` line 12: `const shouldLoadSkillEntries = !params.skillsSnapshot || !params.skillsSnapshot.resolvedSkills`). An empty array `[]` correctly signals "no skills, and don't scan."

### Budget Enforcement

The runtime uses `content_chars` from the RPC result (pre-computed at import time from `sanitized_content`). This avoids re-measuring at runtime. If `content_chars` and actual `sanitized_content.length` ever drift due to a bug, the budget may be slightly off — this is acceptable for a first slice. The budget is a soft limit, not a security boundary.

### Integration Points

- **Legacy path** (`OpenClawAgent.ts` ~line 543): Replace `skillsSnapshot: { resolvedSkills: [] }` with `await fetchActiveSkills() → buildSkillsSnapshotFromRows()`.
- **V2 path** (`EmbeddedRuntime.runTurn()`): Same — call fetch + build, pass result as `skillsSnapshot`.

### Fallback

If `fetchActiveSkills()` fails (DB error, timeout):
- Return `{ prompt: '', skills: [], resolvedSkills: [] }` (no skills in prompt — `[]` not `undefined`)
- Log `console.warn` with assistant ID and error
- Emit Sentry warning event with `assistantId`, `orgId`, runtime path tag
- **Never** fall back to filesystem scanning

---

## Section 4: Sanitization Rules

### Formatting cleanup (always applied, non-destructive)

- CRLF → LF
- Strip trailing whitespace per line
- Ensure single trailing newline
- Strip BOM if present

### Frontmatter validation

- **Known fields:** Validated with per-field limits (see Section 2 step 4).
- **Unknown fields:** Preserved in `frontmatter` JSONB column. Flagged with warning. Skill imports as `draft`.
- **Hard reject only if:** YAML parse failure, missing required fields (`name`, `description`), file > 256KB.

### Prompt injection flagging

Scan prose blocks only using **line-by-line state tracking** (not regex across raw markdown). Skip:
- Fenced code blocks: track opening/closing `` ``` `` markers line-by-line, skip all lines between them
- Inline code: skip content between `` ` `` markers within a line
- Blockquotes: skip lines starting with `>`

Implementation note: use a simple state machine (in-fence / not-in-fence) iterating line by line. This is more robust than regex-based code fence detection, which has edge cases with nested/escaped backticks.

Flag patterns:
```
(?i)(ignore (all )?previous|you are now|<\/?system>|## System Prompt|
     forget (all )?instructions|disregard|override.*instructions)
```

Each match stored as:
```json
{ "pattern": "matched regex", "line": 42, "snippet": "50 chars of context", "severity": "high" }
```

Skills with flags still import as `draft`. Reviewers see `import_warnings` and can approve knowingly.

### Budget enforcement

Budget is enforced at **runtime** (Section 3), not at import time:
- Store full `sanitized_content` and `content_chars` in catalog
- Runtime applies 30,000 char / 150 skill limit when building `skillsSnapshot`

---

## Section 5: File Layout & Testing

### New files

```
worker/src/agent/skills/
├── fetch-active-skills.ts        # DB fetch: get_assistant_active_skills() RPC
├── snapshot-builder.ts           # Build SkillSnapshot from DB rows
├── import-openclaw-skills.ts     # CLI: scan → parse → validate → upsert (+ --dry-run)
├── sanitize.ts                   # Formatting cleanup + frontmatter validation + flag logic
└── types.ts                      # SkillCatalogRow, ActiveSkillRow, ImportWarning

supabase/migrations/
└── 20260312120000_skill_catalog.sql

worker/src/agent/skills/__tests__/
├── sanitize.test.ts
├── snapshot-builder.test.ts
├── import-openclaw-skills.test.ts
└── runtime-lockdown.test.ts
```

### Modified files

```
worker/src/agent/runtime/embedded.ts    # V2 lockdown + skillsSnapshot from DB
worker/src/agent/OpenClawAgent.ts       # Legacy: replace empty snapshot with DB-backed
worker/src/agent/runtime/types.ts       # Add supabase to RunTurnInput if needed
```

### Test coverage

**`sanitize.test.ts`** — Sanitization rules:
- Frontmatter validation (known fields, unknown fields preserved + flagged, per-field limits)
- Prompt injection flagging (detects patterns in prose, skips code fences/inline/blockquotes)
- Size guard (rejects > 256KB)
- Formatting cleanup (CRLF, BOM, trailing whitespace)

**`snapshot-builder.test.ts`** — Snapshot construction:
- Respects `sort_order`
- Enforces 30K char budget (stops adding skills at limit)
- Enforces 150 skill count limit
- Empty input → `{ resolvedSkills: [], prompt: '', skills: [] }`
- Produces valid `SkillSnapshot` type

**`import-openclaw-skills.test.ts`** — Import logic:
- Slug derivation from relative paths
- `content_hash` skip (idempotent re-runs)
- Changed content resets status to `draft`
- Removed upstream skills marked `deprecated`
- `--dry-run` produces summary without DB writes

**`runtime-lockdown.test.ts`** — SaaS guarantee (the most important test file):
- Filesystem skill directories exist on disk (vendored SKILL.md files present) — proves the lockdown is needed
- Plugin auto-loading config is `{ enabled: false, installs: [] }` in both legacy and v2 paths
- Skill filesystem discovery config is `{ load: { disabled: true, extraDirs: [] } }` in both paths
- `skillsSnapshot.resolvedSkills` is always an array (`[]`), never `undefined` — including in fallback
- Runtime only uses DB-backed `skillsSnapshot`, never filesystem-resolved skills
- If DB fetch fails, fallback is `{ resolvedSkills: [] }` (not filesystem)
- Custom inline formatter is used (not `formatSkillsForPrompt()` which emits file paths)

### Not in this slice

- Admin UI for skill browsing/approval (use Supabase dashboard)
- Plugin importer/classifier
- Advanced versioning or diffing
- External registry sync
- Skill editing workflow
