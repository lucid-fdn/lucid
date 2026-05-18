# Capability Templates

Capability templates are Lucid Pack-backed templates that launch a full operating capability, not just one agent. They use the same template architecture as simple agent and team templates; they just declare more resources.

Use them when the user needs an ongoing workflow such as Web3 intelligence, launch readiness, browser monitoring, or commerce-safe buying. A capability template can compose:

- agents and teams
- workflows and routines
- knowledge sources
- browser procedures
- policies and approval gates
- channel commands
- docs and runbooks

## How Install Works

Before install, Lucid shows a preview:

- **Creates:** resources this template will add.
- **Reuses:** installed resources that already match the template.
- **Updates:** managed resources that can be reconciled.
- **Forks or review:** resources where local edits are protected.
- **Needs setup:** missing providers, watchlists, wallets, or channels.
- **Approvals:** risky capabilities that require an approval policy.

Blocked templates cannot be installed until the blocking conflict is resolved.

## Provisioning

Capability templates provision safely and incrementally:

- agents create real assistants when a project and default environment are available
- policies register into Agent Ops project policy metadata
- knowledge sources create real Lucid Knowledge source records
- browser procedures create real Browser Operator procedures and versions
- routines can create Agent scheduled tasks when they are explicitly enabled and have a provisioned agent plus cron-compatible cadence
- workflows, host playbooks, skills, docs, and channel commands register into the managed-resource ledger with health/setup status until their native surfaces are safe to materialize
- missing setup marks the resource as `needs_setup` instead of failing the whole install
- reconcile re-runs provisioning so templates can recover after setup is completed

This keeps the architecture vertical-agnostic while allowing deeper native materializers to be added over time.

## Safety Model

Capability templates must not contain raw secrets. They may reference integrations, provider types, or secret manager references, but never embed literal API keys, passwords, cookies, or private keys.

Mutating actions such as swaps, transfers, prediction trades, checkout, publish, delete, or payment must be guarded by explicit policy. Read-only intelligence should be the default posture.

## Web3 Intelligence Templates

The first first-party capability templates are:

- **Whale Watchtower**
- **Token War Room**
- **Prediction Market Alpha Desk**
- **Portfolio Risk Agent**
- **Smart Wallet Copy Desk**
- **Web3 Intelligence Suite**

These templates reuse Lucid's existing Web3 tools, Agent Ops, Mission Control, wallet/trading guardrails, and memory systems. They do not introduce a parallel runtime.

## Seeding Platform Templates

Operators can seed all first-party platform templates into the governed Lucid Pack catalog:

```bash
npm run templates:seed -- --dry-run
npm run templates:seed
```

The dry run validates manifests and prints the templates that would be seeded. The live command requires Supabase service credentials. `npm run capability-templates:seed` remains available as a Web3-only compatibility seed, but `npm run templates:seed` is the canonical first-party path.

## Authoring Standard

Capability templates must pass conformance, and all first-party template packs must pass the Pack validation gate:

- valid `LucidPackManifest`
- `composition.provides` declares at least one capability
- each operational capability can declare `progress: { phase, label }` so channels and web chat show precise status without guessing from prompt text
- managed resource keys are unique
- no embedded secrets in resources, composition, or metadata
- high-risk capabilities ship with an approval policy

This keeps templates composable for first-party and future community authors.

Run conformance locally:

```bash
npm run templates:validate
npm run capability-templates:validate
npm run capability-templates:validate -- ./path/to/manifest.json
```

Run deterministic behavior simulations for first-party Web3 templates:

```bash
npm run capability-templates:simulate
```

The simulation gate validates that every shipped Web3 template can produce the standard `Summary`, `Findings`, `Evidence`, `Risks`, and `Next actions` response shape from realistic whale, token, portfolio, prediction-market, and copy-trading fixtures. It also checks that trading or automation templates remain approval-gated and never claim to execute swaps, transfers, or prediction trades during template validation.

Run the live external-market smoke before customer demos or production promotion:

```bash
npm run capability-templates:simulate:live
```

The live smoke is read-only. It pulls current data from Ethereum RPC, DexScreener, and Polymarket Gamma, then runs one live scenario through each first-party Web3 template. The gate fails if a live source is unavailable, a scenario no longer matches the template capability contract, the standard response sections are missing, unsafe execution language appears, or any scorecard category drops below the quality threshold.

By default the live gate is strict: Ethereum RPC, DexScreener, and Polymarket must all be reachable. Use `--allow-fixture-fallback` only for local debugging when external providers are down; do not use fallback mode for demos, release promotion, or customer-readiness claims. `WEB3_ETHEREUM_RPC_URL` can override the default public Ethereum RPC endpoint.

Run the live stress/outcome quality gate when validating customer readiness:

```bash
npm run capability-templates:stress:live -- --iterations 3 --concurrency 6
```

The stress gate expands live market data into realistic operator asks for every Web3 template, repeats them under concurrency, and grades the resulting outcomes for evidence diversity, live-data anchors, actionability, risk clarity, Mission Control handoff, template fit, and no unsafe execution claims.

Run the real LLM-backed live stress gate before claiming production answer quality:

```bash
npm run capability-templates:stress:llm-live -- --iterations 3 --concurrency 5
```

This gate asks the actual configured model through the OpenAI-compatible inference path. It uses TrustGate/OpenAI by default for local quality validation, and only uses Lucid gateway inference when `CAPABILITY_TEMPLATE_LLM_ENABLE_LUCID=true` is set. It uses the same live Ethereum RPC, DexScreener, and Polymarket evidence, then fails if model answers are thin, ungrounded, missing risk/approval language, missing Mission Control handoff, or making unsafe execution claims.

The LLM gate loads `.env` and `.env.local`, then tries providers in order: Lucid when explicitly enabled, TrustGate, OpenAI. Provider fallback is reported in the output so an unhealthy explicitly enabled primary inference path remains visible even when the quality gate can continue through a backup model. Optional knobs: `CAPABILITY_TEMPLATE_LLM_ENABLE_LUCID`, `CAPABILITY_TEMPLATE_LLM_BASE_URL`, `CAPABILITY_TEMPLATE_LLM_MODEL`, `LUCID_API_BASE_URL`, `TRUSTGATE_BASE_URL`, `OPENAI_MODEL`, `--threshold`, `--timeout-ms`, `--iterations`, `--concurrency`, and `--template`.

Authoring references:

- [Capability Authoring](./capability-authoring.md)
- [Composition Metadata](./composition.md)

First-party agent/team templates now use the same product-facing Templates library and are seeded as Lucid Packs by:

```bash
npm run templates:seed -- --dry-run
npm run templates:seed
```

The old `template_catalog` schema is retired. Active first-party, org-authored, and capability templates should be Lucid Pack-backed. Use these gates for non-Web3 agent/team template families:

```bash
npm run templates:simulate
npm run templates:stress:llm-live -- --iterations 1 --concurrency 3 --threshold 10 --report docs/generated/template-live-quality-report.md
```

The agent-team template harness covers sales/prospecting, support/success, marketing/content/social, executive/ops/legal, and personal productivity. It grades standard sections, evidence/provenance, human-review safety, actionability, Mission Control handoff, live-evidence accuracy, and unsafe side-effect claims.
