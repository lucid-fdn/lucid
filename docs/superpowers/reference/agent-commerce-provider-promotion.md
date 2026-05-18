# Agent Commerce Provider Promotion

Provider manifests are not enough to make a rail live. A provider can move to `availability.mode: live` only when its adapter and operational evidence satisfy the promotion gate.

Run:

```bash
npm run agent-commerce:provider-promotion
```

To validate a provider-specific live promotion packet:

```bash
AGENT_COMMERCE_PROVIDER_PROMOTION_PACKET_FILE=ops/agent-commerce/evidence/provider-promotion.stripe-link-agents.<release>.json \
AGENT_COMMERCE_PROVIDER_PROMOTION_REQUIRE_READY=true \
npm run agent-commerce:provider-promotion-evidence
```

## Provider Promotion Evidence

Every live provider requires:

- `provider_adapter_registered`
- `idempotency_before_provider_side_effects`
- `ledger_budget_reservation_before_provider_side_effects`
- `no_raw_credential_persistence_tested`
- `fail_closed_provider_tests`

Providers with account access also require:

- `account_access_approved`
- `secret_ref_configured`

Webhook and reconciliation rails require:

- `webhook_signature_verified`
- `webhook_dedupe_enabled`
- `reconciliation_mapping_tested`

Machine-payment rails require:

- `atomic_proof_claim_tested`
- `replay_protection_tested`

Stripe Link Agents / Agentic Commerce Suite additionally requires:

- `stripe_link_stable_api_access`
- `oauth_callback_verified`

Stripe Link live mode must be backed by a provider promotion packet with:

- approved Stripe ACS/Link account access;
- account-approved Shared Payment issued-token endpoint evidence;
- OAuth/OCA callback verification;
- webhook signature and dedupe evidence;
- reconciliation mapping evidence for issued-token and OCA lifecycle events;
- idempotency and budget-reservation proof before provider side effects;
- no raw returned card/SPT credential persistence;
- fail-closed timeout, replay, and mismatch tests.

The crypto wallet rail additionally requires:

- `lucid_l2_p0_execution_gate`
- `internal_hmac_only`
- `no_public_wallet_signing`

## Current State

The only current live provider adapter is `manual`. Stripe Link Agents has an env-gated preview adapter for ACS Shared Payment issued-token execution, but it remains non-live until Stripe account/API access and promotion evidence exist. Stripe Shared Payment Tokens, Stripe Issuing, MPP, x402, and crypto wallet remain preview, waitlist, disabled, or manifest-only until promotion evidence exists.

`manifest-only` providers must not be marked live. If a provider needs account access, do not set it live before account/API access, secret refs, webhook verification, event dedupe, reconciliation, and fail-closed tests are in place.

Use `ops/agent-commerce/evidence/provider-promotion.stripe-link-agents.example.json` as the shape for a Stripe Link/ACS packet. The example is structurally ready, but release evidence must replace every placeholder URL with real account, webhook, callback, and test artifacts.

## Audit Trail

Mission Control provider health updates are guarded by the same promotion rules. Blocked `mode: live` attempts append `provider_promotion.blocked` Commerce events with the provider id, requested mode/status, blockers, and missing evidence. Mission Control Commerce counts those events in `production_summary.failures.provider_promotion_blocks` through historical `production_event_counts`, and shows recent Promotion Blocks from a dedicated `provider_promotion_block_events` feed beside provider health. The audit payload is evidence-only and must not contain provider secrets, API keys, card data, wallet identifiers, or raw payment credentials.
