# Templates / Assemblies Stack

**Status:** Active
**Stack ID:** `templates`

Templates are the top-level product concept for launching reusable agent capabilities. Some templates create one agent, some create a team, and capability templates install a whole operating capability. Internally, first-party platform templates are Lucid Packs as the governed composition and lifecycle substrate. The old `template_catalog` schema is retired.

This is a major competitive lever. A template should not be "a prompt." It should be a reproducible operating model.

## Owns

- Template Pack contracts.
- Template parameter rendering.
- Agent and team specs.
- Capability template composition contracts.
- Lucid Pack implementation contracts for governed lifecycle.
- Deployment records.
- Assembly-level policies, eval packs, and AgentOps panel declarations.

## Does Not Own

- Runtime execution.
- Provider OAuth connection storage.
- Provider credentials.
- Operator UI after deployment.

## Current Surfaces

- `contracts/template.ts`: agent and team template contracts.
- `contracts/lucid-pack.ts`: internal managed-resource manifest and lifecycle contracts backing platform templates.
- `src/lib/templates/pack-adapter.ts`: conversion seam from agent/team template specs into Lucid Pack-backed templates and back into deploy-compatible `TemplateCatalogEntry` objects.
- `src/lib/templates/packs/*`: converged first-party template-pack catalog and seed script.
- `docs/platform/templates/examples/*`: importable creator Pack examples used by public authoring docs and validation smoke.
- `src/lib/templates/library.ts`: normalized `TemplateLibraryItem` contract for Lucid Pack-backed agent/team/capability templates.
- `src/lib/templates/library-server.ts`: canonical server loader for public marketing pages, project builder recommendations, workspace templates, and API consumers. It reads Lucid Packs only.
- `src/lib/templates/deploy.ts`: deployment rendering and agent/team provisioning.
- `src/lib/packs/*`: internal manifest safety, diff, reconcile, install health, and lifecycle helpers.
- `src/lib/templates/composition/*`: capability-template composition normalization, preview, Web3 capability vocabulary, and tests.
- `src/lib/templates/capabilities/catalog/*`: first-party capability-template catalog, currently Web3 Intelligence.
- `src/lib/db/lucid-packs.ts`: internal capability-template backing persistence for install, managed resources, reconcile, fork, and uninstall.
- `src/app/api/agent-ops/packs/*`: current internal/API surface for managed capability-template backing installs and previews.
- `src/app/api/templates/capabilities/*`: user-facing capability-template API aliases.
- `src/app/api/orgs/[id]/templates/`: retired catalog-authoring endpoint returning `410`; new authoring should use Lucid Pack APIs.
- `src/app/(marketing)/templates/`: public gallery.
- `src/app/(app)/[workspace-slug]/templates/`: app-scoped unified template gallery and detail routes. It shows agent, team, and capability templates together while routing each card/detail page to the correct deploy or Lucid Pack preview/install flow.
- `src/app/api/dags/templates/`: DAG template API surface.
- `worker/src/pulse/dag/template-loader.ts`: worker DAG template loader.

## Assembly Model

Agent and team templates can declare:

- agents and team topology,
- memory schema,
- integrations and scopes through plugin/skill declarations,
- eval scenarios,
- Agent Ops workflow bindings,
- work graph hints.

Capability templates compose those smaller specs and add stack-level operating policy. Internally they are backed by Lucid Packs, which can declare managed resources such as agents, teams, workflows, routines, knowledge sources, browser procedures, host playbooks, skills, docs, policies, and channel commands.

## Deployment Model

- Agent templates provision one assistant through the Lucid Pack managed-resource installer.
- Team templates provision assistants plus the existing crew-compatible orchestration record through the Lucid Pack managed-resource installer.
- Capability templates use the same governed managed-resource ledger with reconcile, drift, fork, pause, resume, and uninstall/archive semantics.
- Capability template resources do not imply provider credentials or unsafe runtime execution. Provisioners materialize safe resources, register resources that need deeper native adapters, and mark missing setup without rolling back the whole install.
- Native materializers currently create assistants, Agent Ops policy metadata, Lucid Knowledge sources, Browser Operator procedures, and explicitly enabled cron-compatible scheduled routines.
- Capability template install preview should expose required integrations, referenced/inline resources, Commerce policy, approval policy, eval pack, memory schema, and Agent Ops panels for review before mutation.

## Integration Rules

