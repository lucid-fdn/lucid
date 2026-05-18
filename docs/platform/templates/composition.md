# Capability Template Composition

Composition metadata makes capability templates deterministic and reusable. It tells Lucid what the template provides, what it requires, what is optional, and what would conflict with already-installed capabilities.

Users see this as an install preview. Internally, Lucid uses it to reconcile managed resources safely.

## Schema Shape

Capability templates use `LucidPackManifest` internally and add:

```ts
composition: {
  provides: TemplateCapability[]
  requires: TemplateDependency[]
  optional: TemplateDependency[]
  conflicts: TemplateConflict[]
  upgradesFrom: string[]
  tags: string[]
}
```

## Provides

Use `provides` for capabilities the template owns after install.

```json
{
  "key": "web3.wallet.history.read",
  "kind": "web3_read",
  "name": "Read wallet history",
  "scope": "project",
  "risk": "read_only"
}
```

Rules:

- Capability keys must be stable and globally understandable.
- Read-only should be the default.
- High-risk capabilities require an explicit approval policy resource.

## Requires

Use `requires` for setup that must exist before the capability can run fully.

```json
{
  "capability": "integration.web3.data-provider",
  "required": true,
  "acceptedProviders": ["alchemy", "helius", "quicknode"],
  "reason": "Wallet intelligence needs a chain data provider."
}
```

Requirements do not store secrets. They point users to integrations or setup surfaces.

## Optional

Use `optional` for useful but non-blocking setup.

Examples:

- Slack alert channel
- Telegram report channel
- calendar context
- extra provider for fallback

## Conflicts

Use `conflicts` when two templates should not own the same exclusive operating area.

Modes:

- `warn`: show warning, allow install
- `requires_fork`: require operator review before local ownership diverges
- `exclusive`: block install until resolved

## Resource Kinds

Supported manifest resource kinds:

- `agent`
- `team`
- `workflow`
- `routine`
- `knowledge_source`
- `browser_procedure`
- `host_playbook`
- `skill`
- `doc`
- `policy`
- `channel_command`

Native materialization today:

- `agent`: creates an assistant when project/environment scope exists.
- `policy`: registers into Agent Ops project policy metadata.
- `knowledge_source`: creates a Lucid Knowledge source.
- `browser_procedure`: creates a Browser Operator procedure and version.
- `routine`: creates an Agent scheduled task only when explicitly enabled and cron-compatible.

Ledger-managed today:

- `workflow`
- `team`
- `host_playbook`
- `skill`
- `doc`
- `channel_command`

Those remain visible in installed capability health and can gain native materializers without changing the public manifest contract.
