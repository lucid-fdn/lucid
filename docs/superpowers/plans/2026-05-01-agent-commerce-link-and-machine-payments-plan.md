# Agent Commerce Implementation Plan

> For agentic workers: implement this plan in order. Keep each phase behind feature flags, keep provider code behind adapters, and do not expose Lucid-L2 money-moving routes until the `docs/BACKLOG.md` P0 gates are closed.

**Date:** 2026-05-01
**Status:** P2 seller entitlement, reversal, abuse, security hardening, generated-app paid-action runtime support, Phase 7 operator UI, Phase 10 enforcement tests, Stripe Link Agents/ACS Shared Payment issued-token preview/OCA lifecycle, staging reconciliation evidence collector, security-review packet validator, live provider promotion packet validator, provider promotion GA evidence composition, GA release-bundle hash manifest/verifier/final promotion decision/operator attestation/quorum/release certificate/verifier/artifact index/verifier/dossier/verifier/final local gate/launch status/verifier, Stripe Issuing real-time authorization preview path, and internal-only crypto wallet execution guard implemented; live Stripe/account rails remain gated by env, account access, and promotion evidence
**Owner:** Agent Commerce / Platform
**Spec:** `docs/superpowers/specs/2026-05-01-agent-commerce-architecture-design.md`
**ADR:** `docs/superpowers/adrs/2026-05-01-agent-commerce-provider-neutral-architecture.md`
**Backlog:** `docs/BACKLOG.md`
**Stack doc:** `docs/stacks/commerce.md`
**Stack ID:** `contracts/stack.ts` (`commerce`)

## Goal

Build Lucid Agent Commerce as a provider-neutral Commerce Fabric for two use cases:

1. **Lucid as agent platform:** Lucid/OpenClaw/Hermes/generated app agents request user-approved spending for commerce, reservations, supplier payments, API calls, MCP usage, and workflow execution.
2. **Lucid as seller:** external agents pay Lucid for plans, app services, API usage, generated apps, MCP resources, and per-request machine-payable endpoints.

Stripe Link Agents, Shared Payment Tokens, Issuing for agents, MPP, x402, crypto wallets, and manual approval are rails. They are not the architecture.

## Source Material Reviewed

- Stripe Agentic Commerce: `https://docs.stripe.com/agentic-commerce`
- Stripe Agentic Commerce Protocol: `https://docs.stripe.com/agentic-commerce/acp`
- Stripe Shared Payment Tokens: `https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens`
- Stripe Issuing for agents: `https://docs.stripe.com/issuing/agents`
- Stripe Machine Payments: `https://docs.stripe.com/payments/machine`
- Stripe MPP: `https://docs.stripe.com/payments/machine/mpp`
- Stripe x402: `https://docs.stripe.com/payments/machine/x402`
- Link for agents: `https://link.com/agents`
- pay.sh docs: `https://pay.sh/docs`
- pay.sh source: `https://github.com/solana-foundation/pay`
- pay-skills catalog: `https://github.com/solana-foundation/pay-skills`
- Coinbase x402 facilitator docs: `https://docs.cdp.coinbase.com/x402/core-concepts/facilitator`
- Google AP2 announcement: `https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol/`
- ACP GitHub spec: `https://github.com/agentic-commerce-protocol/agentic-commerce-protocol`
- Lucid-L2 audit gates: `docs/BACKLOG.md`

## Non-Negotiable Rules

- **Provider-neutral core:** no Stripe SDK imports in worker runtimes, OpenClaw/Hermes loops, generated app runtimes, or shared contracts.
- **Engine-neutral tools:** runtime tools create commerce intents and poll status; control-plane APIs and provider adapters execute.
- **Router selects, adapters execute:** the Rail Router returns a decision. It never calls provider APIs directly.
- **Ledger before side effect:** spend requests, seller grants, machine-payment challenges, credential issuance, and proof redemption are durably reserved before provider calls.
- **Verified identity only:** derive `userId`, `orgId`, `assistantId`, `runId`, and `projectId` from Lucid auth/internal context, never from caller-supplied request bodies.
- **Fail closed:** missing policy, missing idempotency, stale approval, provider timeout, replay ambiguity, or reconciliation mismatch denies execution.
- **No raw credential persistence:** one-time cards, SPT secrets, OAuth tokens, wallet credentials, and proof secrets are stored only as encrypted secret references.
- **Human approval by default:** autonomy is an explicit policy exception, not the default.
- **Lucid-L2 isolation:** Lucid-L2 remains source material only until `P0-L2-001` through `P0-L2-003` are closed in `docs/BACKLOG.md`.

## Target File Structure

```text
contracts/
  agent-commerce.ts

src/lib/agent-commerce/
  provider.ts
  provider-registry.ts
  policy.ts
  rail-router.ts
  ledger.ts
  idempotency.ts
  reconciliation.ts
  machine-middleware.ts
  observability.ts
  rate-limit.ts
  secrets.ts
  errors.ts
  providers/
    manual.ts
    stripe-link.ts
    stripe-spt.ts
    stripe-issuing.ts
    machine-mpp.ts
    machine-x402.ts
    crypto-wallet.ts

src/lib/db/
  agent-commerce.ts

src/app/api/agent-commerce/
  providers/route.ts
  connections/route.ts
  spend-requests/route.ts
  spend-requests/[id]/route.ts
  spend-requests/[id]/approve/route.ts
  spend-requests/[id]/cancel/route.ts

src/app/api/internal/agent-commerce/
  reconcile/route.ts
  spend-requests/route.ts
  spend-requests/[id]/issue-credential/route.ts
  spend-requests/[id]/complete/route.ts
  seller/grants/route.ts
  machine/challenges/route.ts
  machine/proofs/claim/route.ts

src/app/api/webhooks/stripe/agent-commerce/route.ts
src/app/api/webhooks/agent-commerce/[provider]/route.ts

src/app/api/mission-control/commerce/
  route.ts
  reconcile/route.ts
  providers/[provider]/health/route.ts

src/app/(app)/[workspace-slug]/mission-control/commerce/
  page.tsx
  commerce-client.tsx

worker/src/agent/runtime-tools/
  commerce.ts

worker/src/services/agent-commerce/
  client.ts
  tools.ts

migrations/
  107_agent_commerce_foundation.sql
  108_agent_commerce_operations.sql
  109_agent_commerce_budget_and_seller_execution.sql
  110_agent_commerce_seller_entitlements_and_limits.sql
```

