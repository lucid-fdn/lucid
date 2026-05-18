# Living Templates — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-04-13-living-templates-design.md`
**Status:** Draft
**Date:** 2026-04-13
**Strategic frame:** "n8n shares automations. Lucid deploys AI teammates."

Total: **6 phases, ~14-18 working days across phases 1-5.**

---

## Phase 1 — Living Spec (foundation)

Goal: extend the template spec so it carries memory hints, schedules, channel hints, and eval packs. Deploy engine applies them. No UI changes yet.

**Estimated: 3-4 days.**

### Chunk 1-A: Contracts

- [ ] Edit `contracts/template.ts`:
  - Add `MemorySchemaHintSchema`: `category` (fact|preference|instruction|context), `description`, `importance_floor` (number 0–1)
  - Add `ScheduleHintSchema`: `cron` (string), `prompt`, `description`, `optional` (boolean)
  - Add `ChannelHintSchema`: `channel_type`, `required` (boolean), `setup_note`
  - Add `EvalScenarioSchema`: `name`, `prompt`, `expected_behaviors` (string[]), `must_not_contain?` (string[])
  - Extend `AgentTemplateSpecSchema` with optional: `memory_schema?`, `default_schedules?`, `channel_hints?`, `eval_pack?`
  - Extend `TeamMemberSpecSchema` with optional: `memory_schema?`, `default_schedules?`
  - Extend `TeamTemplateSpecSchema` with optional: `channel_hints?`, `eval_pack?`
  - All new fields optional — existing seed JSONs remain valid

### Chunk 1-B: Migration

- [ ] Create `supabase/migrations/20260413300000_living_templates.sql`:
  ```sql
  ALTER TABLE template_catalog
    ADD COLUMN version         TEXT    NOT NULL DEFAULT '1.0.0',
    ADD COLUMN changelog       TEXT,
    ADD COLUMN forked_from_id  UUID    REFERENCES template_catalog(id),
    ADD COLUMN forked_from_ver TEXT,
    ADD COLUMN component_type  TEXT
                               CHECK (component_type IN ('role','prompt','memory_schema','schedule','approval','eval')),
    ADD COLUMN cert_status     TEXT    NOT NULL DEFAULT 'uncertified'
                               CHECK (cert_status IN ('uncertified','experimental','community','verified')),
    ADD COLUMN cert_score      NUMERIC(4,2),
    ADD COLUMN cert_checked_at TIMESTAMPTZ,
    ADD COLUMN outcome_data    JSONB   NOT NULL DEFAULT '{}'::jsonb;

  ALTER TABLE template_deployments
    ADD COLUMN template_version TEXT,
    ADD COLUMN activated_at     TIMESTAMPTZ,
    ADD COLUMN last_active_at   TIMESTAMPTZ,
    ADD COLUMN is_active        BOOLEAN NOT NULL DEFAULT TRUE;

  CREATE TABLE template_evals (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id  UUID        NOT NULL REFERENCES template_catalog(id) ON DELETE CASCADE,
    version      TEXT        NOT NULL,
    scenario     TEXT        NOT NULL,
    result       TEXT        NOT NULL CHECK (result IN ('pass','partial','fail')),
    score        NUMERIC(4,2),
    detail       JSONB,
    run_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX idx_template_evals_template ON template_evals (template_id, run_at DESC);

  ALTER TABLE template_evals ENABLE ROW LEVEL SECURITY;
  CREATE POLICY template_evals_select ON template_evals FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY template_evals_service ON template_evals FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
  ```
- [ ] Verify migration runs cleanly locally

### Chunk 1-C: Deploy Engine

- [ ] Edit `src/lib/templates/deploy.ts`:
  - After creating assistant(s), call `applyLivingSpecHints(assistantId, spec, orgId, userId)`:
    - `default_schedules`: for each non-optional ScheduleHint, call the scheduled tasks API to create a cron task
    - `channel_hints`: store hints in assistant metadata (not auto-connected — channels need secrets)
    - `memory_schema`: store as `assistant_memory_config` JSONB on `ai_assistants` (new column — see below)
  - Record `template_version` in `recordTemplateDeployment()`
- [ ] Add `memory_config JSONB` column to `ai_assistants` via migration (or piggyback on same migration)
- [ ] `applyLivingSpecHints` is fail-open: schedule creation failure → warning, not rollback

### Chunk 1-D: Seed Updates

