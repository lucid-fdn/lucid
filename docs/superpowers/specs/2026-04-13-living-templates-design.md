# Living Templates — Design Spec

**Status:** Draft
**Date:** 2026-04-13
**Codex verdict:** "n8n shares automations. Lucid deploys AI teammates."

---

## Problem

The current template system is a snapshot system. A template is a spec you deploy once — after that, the deployed agent is on its own. There is no versioning, no post-deploy improvement signal, no community lineage, no proof of outcomes, and no way for a template to carry memory schemas, schedules, or approval policies. This makes Lucid's template gallery structurally equivalent to n8n's (9,000+ workflows), just smaller.

The structural moat we have — persistent identity, compounding memory, multi-agent teams, autonomous scheduling, multi-channel presence, governance, DAG planning — is not expressed in the template system at all. Templates should embody all of that, not just the prompt.

---

## Vision

**A Living Template is a deployable AI workforce, not a workflow snapshot.**

It ships with:
- Versioned spec with an upgrade path
- Memory schema (what the agent should remember, in what categories)
- Default schedules (what the agent should do proactively)
- Team topology (roles, edges, coordinator — for team templates)
- Channel bindings (which channels to connect, with what config)
- Guardrails (cost limits, approval-required tools, budget caps)
- Eval pack (scenario prompts + expected behaviors for certification)
- Outcome metrics (deployment count, activation rate, retention, cost/outcome)

After deployment:
- Template installs are tracked and measured
- The platform surfaces post-deploy recommendations (missing integrations, better parameters)
- Creators publish updates; deployed instances can opt into upgrades
- Community can fork, remix, and publish derivatives with lineage tracked

---

## Core Concepts

### 1. Template Version

Every template has a `semver` version (`1.0.0`, `1.1.0`, etc.). When a creator publishes an update:
- Existing deployments are notified ("Authority Engine v1.1 available — what changed")
- Org admins can review the diff and upgrade or stay on the current version
- Deployed agents are never auto-upgraded (always opt-in)

### 2. Living Spec Extension

The current `AgentTemplateSpec` and `TeamTemplateSpec` gain new optional sections:

```typescript
interface LivingAgentSpec extends AgentTemplateSpec {
  // Memory
  memory_schema?: MemorySchemaHint[]     // categories + importance hints
  board_memory_hints?: string[]          // suggested org knowledge entries

  // Autonomy
  default_schedules?: ScheduleHint[]    // cron expressions + task prompts

  // Channels
  channel_hints?: ChannelHint[]         // suggested channel types + setup notes

  // Governance
  approval_required_tools?: string[]    // tools needing human approval
  cost_limit_per_run_usd?: number
  cost_limit_daily_usd?: number

  // Evals
  eval_pack?: EvalScenario[]            // test prompts + expected behaviors
}

interface MemorySchemaHint {
  category: 'fact' | 'preference' | 'instruction' | 'context'
  description: string       // e.g. "Remember the user's preferred report format"
  importance_floor: number  // 0.0–1.0 — memories below this aren't worth keeping
}

interface ScheduleHint {
  cron: string              // e.g. "0 9 * * MON"
  prompt: string            // e.g. "Run your weekly brand monitoring report"
  description: string       // shown to user during deploy
  optional: boolean         // user can skip this schedule
}

interface ChannelHint {
  channel_type: string      // e.g. "slack", "telegram"
  required: boolean
  setup_note: string        // e.g. "Connect Slack to receive daily digests"
}

interface EvalScenario {
  name: string
  prompt: string            // test input
  expected_behaviors: string[]  // what a passing response must include
  must_not_contain?: string[]   // failure conditions
}
```

### 3. Eval + Certification

Before a community template is marked `approved`, it passes automated eval:
1. Scenario prompts from `eval_pack` are run against a sandboxed deployment
2. Each scenario is scored: pass / partial / fail
3. Plugin health is checked (all declared plugins available and responding)
4. A certification badge is assigned: `verified`, `community`, or `experimental`

Platform templates are certified by Lucid. Community templates start as `experimental` and earn `verified` through sufficient real-world deployment data + eval pass rate.

### 4. Outcome Network

