# Agent Commerce GA Readiness Evidence

Agent Commerce GA is intentionally evidence-gated. Local code can prove the provider-neutral architecture, dashboards, rail readiness, and Lucid-L2 execution blocks. Staging reconciliation history and external security review still require real release evidence.

Run:

```bash
npm run agent-commerce:ga-readiness
```

By default the validator checks the gate inventory and the example evidence shape. To validate a real release file, set:

```bash
AGENT_COMMERCE_GA_EVIDENCE_FILE=ops/agent-commerce/evidence/ga-readiness.<release>.json \
npm run agent-commerce:ga-readiness
```

To generate a draft evidence file after local checks pass:

```bash
AGENT_COMMERCE_GA_LOCAL_CHECKS_PASSED=true \
AGENT_COMMERCE_GA_EVIDENCE_OUTPUT=ops/agent-commerce/evidence/ga-readiness.<release>.json \
npm run agent-commerce:ga-evidence
```

The collector intentionally leaves staging reconciliation and external security review incomplete until their artifact URLs or machine-verifiable staging evidence are provided. Set `AGENT_COMMERCE_GA_EVIDENCE_REQUIRE_READY=true` when running it in a release pipeline that should fail on missing evidence.

To turn durable staging reconciliation audit events into a machine-verifiable evidence artifact:

```bash
AGENT_COMMERCE_STAGING_ORG_ID=<org-id> \
AGENT_COMMERCE_STAGING_RECONCILIATION_INCIDENT_COUNT=0 \
AGENT_COMMERCE_STAGING_RECONCILIATION_OUTPUT=ops/agent-commerce/evidence/staging-reconciliation.<release>.json \
npm run agent-commerce:staging-reconciliation-evidence
```

Then feed that artifact into the GA draft collector:

```bash
AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE=ops/agent-commerce/evidence/staging-reconciliation.<release>.json \
AGENT_COMMERCE_GA_LOCAL_CHECKS_PASSED=true \
AGENT_COMMERCE_GA_EVIDENCE_OUTPUT=ops/agent-commerce/evidence/ga-readiness.<release>.json \
npm run agent-commerce:ga-evidence
```

To turn a reviewer-authored security packet into GA evidence:

```bash
AGENT_COMMERCE_SECURITY_REVIEW_PACKET_FILE=ops/agent-commerce/evidence/security-review.<release>.json \
AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_OUTPUT=ops/agent-commerce/evidence/security-review-summary.<release>.json \
npm run agent-commerce:security-review-evidence
```

Then feed that summary into the GA draft collector:

```bash
AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE=ops/agent-commerce/evidence/security-review-summary.<release>.json \
AGENT_COMMERCE_GA_LOCAL_CHECKS_PASSED=true \
AGENT_COMMERCE_GA_EVIDENCE_OUTPUT=ops/agent-commerce/evidence/ga-readiness.<release>.json \
npm run agent-commerce:ga-evidence
```

For a release that promotes an external provider such as Stripe Link/ACS, include the provider promotion summary too:

```bash
AGENT_COMMERCE_PROVIDER_PROMOTION_PACKET_FILE=ops/agent-commerce/evidence/provider-promotion.stripe-link-agents.<release>.json \
AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_OUTPUT=ops/agent-commerce/evidence/provider-promotion.stripe-link-agents-summary.<release>.json \
npm run agent-commerce:provider-promotion-evidence

AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES=ops/agent-commerce/evidence/provider-promotion.stripe-link-agents-summary.<release>.json \
AGENT_COMMERCE_GA_LOCAL_CHECKS_PASSED=true \
AGENT_COMMERCE_GA_EVIDENCE_OUTPUT=ops/agent-commerce/evidence/ga-readiness.<release>.json \
npm run agent-commerce:ga-evidence
```

After the GA evidence file is ready, build a portable release bundle with file hashes for the exact artifacts used during promotion:

```bash
AGENT_COMMERCE_GA_EVIDENCE_FILE=ops/agent-commerce/evidence/ga-readiness.<release>.json \
AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE=ops/agent-commerce/evidence/staging-reconciliation.<release>.json \
AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE=ops/agent-commerce/evidence/security-review-summary.<release>.json \
AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES=ops/agent-commerce/evidence/provider-promotion.stripe-link-agents-summary.<release>.json \
AGENT_COMMERCE_GA_RELEASE_BUNDLE_OUTPUT=ops/agent-commerce/evidence/ga-release-bundle.<release>.json \
AGENT_COMMERCE_GA_RELEASE_BUNDLE_REQUIRE_READY=true \
npm run agent-commerce:ga-release-bundle
```