## Phase 0 - Baseline and Safety Gates

### Task 0.0 Confirm stack boundary and composition rules

- [x] Register the `commerce` stack ID in `contracts/stack.ts`.
- [x] Add `docs/stacks/commerce.md`.
- [x] Add cross-stack docs for AgentOps, Mission Control, Teams, Templates, Runtime, App Service, Trust, Data, and Providers.
- [x] Tag new Agent Commerce events with stack ID `commerce`.
- [x] Update generated app guards when Agent Commerce route families are added.
- [x] Acceptance: implementation follows the stack rules in `docs/stacks/commerce.md` and does not require a broad repo reorganization.

### Task 0.1 Confirm kill switches and feature flags

- [x] Verify `src/lib/features.ts` exposes:
  - `agentCommerce`
  - `agentCommerceWallets`
  - `agentCommerceSeller`
- [x] Add env docs for:
  - `FEATURE_AGENT_COMMERCE`
  - `FEATURE_AGENT_COMMERCE_WALLETS`
  - `FEATURE_AGENT_COMMERCE_SELLER`
  - `AGENT_COMMERCE_PROVIDER`
  - `AGENT_COMMERCE_INTERNAL_SECRET`
  - `AGENT_COMMERCE_KILL_SWITCH`
- [x] Add runtime helper:
  - `isAgentCommerceEnabled()`
  - `isAgentCommerceWalletsEnabled()`
  - `isAgentCommerceSellerEnabled()`
  - `assertAgentCommerceEnabled()`
- [x] Acceptance: all Agent Commerce APIs return `404` or `403` while disabled.

### Task 0.2 Inventory current payment and wallet surfaces

- [x] Map existing human checkout routes:
  - `src/lib/payments/stripe-provider.ts`
  - `src/app/api/checkout/stripe/route.ts`
  - current Stripe webhook route
- [x] Map existing agent wallet/session signer surfaces:
  - `src/lib/agent-wallets/*`
  - `src/lib/session-signers/index.ts`
  - `src/app/api/internal/trading/execute/route.ts`
  - `src/app/api/internal/trading/sign-typed-data/route.ts`
- [x] Map worker x402 surfaces:
  - `worker/src/services/x402/index.ts`
  - `worker/src/agent/BuiltInToolExecutor.ts`
- [x] Acceptance: plan notes exactly which existing paths are reused, wrapped, or deprecated.
  - Current decision: normal users keep existing Stripe Checkout/Link plan checkout; Agent Commerce is an alternate seller/agent rail. Existing wallet/session-signer and trading paths remain isolated behind policy; worker commerce tools call Lucid internal Commerce APIs only.

### Task 0.3 Add policy and execution guardrails before any adapter work

- [x] Confirm `docs/BACKLOG.md` P0 Lucid-L2 items remain open blockers.
- [x] Add code comments or TODO gates near any Lucid-L2 integration path that could route money movement.
  - No Lucid-L2 money-moving path is imported by Agent Commerce; Lucid-L2 remains documented as shadow/source material only in `docs/BACKLOG.md`, and crypto wallet execution now also requires the shared Lucid-L2 P0 execution gate plus a security-review reference.
- [x] Create unit tests for `evaluateAgentCommercePolicy()` covering amount, currency, domain allowlist/blocklist, expiry, and approval defaults.
- [x] Acceptance: no provider adapter can issue credentials without a policy decision and idempotency key.

## Phase 1 - Contracts and Domain Model

### Task 1.1 Expand shared contracts

**File:** `contracts/agent-commerce.ts`

- [x] Add `AgentCommerceIntentSchema`.
- [x] Add `AgentCommerceConnectionSchema`.
- [x] Add `RailPolicyDecisionSchema`.
- [x] Add `CommerceRailSchema`.
- [x] Add `MachinePaymentChallengeSchema`.
- [x] Add `MachinePaymentProofClaimSchema`.
- [x] Add `AgentCommerceEventSchema`.
- [x] Add versioned envelope fields:
  - `contract_version`
  - `schema_version`
  - `provider_version`
- [x] Add strict `metadata` limits where possible.
  - Delivered: shared contract metadata is capped by byte size, depth, and key count in `contracts/agent-commerce.ts`.
- [x] Acceptance: contracts remain provider-neutral and importable by app and worker.

### Task 1.2 Normalize provider capability manifests

**Files:**
- `src/lib/agent-commerce/providers/stripe-link.ts`
- `src/lib/agent-commerce/providers/manual.ts`
- new provider manifest files

- [x] Represent each provider by manifest only until the adapter is implemented.
- [x] Add capabilities for:
  - `wallet_oauth`
  - `spend_request`
  - `one_time_card`
  - `shared_payment_token`
  - `machine_payment`
  - `catalog_feed`
  - `agentic_checkout`
  - `realtime_authorization`
- [x] Mark Stripe Link Agents and Stripe SPT as preview/waitlist until stable account access is available.
- [x] Add tests that list manifests and assert no duplicate provider IDs.

### Task 1.3 Define status machines

- [x] Spend request status:
  - `draft`
  - `requires_connection`
  - `requires_approval`
  - `approved`
  - `credential_issuing`
  - `credential_issued`
  - `completed`
  - `declined`
  - `expired`
  - `failed`
  - `cancelled`
