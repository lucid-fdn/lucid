# Template Authoring

Templates package reusable Lucid operating capabilities. A template can be a single agent, a team, or a richer capability bundle. They can be first-party, workspace-private, or future community submissions.

The product word is **Template**. The internal lifecycle format is `LucidPackManifest`.

## Authoring Checklist

Before submitting a template:

- Define one clear user promise.
- Keep the default posture read-only unless the capability truly needs action.
- Declare `composition.provides`.
- Declare setup with `composition.requires` instead of embedding credentials.
- Add explicit approval policy resources for high-risk actions.
- Use stable resource keys.
- Include evidence expectations in workflow and agent specs.
- Keep provider-specific IDs out of the manifest unless they are public slugs.
- Run conformance locally before import or publication.

```bash
npm run templates:validate -- ./my-template.json
```

You can validate the included creator example with:

```bash
npm run templates:validate -- docs/platform/templates/examples/prospect-intelligence-pack.json
```

## Minimal Manifest

```json
{
  "schemaVersion": "2026-05-07.lucid-pack.v1",
  "key": "example-competitor-monitor",
  "name": "Competitor Monitor",
  "description": "Track competitor pages and report material changes.",
  "version": "1.0.0",
  "composition": {
    "provides": [
      {
        "key": "browser.public-page.monitor",
        "kind": "browser",
        "name": "Monitor public web pages",
        "scope": "project",
        "risk": "read_only"
      }
    ],
    "requires": [
      {
        "capability": "integration.channel.alerts",
        "required": true,
        "acceptedProviders": ["slack", "telegram", "discord"],
        "reason": "Reports need a channel destination."
      }
    ],
    "optional": [],
    "conflicts": [],
    "upgradesFrom": [],
    "tags": ["browser", "monitoring"]
  },
  "resources": [
    {
      "key": "agent:competitor-monitor",
      "kind": "agent",
      "name": "Competitor Monitor Analyst",
      "policy": "fork_on_edit",
      "spec": {
        "role": "Competitor Monitor Analyst",
        "system_prompt": "Track competitor pages, cite evidence, and separate material changes from noise.",
        "model_hint": "strong",
        "memory_enabled": true
      }
    },
    {
      "key": "browser_procedure:competitor-page-check",
      "kind": "browser_procedure",
      "name": "Competitor Page Check",
      "policy": "managed",
      "spec": {
        "host_pattern": "*",
        "procedure_type": "monitoring",
        "definition": {
          "steps": ["navigate", "observe", "screenshot", "extract_changes"]
        },
        "risk_level": "low"
      }
    }
  ],
  "metadata": {
    "product_surface": "template",
    "template_type": "capability"
  }
}
```

For a deploy-compatible agent example that can be imported through `/templates`, see [`examples/prospect-intelligence-pack.json`](./examples/prospect-intelligence-pack.json).

## Import And Publish Flow

The current creator flow is Pack-native:

1. Author a `LucidPackManifest` JSON file.
2. Run `npm run templates:validate -- ./my-template.json`.
3. Open `/templates`.
4. Use **Import Pack JSON** to create a workspace-private Pack.
5. Preview the install plan.
6. Install, check health, and reconcile.
7. Submit the imported Pack for marketplace review when ready.

Workspace imports require owner/admin access. Marketplace publication remains review-gated through `/api/templates/marketplace-submissions`: submit the imported Pack, include generated quality evidence, and keep every credential as a setup requirement or secret reference. Published templates must pass Pack validation, safety scanning, simulation, and human review before they become first-party or community-visible.

The `/templates` creator card now supports the full private-to-review loop:

- **Import Pack JSON** creates a workspace-private Pack.
- **Copy validation CLI** gives creators the exact local gate to run before import.
- **Submit for review** creates a marketplace submission record tied to the Pack, quality report, submitter, status, and review notes.
- Submission status remains visible from the gallery so creators can see `submitted`, `needs changes`, `approved`, `rejected`, or `withdrawn` without learning the old catalog schema.

## Provisioning Semantics

Install is safe and incremental:

- Preview never mutates data.
- Install creates a managed-resource ledger.
- Reconcile materializes resources where supported.
- Unsupported resources remain registered with setup/health status.
- Forked resources are skipped by future reconcile.
- Uninstall archives ownership instead of deleting evidence.

## Safety Rules

Never include:

- API keys
- private keys
- passwords
- cookies
- bearer tokens
- provider refresh tokens

Use requirements and setup UI instead:

```json
{
  "capability": "integration.web3.data-provider",
  "required": true,
  "acceptedProviders": ["alchemy", "helius"],
  "reason": "A chain data provider is required for live wallet monitoring."
}
```

## Quality Gates

Run the same gates Lucid uses for first-party templates:

```bash
npm run templates:simulate
npm run templates:simulate:live
npm run templates:stress:live -- --iterations 2 --concurrency 4 --threshold 9
npm run templates:stress:llm-live -- --iterations 1 --concurrency 3 --threshold 10 --report docs/generated/template-live-quality-report.md
npm run capability-templates:simulate
npm run capability-templates:simulate:live
```

`templates:stress:llm-live` produces a Markdown report with the actual LLM answer, quality percentage, live-evidence accuracy percentage, matched anchors, missing anchors, and failures for every agent/team template. It intentionally uses the dedicated simulation provider chain. Set `CAPABILITY_TEMPLATE_LLM_ENABLE_LUCID=true` only when the Lucid gateway credentials are known-good; otherwise the gate uses TrustGate/OpenAI and avoids noisy fallback from an unhealthy Lucid key.

High-risk capability templates must include a policy resource:

```json
{
  "key": "policy:trade-approval",
  "kind": "policy",
  "name": "Trade Approval Policy",
  "policy": "managed",
  "spec": {
    "policy_type": "approval",
    "approval_required": true,
    "high_risk_approval": true,
    "blocks": ["wallet_transfer", "dex_swap", "prediction_trade"]
  }
}
```
