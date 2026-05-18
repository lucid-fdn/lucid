# Agent Commerce Operations Runbook

**Status:** Preview-ready, live provider rails gated
**Stack:** `commerce`
**Primary surfaces:** Mission Control Commerce, `/api/internal/agent-commerce/reconcile`, `agent_commerce_*` tables

## Feature Flags

- Keep `FEATURE_AGENT_COMMERCE=false` in production until migrations `107`, `108`, `109`, and `110` are applied.
- Enable `FEATURE_AGENT_COMMERCE=true` before enabling sub-surfaces.
- Enable `FEATURE_AGENT_COMMERCE_WALLETS=true` for buyer-agent spend requests.
- Enable `FEATURE_AGENT_COMMERCE_SELLER=true` for seller grants and machine-payment challenges.
- Set `AGENT_COMMERCE_KILL_SWITCH=true` to fail closed across Commerce APIs.

## Required Secrets

- `AGENT_COMMERCE_INTERNAL_SECRET`: HMAC secret used by runtime/internal Commerce tools.
- `AGENT_COMMERCE_WEBHOOK_SECRET`: generic provider webhook HMAC secret.
- `AGENT_COMMERCE_SECRET_ENCRYPTION_KEY`: optional dedicated key for encrypted Agent Commerce secret refs; otherwise Commerce falls back to the app credential/data encryption key.
- `STRIPE_AGENT_COMMERCE_WEBHOOK_SECRET`: optional dedicated Stripe Agent Commerce webhook secret.
- `STRIPE_API_VERSION`: Stripe API version for Agent Commerce preview adapter calls; default `2026-02-25.clover`.
- `AGENT_COMMERCE_STRIPE_LINK_AGENTS_ENABLED`: keep `false` until Stripe Agentic Commerce Suite / Link Agents account access is approved.
- `AGENT_COMMERCE_STRIPE_LINK_SECRET_REF`: optional secret ref for Stripe Link Agents execution. Prefer `env:STRIPE_SECRET_KEY` or an encrypted `agent-commerce-secret:v1:*` ref.
- `AGENT_COMMERCE_STRIPE_LINK_ISSUED_TOKEN_ENDPOINT`: Stripe ACS Shared Payment issued-token endpoint. Override it only if Stripe provides account-specific endpoint guidance.
- `AGENT_COMMERCE_STRIPE_LINK_RETURN_URL`: HTTPS return URL for SPT issuance when buyer authorization requires a redirect.
- `AGENT_COMMERCE_STRIPE_LINK_REQUESTED_SESSION_ENDPOINT`: deprecated preview override kept for backward compatibility.
- `AGENT_COMMERCE_STRIPE_SPT_ENABLED`: keep `false` until Stripe Shared Payment Tokens seller access is approved for the account.
- `AGENT_COMMERCE_STRIPE_SECRET_REF`: optional secret ref for Stripe SPT execution. Prefer `env:STRIPE_SECRET_KEY` or an encrypted `agent-commerce-secret:v1:*` ref over passing raw keys through configs.
- `AGENT_COMMERCE_STRIPE_SPT_TOKEN_FIELD`: preview PaymentIntent field for a granted Shared Payment Token; override only when Stripe account docs require it.
- `CRON_SECRET`: required for scheduled reconciliation.

## Reconciliation

Scheduled endpoint:

```text
GET /api/internal/agent-commerce/reconcile?secret=<CRON_SECRET>
```

What it reconciles:

- expires stale spend requests with `expires_at <= now()`;
- fails spend requests stuck in `credential_issuing`;
- releases or fails linked budget reservations when spend requests expire or fail;
- expires stale machine-payment challenges;
- expires stale seller grants;
- expires active seller entitlements whose `expires_at` has passed;
- expires reserved idempotency keys;
- reports provider events that do not match a local ledger entity.

Manual operator action:

```text
POST /api/mission-control/commerce/reconcile
```

Use the Mission Control Commerce page when possible so the reconcile action is tied to the operator session and audit trail.

## Emergency Disable

Use Mission Control Commerce provider health controls to disable a provider. This updates `agent_commerce_provider_health` and causes the Rail Router to deny or avoid that provider.

If the whole stack must stop:

```text
AGENT_COMMERCE_KILL_SWITCH=true
```

## Incident Checklist