Then verify the bundle immediately before promotion:

```bash
AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE=ops/agent-commerce/evidence/ga-release-bundle.<release>.json \
AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_OUTPUT=ops/agent-commerce/evidence/ga-release-bundle-verification.<release>.json \
AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_REQUIRE_READY=true \
npm run agent-commerce:ga-release-bundle:verify
```

Finally, create the explicit promotion decision artifact:

```bash
AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE=ops/agent-commerce/evidence/ga-release-bundle.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_TARGET_ENVIRONMENT=production \
AGENT_COMMERCE_GA_PROMOTION_DECISION_OUTPUT=ops/agent-commerce/evidence/ga-promotion-decision.<release>.json \
AGENT_COMMERCE_GA_PROMOTION_REQUIRE_APPROVED=true \
npm run agent-commerce:ga-promotion
```

Have an authorized release operator sign the approved decision:

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

The bundle embeds GA readiness results, source artifact paths, SHA-256 hashes, provider-specific promotion source checks, and a deterministic `bundle_hash`. Manual-only releases can omit provider promotion files, but staging and security source artifacts are required once those gates are marked ready. Verification recomputes the bundle hash, GA readiness/source integrity, and every repo-local source file hash before a release can be treated as promotion-ready. The promotion decision adds the final operator-facing approval/blocker layer: it only approves when the verified bundle is ready, the target environment matches, no GA gate is open, and no provider promotion is incomplete. The attestation then binds a human operator, exact promotion decision hash, and exact bundle hash under an HMAC signature; blocked decisions cannot be attested. Production promotion should pass quorum verification with distinct authorized roles before go-live. The release certificate is the final public artifact for release tickets: it records the decision hash, quorum hash, bundle hash, quorum blockers, roles, key ids, and attestor ids without storing signing secrets. Verify the certificate after it is copied into a release ticket to catch drift, truncation, or tampering. The release artifact index is the final dossier manifest: it hashes every public artifact, requires verifier outputs, counts attestation files, and scans for secret-bearing env markers before go-live. Verify the index as the last release-ticket check so copied artifacts cannot drift from the dossier. Generate the release dossier after index verification to produce a non-secret JSON and Markdown summary that binds the release ticket to the artifact index hash, certificate hashes, verification status, and artifact list. Verify the dossier after publishing it so copied JSON/Markdown release-ticket summaries cannot drift from the verified artifact index. Run the final local gate at the end of the release ticket to attach one machine-readable artifact proving the dossier verifier, typecheck, Agent Commerce tests, GA readiness, provider promotion guard, rail readiness, dashboard, L2 gate, and stack/app-service boundary checks all passed. Run launch status last: it combines the final local gate with real staging reconciliation, external security review, required provider-promotion summaries, and optional Lucid-L2 upstream P0 closure URLs; it stays blocked until the non-local evidence is truly attached. Verify launch status after publishing so copied launch-ticket artifacts cannot drift from their source evidence.

## Evidence Gates

| ID | Evidence |
| --- | --- |
| `manual_agent_platform_live_rail` | `rail_readiness_has_live_agent_platform_rail`, `manual_provider_durable_spend_flow`, `runtime_tools_internal_api_only` |
| `manual_seller_live_rail` | `rail_readiness_has_live_seller_rail`, `manual_seller_grant_entitlement_flow`, `refund_reversal_flow_exists` |
| `staging_reconciliation_beta_window` | `seven_day_reconciliation_job_history`, `stale_approval_reconciliation_log`, `stuck_credential_reconciliation_log`, `provider_mismatch_triage_log`, `zero_untriaged_p0_p1_commerce_incidents` |
| `production_dashboard_operational` | `production_summary_visible`, `spend_revenue_failure_replay_provider_metrics_visible`, `provider_health_controls_visible` |
| `lucid_l2_p0_execution_blocked` | `p0_l2_backlog_items_open_or_reviewed`, `wallet_execution_gate_requires_review_ref`, `public_routes_have_no_wallet_signing_imports` |
| `external_security_review` | `reviewer_identity`, `review_scope`, `review_date`, `findings_disposition`, `zero_open_p0_p1_findings` |

## Command Gates

Required command evidence:

```bash
npm run test -- src/lib/agent-commerce
npm run agent-commerce:staging-reconciliation-evidence
npm run agent-commerce:security-review-evidence
npm run agent-commerce:l2-gates
npm run agent-commerce:dashboard
npm run agent-commerce:rail-readiness
npm run stack:boundaries
npm run agent-commerce:ga-release-bundle
npm run agent-commerce:ga-release-bundle:verify
npm run agent-commerce:ga-promotion
npm run agent-commerce:ga-promotion:attest
npm run agent-commerce:ga-promotion:attest:verify
npm run agent-commerce:ga-promotion:attest:quorum
npm run agent-commerce:ga-release-certificate
npm run agent-commerce:ga-release-certificate:verify
npm run agent-commerce:ga-release-artifact-index
npm run agent-commerce:ga-release-artifact-index:verify
npm run agent-commerce:ga-release-dossier
npm run agent-commerce:ga-release-dossier:verify
npm run agent-commerce:ga-final-local-gate
npm run agent-commerce:ga-launch-status
npm run agent-commerce:ga-launch-status:verify
```

The staging reconciliation beta-window gate must prove seven days of reconciliation job history, stale-approval checks, stuck-credential checks, provider mismatch triage, and zero untriaged P0/P1 Commerce incidents. Prefer `npm run agent-commerce:staging-reconciliation-evidence` against staging `agent_commerce_events`; URL links remain accepted for release audit trails. The external security review gate must include a reviewer-authored packet with reviewer identity, review date, all required Commerce security scopes, findings disposition, and explicit confirmation that no P0/P1 findings remain open. Provider promotion summaries are optional for manual-only GA, but when included they must be ready or GA readiness fails.

## Evidence Collector Variables