- [x] Seller grant status:
  - `received`
  - `validating`
  - `accepted`
  - `processing`
  - `completed`
  - `rejected`
  - `revoked`
  - `expired`
  - `failed`
- [x] Machine proof status:
  - `challenge_created`
  - `proof_claimed`
  - `settlement_pending`
  - `settled`
  - `failed`
  - `refunded`
- [x] Acceptance: illegal transitions are rejected in service logic and DB constraints where practical.

## Phase 2 - Database and Ledger Foundation

### Task 2.1 Add foundation migration

**File:** `migrations/107_agent_commerce_foundation.sql`

- [x] Create `agent_commerce_connections`.
- [x] Create `agent_commerce_policies`.
- [x] Create `agent_spend_requests`.
- [x] Create `agent_commerce_credentials`.
- [x] Create `seller_payment_grants`.
- [x] Create `machine_payment_challenges`.
- [x] Create `machine_payment_proof_claims`.
- [x] Create `agent_commerce_events`.
- [x] Create `agent_commerce_idempotency_keys`.
- [x] Create `agent_commerce_provider_health`.
- [x] Add indexes listed in the spec.
- [x] Enable RLS on all tables.
- [x] Add service-role policies for internal writes.
- [x] Add org-member read policies for user-facing reads.
- [x] Acceptance: local migration applies cleanly and schema is compatible with Supabase/PostgREST.

### Task 2.2 Add atomic idempotency and proof claim RPCs

- [x] Add `claim_agent_commerce_idempotency_key(...)`.
- [x] Add `claim_machine_payment_proof(...)`.
- [x] Add `reserve_agent_spend_budget(...)`.
- [x] Add `release_agent_spend_budget(...)`.
- [x] Add `complete_agent_spend_request(...)`.
- [x] Add `fulfill_agent_commerce_seller_grant(...)`.
- [x] Add `revoke_agent_commerce_seller_entitlement(...)`.
- [x] Add `claim_agent_commerce_rate_limit(...)`.
- [x] Acceptance: concurrent calls with same idempotency key or proof hash produce exactly one winner.
  - Delivered now: idempotency, proof claim, one-reservation-per-spend budget reservation, seller entitlement fulfillment/revocation, and route rate-limit claims through migrations `109` and `110`.

### Task 2.3 Add DB access layer

**File:** `src/lib/db/agent-commerce.ts`

- [x] Implement typed functions only; no direct Supabase calls in route handlers.
- [x] Functions:
  - `createAgentCommerceConnection`
  - `getAgentCommerceConnection`
  - `listAgentCommerceConnections`
  - `createAgentSpendRequest`
  - `getAgentSpendRequest`
  - `listAgentSpendRequests`
  - `transitionAgentSpendRequest`
  - `createAgentCommerceCredential`
  - `reserveAgentSpendBudget`
  - `releaseAgentSpendBudget`
  - `completeAgentSpendRequestWithLedger`
  - `listAgentSpendBudgetReservations`
  - `claimAgentCommerceRateLimit`
  - `createSellerPaymentGrant`
  - `getSellerPaymentGrant`
  - `transitionSellerPaymentGrant`
  - `fulfillSellerPaymentGrantEntitlement`
  - `revokeSellerPaymentGrantEntitlement`
  - `listAgentCommerceSellerEntitlements`
  - `createMachinePaymentChallenge`
  - `claimMachinePaymentProof`
  - `appendAgentCommerceEvent`
- [x] Acceptance: all functions require explicit `orgId` and service/user context.

## Phase 3 - Rail Policy Router

### Task 3.1 Implement router service

**File:** `src/lib/agent-commerce/rail-router.ts`

- [x] Implement `resolveCommerceRail(input)`.
- [x] Inputs:
  - normalized commerce intent
  - org policy
  - assistant policy
  - user connection state
  - seller capabilities
  - provider manifests
  - provider health
  - amount/currency/country
  - risk score
  - Delivered: router inputs are normalized through `AgentCommerceIntentSchema` and provider manifests; assistant/org policy share the provider-neutral policy envelope, seller capability is represented by provider manifest role/capability metadata, and provider health/risk/user connection state are covered in tests.
- [x] Outputs:
  - `denied`
  - `requires_connection`
  - `requires_approval`
  - `manual_review`
  - `approved_to_issue_credential`
  - `ready`
  - Delivered: router tests now exercise every decision state.
- [x] Emit reason codes:
  - `feature_disabled`
  - `policy_denied`
  - `amount_exceeds_limit`
  - `currency_not_allowed`
  - `merchant_blocked`
  - `connection_missing`
  - `approval_required`
  - `provider_unavailable`
  - `provider_preview_only`
  - `lucid_l2_gate_open`
  - Delivered: router and boundary tests cover fail-closed provider, policy, risk, feature, preview, and Lucid-L2 isolation reasons. `lucid_l2_gate_open` remains a reserved contract reason while Lucid-L2 is physically unreachable.
- [x] Acceptance: router has no provider SDK imports and no side effects except optional event construction.

### Task 3.2 Add router tests

- [x] Test human approval default.
- [x] Test no silent fallback to weaker rail.
- [x] Test Link unavailable -> `requires_connection` or `manual_review`, not crypto fallback.
- [x] Test x402 proof route disabled while seller feature flag is off.
- [x] Test Lucid-L2 P0 gates deny Lucid-L2 execution paths.
  - Delivered: stack-boundary tests and the `stack:boundaries` validator scan Agent Commerce execution roots for Lucid-L2 public Solana, Hyperliquid, passport mutation, gateway-lite, and `SOLANA_PRIVATE_KEY` markers.
- [x] Acceptance: router tests cover every decision state.

## Phase 4 - Control Plane APIs

### Task 4.1 Public user APIs

- [x] `GET /api/agent-commerce/providers`
  - Lists provider manifests visible to the org.