1. Set provider health to `disabled` for a provider-specific incident.
2. Set `AGENT_COMMERCE_KILL_SWITCH=true` for broad replay, ledger, or credential risk.
3. Run reconciliation for the affected org.
4. Inspect Mission Control Commerce mismatches.
5. Check `agent_commerce_events` for `provider_event_id` duplicates and unmatched provider events.
6. Confirm no spend request remains in `credential_issuing` longer than the configured stuck window.
7. For seller incidents, inspect `agent_commerce_seller_entitlements` and linked `subscriptions`/`payments` before restoring access.
8. Re-enable provider health only after a clean reconciliation pass.

## Seller Entitlements and Reversals

Completed seller grants are fulfilled through `fulfill_agent_commerce_seller_grant` into `agent_commerce_seller_entitlements`.

- Plan grants create a Lucid subscription and payment row, then link the entitlement to that subscription.
- App/API/usage grants create provider-neutral entitlement rows so generated apps and runtimes never import Stripe or provider SDKs.
- Stripe refund/dispute/revocation events call `revoke_agent_commerce_seller_entitlement`, cancel linked subscriptions, mark linked payments refunded where applicable, and append `seller_entitlement.revoked` events.

If a provider reversal is suspected but not reflected in Lucid:

1. Keep the provider disabled or the Commerce kill switch active.
2. Confirm the Stripe event has `metadata.org_id` and either `metadata.seller_grant_id` or a PaymentIntent id.
3. Run reconciliation for the affected org.
4. If the entitlement is still active, manually replay the signed webhook or revoke through the DB RPC with the provider event id in metadata.
5. Confirm Mission Control Commerce shows the entitlement as revoked before re-enabling paid access.

## Abuse Controls

Mutation routes call `claim_agent_commerce_rate_limit` before provider side effects or ledger mutation. Rate limits are org-scoped and bucketed by user, assistant, provider, seller grant, or machine-payment resource depending on the route.

If legitimate traffic is blocked:

1. Confirm the response details include the expected `bucket`, `limit_value`, and `reset_at`.
2. Inspect `agent_commerce_rate_limit_buckets` for the org and bucket.
3. Prefer a policy/code change for durable limit increases; direct DB edits should be incident-only.

## Logs, Sentry, and Secrets

Agent Commerce routes report unexpected 5xx errors through the Commerce observability helper. It allowlists tags such as stack, operation, surface, provider, rail, status, and error code, while hashing or redacting merchant, user, customer, grant, payment, token, key, wallet, and signature values from Sentry context and local error logs.

Provider credentials should be represented by secret refs:

- `env:VAR_NAME` for deployment-managed secrets.
- `agent-commerce-secret:v1:*` for encrypted inline refs created by the Commerce secret helper.

Never store raw provider credentials, granted payment tokens, card data, OAuth tokens, wallet keys, or webhook secrets in `metadata`, runtime tool payloads, generated app manifests, or public API responses.

## Production Dashboard Metrics

Mission Control Commerce includes the GA dashboard metrics operators need before widening access:

- completed spend volume from historical `agent_spend_requests` ledger aggregates;
- seller revenue from historical completed `seller_payment_grants` ledger aggregates;
- failure totals from historical spend and budget aggregates, historical provider-event mismatch counts, and blocked provider promotions;
- replay counts from exact historical `proof_claim.claimed` and `proof_claim.replayed` event-type counts;
- global provider health counts and global rail failure counters from `agent_commerce_provider_health`.

Spend, captured budget, seller revenue, and entitlement totals use `production_ledger_aggregates`, backed by the `agent_commerce_production_dashboard_ledger_aggregates` RPC and ledger aggregate indexes. Provider webhook mismatch totals use `production_provider_mismatch_count`, backed by `agent_commerce_provider_event_mismatch_count`, while the mismatch panel remains a recent feed. Replay and blocked-promotion totals use `production_event_counts`, backed by the `idx_agent_commerce_events_org_event_type_created` index. These production metrics are not limited by the recent activity feed or capped list rows. Run `npm run agent-commerce:dashboard` before a release to verify the API, client, tests, and plan still expose those metrics.

Provider health `failure_count` is global rail health, not org-scoped Commerce failure volume. It appears under `production_summary.providers.global_failure_count` and provider health rows, and it must not be added to `production_summary.failures.total`.