Every deployed template reports anonymized operational metrics back to the gallery:
- Deployment count + activation rate (did user connect a channel within 72h?)
- Week-1 retention (is the agent still active 7 days after deploy?)
- Cost per run (median)
- Task completion rate (for scheduled tasks)
- Human rating (from template_ratings)

Gallery ranking is: `outcome_score` (weighted composite) + `install_count` + `human_rating`. Not just likes.

### 5. Fork / Remix / Lineage

Any public template can be forked into an org-private draft. The fork records `forked_from_id` + `forked_from_version`. The gallery shows the lineage tree: original → forks → forks of forks.

When the original publishes an update, forked templates see a "upstream updated" notification. Fork authors can pull in specific changes or ignore them. Lineage is visualized as a graph on the public template page.

### 6. Remixable Subcomponents

Not every shareable unit is a full template. The platform supports sharing discrete components:

| Component | What It Is | Example |
|---|---|---|
| Agent Role | A single member spec (role + prompt + plugins) | "SDR Research Agent" |
| Prompt Pack | A system prompt with params | "Cold outreach prompt — B2B SaaS" |
| Memory Schema | A set of MemorySchemaHints | "Account history schema for CS agents" |
| Schedule Pack | A set of ScheduleHints | "Weekly brand monitoring schedule" |
| Approval Policy | approval_required_tools + cost limits | "Trading safety guardrails" |
| Eval Pack | A set of EvalScenarios | "Support agent quality benchmark" |

These live in the same `template_catalog` table under `kind='component'` and a `component_type` column.

### 7. Public Proof Pages

Each template has a public URL (`lucid.foundation/templates/[slug]`) that shows:
- Description and parameter list
- Certification badge + eval score
- Deployment metrics (install count, activation rate, retention)
- "Used by N orgs" with industry tags
- Lineage tree (forked from / forked by)
- Ratings and reviews (tied to real deployments, not anonymous)
- "Deploy to Lucid" CTA (redirects to in-app with template pre-selected)
- Live demo chat widget (sandboxed ephemeral instance, read-only)

This is the SEO surface. Not just a gallery — proof that the template works.

### 8. Post-Deploy Optimization Loop

After deploying a template, Mission Control surfaces:
- "This template works better with [apollo] — you don't have it installed yet"
- "86% of Authority Engine deployments use a weekly schedule — add one?"
- "Your brand-monitor is running but hasn't sent a Slack alert in 7 days — check your channel config"
- "A newer version (v1.2) of this template is available — 3 changes"

These surface in the agent detail page and Mission Control dashboard as contextual nudges, not notifications spam.

### 9. Creator Profiles + Economic Loop

Every community template creator gets:
- A public profile page with their templates, installs, and verified outcomes
- Attribution shown on every deployed instance ("Template by @creator")
- "Trending creator" badge when their templates gain organic traction

Future (Phase 2): revenue sharing for premium templates (creators set a price, Lucid takes a cut, deployers pay once or subscribe).

### 10. Open Source Repository

`github.com/lucid-fdn/templates` — one JSON file per template, CI validates against the Zod schema on every PR. Merge → auto-seeded to production. Community forks the repo, edits JSON, opens a PR. Lucid reviews and merges. Git history is the template version history.

---

## DB Schema Changes

### template_catalog additions
```sql
ALTER TABLE template_catalog
  ADD COLUMN version         TEXT    NOT NULL DEFAULT '1.0.0',
  ADD COLUMN changelog       TEXT,
  ADD COLUMN forked_from_id  UUID    REFERENCES template_catalog(id),
  ADD COLUMN forked_from_ver TEXT,
  ADD COLUMN component_type  TEXT,   -- NULL for full templates; 'role'|'prompt'|'memory_schema'|'schedule'|'approval'|'eval'
  ADD COLUMN cert_status     TEXT    NOT NULL DEFAULT 'uncertified'
                             CHECK (cert_status IN ('uncertified','experimental','community','verified')),
  ADD COLUMN cert_score      NUMERIC(4,2),   -- 0.00–1.00 eval pass rate
  ADD COLUMN cert_checked_at TIMESTAMPTZ,
  ADD COLUMN outcome_data    JSONB   NOT NULL DEFAULT '{}'::jsonb;
  -- outcome_data: { install_count, activation_rate, week1_retention, median_cost_per_run, task_completion_rate }
```

