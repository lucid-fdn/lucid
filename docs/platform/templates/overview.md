# Templates Overview

Templates are pre-built operating capabilities you can deploy with one click. Instead of starting from scratch, pick a template that matches your use case, fill in a few parameters, and Lucid provisions the right agent, team, or governed capability.

## What Is a Template?

A template is a portable, parameterized Lucid Pack manifest for an agent, team, or whole capability. It can define:

- The system prompt (with `{{VARIABLE}}` placeholders for your specific values)
- Which plugins and integrations to install and activate
- Memory settings and guardrails
- For teams: the full crew structure — member roles, prompts, and message flow
- The workflows, routines, policies, knowledge sources, channel commands, browser procedures, evals, and setup requirements that make the template operable

Templates reference catalog entries by slug, not by live IDs, so they work across any org without modification.

## Three Template Kinds

| Kind | What It Creates |
|------|----------------|
| **Agent** | A single AI assistant with plugins, memory, and settings configured |
| **Team** | A crew of N agents with defined roles, handoffs, and a coordinator |
| **Capability** | A governed operating capability composed from agents, workflows, routines, policies, knowledge, and channel commands |

First-party platform templates are backed internally by Lucid Packs. The same managed-resource lifecycle now handles simple single-agent templates, team templates, and richer capability bundles. Users do not need to understand the internal layer; they just see Templates.

## One-Click Deploy

When you deploy or install a template:

1. You fill in the required parameters (brand name, topic, Slack channel, etc.)
2. Lucid installs the Pack into your project and creates a managed-resource ledger
3. Lucid renders any parameterized specs — substituting `{{VARIABLE}}` with your values
4. Agents, teams, policies, knowledge sources, browser procedures, routines, and channel commands are provisioned or marked as needing setup
5. Mission Control and the template health view show what was created, reused, blocked, or waiting for setup

The flow is idempotent and reconcileable. Simple agent/team templates still produce real assistants and crews, while richer templates can safely stage setup-dependent resources instead of pretending everything is live.

For templates with multiple resources, Lucid first shows an install preview:

- what will be created
- what will be reused
- what needs setup
- what requires approval
- what conflicts or needs review

Then Lucid installs a governed managed-resource ledger. Future updates can reconcile, fork, pause, resume, or archive resources without deleting evidence.

## Template Parameters

Each template defines its required parameters upfront. Common parameter types:

| Type | Example |
|------|---------|
| `text` | Brand name, topic, target reader |
| `email` | Alert recipient |
| `url` | Webhook endpoint |
| `secret` | API key (stored encrypted, never logged) |
| `select` | Dropdown with fixed options |

Required parameters must be provided. Optional parameters have defaults.

## Template Gallery

Browse all available templates at `/templates`. Templates are organized by category:

- **Content** — SEO articles, content pipelines, social media
- **Sales** — Outreach, pipeline monitoring, prospect research
- **Support** — Tier-1 triage, contract review, escalation routing
- **Marketing** — Campaign management, brand monitoring, NPS tracking
- **Analytics** — Competitive intel, dev monitoring, CEO briefings

Each template shows a description, the kind (agent, team, or capability), tags, setup requirements, and the right action for that kind. Under the hood all first-party templates are Lucid Pack-backed.

## Governance

Templates follow a three-tier source model, backed by Lucid Packs:

| Source | Created By | Review | Visible To |
|--------|-----------|--------|------------|
| `platform` | Lucid Pack seed | Pack conformance | Everyone |
| `community` | Future Pack marketplace submission | Lucid review + Pack conformance | Everyone once approved |
| `org` | Future workspace Pack authoring | Pack conformance | Your org only |

Platform templates ship with Lucid and are ready to use immediately. Community and org authoring create Lucid Packs directly; the old catalog-authoring routes are retired.

## Creator And Marketplace Flow

Creators use the same Pack contract as first-party templates:

1. Author a `LucidPackManifest`.
2. Validate it locally with `npm run templates:validate -- ./pack.json`.
3. Import it from `/templates` with **Import Pack JSON** to create a workspace-private Pack.
4. Preview, install, health-check, and reconcile the Pack from the same gallery.
5. Submit the imported Pack, quality report, and setup notes for marketplace review when it is ready for broader distribution.

The gallery includes a creator marketplace card so operators do not need to know the old catalog system existed. Example manifests live in [`./examples`](./examples/README.md).

Marketplace submissions are Pack-native. `/api/templates/marketplace-submissions` stores one review record per workspace Pack with status, quality evidence, submitter, review notes, and timestamps. Approval can later promote the Pack to a public/community listing, but submission itself never makes a Pack globally visible. That keeps the creator UX self-serve while preserving Lucid’s safety, quality, and secret-scanning gates.

## Quality And Live Simulation

Lucid validates template value before launch with two layers:

- Deterministic simulation: `npm run templates:simulate` and `npm run capability-templates:simulate`.
- Live-source simulation: `npm run templates:simulate:live`, `npm run templates:stress:live`, `npm run templates:stress:llm-live`, and `npm run capability-templates:simulate:live`.
- LLM quality reports: `npm run templates:stress:llm-live -- --iterations 1 --concurrency 3 --threshold 10 --report docs/generated/template-live-quality-report.md`.

For non-Web3 agent/team templates, live simulation fetches public external anchors from GitHub repo/issues/status, Hacker News, and npm downloads, then requires answers to cite those anchors with evidence, provenance, risk, human-review safety, Mission Control handoff, and no claims that Lucid sent, published, refunded, scheduled, or mutated external systems.

The LLM quality report stores the actual answer text plus quality percentage, live-anchor accuracy, matched anchors, missing anchors, latency, model, and provider. Lucid gateway inference is opt-in for this simulation gate via `CAPABILITY_TEMPLATE_LLM_ENABLE_LUCID=true`; this avoids hiding a bad gateway key behind fallback noise while preserving the ability to test Lucid directly when credentials are healthy.

For Web3 capability templates, live simulation fetches market/on-chain anchors and applies the same evidence, safety, and actionability rubric.

## Save as Template

The old catalog-backed "Save as Template" flow is retired while template authoring converges on Lucid Packs. The intended Pack-backed authoring flow is:

1. Start from an existing agent, team, or capability.
2. Export a Lucid Pack manifest.
3. Validate it with Pack conformance.
4. Review managed resources, setup requirements, and secret placeholders.
5. Publish it as a workspace or marketplace Pack.

Until the Pack authoring UI is rebuilt, use Pack manifests and the validation/seed tooling instead of the retired org template catalog endpoints.

## Related

- [Deploy a Template](./deploy.md)
- [Platform Templates](./platform-templates.md)
- [Save as Template](./save-as-template.md)
- [Capability Templates](./capability-templates.md)
- [Capability Authoring](./capability-authoring.md)
- [Composition Metadata](./composition.md)
