import type { AgentCommerceGaEvidenceInput } from '../ga-readiness'
import {
  AGENT_COMMERCE_GA_EVIDENCE_GATES,
} from '../ga-readiness'
import {
  AgentCommerceGaReleaseArtifactIndexSchema,
  AgentCommerceGaReleaseCertificateSchema,
  AgentCommerceGaReleaseBundleSchema,
  createAgentCommerceGaPromotionAttestation,
  createAgentCommerceGaReleaseDossier,
  createAgentCommerceGaReleaseArtifactIndex,
  createAgentCommerceGaReleaseCertificate,
  createAgentCommerceGaReleaseBundle,
  decideAgentCommerceGaPromotion,
  evaluateAgentCommerceGaPromotionAttestationQuorum,
  hashAgentCommerceGaReleaseDossier,
  hashAgentCommerceGaReleaseArtifactIndex,
  renderAgentCommerceGaReleaseDossierMarkdown,
  verifyAgentCommerceGaReleaseDossier,
  verifyAgentCommerceGaReleaseCertificate,
  verifyAgentCommerceGaReleaseArtifactIndex,
  verifyAgentCommerceGaPromotionAttestation,
  verifyAgentCommerceGaReleaseBundle,
  type AgentCommerceGaReleaseArtifact,
  type AgentCommerceGaReleaseBundleSourceFile,
} from '../ga-release-bundle'
import type { AgentCommerceProviderPromotionEvidenceSummary } from '../provider-promotion'
import { describe, expect, it } from 'vitest'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)
const HASH_D = 'd'.repeat(64)
const SIGNING_SECRET = 'release-secret-2026-05-09'
const SECURITY_SIGNING_SECRET = 'security-secret-2026-05-09'

function completeEvidence(
  overrides: Partial<AgentCommerceGaEvidenceInput> = {},
): AgentCommerceGaEvidenceInput {
  return {
    environment: 'staging',
    release: 'agent-commerce-ga-2026-05-09',
    evidence: Object.fromEntries(
      AGENT_COMMERCE_GA_EVIDENCE_GATES.map((gate) => [gate.id, gate.requiredEvidence]),
    ),
    commandResults: Object.fromEntries(
      AGENT_COMMERCE_GA_EVIDENCE_GATES.map((gate) => [gate.id, gate.requiredCommands]),
    ),
    links: {},
    ...overrides,
  } as AgentCommerceGaEvidenceInput
}

function source(
  kind: AgentCommerceGaReleaseBundleSourceFile['kind'],
  path: string,
  sha256: string,
  provider?: AgentCommerceGaReleaseBundleSourceFile['provider'],
): AgentCommerceGaReleaseBundleSourceFile {
  return {
    kind,
    path,
    sha256,
    bytes: 100,
    ...(provider ? { provider } : {}),
  }
}

function artifact(
  kind: AgentCommerceGaReleaseArtifact['kind'],
  path: string,
  sha256: string,
  secretMarkers: AgentCommerceGaReleaseArtifact['secret_markers_found'] = [],
): AgentCommerceGaReleaseArtifact {
  return {
    kind,
    path,
    sha256,
    bytes: 100,
    secret_markers_found: secretMarkers,
  }
}

function stripeLinkPromotion(
  overrides: Partial<AgentCommerceProviderPromotionEvidenceSummary> = {},
): AgentCommerceProviderPromotionEvidenceSummary {
  return {
    ready: true,
    release: 'agent-commerce-stripe-link-live-2026-05-09',
    environment: 'staging',
    provider: 'stripe_link_agents',
    target_mode: 'live',
    adapter_registered: true,
    provider_version: 'stripe-api-2026-02-25.clover-link-agents',
    requiredEvidence: [
      'provider_adapter_registered',
      'account_access_approved',
    ],
    suppliedEvidence: [
      'provider_adapter_registered',
      'account_access_approved',
    ],
    missingEvidence: [],
    blockers: [],
    links: {
      account_access: 'https://example.com/stripe/account-access',
    },
    ...overrides,
  }
}