- [ ] Update 5-6 priority seed JSONs with living spec fields (pick the richest templates):
  - `content-machine`: add `default_schedules` (weekly SEO audit cron), `memory_schema` (brand voice, competitor intel)
  - `brand-monitor`: add `default_schedules` (daily monitoring cron), `memory_schema` (known mentions, sentiment baseline)
  - `sales-outreach-lemlist`: add `memory_schema` (prospect history, response patterns), `channel_hints` (slack for alerts)
  - `dev-monitor`: add `default_schedules` (daily GitHub digest cron)
  - `churn-radar`: add `default_schedules` (weekly at-risk account scan)
- [ ] All seed JSONs still validate against updated `TemplateSpecSchema`

### Chunk 1-E: Tests

- [ ] Update `src/lib/templates/__tests__/render.test.ts`: verify `memory_schema`, `default_schedules` survive `{{VARIABLE}}` substitution intact
- [ ] Update `src/lib/templates/__tests__/deploy.test.ts`:
  - Add test: `applyLivingSpecHints` called after assistant creation
  - Add test: schedule hint creates cron task; failure is non-fatal
- [ ] Typecheck + full test suite

---

## Phase 2 — Eval + Certification

Goal: automated eval runner, cert pipeline, certification badges in UI.

**Estimated: 3-4 days.**

### Chunk 2-A: Eval Runner

- [ ] Create `src/lib/templates/eval.ts`:
  - `runTemplateEval(templateId, version, orgId)`:
    1. Fetch template + `eval_pack` scenarios
    2. Deploy ephemeral agent (temp org or sandbox flag) by installing the Lucid Pack and materializing its deploy-compatible resource
    3. For each scenario: POST to `/api/assistants/[id]/chat` with scenario prompt, await response
    4. Score response: check `expected_behaviors` (string inclusion) + `must_not_contain`
    5. Insert rows into `template_evals`
    6. Compute `cert_score` = pass count / total
    7. Set `cert_status`: score ≥ 0.9 → `verified`/`community`, score ≥ 0.6 → `experimental`, else `uncertified`
    8. Destroy ephemeral agent
  - Timeout: 60s per scenario, 5min total
  - Fail-open: if eval infra fails, log + skip (do not block template publishing)

- [ ] Create `src/app/api/internal/templates/eval/route.ts` (service_role only):
  - POST `{ template_id, version }` → triggers `runTemplateEval()` async
  - Used by: seed runner (for platform templates), community review pipeline

### Chunk 2-B: Seed Runner Integration

- [ ] Edit `src/lib/templates/seeds/seed.ts`:
  - After upsert, if template has `eval_pack` and env is not CI, trigger eval via internal API
  - Log cert result per template

### Chunk 2-C: UI — Certification Badge

- [ ] Edit `src/components/templates/template-card.tsx`:
  - Show badge based on `cert_status`: `verified` (green checkmark), `community` (blue), `experimental` (amber), none (gray)
  - Show `cert_score` as percentage on badge tooltip

- [ ] Edit template gallery filter: add "Verified only" toggle

### Chunk 2-D: Tests

- [ ] Unit test `eval.ts`: mock chat API, verify scoring logic for pass/partial/fail
- [ ] Integration test: deploy + eval + cert_status update (mocked chat)

---

## Phase 3 — Outcome Network

Goal: track real deployment outcomes, surface in gallery ranking.

**Estimated: 2-3 days.**

### Chunk 3-A: Activation Tracking

- [ ] Edit `src/app/api/assistants/[id]/channels/route.ts` (POST):
  - After successful channel connect, find the `template_deployments` row for this assistant (if any)
  - Set `activated_at = NOW()` if not already set

- [ ] Create `src/lib/templates/outcomes.ts`:
  - `recordLastActive(assistantId)`: called from inbound message processor — sets `last_active_at = NOW()` on matching deployment row
  - `markDeploymentInactive(assistantId)`: called if assistant is deleted

### Chunk 3-B: Outcome Cron

- [ ] Create Vercel cron or worker cron `template-outcomes`:
  - Runs weekly (Monday midnight UTC)
  - For each `template_id` in `template_catalog` (source=platform or status=approved):
    - Count deployments in last 30 days → `install_count`
    - Count activated / total → `activation_rate`
    - Count still active at day 7 / activated → `week1_retention`
    - Median `mc_agent_cost_tracking.daily_cost_usd` for deployed agents → `median_cost_per_run`
    - Average task completion rate from `agent_scheduled_tasks` → `task_completion_rate`
  - Write to `template_catalog.outcome_data` (atomic JSONB update)

