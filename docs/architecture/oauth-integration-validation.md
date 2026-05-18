# OAuth Integration Validation

Last updated: 2026-04-21

This note records the current validation bar for Lucid's published OAuth integrations and the boundary between what can be proven automatically and what still requires a human-connected account.

It also records current UX guarantees for connect flows that include first-time provider signup.

## Current Published Catalog

The current published app-facing OAuth integrations are:

- `slack`
- `twitter-v2`
- `zoom`
- `hubspot`
- `github`
- `calendly`
- `google`
- `notion`
- `trello`
- `asana`
- `jira`
- `linear`
- `monday`
- `intercom`

## Proven Non-Interactive Coverage

The following was validated against the live app route on local dev:

1. `POST /api/oauth/session`
- returned `200` for all published providers
- returned an `authUrl`

2. Provider redirect smoke
- each `authUrl` produced a real `302` to the upstream provider authorize host

3. Org install path
- `POST /api/orgs/[id]/plugins` installed the published integrations successfully on the dev org
- manifest resolution succeeded for all published integrations

4. Manifest refresh path
- `PATCH /api/orgs/[id]/plugins` refreshed all published integrations successfully
- action counts matched the canonical catalog for each provider

5. Verify path
- `POST /api/oauth/verify` returned the correct shape for:
  - already connected providers
  - not-yet-connected providers

## What This Does Not Prove

This coverage does not prove live provider tool execution.

That still requires:

- a real completed OAuth consent flow for the provider
- a real connected account
- real third-party resources where the tools expect them

Examples:

- Google needs a real Gmail/Drive/Calendar account
- Notion needs a real workspace and database/page targets
- GitHub needs a real repo or issue target
- HubSpot needs a real portal

Without those, the strongest honest claim is:

- the product can start OAuth correctly
- the install and manifest layer is healthy
- the verify/reconcile layer is healthy

Not:

- every tool action has been executed live end to end

## Connect Flow Reality

OAuth account creation and OAuth authorization are not the same step.

When a user does not already have a provider account, the provider may:

- send them through signup or onboarding first
- preserve the original OAuth transaction cleanly
- or fail to return to the original OAuth approval flow

Lucid now treats that path explicitly:

- connect stays in a bounded `authorizing` state
- popup close or stalled signup without a real connection resolves to an interrupted-auth failure, not an endless loop
- the user gets a clean retry path instead of ambiguous “still connecting” behavior

Practical validation rule:

- “provider signup was offered” is not enough to claim the integration connected
- only the callback + verify/reconcile path or a real connection record counts as success

## Live Execution Reality

Published-provider health also depends on the boundary between Lucid's local action execution path and provider-side remote execution.

Current validation expectations:

- manifest/schema validation must pass before a provider is exposed to models
- local bundled action scripts must resolve reliably in production images
- representative live reads should be tested through the same execution path production uses, not a stale side harness
- if a provider has active production connections, at least one real live smoke action should be run periodically

Current known boundary:

- full all-provider live e2e is only possible for providers that actually have active real connections in the environment being tested
- all-provider simulation coverage is stronger than all-provider live coverage in environments where only a subset of providers are connected

## Rate Limit Note

During automated matrix runs, the main false negatives came from Lucid's own per-user API rate limits, not from provider failures or missing Nango config.

Routes affected during burst testing:

- `/api/oauth/session`
- `/api/oauth/verify`
- `/api/orgs/[id]/plugins` refresh path

When rerun after cooldown, those providers passed.

This means burst matrix automation should be interpreted carefully:

- `429` from these routes is a local guardrail signal
- not evidence that a provider is broken

## Practical Validation Sequence

Use this sequence when validating a new published integration:

1. confirm provider appears in `/api/oauth/providers`
2. confirm actions appear in `/api/oauth-tools/catalog`
3. confirm `/api/oauth/session` returns `200`
4. confirm returned `authUrl` redirects to the provider
5. complete OAuth manually
6. confirm `/api/oauth/verify` resolves connected state
7. run one representative read action
8. run one safe write action where appropriate
9. confirm disconnect works cleanly