- [x] `GET /api/agent-commerce/connections`
  - Lists user/org connections and statuses.
- [x] `POST /api/agent-commerce/spend-requests`
  - User-facing creation path for UI-initiated requests.
- [x] `GET /api/agent-commerce/spend-requests/:id`
  - Requires org membership.
- [x] `POST /api/agent-commerce/spend-requests/:id/approve`
  - Requires authenticated user and pending approval state.
- [x] `POST /api/agent-commerce/spend-requests/:id/cancel`
  - Requires owner/admin.
- [x] Acceptance: all request bodies use Zod, all routes derive auth from server session.

### Task 4.2 Internal worker/runtime APIs

- [x] `POST /api/internal/agent-commerce/spend-requests`
  - HMAC internal auth.
  - Creates request from runtime tool call.
  - Requires `runId`, `assistantId`, `orgId`, `toolCallId`, idempotency key.
- [x] `POST /api/internal/agent-commerce/spend-requests/:id/issue-credential`
  - Internal only.
  - Requires approved state and budget reservation.
- [x] `POST /api/internal/agent-commerce/spend-requests/:id/complete`
  - Reconciles provider or merchant completion.
- [x] `POST /api/internal/agent-commerce/providers`
  - Internal provider/capability discovery for runtime tools.
- [x] `POST /api/internal/agent-commerce/seller/grants`
  - Accepts SPT/MPP/x402 grants for Lucid as seller.
- [x] `POST /api/internal/agent-commerce/seller/grants/:id/accept`
  - Executes seller grant acceptance through the selected provider adapter.
- [x] `POST /api/internal/agent-commerce/machine/challenges`
  - Creates a payment challenge for paid API/MCP/app endpoints.
- [x] `POST /api/internal/agent-commerce/machine/proofs/claim`
  - Atomic proof redemption before granting access.
- [x] Acceptance: internal routes reject missing HMAC, stale timestamps, missing idempotency, and caller-supplied identity conflicts.
  - Delivered: HMAC helper enforces signed body/timestamp; spend creation validates assistant/org/project scope before idempotency reservation.

### Task 4.3 Webhooks

- [x] `POST /api/webhooks/stripe/agent-commerce`
  - SPT events.
  - Issuing authorization events.
  - PaymentIntent lifecycle for machine payments.
- [x] `POST /api/webhooks/agent-commerce/[provider]`
  - Generic provider webhook adapter for non-Stripe rails.
- [x] Acceptance: webhook handlers verify signatures, dedupe events, and append normalized `agent_commerce_events`.
  - Delivered: provider events normalize known spend/grant/challenge/proof IDs and fall back to provider health for mismatch visibility.

## Phase 5 - Provider Adapters

### Task 5.1 Manual provider

- [x] Make `ManualAgentCommerceProvider` durable instead of in-memory.
- [x] Support manual spend approval, manual seller grant acceptance, and fake credential display in test.
- [x] Add test-only fixtures for local development.
- [x] Acceptance: complete end-to-end flow works without Stripe access.

### Task 5.2 Stripe Link Agents adapter

- [x] Keep manifest-only until account/API access is available.
  - Provider promotion gates implemented: `npm run agent-commerce:provider-promotion` prevents manifest-only or account-access providers from becoming live without adapter, account, secret-ref, webhook, reconciliation, fail-closed, and provider-specific evidence.
  - Mission Control Commerce surfaces provider promotion readiness and blockers beside provider health, so operators can see why a preview or manifest-only rail is not live-ready.
  - Provider health live-mode updates are blocked unless promotion evidence is complete, so operators cannot mark a preview/waitlist/manifest-only rail as live from Mission Control before the adapter gates pass.
  - Blocked live-mode attempts emit provider_promotion.blocked audit events with requested mode/status, blockers, and missing evidence.
  - Blocked promotion audit events are counted in production dashboard failures through historical event-type counts and shown in Mission Control Commerce as recent Promotion Blocks from a dedicated event-family feed.
- [x] Add env-gated Stripe Agentic Commerce Suite / Link Agents preview adapter.
  - Delivered: `StripeLinkAgentsProvider` registers only with `AGENT_COMMERCE_STRIPE_LINK_AGENTS_ENABLED=true`, resolves API keys through Agent Commerce secret refs, issues Stripe Shared Payment Tokens through `shared_payment/issued_tokens` after Lucid approval and budget reservation, and keeps the manifest in preview until promotion evidence exists.
- [x] Create spend session payload with merchant, amount, currency, context, approval mode, requested credential, OCA id, resource, seller, and Lucid metadata.
- [x] Handle Link/ACS webhook reconciliation back to Lucid spend requests.
  - Delivered: Stripe Agent Commerce webhooks classify `shared_payment.issued_token.*`, `requested_session.*`, `v2.commerce.*`, `v2.orchestrated_commerce.*`, and `checkout.session.*` as `stripe_link_agents`, guard them on the wallet surface, complete successful spend requests, and fail terminal failed/cancelled/expired/deactivated sessions.
- [x] Reconcile Stripe Orchestrated Commerce Agreement lifecycle to durable Lucid connections.
  - Delivered: `upsert_agent_commerce_connection` atomically creates/updates provider connections by `(provider, provider_connection_id)` without cross-org reassignment; Stripe OCA created/partially-confirmed/confirmed/terminated/expired/failed webhooks map to pending/active/revoked/expired/failed `stripe_link_agents` connections and emit `connection.*` audit events.
- [x] Issue one-time card, SPT, or checkout redirect credentials through secret references.
  - Delivered: raw returned payment credentials are encrypted into `agent-commerce-secret:v1:*` refs before persistence; credential metadata stores only provider ids/status/url and not raw card/SPT values.