### Chunk 3-C: Gallery Ranking

- [ ] Edit `src/lib/db/templates.ts` `listTemplates()`:
  - Add computed `outcome_score` in ORDER BY:
    ```sql
    (
      COALESCE((outcome_data->>'activation_rate')::float, 0) * 0.3 +
      COALESCE((outcome_data->>'week1_retention')::float, 0) * 0.4 +
      COALESCE((rating_avg), 0) / 5.0 * 0.3
    ) DESC
    ```
  - Expose `outcome_data` in the list response

- [ ] Edit `template-card.tsx`: show activation rate + retention as small metrics on the card

---

## Phase 4 — Fork / Lineage / Remix

Goal: community fork-and-improve loop. Lineage tree visible in UI.

**Estimated: 3-4 days.**

### Chunk 4-A: Fork API

- [ ] Create `src/app/api/templates/[id]/fork/route.ts` (POST, authenticated):
  - Copies template spec into new `template_catalog` row:
    - `source = 'org'`, `status = 'draft'`, `owner_org_id = orgId`
    - `forked_from_id = originalId`, `forked_from_ver = original.version`
    - `version = '1.0.0'`, `name = 'Fork of {original.name}'`
  - Returns new template ID
  - Org admin only

- [ ] Create `src/components/templates/fork-button.tsx`: "Fork" button on template detail page

### Chunk 4-B: Lineage Table

- [ ] Add to migration or new migration:
  ```sql
  CREATE TABLE template_lineage (
    ancestor_id   UUID NOT NULL REFERENCES template_catalog(id),
    descendant_id UUID NOT NULL REFERENCES template_catalog(id),
    depth         INTEGER NOT NULL,
    PRIMARY KEY (ancestor_id, descendant_id)
  );
  -- Populate on insert via trigger
  ```
- [ ] Trigger: on `template_catalog` INSERT with `forked_from_id` set, walk ancestor chain and insert lineage rows

### Chunk 4-C: Lineage UI

- [ ] On template detail page: "Forked from [original name]" breadcrumb if `forked_from_id`
- [ ] "N forks" count shown on original template
- [ ] Lineage tree visualization (simple indented list for MVP; D3 graph later)

### Chunk 4-D: Upstream Update Notifications

- [ ] When a platform template version is bumped (via seed runner), find all org templates with `forked_from_id = id`:
  - Insert notification: "The template you forked ({name}) has been updated to v{version}"
  - Surface in in-app notifications (or MC feed event)

### Chunk 4-E: Remixable Subcomponents

- [ ] Add `kind = 'component'` to the Zod schema discriminated union:
  ```typescript
  ComponentTemplateSpecSchema = z.object({
    kind: z.literal('component'),
    component_type: z.enum(['role','prompt','memory_schema','schedule','approval','eval']),
    content: z.unknown(),   // typed per component_type
  })
  ```
- [ ] Update `template_catalog` RLS to include components in SELECT policy
- [ ] Gallery filter: "Components" section separate from full templates
- [ ] 3-5 initial component seeds: "SDR Account Memory Schema", "Weekly Brand Monitoring Schedule", "Trading Safety Guardrails", "Support Agent Eval Pack"

---

## Phase 5 — Public Proof Pages + Open Source Repo

Goal: zero-auth public gallery, per-template SEO proof page, GitHub-backed community contributions.

**Estimated: 3-4 days.**

### Chunk 5-A: Public Gallery Route

- [ ] Create `src/app/(marketing)/templates/page.tsx`:
  - Server component, no auth required
  - Lists `is_public=true AND status='approved'` templates from `template_catalog`
  - Filters by category, kind, cert_status, tags
  - Sorted by `outcome_score DESC`
  - SEO metadata: title, description, OG image per category

- [ ] Create `src/app/(marketing)/templates/[slug]/page.tsx`:
  - Per-template proof page
  - Sections: header (name, description, badges), metrics strip (installs, activation, retention), params list, plugin list, lineage tree, ratings/reviews, "Deploy to Lucid" CTA
  - `generateMetadata()` for full SEO

### Chunk 5-B: Demo Chat Widget (MVP)

