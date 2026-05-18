# Providers Stack

**Status:** Active
**Stack ID:** `providers`

Providers are swappable adapters for external systems: model providers, auth providers, billing/payment rails, storage, observability, integrations, deployment, sandboxing, and commerce rails.

The provider stack exists so Lucid can integrate deeply without becoming locked to one vendor's object model.

## Owns

- Provider-specific SDK calls.
- Provider lifecycle health.
- Provider manifests and feature availability.
- Provider webhook normalization.
- Provider-specific retry and error mapping.
- Provider account capability detection.

## Does Not Own

- Core Lucid contracts.
- Operator approval decisions.
- Runtime engine protocol.
- Ledger truth.

## Current Surfaces

- `src/lib/payments/`: human checkout provider abstraction.
- `src/lib/agent-commerce/providers/`: Agent Commerce provider manifests and adapters.
- `src/lib/auth/providers/`: auth providers.
- `src/lib/app-service/*-providers/`: generation, frontend, deployment, and sandbox providers.
- `src/lib/oauth/providers/`: OAuth provider surfaces.
- `packages/lucid-adapters/`: reusable provider adapter package surface.

## Integration Rules

- Providers adapt Lucid domain requests to provider SDK calls.
- Provider-specific IDs should be stored as external references, not become primary cross-stack identifiers.
- Provider webhooks must normalize into Lucid events before touching AgentOps or ledgers.
- Providers must expose health/availability for Mission Control.
- Provider adapters must respect Trust, policy, approval, and idempotency gates.

## Agent Commerce Provider Rules

- Stripe Link Agents, SPTs, MPP, x402, crypto wallet, and manual rails are provider adapters.
- Rail availability should be expressed through manifests.
- Provider adapters should never execute before Commerce ledger reservation and approval gates are satisfied.
- Stripe-specific logic stays in Stripe adapters; x402/facilitator-specific logic stays in x402 adapters.
- Lucid-L2-derived wallet or trading execution must pass the shared Lucid-L2 P0 execution gate before any provider adapter can produce an execution plan.

## Backlog Direction

- Add provider manifest health to Agent Commerce.
- Add emergency provider disable.
- Add provider webhook normalization and event dedupe.
- Add provider adapter tests for fail-closed behavior.
