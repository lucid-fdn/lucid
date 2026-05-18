# Microsoft Teams Integration

For the canonical current-state architecture, including hosted shared-app flows vs BYOB and relay vs native behavior, see `docs/platform/agents/channels.md`.

## Current Model

Lucid supports two Teams modes:

- `Hosted shared app`
  - Lucid owns the shared Microsoft Teams application
  - owner/admin installs it from Studio
  - install creates an unbound hosted Teams install for the tenant
  - users explicitly bind the agent from the Teams conversation where it should be active
- `BYOB`
  - the tenant provides its own Bot Framework app credentials
  - the channel can run through shared worker, dedicated relay, or dedicated native runtime depending on deployment mode

## Hosted Teams

Hosted Teams is the fastest path when you want Lucid to manage the Teams app lifecycle.

Studio flow:
1. Open the agent in Lucid Studio
2. Go to `Channels`
3. Choose `Microsoft Teams`
4. Choose hosted mode
5. Click `Install on Microsoft Teams`
6. Complete the Microsoft consent/install flow

Important behavior:
- there is no separate "public install link" toggle anymore
- install itself is the privileged action
- hosted Teams no longer claims the first conversation implicitly
- after install, open the Teams conversation where the agent should be active and run `bind`
- tenant-level defaults can be configured in Studio so new unbound conversations have a fallback agent
- Teams hosted outbound still uses the same Lucid/OpenClaw managed delivery path as other managed channels
- Teams ingress now preserves attachment metadata on inbound events, including audio/file notes, instead of dropping non-text activity context
- after bind, Teams chat supports:
  - `help`
  - `bind`
  - `bind <agent name>`
  - `agents`
  - `whoami`
  - `ops <workflow> <target>`
  - `check <url>`
  - `buy <request>`
  - `research <url>`
  - `extract <what> from <url>`
  - `monitor <url>`
  - `switch <agent name>`
  - `leave`

Hosted Teams also now uses the shared alias/default admin model:
- tenant default
- per-conversation override
- alias add/remove for the bound Teams conversation

Agent Ops and Browser Operator examples:

- `ops qa https://preview.example.com`
- `check https://www.example.com`
- `research https://competitor.example.com`
- `extract pricing from https://www.example.com/pricing`
- `monitor https://status.example.com`

No Teams app manifest command registration is required for these text commands. The Bot Framework activity text is parsed by Lucid once the shared app is installed and the conversation is bound, or when a tenant default can safely resolve the active agent.

## Hosted Env Requirements

Hosted Teams requires these control-plane env vars:

- `FEATURE_TEAMS_HOSTED=true`
- `MSTEAMS_HOSTED_INSTALL_URL`
- `MSTEAMS_HOSTED_APP_ID`
- `MSTEAMS_HOSTED_APP_PASSWORD`
- `MSTEAMS_HOSTED_TENANT_ID`
- `MSTEAMS_HOSTED_STATE_SECRET`

These belong on the web/control plane only. Do not leak them into the worker.

## BYOB Teams

BYOB remains available when a tenant wants full control of the Bot Framework app identity.

Typical setup:
1. Create an Azure Bot or Bot Framework app registration
2. Capture the app id, app password, and tenant id
3. Add the Teams channel in Lucid with those credentials

BYOB Teams supports:
- Bot Framework webhook ingress
- JWT validation against Microsoft's JWKS
- managed or native outbound delivery
- service URL persistence for stable replies

## Troubleshooting

| Issue | What to check |
|-------|---------------|
| Hosted install unavailable | `FEATURE_TEAMS_HOSTED` and `MSTEAMS_HOSTED_*` env vars on the control plane; run `npm run env:audit:channels` for a production audit |
| Teams bind does not work | pending hosted install exists for the tenant and the shared app is receiving inbound activities; then run `bind` or `bind <agent name>` in the target conversation |
| Bot not responding in BYOB mode | app id/password valid, tenant id correct, webhook reachable, JWT validation succeeding |