- [ ] On each public template proof page, embed a sandboxed chat:
  - Deploys a read-only ephemeral agent from the template spec with safe defaults
  - Max 5 messages per session, no tool execution (prompt-only mode)
  - Shows what the agent "sounds like" without requiring account creation

### Chunk 5-C: Open Source Template Repository

- [ ] Create `github.com/lucid-fdn/templates`:
  - One JSON file per template in `templates/` directory
  - `schema/template.schema.json` (generated from Zod)
  - CI workflow: validate each JSON against schema on PR
  - `CONTRIBUTING.md`: how to write and submit a community template
  - GitHub Actions: on merge to main → webhook hits `/api/internal/templates/sync-from-github`
  - Internal sync endpoint: upserts templates from repo into `template_catalog` (service_role)

### Chunk 5-D: Community Submission Flow (In-App)

- [ ] "Publish to Community" button on org template detail page (status=draft or approved)
- [ ] Opens modal:
  - Pre-fills template JSON for review
  - Links to open a GitHub PR in `lucid-fdn/templates`
  - Copies template JSON to clipboard + opens GitHub new-file URL
  - Shows contributor instructions inline
- [ ] After submission, set `status = 'pending_review'` locally

---

## Phase 6 — Post-Deploy Optimization Loop (Mission Control Integration)

Goal: nudges that help users get more value after deploying a template.

**Estimated: 2-3 days. Can run in parallel with Phase 5.**

### Chunk 6-A: Recommendations Engine

- [ ] Create `src/lib/templates/recommendations.ts`:
  - `getPostDeployRecommendations(assistantId, templateId)`: returns list of `Recommendation[]`
  - Checks:
    - Template `eval_pack` plugin requirements vs installed plugins → "Missing plugin X"
    - Template `default_schedules` vs created tasks → "Schedule not set up"
    - Template `channel_hints` vs connected channels → "Channel not connected"
    - `activated_at` is null after 24h → "Connect a channel to activate your agent"
    - Newer version available → "Update available (v{version} → v{latest})"

### Chunk 6-B: Surface in Agent Detail

- [ ] Edit `src/components/assistant/post-create-guide.tsx`:
  - If agent was deployed from a template, show template-specific hints (channel hints, schedule hints)
  - Show "Update available" banner if template version behind

### Chunk 6-C: Surface in Mission Control

- [ ] Edit `src/components/dashboard/action-items-panel.tsx`:
  - Add "Template recommendations" section: agents with unresolved post-deploy recommendations
  - Shows agent name + recommendation type

---

## Verification Checklist (Full Plan)

- [ ] `npm run typecheck` — clean
- [ ] `npm run test -- --run` — full frontend suite
- [ ] `cd worker && npm run typecheck` — clean (if worker touched)
- [ ] `cd worker && npm run test -- --run` — full worker suite (if worker touched)
- [ ] Migration runs clean on fresh Supabase project
- [ ] All 18 seed JSONs pass updated `TemplateSpecSchema` validation
- [ ] Platform templates show `cert_status=verified` after eval run
- [ ] Fork creates correct `forked_from_id` chain
- [ ] Lineage trigger populates `template_lineage` table correctly
- [ ] Public gallery page renders without auth (test with incognito)
- [ ] SEO metadata correct on proof pages (check `<title>`, `og:description`, `og:image`)

---

## Rollout Order

1. Phase 1 (Living Spec) — no UI change, pure backend. Safe to ship immediately.
2. Phase 2 (Evals) — internal eval runner. Safe to ship behind service_role gate.
3. Phase 3 (Outcomes) — cron + DB updates. Safe to ship; cron runs weekly.
4. Phase 4 (Fork/Lineage) — new API + UI. Ship after outcomes so fork pages have real data.
5. Phase 5 (Public pages + GitHub repo) — public launch moment. Announce when shipped.
6. Phase 6 (Post-deploy nudges) — continuous improvement. Can ship incrementally.

---

## Deferred (Out of Scope for This Plan)

| Item | Notes |
|---|---|
| Revenue sharing for premium templates | Separate spec — requires Stripe Connect |
| Creator profile pages | Nice to have; depends on community volume |
| Full-text Elasticsearch search | Needed at 500+ templates |
| LLM-based eval scoring | Current scoring is string-match; upgrade later |
| D3 lineage graph visualization | MVP uses indented list |
| Real-time demo chat with tool execution | MVP is prompt-only |
| Template A/B testing | Platform experiments infrastructure needed first |