function readyProductionPromotionQuorum() {
  const bundle = createAgentCommerceGaReleaseBundle({
    generatedAt: '2026-05-09T00:00:00.000Z',
    gaEvidence: completeEvidence({ environment: 'production' }),
    sourceFiles: [
      source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
      source('staging_reconciliation', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
      source('security_review', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
    ],
  })
  const decision = decideAgentCommerceGaPromotion({
    bundle,
    verification: verifyAgentCommerceGaReleaseBundle(bundle, bundle.source_files),
    targetEnvironment: 'production',
    decidedAt: '2026-05-09T01:00:00.000Z',
  })
  const releaseAttestation = createAgentCommerceGaPromotionAttestation({
    decision,
    attestor: {
      name: 'Release Operator',
      role: 'Commerce Release Manager',
      identity_url: 'https://example.com/operators/release',
    },
    signing: {
      keyId: 'release-key',
      secret: SIGNING_SECRET,
    },
  })
  const securityAttestation = createAgentCommerceGaPromotionAttestation({
    decision,
    attestor: {
      name: 'Security Reviewer',
      role: 'Security Reviewer',
      identity_url: 'https://example.com/operators/security',
    },
    signing: {
      keyId: 'security-key',
      secret: SECURITY_SIGNING_SECRET,
    },
  })
  const quorum = evaluateAgentCommerceGaPromotionAttestationQuorum({
    decision,
    attestations: [releaseAttestation, securityAttestation],
    signingKeys: {
      'release-key': SIGNING_SECRET,
      'security-key': SECURITY_SIGNING_SECRET,
    },
    targetEnvironment: 'production',
    requiredAttestations: 2,
    requiredRoles: ['Commerce Release Manager', 'Security Reviewer'],
    evaluatedAt: '2026-05-09T01:10:00.000Z',
  })

  return {
    bundle,
    decision,
    quorum,
  }
}

function readyReleaseArtifactIndex() {
  const { bundle, decision, quorum } = readyProductionPromotionQuorum()
  const certificate = createAgentCommerceGaReleaseCertificate({
    decision,
    quorum,
    issuedAt: '2026-05-09T01:15:00.000Z',
  })
  const index = createAgentCommerceGaReleaseArtifactIndex({
    certificate,
    bundleVerification: verifyAgentCommerceGaReleaseBundle(bundle, bundle.source_files),
    certificateVerification: verifyAgentCommerceGaReleaseCertificate(certificate, decision, quorum),
    generatedAt: '2026-05-09T01:20:00.000Z',
    artifacts: [
      artifact('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
      artifact('staging_reconciliation_evidence', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
      artifact('security_review_evidence', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
      artifact('ga_release_bundle', 'ops/agent-commerce/evidence/ga-release-bundle.2026-05-09.json', HASH_D),
      artifact('ga_release_bundle_verification', 'ops/agent-commerce/evidence/ga-release-bundle-verification.2026-05-09.json', HASH_A),
      artifact('ga_promotion_decision', 'ops/agent-commerce/evidence/ga-promotion-decision.2026-05-09.json', HASH_B),
      artifact('ga_promotion_attestation', 'ops/agent-commerce/evidence/ga-promotion-attestation.release.2026-05-09.json', HASH_C),
      artifact('ga_promotion_attestation', 'ops/agent-commerce/evidence/ga-promotion-attestation.security.2026-05-09.json', HASH_D),
      artifact('ga_promotion_attestation_quorum', 'ops/agent-commerce/evidence/ga-promotion-attestation-quorum.2026-05-09.json', HASH_A),
      artifact('ga_release_certificate', 'ops/agent-commerce/evidence/ga-release-certificate.2026-05-09.json', HASH_B),
      artifact('ga_release_certificate_verification', 'ops/agent-commerce/evidence/ga-release-certificate-verification.2026-05-09.json', HASH_C),
    ],
  })

  return {
    index,
    verification: verifyAgentCommerceGaReleaseArtifactIndex(index, index.artifacts),
  }
}

describe('Agent Commerce GA release bundle', () => {
  it('creates a ready release bundle when GA evidence and external source hashes are present', () => {
    const bundle = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: completeEvidence(),
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        source('staging_reconciliation', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        source('security_review', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
      ],
    })

    expect(bundle.ready).toBe(true)
    expect(bundle.source_integrity).toMatchObject({
      ready: true,
      requiredSourceKinds: [
        'ga_evidence',
        'staging_reconciliation',
        'security_review',
      ],
      missingSourceKinds: [],
    })
    expect(bundle.bundle_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(AgentCommerceGaReleaseBundleSchema.safeParse(bundle).success).toBe(true)
  })

  it('fails closed when ready GA evidence lacks staging or security source artifacts', () => {
    const bundle = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: completeEvidence(),
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
      ],
    })

    expect(bundle.ready).toBe(false)
    expect(bundle.ga_readiness.ready).toBe(true)
    expect(bundle.source_integrity).toMatchObject({
      ready: false,
      missingSourceKinds: [
        'staging_reconciliation',
        'security_review',
      ],
    })
  })

  it('requires provider-specific source hashes for included provider promotion summaries', () => {
    const promotion = stripeLinkPromotion()
    const missingProviderSource = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: completeEvidence({
        providerPromotions: [promotion],
      }),
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        source('staging_reconciliation', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        source('security_review', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
      ],
    })

    expect(missingProviderSource.ready).toBe(false)
    expect(missingProviderSource.source_integrity.missingProviderPromotionSources)
      .toEqual(['stripe_link_agents'])

    const readyProviderSource = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: completeEvidence({
        providerPromotions: [promotion],
      }),
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        source('staging_reconciliation', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        source('security_review', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
        source(
          'provider_promotion',
          'ops/agent-commerce/evidence/provider-promotion.stripe-link-agents-summary.2026-05-09.json',
          HASH_D,
          'stripe_link_agents',
        ),
      ],
    })

    expect(readyProviderSource.ready).toBe(true)
  })

  it('fails closed when provider promotion evidence targets a different environment', () => {
    const bundle = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: completeEvidence({
        providerPromotions: [
          stripeLinkPromotion({ environment: 'production' }),
        ],
      }),
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        source('staging_reconciliation', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        source('security_review', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
        source(
          'provider_promotion',
          'ops/agent-commerce/evidence/provider-promotion.stripe-link-agents-summary.2026-05-09.json',
          HASH_D,
          'stripe_link_agents',
        ),
      ],
    })

    expect(bundle.ready).toBe(false)
    expect(bundle.source_integrity.providerPromotionEnvironmentMismatches)
      .toEqual([
        {
          provider: 'stripe_link_agents',
          expected: 'staging',
          actual: 'production',
        },
      ])
  })

  it('verifies bundle hash and source hashes against the release artifacts', () => {
    const bundle = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: completeEvidence(),
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        source('staging_reconciliation', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        source('security_review', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
      ],
    })

    const verification = verifyAgentCommerceGaReleaseBundle(bundle, bundle.source_files)

    expect(verification).toMatchObject({
      ready: true,
      bundleHashValid: true,
      bundleSelfConsistent: true,
      sourceHashesValid: true,
      sourceBytesValid: true,
      missingSourceFiles: [],
      sourceHashMismatches: [],
      sourceByteMismatches: [],
    })
  })

  it('rejects tampered bundle hashes and changed source artifacts', () => {
    const bundle = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: completeEvidence(),
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        source('staging_reconciliation', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        source('security_review', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
      ],
    })

    const tamperedBundle = {
      ...bundle,
      bundle_hash: 'e'.repeat(64),
    }
    const verification = verifyAgentCommerceGaReleaseBundle(tamperedBundle, [
      bundle.source_files[0],
      { ...bundle.source_files[1], sha256: HASH_D, bytes: 101 },
    ])

    expect(verification.ready).toBe(false)
    expect(verification.bundleHashValid).toBe(false)
    expect(verification.sourceHashesValid).toBe(false)
    expect(verification.sourceBytesValid).toBe(false)
    expect(verification.missingSourceFiles)
      .toEqual(['ops/agent-commerce/evidence/security-review-summary.2026-05-09.json'])
    expect(verification.sourceHashMismatches)
      .toEqual([
        {
          path: 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json',
          expected: HASH_B,
          actual: HASH_D,
        },
      ])
    expect(verification.sourceByteMismatches)
      .toEqual([
        {
          path: 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json',
          expected: 100,
          actual: 101,
        },
      ])
  })

  it('approves promotion only from a verified ready bundle for the target environment', () => {
    const bundle = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: completeEvidence({ environment: 'production' }),
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        source('staging_reconciliation', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        source('security_review', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
      ],
    })
    const verification = verifyAgentCommerceGaReleaseBundle(bundle, bundle.source_files)

    const decision = decideAgentCommerceGaPromotion({
      bundle,
      verification,
      targetEnvironment: 'production',
      decidedAt: '2026-05-09T01:00:00.000Z',
    })

    expect(decision).toMatchObject({
      schema_version: 'agent-commerce-ga-promotion-decision:v1',
      approved: true,
      decision: 'approved',
      environment: 'production',
      target_environment: 'production',
      blockers: [],
      gate_blockers: [],
      provider_promotion_blockers: [],
      bundle_hash: bundle.bundle_hash,
    })
  })

  it('blocks promotion when bundle verification, target environment, or GA gates are not ready', () => {
    const bundle = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: {
        environment: 'staging',
        release: 'agent-commerce-ga-2026-05-09',
        evidence: {
          manual_agent_platform_live_rail: [
            'rail_readiness_has_live_agent_platform_rail',
          ],
        },
        commandResults: {},
      },
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
      ],
    })
    const verification = verifyAgentCommerceGaReleaseBundle(bundle, [
      { ...bundle.source_files[0], sha256: HASH_B },
    ])

    const decision = decideAgentCommerceGaPromotion({
      bundle,
      verification,
      targetEnvironment: 'production',
      decidedAt: '2026-05-09T01:00:00.000Z',
    })

    expect(decision.approved).toBe(false)
    expect(decision.decision).toBe('blocked')
    expect(decision.blockers).toEqual(expect.arrayContaining([
      'target_environment_mismatch',
      'bundle_not_ready',
      'ga_readiness_incomplete',
      'source_hash_mismatch',
      'staging_reconciliation_incomplete',
      'external_security_review_incomplete',
    ]))
    expect(decision.gate_blockers.map((gate) => gate.id)).toEqual(expect.arrayContaining([
      'staging_reconciliation_beta_window',
      'external_security_review',
    ]))
    expect(decision.bundle_verification).toMatchObject({
      ready: false,
      source_hashes_valid: false,
      source_hash_mismatch_count: 1,
    })
  })

  it('creates and verifies a signed operator attestation for an approved promotion decision', () => {
    const bundle = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: completeEvidence({ environment: 'production' }),
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        source('staging_reconciliation', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        source('security_review', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
      ],
    })
    const decision = decideAgentCommerceGaPromotion({
      bundle,
      verification: verifyAgentCommerceGaReleaseBundle(bundle, bundle.source_files),
      targetEnvironment: 'production',
      decidedAt: '2026-05-09T01:00:00.000Z',
    })

    const attestation = createAgentCommerceGaPromotionAttestation({
      decision,
      attestedAt: '2026-05-09T01:05:00.000Z',
      attestor: {
        name: 'Release Operator',
        role: 'Commerce Release Manager',
        organization: 'Lucid',
        identity_url: 'https://example.com/operators/release-operator',
      },
      signing: {
        keyId: 'agent-commerce-ga-2026-05',
        secret: SIGNING_SECRET,
      },
    })
    const verification = verifyAgentCommerceGaPromotionAttestation(
      attestation,
      decision,
      SIGNING_SECRET,
    )

    expect(attestation).toMatchObject({
      schema_version: 'agent-commerce-ga-promotion-attestation:v1',
      release: decision.release,
      environment: 'production',
      target_environment: 'production',
      approved: true,
      promotion_decision_hash: verification.expectedDecisionHash,
      bundle_hash: bundle.bundle_hash,
      signature: {
        alg: 'HMAC-SHA256',
        key_id: 'agent-commerce-ga-2026-05',
        value: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    })
    expect(verification).toMatchObject({
      ready: true,
      decisionApproved: true,
      decisionHashValid: true,
      bundleHashValid: true,
      releaseMatches: true,
      environmentMatches: true,
      targetEnvironmentMatches: true,
      signatureValid: true,
    })
  })

  it('rejects blocked decisions and invalid attestation signatures', () => {
    const bundle = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: {
        environment: 'staging',
        release: 'agent-commerce-ga-2026-05-09',
        evidence: {},
        commandResults: {},
      },
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
      ],
    })
    const blockedDecision = decideAgentCommerceGaPromotion({
      bundle,
      verification: verifyAgentCommerceGaReleaseBundle(bundle, bundle.source_files),
      targetEnvironment: 'staging',
      decidedAt: '2026-05-09T01:00:00.000Z',
    })

    expect(() => createAgentCommerceGaPromotionAttestation({
      decision: blockedDecision,
      attestor: {
        name: 'Release Operator',
        role: 'Commerce Release Manager',
      },
      signing: {
        keyId: 'agent-commerce-ga-2026-05',
        secret: SIGNING_SECRET,
      },
    })).toThrow('Cannot attest a blocked Agent Commerce GA promotion decision.')

    const readyBundle = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: completeEvidence(),
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        source('staging_reconciliation', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        source('security_review', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
      ],
    })
    const readyDecision = decideAgentCommerceGaPromotion({
      bundle: readyBundle,
      verification: verifyAgentCommerceGaReleaseBundle(readyBundle, readyBundle.source_files),
    })
    const attestation = createAgentCommerceGaPromotionAttestation({
      decision: readyDecision,
      attestor: {
        name: 'Release Operator',
        role: 'Commerce Release Manager',
      },
      signing: {
        keyId: 'agent-commerce-ga-2026-05',
        secret: SIGNING_SECRET,
      },
    })

    expect(verifyAgentCommerceGaPromotionAttestation(
      attestation,
      readyDecision,
      'wrong-secret',
    )).toMatchObject({
      ready: false,
      signatureValid: false,
    })
  })

  it('requires a distinct multi-operator quorum for production promotion', () => {
    const bundle = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: completeEvidence({ environment: 'production' }),
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        source('staging_reconciliation', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        source('security_review', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
      ],
    })
    const decision = decideAgentCommerceGaPromotion({
      bundle,
      verification: verifyAgentCommerceGaReleaseBundle(bundle, bundle.source_files),
      targetEnvironment: 'production',
      decidedAt: '2026-05-09T01:00:00.000Z',
    })
    const releaseAttestation = createAgentCommerceGaPromotionAttestation({
      decision,
      attestor: {
        name: 'Release Operator',
        role: 'Commerce Release Manager',
        identity_url: 'https://example.com/operators/release',
      },
      signing: {
        keyId: 'release-key',
        secret: SIGNING_SECRET,
      },
    })
    const securityAttestation = createAgentCommerceGaPromotionAttestation({
      decision,
      attestor: {
        name: 'Security Reviewer',
        role: 'Security Reviewer',
        identity_url: 'https://example.com/operators/security',
      },
      signing: {
        keyId: 'security-key',
        secret: SECURITY_SIGNING_SECRET,
      },
    })

    const quorum = evaluateAgentCommerceGaPromotionAttestationQuorum({
      decision,
      attestations: [releaseAttestation, securityAttestation],
      signingKeys: {
        'release-key': SIGNING_SECRET,
        'security-key': SECURITY_SIGNING_SECRET,
      },
      targetEnvironment: 'production',
      requiredAttestations: 2,
      requiredRoles: ['Commerce Release Manager', 'Security Reviewer'],
      evaluatedAt: '2026-05-09T01:10:00.000Z',
    })

    expect(quorum).toMatchObject({
      schema_version: 'agent-commerce-ga-promotion-attestation-quorum:v1',
      ready: true,
      blockers: [],
      required_attestations: 2,
      valid_attestation_count: 2,
      distinct_valid_attestor_count: 2,
      required_roles: ['Commerce Release Manager', 'Security Reviewer'],
      missing_roles: [],
      invalid_attestations: [],
      duplicate_attestor_ids: [],
      bundle_hash: bundle.bundle_hash,
    })
  })

  it('blocks attestation quorum on duplicate signers, unknown keys, and missing roles', () => {
    const bundle = createAgentCommerceGaReleaseBundle({
      generatedAt: '2026-05-09T00:00:00.000Z',
      gaEvidence: completeEvidence({ environment: 'production' }),
      sourceFiles: [
        source('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        source('staging_reconciliation', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        source('security_review', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
      ],
    })
    const decision = decideAgentCommerceGaPromotion({
      bundle,
      verification: verifyAgentCommerceGaReleaseBundle(bundle, bundle.source_files),
      targetEnvironment: 'production',
      decidedAt: '2026-05-09T01:00:00.000Z',
    })
    const firstAttestation = createAgentCommerceGaPromotionAttestation({
      decision,
      attestor: {
        name: 'Release Operator',
        role: 'Commerce Release Manager',
        identity_url: 'https://example.com/operators/release',
      },
      signing: {
        keyId: 'release-key',
        secret: SIGNING_SECRET,
      },
    })
    const duplicateAttestation = createAgentCommerceGaPromotionAttestation({
      decision,
      attestor: {
        name: 'Release Operator',
        role: 'Commerce Release Manager',
        identity_url: 'https://example.com/operators/release',
      },
      signing: {
        keyId: 'release-key-2',
        secret: SECURITY_SIGNING_SECRET,
      },
    })
    const unknownKeyAttestation = createAgentCommerceGaPromotionAttestation({
      decision,
      attestor: {
        name: 'Security Reviewer',
        role: 'Security Reviewer',
        identity_url: 'https://example.com/operators/security',
      },
      signing: {
        keyId: 'unknown-key',
        secret: SECURITY_SIGNING_SECRET,
      },
    })

    const quorum = evaluateAgentCommerceGaPromotionAttestationQuorum({
      decision,
      attestations: [firstAttestation, duplicateAttestation, unknownKeyAttestation],
      signingKeys: {
        'release-key': SIGNING_SECRET,
        'release-key-2': SECURITY_SIGNING_SECRET,
      },
      targetEnvironment: 'production',
      requiredAttestations: 2,
      requiredRoles: ['Commerce Release Manager', 'Security Reviewer'],
      evaluatedAt: '2026-05-09T01:10:00.000Z',
    })

    expect(quorum.ready).toBe(false)
    expect(quorum.blockers).toEqual(expect.arrayContaining([
      'unknown_signing_key',
      'invalid_attestation',
      'insufficient_valid_attestations',
      'missing_required_roles',
    ]))
    expect(quorum.valid_attestation_count).toBe(2)
    expect(quorum.distinct_valid_attestor_count).toBe(1)
    expect(quorum.duplicate_attestor_ids).toEqual(['https://example.com/operators/release'])
    expect(quorum.missing_roles).toEqual(['Security Reviewer'])
    expect(quorum.invalid_attestations).toMatchObject([
      {
        key_id: 'unknown-key',
        attestor_id: 'https://example.com/operators/security',
        reasons: ['unknown_signing_key'],
      },
    ])
  })

  it('creates a ready public release certificate from approved decision and ready quorum', () => {
    const { bundle, decision, quorum } = readyProductionPromotionQuorum()

    const certificate = createAgentCommerceGaReleaseCertificate({
      decision,
      quorum,
      issuedAt: '2026-05-09T01:15:00.000Z',
    })

    expect(certificate).toMatchObject({
      schema_version: 'agent-commerce-ga-release-certificate:v1',
      release: decision.release,
      environment: 'production',
      target_environment: 'production',
      issued_at: '2026-05-09T01:15:00.000Z',
      ready: true,
      blockers: [],
      promotion_decision: 'approved',
      promotion_decision_approved: true,
      attestation_quorum_ready: true,
      attestation_quorum_blockers: [],
      promotion_decision_hash: quorum.decision_hash,
      bundle_hash: bundle.bundle_hash,
      required_attestations: 2,
      valid_attestation_count: 2,
      distinct_valid_attestor_count: 2,
      required_roles: ['Commerce Release Manager', 'Security Reviewer'],
      satisfied_roles: ['Commerce Release Manager', 'Security Reviewer'],
      missing_roles: [],
      attestation_key_ids: ['release-key', 'security-key'],
      attestor_ids: [
        'https://example.com/operators/release',
        'https://example.com/operators/security',
      ],
    })
    expect(certificate.attestation_quorum_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(AgentCommerceGaReleaseCertificateSchema.safeParse(certificate).success).toBe(true)
  })

  it('blocks release certificate when decision and quorum are not bound to the same artifacts', () => {
    const { decision, quorum } = readyProductionPromotionQuorum()

    const certificate = createAgentCommerceGaReleaseCertificate({
      decision,
      quorum: {
        ...quorum,
        ready: false,
        blockers: ['missing_required_roles'],
        decision_hash: HASH_D,
        bundle_hash: HASH_D,
      },
      issuedAt: '2026-05-09T01:15:00.000Z',
    })

    expect(certificate.ready).toBe(false)
    expect(certificate.blockers).toEqual(expect.arrayContaining([
      'attestation_quorum_not_ready',
      'decision_hash_mismatch',
      'bundle_hash_mismatch',
    ]))
    expect(certificate.promotion_decision_approved).toBe(true)
    expect(certificate.attestation_quorum_ready).toBe(false)
    expect(certificate.attestation_quorum_blockers).toEqual(['missing_required_roles'])
    expect(certificate.missing_roles).toEqual([])
  })

  it('verifies a public release certificate against its decision and quorum artifacts', () => {
    const { decision, quorum } = readyProductionPromotionQuorum()
    const certificate = createAgentCommerceGaReleaseCertificate({
      decision,
      quorum,
      issuedAt: '2026-05-09T01:15:00.000Z',
    })

    const verification = verifyAgentCommerceGaReleaseCertificate(certificate, decision, quorum)

    expect(verification).toMatchObject({
      ready: true,
      certificateReady: true,
      certificateSelfConsistent: true,
      promotionDecisionApproved: true,
      attestationQuorumReady: true,
      releaseMatches: true,
      environmentMatches: true,
      targetEnvironmentMatches: true,
      bundleHashValid: true,
      promotionDecisionHashValid: true,
      attestationQuorumHashValid: true,
      attestationKeyIdsMatch: true,
      attestorIdsMatch: true,
      requiredRolesMatch: true,
      satisfiedRolesMatch: true,
      missingRolesMatch: true,
      expectedCertificateBlockers: [],
      actualCertificateBlockers: [],
    })
    expect(verification.actualPromotionDecisionHash).toBe(verification.expectedPromotionDecisionHash)
    expect(verification.actualAttestationQuorumHash).toBe(verification.expectedAttestationQuorumHash)
  })

  it('rejects tampered public release certificate artifacts', () => {
    const { decision, quorum } = readyProductionPromotionQuorum()
    const certificate = createAgentCommerceGaReleaseCertificate({
      decision,
      quorum,
      issuedAt: '2026-05-09T01:15:00.000Z',
    })

    const verification = verifyAgentCommerceGaReleaseCertificate({
      ...certificate,
      attestation_quorum_hash: HASH_D,
      attestor_ids: ['https://example.com/operators/release'],
      blockers: ['bundle_hash_mismatch'],
    }, decision, quorum)

    expect(verification.ready).toBe(false)
    expect(verification.certificateReady).toBe(true)
    expect(verification.certificateSelfConsistent).toBe(false)
    expect(verification.attestationQuorumHashValid).toBe(false)
    expect(verification.attestorIdsMatch).toBe(false)
    expect(verification.expectedCertificateBlockers).toEqual([])
    expect(verification.actualCertificateBlockers).toEqual(['bundle_hash_mismatch'])
  })

  it('creates a ready release artifact index for the public GA release dossier', () => {
    const { bundle, decision, quorum } = readyProductionPromotionQuorum()
    const certificate = createAgentCommerceGaReleaseCertificate({
      decision,
      quorum,
      issuedAt: '2026-05-09T01:15:00.000Z',
    })
    const bundleVerification = verifyAgentCommerceGaReleaseBundle(bundle, bundle.source_files)
    const certificateVerification = verifyAgentCommerceGaReleaseCertificate(certificate, decision, quorum)

    const index = createAgentCommerceGaReleaseArtifactIndex({
      certificate,
      bundleVerification,
      certificateVerification,
      generatedAt: '2026-05-09T01:20:00.000Z',
      artifacts: [
        artifact('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        artifact('staging_reconciliation_evidence', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        artifact('security_review_evidence', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
        artifact('ga_release_bundle', 'ops/agent-commerce/evidence/ga-release-bundle.2026-05-09.json', HASH_D),
        artifact('ga_release_bundle_verification', 'ops/agent-commerce/evidence/ga-release-bundle-verification.2026-05-09.json', HASH_A),
        artifact('ga_promotion_decision', 'ops/agent-commerce/evidence/ga-promotion-decision.2026-05-09.json', HASH_B),
        artifact('ga_promotion_attestation', 'ops/agent-commerce/evidence/ga-promotion-attestation.release.2026-05-09.json', HASH_C),
        artifact('ga_promotion_attestation', 'ops/agent-commerce/evidence/ga-promotion-attestation.security.2026-05-09.json', HASH_D),
        artifact('ga_promotion_attestation_quorum', 'ops/agent-commerce/evidence/ga-promotion-attestation-quorum.2026-05-09.json', HASH_A),
        artifact('ga_release_certificate', 'ops/agent-commerce/evidence/ga-release-certificate.2026-05-09.json', HASH_B),
        artifact('ga_release_certificate_verification', 'ops/agent-commerce/evidence/ga-release-certificate-verification.2026-05-09.json', HASH_C),
      ],
    })

    expect(index).toMatchObject({
      schema_version: 'agent-commerce-ga-release-artifact-index:v1',
      release: certificate.release,
      environment: 'production',
      target_environment: 'production',
      ready: true,
      blockers: [],
      missing_artifact_kinds: [],
      duplicate_singleton_artifact_kinds: [],
      required_promotion_attestations: 2,
      promotion_attestation_artifact_count: 2,
      artifact_secret_marker_paths: [],
      bundle_verification_ready: true,
      certificate_verification_ready: true,
    })
    expect(index.index_hash).toBe(hashAgentCommerceGaReleaseArtifactIndex(index))
    expect(AgentCommerceGaReleaseArtifactIndexSchema.safeParse(index).success).toBe(true)
  })

  it('blocks release artifact index on missing artifacts, insufficient attestations, and secret markers', () => {
    const { bundle, decision, quorum } = readyProductionPromotionQuorum()
    const certificate = createAgentCommerceGaReleaseCertificate({
      decision,
      quorum,
      issuedAt: '2026-05-09T01:15:00.000Z',
    })
    const bundleVerification = verifyAgentCommerceGaReleaseBundle(bundle, bundle.source_files)
    const certificateVerification = verifyAgentCommerceGaReleaseCertificate(certificate, decision, quorum)

    const index = createAgentCommerceGaReleaseArtifactIndex({
      certificate,
      bundleVerification,
      certificateVerification,
      generatedAt: '2026-05-09T01:20:00.000Z',
      artifacts: [
        artifact('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        artifact('staging_reconciliation_evidence', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        artifact('security_review_evidence', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
        artifact('ga_release_bundle', 'ops/agent-commerce/evidence/ga-release-bundle.2026-05-09.json', HASH_D),
        artifact('ga_release_bundle_verification', 'ops/agent-commerce/evidence/ga-release-bundle-verification.2026-05-09.json', HASH_A),
        artifact(
          'ga_promotion_decision',
          'ops/agent-commerce/evidence/ga-promotion-decision.2026-05-09.json',
          HASH_B,
          ['AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEYRING_JSON'],
        ),
        artifact('ga_promotion_attestation', 'ops/agent-commerce/evidence/ga-promotion-attestation.release.2026-05-09.json', HASH_C),
        artifact('ga_promotion_attestation_quorum', 'ops/agent-commerce/evidence/ga-promotion-attestation-quorum.2026-05-09.json', HASH_A),
        artifact('ga_release_certificate', 'ops/agent-commerce/evidence/ga-release-certificate.2026-05-09.json', HASH_B),
      ],
    })

    expect(index.ready).toBe(false)
    expect(index.blockers).toEqual(expect.arrayContaining([
      'missing_required_artifact',
      'insufficient_attestation_artifacts',
      'artifact_contains_secret_marker',
    ]))
    expect(index.missing_artifact_kinds).toEqual(['ga_release_certificate_verification'])
    expect(index.promotion_attestation_artifact_count).toBe(1)
    expect(index.artifact_secret_marker_paths).toEqual([
      {
        path: 'ops/agent-commerce/evidence/ga-promotion-decision.2026-05-09.json',
        markers: ['AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_KEYRING_JSON'],
      },
    ])
  })

  it('verifies the public release artifact index against current artifact files', () => {
    const { bundle, decision, quorum } = readyProductionPromotionQuorum()
    const certificate = createAgentCommerceGaReleaseCertificate({
      decision,
      quorum,
      issuedAt: '2026-05-09T01:15:00.000Z',
    })
    const index = createAgentCommerceGaReleaseArtifactIndex({
      certificate,
      bundleVerification: verifyAgentCommerceGaReleaseBundle(bundle, bundle.source_files),
      certificateVerification: verifyAgentCommerceGaReleaseCertificate(certificate, decision, quorum),
      generatedAt: '2026-05-09T01:20:00.000Z',
      artifacts: [
        artifact('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        artifact('staging_reconciliation_evidence', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        artifact('security_review_evidence', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
        artifact('ga_release_bundle', 'ops/agent-commerce/evidence/ga-release-bundle.2026-05-09.json', HASH_D),
        artifact('ga_release_bundle_verification', 'ops/agent-commerce/evidence/ga-release-bundle-verification.2026-05-09.json', HASH_A),
        artifact('ga_promotion_decision', 'ops/agent-commerce/evidence/ga-promotion-decision.2026-05-09.json', HASH_B),
        artifact('ga_promotion_attestation', 'ops/agent-commerce/evidence/ga-promotion-attestation.release.2026-05-09.json', HASH_C),
        artifact('ga_promotion_attestation', 'ops/agent-commerce/evidence/ga-promotion-attestation.security.2026-05-09.json', HASH_D),
        artifact('ga_promotion_attestation_quorum', 'ops/agent-commerce/evidence/ga-promotion-attestation-quorum.2026-05-09.json', HASH_A),
        artifact('ga_release_certificate', 'ops/agent-commerce/evidence/ga-release-certificate.2026-05-09.json', HASH_B),
        artifact('ga_release_certificate_verification', 'ops/agent-commerce/evidence/ga-release-certificate-verification.2026-05-09.json', HASH_C),
      ],
    })

    const verification = verifyAgentCommerceGaReleaseArtifactIndex(index, index.artifacts)

    expect(verification).toMatchObject({
      ready: true,
      indexReady: true,
      indexHashValid: true,
      indexMetadataSelfConsistent: true,
      artifactFilesPresent: true,
      artifactHashesValid: true,
      artifactBytesValid: true,
      artifactSecretMarkersValid: true,
      noArtifactSecretMarkers: true,
      requiredArtifactsPresent: true,
      attestationArtifactsSufficient: true,
      bundleVerificationReady: true,
      certificateReady: true,
      certificateVerificationReady: true,
      expectedBlockers: [],
      actualBlockers: [],
      missingArtifactPaths: [],
      artifactHashMismatches: [],
      artifactSecretMarkerMismatches: [],
    })
  })

  it('rejects drifted release artifact index files and content', () => {
    const { bundle, decision, quorum } = readyProductionPromotionQuorum()
    const certificate = createAgentCommerceGaReleaseCertificate({
      decision,
      quorum,
      issuedAt: '2026-05-09T01:15:00.000Z',
    })
    const index = createAgentCommerceGaReleaseArtifactIndex({
      certificate,
      bundleVerification: verifyAgentCommerceGaReleaseBundle(bundle, bundle.source_files),
      certificateVerification: verifyAgentCommerceGaReleaseCertificate(certificate, decision, quorum),
      generatedAt: '2026-05-09T01:20:00.000Z',
      artifacts: [
        artifact('ga_evidence', 'ops/agent-commerce/evidence/ga-readiness.2026-05-09.json', HASH_A),
        artifact('staging_reconciliation_evidence', 'ops/agent-commerce/evidence/staging-reconciliation.2026-05-09.json', HASH_B),
        artifact('security_review_evidence', 'ops/agent-commerce/evidence/security-review-summary.2026-05-09.json', HASH_C),
        artifact('ga_release_bundle', 'ops/agent-commerce/evidence/ga-release-bundle.2026-05-09.json', HASH_D),
        artifact('ga_release_bundle_verification', 'ops/agent-commerce/evidence/ga-release-bundle-verification.2026-05-09.json', HASH_A),
        artifact('ga_promotion_decision', 'ops/agent-commerce/evidence/ga-promotion-decision.2026-05-09.json', HASH_B),
        artifact('ga_promotion_attestation', 'ops/agent-commerce/evidence/ga-promotion-attestation.release.2026-05-09.json', HASH_C),
        artifact('ga_promotion_attestation', 'ops/agent-commerce/evidence/ga-promotion-attestation.security.2026-05-09.json', HASH_D),
        artifact('ga_promotion_attestation_quorum', 'ops/agent-commerce/evidence/ga-promotion-attestation-quorum.2026-05-09.json', HASH_A),
        artifact('ga_release_certificate', 'ops/agent-commerce/evidence/ga-release-certificate.2026-05-09.json', HASH_B),
        artifact('ga_release_certificate_verification', 'ops/agent-commerce/evidence/ga-release-certificate-verification.2026-05-09.json', HASH_C),
      ],
    })
    const actualArtifacts = index.artifacts
      .filter((releaseArtifact) => releaseArtifact.kind !== 'ga_release_certificate_verification')
      .map((releaseArtifact) => {
        if (releaseArtifact.kind !== 'ga_promotion_decision') return releaseArtifact
        return {
          ...releaseArtifact,
          sha256: HASH_D,
          bytes: releaseArtifact.bytes + 1,
          secret_markers_found: [
            'AGENT_COMMERCE_GA_PROMOTION_ATTESTATION_SIGNING_KEY',
          ] as AgentCommerceGaReleaseArtifact['secret_markers_found'],
        }
      })

    const verification = verifyAgentCommerceGaReleaseArtifactIndex({
      ...index,
      index_hash: HASH_D,
    }, actualArtifacts)

    expect(verification.ready).toBe(false)
    expect(verification.indexHashValid).toBe(false)
    expect(verification.artifactFilesPresent).toBe(false)
    expect(verification.artifactHashesValid).toBe(false)
    expect(verification.artifactBytesValid).toBe(false)
    expect(verification.artifactSecretMarkersValid).toBe(false)
    expect(verification.noArtifactSecretMarkers).toBe(false)
    expect(verification.missingArtifactPaths).toEqual([
      'ops/agent-commerce/evidence/ga-release-certificate-verification.2026-05-09.json',
    ])
    expect(verification.artifactHashMismatches).toEqual([
      {
        path: 'ops/agent-commerce/evidence/ga-promotion-decision.2026-05-09.json',
        expected: HASH_B,
        actual: HASH_D,
      },
    ])
  })

  it('creates a non-secret release dossier from a verified artifact index', () => {
    const { index, verification } = readyReleaseArtifactIndex()

    const dossier = createAgentCommerceGaReleaseDossier({
      index,
      verification,
      generatedAt: '2026-05-09T01:25:00.000Z',
      publicLinks: {
        release_ticket: 'https://example.com/releases/agent-commerce-ga-2026-05-09',
      },
    })
    const markdown = renderAgentCommerceGaReleaseDossierMarkdown(dossier)

    expect(dossier).toMatchObject({
      schema_version: 'agent-commerce-ga-release-dossier:v1',
      release: 'agent-commerce-ga-2026-05-09',
      ready: true,
      blockers: [],
      index_hash: index.index_hash,
      expected_index_hash: verification.expectedIndexHash,
      actual_index_hash: verification.actualIndexHash,
      verification_bound_to_index: true,
      artifact_counts: {
        total: 11,
        required: 9,
        promotion_attestations: 2,
        provider_promotions: 0,
        supporting: 0,
        missing_required: 0,
        secret_marker_paths: 0,
      },
    })
    expect(dossier.dossier_hash).toBe(hashAgentCommerceGaReleaseDossier(dossier))
    expect(markdown).toContain('# Agent Commerce GA Release Dossier: agent-commerce-ga-2026-05-09')
    expect(markdown).toContain(`| Artifact index hash | \`${index.index_hash}\` |`)
    expect(markdown).toContain('| Kind | Path | SHA-256 | Bytes | Secret marker count |')
    expect(markdown).not.toContain(SIGNING_SECRET)
    expect(markdown).not.toContain(SECURITY_SIGNING_SECRET)
  })

  it('blocks release dossiers when artifact index verification is missing or unbound', () => {
    const { index, verification } = readyReleaseArtifactIndex()

    const dossier = createAgentCommerceGaReleaseDossier({
      index,
      verification: {
        ...verification,
        ready: false,
        actualIndexHash: HASH_D,
        artifactFilesPresent: false,
        missingArtifactPaths: [
          'ops/agent-commerce/evidence/ga-release-certificate-verification.2026-05-09.json',
        ],
      },
      generatedAt: '2026-05-09T01:25:00.000Z',
    })

    expect(dossier.ready).toBe(false)
    expect(dossier.blockers).toEqual(expect.arrayContaining([
      'artifact_index_verification_not_ready',
      'artifact_index_verification_not_bound',
      'artifact_file_missing',
    ]))
    expect(dossier.verification_bound_to_index).toBe(false)
    expect(dossier.verification_summary.missing_artifact_path_count).toBe(1)
  })

  it('verifies release dossier JSON and Markdown against the artifact index', () => {
    const { index, verification } = readyReleaseArtifactIndex()
    const dossier = createAgentCommerceGaReleaseDossier({
      index,
      verification,
      generatedAt: '2026-05-09T01:25:00.000Z',
    })
    const markdown = renderAgentCommerceGaReleaseDossierMarkdown(dossier)

    const dossierVerification = verifyAgentCommerceGaReleaseDossier(
      dossier,
      index,
      verification,
      markdown,
    )

    expect(dossierVerification).toMatchObject({
      ready: true,
      dossierReady: true,
      dossierHashValid: true,
      dossierSelfConsistent: true,
      dossierBoundToIndex: true,
      artifactIndexReady: true,
      artifactIndexVerificationReady: true,
      markdownMatches: true,
      expectedDossierHash: dossier.dossier_hash,
      actualDossierHash: dossier.dossier_hash,
      expectedBlockers: [],
      actualBlockers: [],
      dossierFieldMismatches: [],
    })
  })

  it('rejects tampered release dossier JSON and Markdown', () => {
    const { index, verification } = readyReleaseArtifactIndex()
    const dossier = createAgentCommerceGaReleaseDossier({
      index,
      verification,
      generatedAt: '2026-05-09T01:25:00.000Z',
    })
    const markdown = renderAgentCommerceGaReleaseDossierMarkdown(dossier)

    const dossierVerification = verifyAgentCommerceGaReleaseDossier(
      {
        ...dossier,
        dossier_hash: HASH_D,
        artifact_counts: {
          ...dossier.artifact_counts,
          total: dossier.artifact_counts.total + 1,
        },
      },
      index,
      verification,
      `${markdown}\nextra line\n`,
    )

    expect(dossierVerification.ready).toBe(false)
    expect(dossierVerification.dossierHashValid).toBe(false)
    expect(dossierVerification.dossierSelfConsistent).toBe(false)
    expect(dossierVerification.markdownMatches).toBe(false)
    expect(dossierVerification.dossierFieldMismatches).toEqual(['artifact_counts'])
  })
})