- [ ] Live promotion remains gated:
  - verify stable account/API access and endpoint with Stripe
  - verify OAuth/OCA callback flow for the production account
  - provide webhook signature, dedupe, reconciliation, no-raw-secret, fail-closed, idempotency, and budget-reservation evidence
  - 2026-05-04 rollout evidence: Stripe account access is partially proven through the Stripe connector and API probes, and the non-mutating Shared Payment issued-token route probe is recognized by the configured key; no real issued-token creation, OAuth/OCA callback, webhook signature/dedupe, or reconciliation proof exists. See `ops/agent-commerce/evidence/rollout-2026-05-04/stripe-link-issued-token-route-probe.blocked.json` and `stripe-link-provider-promotion.summary.json`.
  - Delivered gate: `npm run agent-commerce:provider-promotion-evidence` validates typed provider live-promotion packets; Stripe Link/ACS packets must prove stable API access, approved Shared Payment issued-token access, OAuth/OCA callback, secret refs, webhook signature/dedupe, reconciliation mapping, idempotency, budget reservation, no raw credential persistence, and fail-closed paths before the rail can be treated as promotion-ready.
  - Delivered GA composition: `npm run agent-commerce:ga-evidence` accepts `AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES`; manual-only GA remains possible, but any included external provider promotion summary must be ready or GA readiness fails.
  - Delivered release bundle: `npm run agent-commerce:ga-release-bundle` hashes the GA evidence file, staging reconciliation summary, security review summary, and provider promotion summaries into one typed manifest with provider-specific source checks and a deterministic `bundle_hash`.
  - Delivered release verifier: `npm run agent-commerce:ga-release-bundle:verify` recomputes the deterministic bundle hash, re-evaluates GA readiness/source integrity, and re-hashes every repo-local source artifact before promotion.
  - Delivered final promotion decision: `npm run agent-commerce:ga-promotion` emits an explicit approved/blocked artifact from the verified bundle with target-environment, GA gate, source-integrity, and provider-promotion blockers.
  - Delivered operator attestation: `npm run agent-commerce:ga-promotion:attest` signs the exact approved promotion decision hash and bundle hash, and `npm run agent-commerce:ga-promotion:attest:verify` fails closed on blocked decisions, signature mismatch, decision mismatch, or bundle hash mismatch.
  - Delivered attestation quorum: `npm run agent-commerce:ga-promotion:attest:quorum` verifies distinct valid operator attestations against a keyring, required count, and required roles before production promotion.
  - Delivered release certificate: `npm run agent-commerce:ga-release-certificate` emits the final public release-ticket artifact, binding the promotion decision hash, attestation quorum hash, bundle hash, quorum blockers, required roles, key ids, and attestor ids without exposing signing secrets.
  - Delivered release certificate verifier: `npm run agent-commerce:ga-release-certificate:verify` recomputes the certificate from the promotion decision and quorum, then fails closed on certificate drift, hash mismatch, role/key/attestor mismatch, or tampering.
  - Delivered release artifact index: `npm run agent-commerce:ga-release-artifact-index` emits the final public dossier manifest with SHA-256 hashes for GA evidence, verifier outputs, promotion decision, attestations, quorum, certificate, and certificate verification; it fails closed on missing artifacts, insufficient attestation files, non-ready verifier outputs, or secret-marker leakage.
  - Delivered artifact index verifier: `npm run agent-commerce:ga-release-artifact-index:verify` recomputes the dossier hash, re-hashes every listed artifact, verifies byte counts and secret-marker scans, and fails closed on missing files or copied-artifact drift.
  - Delivered release dossier: `npm run agent-commerce:ga-release-dossier` emits non-secret JSON and Markdown release-ticket summaries bound to the verified artifact index hash, certificate hashes, attestation counts, artifact list, and blocker status.
  - Delivered release dossier verifier: `npm run agent-commerce:ga-release-dossier:verify` recomputes the dossier hash, checks artifact-index binding, recomputes blocker/status fields, verifies Markdown matches the JSON dossier, and fails closed on copied release-ticket drift.
  - Delivered final local gate: `npm run agent-commerce:ga-final-local-gate` requires a ready dossier verifier, then runs typecheck, full Agent Commerce tests, GA readiness, provider promotion, rail readiness, dashboard, Lucid-L2 gate, stack boundaries, and app-service boundaries into one final release-ticket artifact.
  - Delivered launch status: `npm run agent-commerce:ga-launch-status` combines the final local gate with real staging reconciliation, external security review, required provider-promotion summaries, and optional Lucid-L2 upstream P0 closure URLs; it fails closed until those non-local gates are truly attached.
  - Delivered launch status verifier: `npm run agent-commerce:ga-launch-status:verify` recomputes the launch status from source evidence, validates the status hash and blocker state, and fails closed on copied launch-ticket drift.
- [x] Acceptance: no raw card/SPT secret is returned to UI or stored outside secret storage.
  - Delivered now: Stripe Link Agents and Stripe SPT execution resolve provider API keys through Agent Commerce secret refs (`env:*` or encrypted `agent-commerce-secret:v1:*`), while raw granted SPT/card-like values are never returned to UI or runtime tools.

### Task 5.3 Stripe Shared Payment Tokens seller adapter

- [x] Accept granted SPT IDs from external agents.
- [x] Validate usage limits before creating a PaymentIntent.
- [x] Create PaymentIntent with SPT only after grant row is reserved and the adapter is env-gated.
- [x] Reconcile `shared_payment.granted_token.*` and PaymentIntent events.
- [x] Map successful plan purchases into existing subscription/billing ledgers.
- [x] Acceptance: SPT can pay for a Lucid plan/app/API usage without bypassing existing entitlements.
  - Delivered now: env-gated Stripe SPT provider adapter, seller grant accept route, PaymentIntent event reconciliation, status transitions, subscription/payment fulfillment for plan grants, provider-neutral entitlement rows for app/API/usage grants, and refund/dispute/token-revocation handling.

### Task 5.4 Stripe Issuing for agents adapter

