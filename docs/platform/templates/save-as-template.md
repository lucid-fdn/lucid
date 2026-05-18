# Save as Template

The old catalog-backed **Save as Template** flow is retired. Lucid now treats every reusable template as a Lucid Pack so agents, teams, workflows, routines, knowledge, browser procedures, policies, channel commands, evals, setup requirements, and lifecycle metadata share one contract.

## Current Status

Existing first-party templates are seeded as Lucid Packs with:

```bash
npm run templates:seed -- --dry-run
npm run templates:seed
```

The previous org-template catalog APIs return `410 Gone`, and the old catalog schema is retired by migration. Do not build new authoring, marketplace, or org-private-template features on catalog tables.

## Pack-Backed Authoring Direction

The replacement flow should be:

1. Start from an existing agent, team, or capability.
2. Export a Lucid Pack manifest.
3. Strip runtime IDs, secrets, credentials, conversation history, and user memories.
4. Convert live resources into parameterized desired resources.
5. Validate with `npm run templates:validate`.
6. Preview managed resources, risks, setup requirements, and approval gates.
7. Publish as a workspace Pack or submit for marketplace review.

## What A Pack Can Include

| Included | Not Included |
|----------|-------------|
| Agent and team specs | Raw secrets, bot tokens, API keys |
| Plugin, skill, and integration requirements | Live conversation history |
| Memory schema and Knowledge source declarations | User-private memories |
| Workflow, routine, and Agent Ops bindings | Provider credentials |
| Browser procedures and channel commands | Deployment-specific runtime IDs |
| Policies, approval gates, evals, and setup metadata | Org-specific account data |

Users who install the Pack connect their own providers after install. Secrets must be represented as required setup or secret references, never embedded defaults.

## Until The UI Exists

Use Pack manifests plus the validation and seed tooling. The product UI may still say "Templates", but the implementation and authoring substrate should be Lucid Pack-only.