- Templates may declare desired capabilities; deployment must enforce Trust and entitlement gates.
- Templates must never store raw secrets. Secret params may declare required input, but cannot define defaults. Provider manifests may use placeholders or secret references, not raw keys/tokens.
- Template install should produce durable deployment records for rollback and audit.
- Generated app templates must respect App Service public/operator gateway boundaries.
- Commerce declarations must install policy, not provider-specific credentials.

## Backlog Direction

- Expand capability-template install/health views from the Templates page into Mission Control and run detail surfaces.
- Add deeper staged materializers for generic workflow definitions, channel command registration, teams, docs, skills, and host playbooks where those product tables support fully generic inserts.
- Add marketplace submission/review UI on top of the implemented public creator/conformance documentation.
- Add validation that template deployments cannot bypass approval-required tools.
- Add stack tags to template catalog entries so users can filter by capability.
- Deepen native materializers for pack-backed agent/team templates when we want reconcile/fork/uninstall to manage already-deployed assistants and crews directly rather than using the deploy-compatible path.

## Product Rule

Users should see one concept: **Templates**. "Capability template" and "Lucid Pack" are implementation/lifecycle details. UI can badge cards as `Agent`, `Team`, or `Capability`, but should not split them into separate launch libraries unless the user explicitly filters.

## Unified Library Contract

All template consumers should prefer `TemplateLibraryItem` from `src/lib/templates/library.ts`.

- `type: agent | team | capability` is the user-facing template type.
- `backingKind: lucid_pack` is the active internal persistence/provisioning substrate.
- `action: deploy | preview_install` tells UI whether to open the Pack-backed deploy flow or governed capability-template install preview.
- `GET /api/templates` returns deploy-compatible `templates` plus normalized Lucid Pack-backed `items`.
- Public `/templates`, agent/team builder pages, and template recommendation APIs use the normalized server loader.
- `/templates/[id]` and project template detail routes resolve Lucid Pack-backed templates only.
- Seed the converged catalog with `npm run templates:seed` or preview it with `npm run templates:seed -- --dry-run`.
- Validate first-party or creator Pack manifests with `npm run templates:validate`; pass JSON files as arguments for creator/import validation.
- Workspace owners/admins can import Pack JSON from `/templates`. Imported Packs are workspace-private until a reviewed marketplace publication flow promotes them.

## Quality Gates

Agent-team platform templates now have their own deterministic and LLM-backed simulation harness:

```bash
npm run templates:simulate
npm run templates:simulate:live
npm run templates:stress:live -- --iterations 2 --concurrency 4 --threshold 9
npm run templates:stress:llm-live -- --iterations 1 --concurrency 3 --threshold 10 --report docs/generated/template-live-quality-report.md
```

These cover sales/prospecting, support/success, marketing/content/social, executive/ops/legal, and personal productivity templates. They check the same core answer quality expectations as Web3: standard sections, evidence/provenance, risk and human-review safety, actionable next steps, Mission Control handoff, live-source accuracy, and no unsafe side-effect claims. The LLM live-stress report captures the actual answer, quality percentage, live-evidence accuracy, matched anchors, missing anchors, model, provider, and latency for each template.

The live agent/team harness is `src/lib/templates/simulation/agent-team-live.ts`. It fetches public external signals from GitHub repo metadata, GitHub issues, GitHub status, Hacker News, and npm downloads, maps those signals into each vertical family, and requires generated answers to preserve live evidence anchors. This makes non-Web3 templates prove freshness/grounding instead of only passing static fixture rubrics.

Template LLM stress uses TrustGate/OpenAI by default for deterministic quality gates. To test the Lucid gateway explicitly, set `CAPABILITY_TEMPLATE_LLM_ENABLE_LUCID=true`; otherwise an unhealthy `LUCID_API_KEY` will not create noisy fallback messages during template readiness checks.

Web3 capability templates keep their external-market live harness:

```bash
npm run capability-templates:simulate:live
npm run capability-templates:stress:live -- --iterations 3 --concurrency 6
npm run capability-templates:stress:llm-live -- --iterations 3 --concurrency 5
```

## Migration Strategy

First-party platform templates are Lucid Pack-backed. `template_catalog`, `template_deployments`, `template_ratings`, and `template_evals` are retired by migration; Pack installs and managed resources are the source of truth.

Org template catalog authoring is retired. New authoring should create/update Lucid Packs directly through the pack API and conformance gates.