## Agent Commerce GA Readiness Evidence

GA promotion requires an evidence file, not just green local tests. Use:

```bash
AGENT_COMMERCE_GA_EVIDENCE_FILE=ops/agent-commerce/evidence/ga-readiness.<release>.json \
npm run agent-commerce:ga-readiness
```

The evidence file must include the live manual agent-platform rail, live manual seller rail, staging reconciliation beta-window history, production dashboard proof, Lucid-L2 P0 execution block proof, and external security review disposition. Keep `staging_reconciliation_beta_window` and `external_security_review` open in the plan until real release artifacts exist.

To create the draft evidence file after the local validation commands pass:

```bash
AGENT_COMMERCE_GA_LOCAL_CHECKS_PASSED=true \
AGENT_COMMERCE_GA_EVIDENCE_OUTPUT=ops/agent-commerce/evidence/ga-readiness.<release>.json \
npm run agent-commerce:ga-evidence
```

For staging beta-window proof, first collect machine-verifiable reconciliation evidence from durable `reconciliation.completed` audit events:

```bash
AGENT_COMMERCE_STAGING_ORG_ID=<org-id> \
AGENT_COMMERCE_STAGING_RECONCILIATION_INCIDENT_COUNT=0 \
AGENT_COMMERCE_STAGING_RECONCILIATION_OUTPUT=ops/agent-commerce/evidence/staging-reconciliation.<release>.json \
npm run agent-commerce:staging-reconciliation-evidence
```

Every scheduled reconciliation run writes `reconciliation.completed`, including clean zero-update runs, so a healthy beta window can prove both that the job ran and that stale-approval, stuck-credential, and provider-mismatch checks executed. Feed the generated summary into the GA collector with `AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE`.

For external security review proof, ask the reviewer to produce a packet shaped like `ops/agent-commerce/evidence/security-review.example.json`, then validate it:

```bash
AGENT_COMMERCE_SECURITY_REVIEW_PACKET_FILE=ops/agent-commerce/evidence/security-review.<release>.json \
AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_OUTPUT=ops/agent-commerce/evidence/security-review-summary.<release>.json \
npm run agent-commerce:security-review-evidence
```

The packet must cover control-plane APIs, runtime tools, provider adapters, webhooks, machine payments, generated app paid actions, wallet execution guard, Lucid-L2 P0 gates, GA evidence gates, and operator runbooks. Feed the generated summary into the GA collector with `AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE`.

Keep reconciliation and security URL variables for release audit links when useful, then rerun with `AGENT_COMMERCE_GA_EVIDENCE_REQUIRE_READY=true`.

Before promotion, package the exact release artifacts into a hash-manifest bundle:

```bash
AGENT_COMMERCE_GA_EVIDENCE_FILE=ops/agent-commerce/evidence/ga-readiness.<release>.json \
AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE=ops/agent-commerce/evidence/staging-reconciliation.<release>.json \
AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE=ops/agent-commerce/evidence/security-review-summary.<release>.json \
AGENT_COMMERCE_GA_RELEASE_BUNDLE_OUTPUT=ops/agent-commerce/evidence/ga-release-bundle.<release>.json \
AGENT_COMMERCE_GA_RELEASE_BUNDLE_REQUIRE_READY=true \
npm run agent-commerce:ga-release-bundle
```

For releases that promote an external provider, keep `AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES` set while building the bundle so each provider summary is tied to a provider-specific source hash. Use `AGENT_COMMERCE_GA_RELEASE_SOURCE_FILES` for extra repo-local audit artifacts that should be pinned into the bundle.

Verify the bundle just before promotion:

```bash
AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE=ops/agent-commerce/evidence/ga-release-bundle.<release>.json \
AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_OUTPUT=ops/agent-commerce/evidence/ga-release-bundle-verification.<release>.json \
AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_REQUIRE_READY=true \
npm run agent-commerce:ga-release-bundle:verify
```

The verifier recomputes the deterministic bundle hash, re-evaluates GA readiness/source integrity from the embedded evidence, and re-hashes every source file listed in the bundle. Treat any hash mismatch, missing source file, environment mismatch, or non-ready readiness result as a release blocker.

Create the final promotion decision artifact after verification:

```bash
AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE=ops/agent-commerce/evidence/ga-release-bundle.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_TARGET_ENVIRONMENT=production \
AGENT_COMMERCE_GA_PROMOTION_DECISION_OUTPUT=ops/agent-commerce/evidence/ga-promotion-decision.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_REQUIRE_APPROVED=true \
npm run agent-commerce:ga-promotion
```

The promotion decision is the artifact operators should use for the go/no-go call. It stays blocked if bundle verification fails, the target environment does not match the bundle, staging reconciliation or external security gates are incomplete, or any included provider promotion summary remains blocked.

Have an authorized release operator sign the approved promotion decision:

```bash
AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE=ops/agent-commerce/evidence/ga-promotion-decision.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_NAME="Release Operator" \
AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_ROLE="Commerce Release Manager" \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEY_ID=agent-commerce-ga-<release> \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY=<secret> \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_OUTPUT=ops/agent-commerce/evidence/ga-promotion-attestation.<release>.json \
npm run agent-commerce:ga-promotion:attest

AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE=ops/agent-commerce/evidence/ga-promotion-decision.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILE=ops/agent-commerce/evidence/ga-promotion-attestation.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY=<secret> \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_VERIFY_REQUIRE_READY=true \
npm run agent-commerce:ga-promotion:attest:verify

AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE=ops/agent-commerce/evidence/ga-promotion-decision.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILES=ops/agent-commerce/evidence/ga-promotion-attestation.release.<release>.json,ops/agent-commerce/evidence/ga-promotion-attestation.security.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEYRING_JSON='{"release-key":"<secret>","security-key":"<secret>"}' \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRED_COUNT=2 \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRED_ROLES="Commerce Release Manager,Security Reviewer" \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_OUTPUT=ops/agent-commerce/evidence/ga-promotion-attestation-quorum.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRE_READY=true \
npm run agent-commerce:ga-promotion:attest:quorum
```

Issue the final public release certificate after the quorum passes:

```bash
AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE=ops/agent-commerce/evidence/ga-promotion-decision.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE=ops/agent-commerce/evidence/ga-promotion-attestation-quorum.<release>.json \
AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_OUTPUT=ops/agent-commerce/evidence/ga-release-certificate.<release>.json \
AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_REQUIRE_READY=true \
npm run agent-commerce:ga-release-certificate

AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_FILE=ops/agent-commerce/evidence/ga-release-certificate.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE=ops/agent-commerce/evidence/ga-promotion-decision.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE=ops/agent-commerce/evidence/ga-promotion-attestation-quorum.<release>.json \
AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_OUTPUT=ops/agent-commerce/evidence/ga-release-certificate-verification.<release>.json \
AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_REQUIRE_READY=true \
npm run agent-commerce:ga-release-certificate:verify

AGENT_COMMERCE_GA_EVIDENCE_FILE=ops/agent-commerce/evidence/ga-readiness.<release>.json \
AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE=ops/agent-commerce/evidence/staging-reconciliation.<release>.json \
AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE=ops/agent-commerce/evidence/security-review-summary.<release>.json \
AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE=ops/agent-commerce/evidence/ga-release-bundle.<release>.json \
AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_FILE=ops/agent-commerce/evidence/ga-release-bundle-verification.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE=ops/agent-commerce/evidence/ga-promotion-decision.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILES=ops/agent-commerce/evidence/ga-promotion-attestation.release.<release>.json,ops/agent-commerce/evidence/ga-promotion-attestation.security.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE=ops/agent-commerce/evidence/ga-promotion-attestation-quorum.<release>.json \
AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_FILE=ops/agent-commerce/evidence/ga-release-certificate.<release>.json \
AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_FILE=ops/agent-commerce/evidence/ga-release-certificate-verification.<release>.json \
AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_OUTPUT=ops/agent-commerce/evidence/ga-release-artifact-index.<release>.json \
AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_REQUIRE_READY=true \
npm run agent-commerce:ga-release-artifact-index

AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE=ops/agent-commerce/evidence/ga-release-artifact-index.<release>.json \
AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_OUTPUT=ops/agent-commerce/evidence/ga-release-artifact-index-verification.<release>.json \
AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_REQUIRE_READY=true \
npm run agent-commerce:ga-release-artifact-index:verify

AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE=ops/agent-commerce/evidence/ga-release-artifact-index.<release>.json \
AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_FILE=ops/agent-commerce/evidence/ga-release-artifact-index-verification.<release>.json \
AGENT_COMMERCE_GA_RELEASE_DOSSIER_OUTPUT=ops/agent-commerce/evidence/ga-release-dossier.<release>.json \
AGENT_COMMERCE_GA_RELEASE_DOSSIER_MARKDOWN_OUTPUT=ops/agent-commerce/evidence/ga-release-dossier.<release>.md \
AGENT_COMMERCE_GA_RELEASE_DOSSIER_REQUIRE_READY=true \
npm run agent-commerce:ga-release-dossier

AGENT_COMMERCE_GA_RELEASE_DOSSIER_FILE=ops/agent-commerce/evidence/ga-release-dossier.<release>.json \
AGENT_COMMERCE_GA_RELEASE_DOSSIER_MARKDOWN_FILE=ops/agent-commerce/evidence/ga-release-dossier.<release>.md \
AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE=ops/agent-commerce/evidence/ga-release-artifact-index.<release>.json \
AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_FILE=ops/agent-commerce/evidence/ga-release-artifact-index-verification.<release>.json \
AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_OUTPUT=ops/agent-commerce/evidence/ga-release-dossier-verification.<release>.json \
AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_REQUIRE_READY=true \
npm run agent-commerce:ga-release-dossier:verify

AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_FILE=ops/agent-commerce/evidence/ga-release-dossier-verification.<release>.json \
AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_OUTPUT=ops/agent-commerce/evidence/ga-final-local-gate.<release>.json \
AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_REQUIRE_READY=true \
npm run agent-commerce:ga-final-local-gate

AGENT_COMMERCE_GA_EVIDENCE_FILE=ops/agent-commerce/evidence/ga-readiness.<release>.json \
AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_FILE=ops/agent-commerce/evidence/ga-final-local-gate.<release>.json \
AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE=ops/agent-commerce/evidence/staging-reconciliation.<release>.json \
AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE=ops/agent-commerce/evidence/security-review-summary.<release>.json \
AGENT_COMMERCE_GA_LAUNCH_STATUS_OUTPUT=ops/agent-commerce/evidence/ga-launch-status.<release>.json \
AGENT_COMMERCE_GA_LAUNCH_STATUS_REQUIRE_READY=true \
npm run agent-commerce:ga-launch-status

AGENT_COMMERCE_GA_LAUNCH_STATUS_FILE=ops/agent-commerce/evidence/ga-launch-status.<release>.json \
AGENT_COMMERCE_GA_EVIDENCE_FILE=ops/agent-commerce/evidence/ga-readiness.<release>.json \
AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_FILE=ops/agent-commerce/evidence/ga-final-local-gate.<release>.json \
AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE=ops/agent-commerce/evidence/staging-reconciliation.<release>.json \
AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE=ops/agent-commerce/evidence/security-review-summary.<release>.json \
AGENT_COMMERCE_GA_LAUNCH_STATUS_VERIFY_OUTPUT=ops/agent-commerce/evidence/ga-launch-status-verification.<release>.json \
AGENT_COMMERCE_GA_LAUNCH_STATUS_VERIFY_REQUIRE_READY=true \
npm run agent-commerce:ga-launch-status:verify
```

The attestation signs the exact promotion decision hash and bundle hash. Do not store `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY` or `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEYRING_JSON` in repo artifacts or logs. A blocked promotion decision cannot be attested. Production releases should require a quorum of distinct valid attestations, typically a Commerce Release Manager plus Security Reviewer. The release certificate is the release-ticket artifact that proves the exact bundle hash, promotion decision hash, quorum hash, quorum blockers, required roles, key ids, and attestor ids without exposing signing secrets. Verify it after release-ticket publication to catch drift, truncation, or tampering before any live rail is promoted. The artifact index is the final public release dossier: it hashes all release artifacts, requires verifier outputs, counts attestation files, and fails if secret-bearing env markers leak into JSON artifacts. Verify the index as the last release-ticket check so copied artifacts cannot drift from the dossier.
Generate the release dossier after index verification to attach a non-secret JSON/Markdown summary to the release ticket. It binds the ticket to the artifact index hash, certificate hashes, verification status, attestation counts, and public artifact list without exposing signing keys or provider secrets.
Verify the release dossier after it is attached or copied so the JSON hash, Markdown rendering, and artifact-index binding are checked before any live rail promotion.
Run the final local gate after dossier verification to attach one machine-readable proof that the dossier verifier, typecheck, Agent Commerce tests, GA readiness, provider promotion guard, rail readiness, dashboard, L2 gate, and stack/app-service boundary checks all passed.
Run launch status last. It stays blocked until the final local gate, staging reconciliation summary, external security review summary, required provider promotion summaries, and any required Lucid-L2 upstream P0 closure URLs are attached and ready.
Verify launch status after it is attached or copied so the hash, blocker state, final local gate binding, staging/security summaries, provider-promotion requirements, and Lucid-L2 closure requirements still match the source evidence.