- [x] Model Issuing as optional provider for Lucid-owned or platform-owned agent cards.
  - Delivered: `stripe_issuing` remains a preview provider manifest with one-time-card and real-time authorization capabilities, without exposing raw card credentials to UI/runtime tools.
- [x] Add real-time authorization webhook path.
  - Delivered: `issuing_authorization.request` events branch inside `/api/webhooks/stripe/agent-commerce` and return Stripe-compatible direct approval/decline JSON with the configured Stripe API version header.
- [x] Tie authorization decisions to spend request, policy, merchant, amount, and risk score.
  - Delivered: decisioning requires `org_id` and `agent_spend_request_id` metadata, loads the Lucid spend request, checks provider/rail, spend state, amount, currency, policy evaluator output, merchant metadata, and risk score threshold.
- [x] Decline by default on lookup failure or timeout.
  - Delivered: missing metadata, missing spend request, invalid state, policy failure, high risk, disabled feature flags, or decision errors all produce `approved: false`.
- [x] Acceptance: every authorization decision is auditable and tied to a Lucid spend request.
  - Delivered: successful and declined decisions append `stripe_issuing.authorization.*` Agent Commerce events when an org scope is present; unmatched requests fail closed instead of approving.

### Task 5.5 MPP/x402 machine payment adapters

- [x] Create seller-side paid endpoint middleware.
- [x] Generate challenge with price, currency, resource, expiry, and provider.
- [x] Claim proof atomically before returning protected content.
- [x] Reconcile Stripe PaymentIntent or facilitator proof into grant/event rows.
- [x] Support current worker x402 client only through the Agent Commerce control-plane.
- [x] Acceptance: replay tests prove one proof cannot unlock content twice.

### Task 5.6 Crypto wallet adapter

- [x] Treat existing Privy/session-signer wallets as a provider behind policy.
  - Delivered: `crypto_wallet` remains disabled by default, but has a provider-neutral execution guard that returns only an internal execution plan, never a wallet id, signature, key, or provider credential.
- [x] Require agent wallet policy, spend budget, and high-risk approval before signing.
  - Delivered: wallet execution requires `AGENT_COMMERCE_CRYPTO_WALLET_ENABLED=true`, the Lucid-L2 P0 execution gate env trio, provider/rail match, explicit `allowed_providers: ['crypto_wallet']`, explicit `allowed_rails: ['crypto_wallet_transfer']`, approved spend state, recorded human approval, non-expired spend, amount/currency budget checks, and the shared policy evaluator.
- [x] Do not reuse Lucid-L2 public write routes.
  - Delivered: Agent Commerce execution paths are CI-guarded against Lucid-L2 P0 public gateway references; direct wallet execution remains unavailable from public Commerce APIs; crypto wallet execution fails closed through `src/lib/agent-commerce/lucid-l2-p0-gates.ts` until P0 gates have closure and security-review evidence.
- [x] Acceptance: direct wallet execution is not available from public API paths.
  - Delivered: public Agent Commerce/generated-app boundary tests and `npm run stack:boundaries` reject imports/references to wallet signing markers such as `executeAgentWalletTransaction`, `signAgentWalletTypedData`, and `privy_wallet_id`; optional execution is HMAC/internal-trading only and tied to a Lucid spend request id.

## Phase 6 - Runtime Tooling

### Task 6.1 Add engine-neutral tool descriptors

**File:** `worker/src/agent/runtime-tools/commerce.ts`

- [x] `commerce_create_spend_request`
- [x] `commerce_get_spend_request`
- [x] `commerce_issue_credential`
- [x] `commerce_pay_resource`
- [x] `commerce_get_provider_capabilities`
- [x] Acceptance: tools call internal APIs only; they do not import provider SDKs.

### Task 6.2 Wire tools into OpenClaw/Hermes surfaces

- [x] Expose tools based on assistant/org capability policy.
- [x] Add per-run context:
  - `orgId`
  - `projectId`
  - `assistantId`
  - `runId`
  - `toolCallId`
  - `idempotencyKey`
- [x] Redact merchant/user/payment context in logs.
- [x] Acceptance: tools are unavailable when feature flags are disabled.

### Task 6.3 Generated app runtime support

- [x] Add app-runtime contract for seller-side paid actions.
  - Delivered: `contracts/app-runtime.ts` now exposes provider-neutral `commerce.paid_actions`, paid action capability metadata, paid action commerce config, and action commerce result state.
- [x] Allow generated apps to declare machine-payable endpoints.
  - Delivered: `contracts/app-service.ts`, `src/lib/app-service/compiler.ts`, `src/lib/app-service/manifest-sanitizer.ts`, and `src/lib/app-service/public-commerce-core.ts` support sanitized workflow/top-level paid action declarations.
- [x] Route generated app paid requests through Agent Commerce middleware.
  - Delivered: public action routes call `requirePublicAppActionCommercePayment()` before execution and return CORS-safe `402 payment_required` machine-payment challenges when proof is missing.
- [x] Acceptance: generated apps can monetize APIs without provider-specific code.
  - Delivered: generated apps call the same public action endpoint and inspect `config.commerce.paid_actions`; provider SDKs and internal Commerce routes remain blocked by generated-code guards.

## Phase 7 - Product UI

### Task 7.1 User connection and approvals

- [x] Add Agent Commerce settings page under workspace/project settings.
  - Delivered: `src/app/(app)/[workspace-slug]/settings/commerce/page.tsx` plus workspace settings navigation.
- [x] Show connected providers and preview/waitlist status.
  - Delivered: provider manifest, provider health, active connection, live/preview/waitlist cards in workspace Commerce settings.
- [x] Add approval inbox cards for spend requests.
- [x] Add spend request detail page with:
  - merchant
  - amount
  - context
  - assistant/run/tool provenance
  - policy decision
  - provider
  - approve/decline/cancel