### template_deployments additions
```sql
ALTER TABLE template_deployments
  ADD COLUMN template_version TEXT,
  ADD COLUMN activated_at     TIMESTAMPTZ,  -- when user first connected a channel
  ADD COLUMN last_active_at   TIMESTAMPTZ,  -- for retention tracking
  ADD COLUMN is_active        BOOLEAN NOT NULL DEFAULT TRUE;
```

### New: template_evals
```sql
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
```

### New: template_lineage (materialized view or table for graph queries)
```sql
-- Populated from forked_from_id chain; updated on insert/update of template_catalog
CREATE TABLE template_lineage (
  ancestor_id    UUID NOT NULL REFERENCES template_catalog(id),
  descendant_id  UUID NOT NULL REFERENCES template_catalog(id),
  depth          INTEGER NOT NULL,
  PRIMARY KEY (ancestor_id, descendant_id)
);
```

---

## API Changes

| Route | Method | Change |
|---|---|---|
| `/api/templates/[id]` | GET | Add `version`, `cert_status`, `cert_score`, `outcome_data`, `lineage` |
| `/api/templates/[id]/deploy` | POST | Record `template_version` in deployment; apply `memory_schema`, `default_schedules`, `channel_hints` post-deploy |
| `/api/templates/[id]/fork` | POST | New — creates org-private draft with `forked_from_id` |
| `/api/templates/[id]/upgrade` | POST | New — re-deploys from newer version onto existing agent |
| `/api/templates/[id]/eval` | POST | New — triggers eval run for a template version (service_role only) |
| `/api/templates/[id]/outcomes` | GET | New — returns aggregated outcome metrics |

---

## Phased Rollout

### Phase 1 — Living Spec (foundation)
- Extend `AgentTemplateSpec` / `TeamTemplateSpec` with `memory_schema`, `default_schedules`, `channel_hints`, `eval_pack`
- Deploy engine applies hints post-deploy (creates schedules, injects memory schema into agent config)
- DB: add `version`, `forked_from_id`, `cert_status`, `outcome_data` columns
- Update all 18 seed JSONs with minimal `memory_schema` + `default_schedules` hints
- Update `contracts/template.ts` Zod schemas

### Phase 2 — Eval + Certification
- `template_evals` table + eval runner (sandboxed ephemeral deploy + scenario prompts)
- Cert pipeline: uncertified → experimental → community → verified
- Certification badge in gallery UI and template cards
- Platform template auto-cert on every seed run

### Phase 3 — Outcome Network
- Track `activated_at`, `last_active_at`, `is_active` on deployments
- Weekly cron: compute outcome metrics from deployment + agent activity data
- Surface outcome scores in gallery ranking
- Outcome metrics shown on template detail page

### Phase 4 — Fork / Lineage / Remix
- `template_lineage` table + fork API
- Lineage tree visualization on template detail page
- Upstream update notifications to fork authors
- Remixable subcomponents (`kind='component'`)

### Phase 5 — Public Proof Pages + Open Source Repo
- Public gallery at `lucid.foundation/templates` (no auth)
- Per-template proof page with metrics, lineage, ratings, demo chat
- `github.com/lucid-fdn/templates` repo + CI validation
- Community submission flow: in-app → GitHub PR draft

### Phase 6 — Post-Deploy Optimization + Creator Economy
- Mission Control nudges: missing integrations, schedule suggestions, version updates
- Creator profiles with public stats
- Premium template pricing (deferred to separate spec)

---

## What n8n Cannot Build

| Lucid | n8n |
|---|---|
| Memory schema ships with the template | No memory concept |
| Default schedules — agent works autonomously from day 1 | Workflows require manual trigger or external cron |
| Multi-agent team topology versioned and upgradeable | Single-flow only |
| Channel bindings (Telegram, Discord, Slack native) | Integrations but no native channel identity |
| Approval policies + cost guardrails | No governance layer |
| DAG planner presets (researcher + operator + reviewer) | No planning primitives |
| Outcome metrics from live agent behavior | Static workflow execution logs |
| Soul + identity that persists across versions | Stateless workflows |

The frame: **n8n shares automations. Lucid deploys AI teammates.**