## Live Provider Rule

Do not enable Stripe Link Agents, Shared Payment Tokens, Issuing, MPP, x402, or crypto wallet execution as live rails until the provider adapter has:

- verified account/API access;
- idempotency before provider side effects;
- ledger budget reservation before provider side effects;
- no raw credential persistence;
- webhook signature verification and dedupe;
- reconciliation from provider event to local ledger state;
- fail-closed tests for timeout, replay, and provider mismatch.

Stripe Link Agents execution is implemented as an env-gated preview adapter for ACS Shared Payment issued-token flows. Enable it only with `AGENT_COMMERCE_STRIPE_LINK_AGENTS_ENABLED=true`, `FEATURE_AGENT_COMMERCE=true`, `FEATURE_AGENT_COMMERCE_WALLETS=true`, a Stripe secret ref, account-approved issued-token access, an HTTPS return URL, webhook signing, and provider-promotion evidence. Stripe Shared Payment Tokens seller execution is implemented as an env-gated preview adapter. Enable it only with `AGENT_COMMERCE_STRIPE_SPT_ENABLED=true`, `FEATURE_AGENT_COMMERCE=true`, `FEATURE_AGENT_COMMERCE_SELLER=true`, `STRIPE_SECRET_KEY`, and webhook signing configured.

Stripe ACS Orchestrated Commerce Agreement webhooks update `agent_commerce_connections` through the atomic `upsert_agent_commerce_connection` RPC. Agreement `created` and `partially_confirmed` events remain `pending`, `confirmed` becomes `active`, `terminated` becomes `revoked`, and failed/expired agreement events become `failed` or `expired`. If a provider connection id is already attached to another org, the upsert fails instead of moving the connection.

## Provider Promotion Evidence

Before changing any Agent Commerce provider manifest to `availability.mode: live`, run:

```bash
npm run agent-commerce:provider-promotion
```

For a provider-specific live promotion, first validate the release packet:

```bash
AGENT_COMMERCE_PROVIDER_PROMOTION_PACKET_FILE=ops/agent-commerce/evidence/provider-promotion.<provider>.<release>.json \
AGENT_COMMERCE_PROVIDER_PROMOTION_REQUIRE_READY=true \
npm run agent-commerce:provider-promotion-evidence
```

The current live provider is `manual`. Any account-access, webhook, machine-payment, Stripe Link, or crypto wallet provider needs explicit promotion evidence before live mode. A `manifest-only` provider must never be marked live.

Stripe Link/ACS promotion packets must prove stable API access, approved Shared Payment issued-token access, OAuth/OCA callback verification, secret refs, webhook signature verification, dedupe, reconciliation mapping, idempotency, budget reservation, no raw credential persistence, and fail-closed behavior.

When a release includes a provider promotion, pass the validated promotion summary into GA evidence:

```bash
AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES=ops/agent-commerce/evidence/provider-promotion.<provider>-summary.<release>.json \
AGENT_COMMERCE_GA_EVIDENCE_OUTPUT=ops/agent-commerce/evidence/ga-readiness.<release>.json \
npm run agent-commerce:ga-evidence
```

GA readiness stays valid for manual-only releases without provider promotion summaries, but fails closed if any included provider promotion summary is not ready.

Blocked live-mode attempts append `provider_promotion.blocked` Agent Commerce events with blockers and missing evidence. Mission Control Commerce surfaces those events as Promotion Blocks through the dedicated `provider_promotion_block_events` feed and includes them in `production_summary.failures.provider_promotion_blocks` through historical `production_event_counts`. If the audit write itself fails, Commerce captures a sanitized `provider_promotion_blocked_audit` error and still returns the fail-closed promotion response.