- [x] Acceptance: user can approve or decline manual spend request end-to-end.
  - Delivered in Mission Control Commerce; a dedicated settings connection page remains future UI polish.

### Task 7.2 Operator observability

- [x] Add Mission Control panel for agent commerce events.
- [x] Add filters by org/project/assistant/provider/status.
- [x] Add replay/reconcile button for admins.
- [x] Add risk badges for high-risk merchant/currency/provider paths.
  - Delivered: Mission Control Commerce spend list/detail flags high amount, uncommon currency, wallet rails, manual-risk router reasons, and higher-risk merchant geos.
- [x] Acceptance: support can answer "why did this agent spend or fail to spend?" from UI.

### Task 7.3 Seller monetization UI

- [x] Add machine-payable endpoint configuration for app services/MCP/API.
  - Delivered: generated app cockpit Monetization panel edits `commerce.paid_actions` through the App Service settings pipeline.
- [x] Configure amount, currency, free quota, provider, and refund policy.
  - Delivered: action-level mode, minor-unit amount, currency, free quota metadata, provider, rail, resource type/ID, label, and refund policy controls.
- [x] Show revenue and payment proof history.
  - Delivered: app cockpit summarizes configured/shadow/enforced actions, claimed payment gross, and recent proof/challenge events from the app timeline.
- [x] Acceptance: product teams can put an endpoint in shadow pricing before charging.
  - Delivered: `shadow` mode persists in the sanitized manifest and is exposed to generated app runtime config without charging.

## Phase 8 - Billing, Entitlements, and Reconciliation

### Task 8.1 Reuse existing human checkout

- [x] Keep current Stripe Checkout/Link plan checkout as default human purchase flow.
- [x] Do not replace Checkout with Agent Commerce for normal users.
- [x] Add SPT/grant path only as alternative seller-side entry point.

### Task 8.2 Map seller grants to entitlements

- [x] For plan purchases, map payment success to existing subscription/payment ledgers.
- [x] For usage purchases, map to provider-neutral entitlement rows that can later emit OpenMeter/outbox usage events.
- [x] For app-generated services, map to provider-neutral `app_public_usage_bucket` entitlement rows without coupling generated runtimes to provider SDKs.
- [x] Acceptance: no paid access is granted until billing ledger and entitlement state agree.
  - Delivered: `agent_commerce_seller_entitlements`, `fulfill_agent_commerce_seller_grant`, `revoke_agent_commerce_seller_entitlement`, Mission Control entitlement summary, and Stripe reversal event mapping.

### Task 8.3 Reconciliation jobs

- [x] Add scheduled job to reconcile stuck spend requests.
- [x] Add scheduled job to expire stale approvals/credentials.
- [x] Add scheduled job to compare provider events with local ledger.
- [x] Add budget reservation release/failure during reconciliation.
- [x] Emit a durable `reconciliation.completed` event for every org reconciliation run, including clean zero-update runs.
- [x] Add machine-verifiable staging beta-window evidence collector.
- [x] Acceptance: stuck states are visible and recoverable without manual DB edits.
  - Delivered now: `npm run agent-commerce:staging-reconciliation-evidence` can prove seven distinct staging run days, stale-approval checks, stuck-credential checks, provider mismatch triage, and zero untriaged P0/P1 Commerce incidents from durable reconciliation audit events.

## Phase 9 - Security, Compliance, and Abuse Controls

- [x] Rate limit spend request creation per org/user/assistant.
- [x] Add baseline velocity checks:
  - per assistant
  - per merchant domain/name
  - per provider
  - per currency
  - per seller grant
  - per machine-payment resource
- [x] Add PII-safe logging rules.
- [x] Add Sentry tags without sensitive data.
- [x] Add secret storage abstraction for provider credentials.
- [x] Add audit events for every status transition.
- [x] Add admin kill switch.
- [x] Add provider-specific denylist and emergency disable.
- [x] Add typed external security review packet and release evidence validator.
- [x] Acceptance: security checklist required for this phase is complete before preview.
  - Delivered now: `npm run agent-commerce:security-review-evidence` validates reviewer identity, review date, full Agent Commerce security scope, findings disposition, and zero open P0/P1 findings before security-review evidence can close the GA gate.

## Phase 10 - Tests and Verification

### Unit tests

- [x] Contract parse tests.
- [x] Policy evaluator tests.
- [x] Rail Router tests.
- [x] Provider registry tests.
- [x] Idempotency helper tests.
- [x] Observability redaction and secret-ref tests.

### DB tests

- [x] Migration applies.
  - Delivered: CI-friendly Agent Commerce migration apply preflight checks balanced dollar quotes, idempotent table/index DDL, replaceable functions, and dependency ordering across migrations 107-110. Live Supabase/Postgres application remains a staging gate because this workstation has no local `psql`, Supabase CLI, or Docker runtime.
- [x] RLS protects org data.
  - Delivered: migration contract tests require org membership SELECT policies, service-role write policies, provider-health read-only visibility, and no user-readable rate-limit side channel.
- [x] Atomic idempotency claim.
- [x] Atomic proof claim.
- [x] Atomic spend budget reservation.
- [x] Atomic seller entitlement fulfillment/revocation contract.
- [x] Atomic Agent Commerce route rate-limit claim.
- [x] Illegal status transition rejection.

### API tests

- [x] Public route auth/validation.
  - Delivered: public spend-request route tests cover unauthenticated access, malformed org query validation, membership enforcement, idempotency normalization, CSRF-backed mutation entry, shared rate-limit enforcement, and no side effects on malformed mutations.
- [x] Internal HMAC route auth/validation.
  - Delivered: internal spend-request route tests cover missing HMAC headers, invalid signatures, signed payload validation, runtime actor provenance, and no provider side effects before auth/validation/rate limits pass.
- [x] Webhook signature and dedupe.
- [x] Feature flag disabled behavior.

### Worker tests