| Variable | Purpose |
| --- | --- |
| `AGENT_COMMERCE_GA_RELEASE` | Release id for generated evidence. |
| `AGENT_COMMERCE_GA_ENVIRONMENT` | `staging` or `production`; defaults to `staging`. |
| `AGENT_COMMERCE_GA_LOCAL_CHECKS_PASSED` | Include local command/evidence proofs after the commands above pass. |
| `AGENT_COMMERCE_GA_EVIDENCE_FILE` | Existing GA evidence file validated by readiness and required by release-bundle generation. |
| `AGENT_COMMERCE_GA_EVIDENCE_OUTPUT` | Optional output JSON path. |
| `AGENT_COMMERCE_GA_EVIDENCE_REQUIRE_READY` | Exit non-zero if generated evidence is still incomplete. |
| `AGENT_COMMERCE_GA_RELEASE_BUNDLE_FILE` | Optional bundle file validated by `npm run agent-commerce:ga-readiness`. |
| `AGENT_COMMERCE_GA_RELEASE_BUNDLE_OUTPUT` | Optional output path for the GA release bundle. |
| `AGENT_COMMERCE_GA_RELEASE_BUNDLE_REQUIRE_READY` | Exit non-zero if GA readiness or source integrity is incomplete. |
| `AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_OUTPUT` | Optional output path for release-bundle verification results. |
| `AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_REQUIRE_READY` | Exit non-zero if bundle hash, source hashes, or readiness are invalid. |
| `AGENT_COMMERCE_GA_PROMOTION_TARGET_ENVIRONMENT` | Optional promotion target environment; must match the bundle. |
| `AGENT_COMMERCE_GA_PROMOTION_DECISION_OUTPUT` | Optional output path for the final GA promotion decision artifact. |
| `AGENT_COMMERCE_GA_PROMOTION_DECIDED_AT` | Optional ISO timestamp override for reproducible promotion decisions. |
| `AGENT_COMMERCE_GA_PROMOTION_REQUIRE_APPROVED` | Exit non-zero unless the final decision is approved. |
| `AGENT_COMMERCE_GA_PROMOTION_DECISION_FILE` | Promotion decision JSON consumed by attestation commands. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_NAME` | Human operator name recorded in the attestation. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_ROLE` | Human operator release role recorded in the attestation. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_ORGANIZATION` | Optional operator organization. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTOR_IDENTITY_URL` | Optional operator identity URL. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTED_AT` | Optional ISO timestamp override for reproducible attestations. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEY_ID` | Signing key id recorded in the attestation. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY` | Secret HMAC key used to sign and verify the attestation; never write it to artifacts. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_OUTPUT` | Optional output path for the attestation artifact. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILE` | Attestation JSON consumed by attestation verification. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_VERIFY_OUTPUT` | Optional output path for attestation verification results. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_VERIFY_REQUIRE_READY` | Exit non-zero unless signature and decision binding are valid. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_FILES` | Comma-separated attestation JSON files consumed by quorum verification. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEYRING_JSON` | JSON object mapping key ids to HMAC secrets for quorum verification; never write it to artifacts. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRED_COUNT` | Optional distinct valid attestor count; defaults to `2` for production and `1` for staging. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRED_ROLES` | Optional comma-separated roles that must appear among valid attestations. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_EVALUATED_AT` | Optional ISO timestamp override for reproducible quorum artifacts. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_OUTPUT` | Optional output path for quorum verification. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_REQUIRE_READY` | Exit non-zero unless distinct attestor count, required roles, and signatures are valid. |
| `AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_QUORUM_FILE` | Quorum JSON consumed by release-certificate generation. |
| `AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_OUTPUT` | Optional output path for the final public GA release certificate. |
| `AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_ISSUED_AT` | Optional ISO timestamp override for reproducible release certificates. |
| `AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_REQUIRE_READY` | Exit non-zero unless decision, bundle hash, decision hash, and quorum are all bound and ready. |
| `AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_FILE` | Release certificate JSON consumed by release-certificate verification. |
| `AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_OUTPUT` | Optional output path for release certificate verification results. |
| `AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_REQUIRE_READY` | Exit non-zero unless the certificate exactly matches the decision, quorum, hashes, roles, key ids, and attestors. |
| `AGENT_COMMERCE_GA_RELEASE_BUNDLE_VERIFY_FILE` | Release bundle verification JSON consumed by artifact-index generation. |
| `AGENT_COMMERCE_GA_RELEASE_CERTIFICATE_VERIFY_FILE` | Release certificate verification JSON consumed by artifact-index generation. |
| `AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_OUTPUT` | Optional output path for the final public release artifact index. |
| `AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_GENERATED_AT` | Optional ISO timestamp override for reproducible artifact indexes. |
| `AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_REQUIRE_READY` | Exit non-zero unless all required release artifacts, verifier outputs, attestation files, and secret-marker scans are ready. |
| `AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_SUPPORTING_FILES` | Extra public artifacts to hash into the release artifact index. |
| `AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_FILE` | Release artifact index JSON consumed by artifact-index verification. |
| `AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_OUTPUT` | Optional output path for release artifact index verification results. |
| `AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_REQUIRE_READY` | Exit non-zero unless the index hash, artifact file hashes, byte counts, and secret-marker scan are valid. |
| `AGENT_COMMERCE_GA_RELEASE_ARTIFACT_INDEX_VERIFY_FILE` | Release artifact index verification JSON consumed by release-dossier generation. |
| `AGENT_COMMERCE_GA_RELEASE_DOSSIER_OUTPUT` | Optional JSON output path for the final release-ticket dossier. |
| `AGENT_COMMERCE_GA_RELEASE_DOSSIER_MARKDOWN_OUTPUT` | Optional Markdown output path for the human-readable release-ticket dossier. |
| `AGENT_COMMERCE_GA_RELEASE_DOSSIER_GENERATED_AT` | Optional ISO timestamp override for reproducible release dossiers. |
| `AGENT_COMMERCE_GA_RELEASE_DOSSIER_LINKS_JSON` | Optional JSON object of public release-ticket or audit links. |
| `AGENT_COMMERCE_GA_RELEASE_DOSSIER_REQUIRE_READY` | Exit non-zero unless the verified artifact index is ready and bound to the dossier. |
| `AGENT_COMMERCE_GA_RELEASE_DOSSIER_FILE` | Release dossier JSON consumed by release-dossier verification. |
| `AGENT_COMMERCE_GA_RELEASE_DOSSIER_MARKDOWN_FILE` | Release dossier Markdown consumed by release-dossier verification. |
| `AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_OUTPUT` | Optional output path for release-dossier verification results. |
| `AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_REQUIRE_READY` | Exit non-zero unless JSON, Markdown, and artifact-index binding are valid. |
| `AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_FILE` | Release dossier verification JSON consumed by the final local GA gate. |
| `AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_OUTPUT` | Optional JSON output path for the final local GA gate artifact. |
| `AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_EVALUATED_AT` | Optional ISO timestamp override for reproducible final local gate artifacts. |
| `AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_REQUIRE_READY` | Exit non-zero unless dossier verification and all required local command gates pass. |
| `AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_FILE` | Final local gate JSON consumed by launch-status collection. |
| `AGENT_COMMERCE_GA_REQUIRED_PROVIDER_PROMOTIONS` | Optional comma-separated provider ids that must have ready live-promotion summaries. |
| `AGENT_COMMERCE_GA_REQUIRE_LUCID_L2_EXECUTION` | Require upstream Lucid-L2 P0 closure URLs for crypto/trading execution launches. |
| `AGENT_COMMERCE_LUCID_L2_P0_CLOSURE_URLS_JSON` | Optional JSON object mapping Lucid-L2 P0 backlog ids to closure/review URLs. |
| `AGENT_COMMERCE_GA_LAUNCH_STATUS_OUTPUT` | Optional JSON output path for the final external launch status artifact. |
| `AGENT_COMMERCE_GA_LAUNCH_STATUS_EVALUATED_AT` | Optional ISO timestamp override for reproducible launch status artifacts. |
| `AGENT_COMMERCE_GA_LAUNCH_STATUS_REQUIRE_READY` | Exit non-zero unless local, staging, security, required provider, and required Lucid-L2 gates pass. |
| `AGENT_COMMERCE_GA_LAUNCH_STATUS_FILE` | Launch status JSON consumed by launch-status verification. |
| `AGENT_COMMERCE_GA_LAUNCH_STATUS_VERIFY_OUTPUT` | Optional output path for launch-status verification results. |
| `AGENT_COMMERCE_GA_LAUNCH_STATUS_VERIFY_REQUIRE_READY` | Exit non-zero unless the status hash, blocker state, and source evidence binding are valid. |
| `AGENT_COMMERCE_GA_RELEASE_SOURCE_FILES` | Extra repo-local supporting files to hash into the GA release bundle. |
| `AGENT_COMMERCE_GA_RELEASE_GENERATED_AT` | Optional ISO timestamp override for reproducible release-bundle generation. |
| `AGENT_COMMERCE_STAGING_ORG_ID` | Org id used by the staging reconciliation evidence collector when querying Supabase. |
| `AGENT_COMMERCE_STAGING_RECONCILIATION_EVENTS_FILE` | Optional local JSON event export instead of querying Supabase. |
| `AGENT_COMMERCE_STAGING_RECONCILIATION_EVIDENCE_FILE` | Optional staging reconciliation summary consumed by `npm run agent-commerce:ga-evidence`. |
| `AGENT_COMMERCE_STAGING_RECONCILIATION_OUTPUT` | Optional output path for the staging reconciliation summary. |
| `AGENT_COMMERCE_STAGING_RECONCILIATION_WINDOW_DAYS` | Beta-window length; defaults to `7`. |
| `AGENT_COMMERCE_STAGING_RECONCILIATION_REQUIRED_RUN_DAYS` | Required distinct run days; defaults to the window length. |
| `AGENT_COMMERCE_STAGING_RECONCILIATION_INCIDENT_COUNT` | Number of untriaged P0/P1 Commerce incidents; set `0` to satisfy incident evidence. |
| `AGENT_COMMERCE_STAGING_RECONCILIATION_REQUIRE_READY` | Exit non-zero if staging reconciliation evidence is incomplete. |
| `AGENT_COMMERCE_SECURITY_REVIEW_PACKET_FILE` | Reviewer-authored JSON packet for `npm run agent-commerce:security-review-evidence`. |
| `AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_FILE` | Security review summary consumed by `npm run agent-commerce:ga-evidence`. |
| `AGENT_COMMERCE_SECURITY_REVIEW_EVIDENCE_OUTPUT` | Optional output path for the security review summary. |
| `AGENT_COMMERCE_SECURITY_REVIEW_REQUIRE_READY` | Exit non-zero if security review evidence is incomplete. |
| `AGENT_COMMERCE_PROVIDER_PROMOTION_EVIDENCE_FILES` | Comma-separated provider promotion summaries consumed by `npm run agent-commerce:ga-evidence`. |
| `AGENT_COMMERCE_RECONCILIATION_HISTORY_URL` | Seven-day reconciliation job history. |
| `AGENT_COMMERCE_STALE_APPROVAL_RECONCILIATION_URL` | Stale approval reconciliation log. |
| `AGENT_COMMERCE_STUCK_CREDENTIAL_RECONCILIATION_URL` | Stuck credential reconciliation log. |
| `AGENT_COMMERCE_PROVIDER_MISMATCH_TRIAGE_URL` | Provider mismatch triage log. |
| `AGENT_COMMERCE_INCIDENT_STATUS_URL` | Incident tracker proving no untriaged P0/P1 Commerce incidents. |
| `AGENT_COMMERCE_SECURITY_REVIEW_URL` | External security review artifact. |
| `AGENT_COMMERCE_SECURITY_FINDINGS_DISPOSITION_URL` | Findings disposition artifact. |
| `AGENT_COMMERCE_ZERO_OPEN_SECURITY_FINDINGS_URL` | Proof that no P0/P1 security findings remain open. |

## Provider Access

Stripe Link Agents now has an env-gated preview adapter for ACS Shared Payment issued-token execution, but it still depends on real issued-token creation, OAuth/OCA, webhook, and reconciliation promotion evidence before live mode. The GA readiness contract does not count preview or manifest-only rails as live rails. The current code-proven live rails are the manual provider adapter for agent-platform approval and seller grants.