- [x] Runtime tools call internal APIs only.
- [x] Tool availability follows capability policy.
- [x] Provider capability lookup calls internal control-plane API only.
- [x] No provider SDK imports in worker runtime tool files.

### E2E tests

- [x] Manual provider spend request: create -> approve -> issue test credential -> complete.
- [x] Seller grant: receive test grant -> accept -> entitlement/usage update.
  - Adapter execution, webhook reconciliation, entitlement activation, and reversal handling are implemented behind feature/env gates.
- [x] x402 proof: no proof -> 402 -> proof claim -> content -> replay denied.

## Preview Launch Gates

- [x] All P0 Lucid-L2 gates in `docs/BACKLOG.md` are either closed or Lucid-L2 execution remains physically unreachable.
  - Delivered: P0-L2 gates remain open in backlog, and Agent Commerce execution code is now guarded by stack-boundary tests, `npm run stack:boundaries`, and `npm run agent-commerce:l2-gates` so those Lucid-L2 money-moving routes cannot be referenced accidentally or enabled without explicit closure evidence.
- [x] Manual provider E2E is green.
- [x] Rail Router test matrix is green.
- [x] Atomic proof/idempotency tests are green.
- [x] Feature flags default off in production.
  - Delivered: feature-flag tests assert Agent Commerce and generated app Commerce surfaces remain dark-launched until explicit env flags open them.
- [x] Admin kill switch verified.
- [x] No raw credential persistence verified by code review.
- [x] Logs and traces are PII-safe.
- [x] Stripe preview adapters remain disabled until account/API access is confirmed.

## GA Gates

Validate release evidence with:

```bash
AGENT_COMMERCE_GA_EVIDENCE_FILE=ops/agent-commerce/evidence/ga-readiness.<release>.json \
npm run agent-commerce:ga-readiness
```

- [x] At least one agent-platform rail is live behind provider adapter.
  - Delivered: the manual provider live rail `manual_approval` is classified by `summarizeAgentCommerceRailReadiness` as an agent-platform rail backed by a durable provider adapter; external provider rails remain access gated.
- [x] At least one seller rail is live behind provider adapter.
  - Delivered: the same manual provider live rail accepts seller grants and supports entitlement flow through the provider-neutral adapter path; external provider rails remain access gated.
- [ ] Reconciliation jobs have run in staging for a beta window.
  - Gate status: evidence contract, draft collector, durable clean-run reconciliation audit events, `npm run agent-commerce:staging-reconciliation-evidence`, and release-bundle source hashing are implemented; real staging beta-window evidence still requires seven staging run days and incident-disposition proof before `AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE=ops/agent-commerce/evidence/staging-reconciliation.<release>.json npm run agent-commerce:ga-evidence` can close the GA evidence file and `npm run agent-commerce:ga-release-bundle` can package it.
  - 2026-05-04 rollout evidence: canonical Agent Commerce migrations `107`-`114` were copied into `supabase/migrations/20260504010000` through `20260504010700` with matching SHA-256 hashes, but the configured Supabase REST target still returns `PGRST205` for `public.agent_commerce_events` and no DB URL/Supabase CLI target is configured. See `ops/agent-commerce/evidence/rollout-2026-05-04/supabase-schema-probe.blocked.json`.
- [x] Support runbook exists.
- [x] Refund/reversal flow exists for seller grants where provider supports it.
- [x] Production dashboard includes spend, failure, replay, provider health, and revenue metrics.
  - Delivered: `summarizeAgentCommerceProductionDashboard` powers the Mission Control Commerce API and client with completed spend volume, seller revenue, org-scoped failure totals including blocked provider promotions, proof replay counts, provider health counts, and CI enforcement through `npm run agent-commerce:dashboard`.
  - Delivered: replay and blocked-promotion totals now use historical `production_event_counts` from exact event-type DB counts, backed by `idx_agent_commerce_events_org_event_type_created`, so production metrics are not capped by the recent activity feed.
  - Delivered: spend, captured budget, seller revenue, and entitlement totals now use historical `production_ledger_aggregates` from `agent_commerce_production_dashboard_ledger_aggregates`, backed by ledger aggregate indexes, so production metrics are not capped by Mission Control list rows.
  - Delivered: provider webhook mismatch totals now use historical `production_provider_mismatch_count` from `agent_commerce_provider_event_mismatch_count`, so the failure metric is not capped by the recent mismatch panel rows.
  - Delivered: provider health `failure_count` is now classified as global rail health through `production_summary.providers.global_failure_count`; it remains visible in provider rows and no longer inflates org-scoped `production_summary.failures.total`.
- [ ] External security review of Agent Commerce flows completed.
  - Gate status: evidence contract, draft collector, security-review packet validator implemented, and release-bundle source hashing implemented; real external review still requires a reviewer-authored packet validated with `AGENT_COMMERCE_SECURITY_REVIEW_PACKET_FILE=ops/agent-commerce/evidence/security-review.<release>.json npm run agent-commerce:security-review-evidence`, then `AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE=ops/agent-commerce/evidence/security-review-summary.<release>.json npm run agent-commerce:ga-evidence` and `npm run agent-commerce:ga-release-bundle`.
  - 2026-05-04 rollout evidence: `ops/agent-commerce/evidence/rollout-2026-05-04/external-security-review-request.blocked.json` records the exact required reviewer packet scope. No reviewer-authored packet exists yet.

## Open Questions

- Which provider gets first live adapter access: Stripe Link Agents, Stripe SPT seller, MPP, x402, or manual-only preview?
- Should org admins define agent autonomy at workspace, project, assistant, or run scope first?
- Should generated apps expose paid endpoints through one shared seller account or per-app seller profiles?
- What is the first paid machine endpoint to launch: MCP tool call, generated API route, app service run, or LucidGateway API call?
- Should Lucid issue agent cards for platform-owned agents, or rely only on user-owned Link/third-party wallets at first?
