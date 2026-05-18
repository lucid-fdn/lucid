import {
  APP_SERVICE_ANALYTICS_EVENTS,
  APP_SERVICE_BILLING_ENTITLEMENTS,
  APP_SERVICE_DOGFOOD_BLUEPRINTS,
  APP_SERVICE_POST_DEPLOY_ONBOARDING_CHECKLIST,
  APP_SERVICE_TEMPLATE_PROOF_PAGES,
} from './launch-readiness-core'
import {
  APP_SERVICE_FIRST_PLATFORM_BLUEPRINTS,
  APP_SERVICE_FIRST_PLATFORM_BLUEPRINT_SLUGS,
} from './platform-blueprints-core'
import { summarizeAppServiceProductPolicy } from './product-policy-core'
import { summarizeAppServiceSuccessMetrics } from './success-metrics-core'

export type AppServiceProductionGateCategory =
  | 'contract_dx'
  | 'security'
  | 'performance'
  | 'reliability'
  | 'observability'
  | 'product'
  | 'ga_exit'

export type AppServiceProductionGateStatus = 'pass' | 'fail' | 'needs_evidence'

export type AppServiceProductionGateEvidenceKind =
  | 'automated_test'
  | 'static_ci'
  | 'staging_drill'
  | 'manual_signoff'
  | 'metric'

export interface AppServiceProductionGateDefinition {
  id: string
  category: AppServiceProductionGateCategory
  label: string
  evidenceKind: AppServiceProductionGateEvidenceKind
  requiredEvidence: string[]
}

export interface AppServiceProductionGateEvidence {
  passed?: boolean
  evidence?: string[]
  measuredValue?: number
  threshold?: number
  owner?: string
  note?: string
}

export interface AppServiceProductionMetrics {
  lucidHostedDeploySuccessRate7d?: number
  platformBlueprintGenerationSuccessRate?: number
  criticalSecurityIssuesOpen?: number
  p0p1LaunchBlockersOpen?: number
  runbookExternalReviewer?: string
  rollbackKillSwitchTestedInStaging?: boolean
}

export interface AppServiceProductionGateResult {
  id: string
  category: AppServiceProductionGateCategory
  label: string
  status: AppServiceProductionGateStatus
  evidenceKind: AppServiceProductionGateEvidenceKind
  missingEvidence: string[]
  measuredValue?: number
  threshold?: number
}

export interface AppServiceProductionReadinessReport {
  ready: boolean
  blocked: boolean
  needsEvidence: boolean
  passed: string[]
  failed: string[]
  evidenceNeeded: string[]
  results: AppServiceProductionGateResult[]
}

export const APP_SERVICE_INTERNAL_SDK_PACKAGE_NAME = '@lucid/app-runtime-sdk'

export const APP_SERVICE_GENERATED_APP_FIXTURES = [
  'packages/app-runtime-sdk/examples/generated-public-app.ts',
  'packages/app-runtime-sdk/examples/generated-owner-cockpit.ts',
] as const

export const APP_SERVICE_MOCK_PROVIDER_MODES = [
  'APP_SERVICE_PROVIDER_MODE=mock',
  'APP_SERVICE_V0_PROVIDER_MODE=mock',
  'APP_SERVICE_VERCEL_PROVIDER_MODE=mock',
  'APP_SERVICE_SANDBOX_MODE=mock',
] as const

export const APP_SERVICE_RELIABILITY_RUNBOOKS = [
  'docs/superpowers/runbooks/app-service-generation-failures.md',
  'docs/superpowers/runbooks/app-service-v0-generation-failure.md',
  'docs/superpowers/runbooks/app-service-v0-quota-rate-limit-exhaustion.md',
  'docs/superpowers/runbooks/app-service-vercel-preview-deployment-failure.md',
  'docs/superpowers/runbooks/app-service-external-deploy-provider-outage.md',
  'docs/superpowers/runbooks/app-service-rollback-app-deployment.md',
  'docs/superpowers/runbooks/app-service-foundry-migration-rollback.md',
] as const

export const APP_SERVICE_PRODUCT_PROOF_PATHS = [
  'src/app/apps/[slug]/page.tsx',
  'src/app/apps/[slug]/public-app-interactions.tsx',
  'src/app/api/app-runtime/v1/operator/apps/[appId]/summary/route.ts',
  'src/app/api/app-runtime/v1/operator/apps/[appId]/usage/route.ts',
  'src/app/api/app-runtime/v1/operator/apps/[appId]/tokens/route.ts',
  'src/app/api/app-runtime/v1/operator/apps/[appId]/origins/route.ts',
  'src/app/api/app-runtime/v1/public/apps/[slug]/feedback/route.ts',
  'src/app/api/app-services/[id]/feedback/route.ts',
  'src/app/api/app-services/blueprints/route.ts',
  'src/app/api/app-services/registry/route.ts',
] as const

export const APP_SERVICE_PRODUCTION_LAUNCH_GATES = [
  {
    id: 'contract_sdk_internal_package',
    category: 'contract_dx',
    label: 'Runtime SDK is internally publishable and consumed by generated app fixtures.',
    evidenceKind: 'static_ci',
    requiredEvidence: [
      'package publishConfig exists',
      'generated app fixtures import @lucid/app-runtime-sdk',
      'SDK fixture typecheck runs in CI',
    ],
  },
  {
    id: 'contract_mock_providers',
    category: 'contract_dx',
    label: 'Mock v0, Vercel, and sandbox providers are available for local dev and CI.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'v0 mock provider test',
      'Vercel mock provider test',
      'sandbox mock provider test',
      'startup env accepts mock mode',
    ],
  },
  {
    id: 'reliability_provider_timeout_retry_circuit',
    category: 'reliability',
    label: 'Provider timeout, retry, and circuit-breaker behavior is deterministic.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'provider resilience core tests',
      'v0 retry test',
      'Vercel retry test',
    ],
  },
  {
    id: 'reliability_redis_degraded_mode',
    category: 'reliability',
    label: 'Redis outage and degraded processor behavior is documented and tested.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'worker retries redis_reconnecting',
      'degraded mode runbook',
    ],
  },
  {
    id: 'reliability_v0_quota_exhaustion',
    category: 'reliability',
    label: 'v0 quota exhaustion fails closed without extra provider calls.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'v0 quota boundary test',
      'quota runbook',
      'billing entitlement gate',
    ],
  },
  {
    id: 'reliability_vercel_deployment_failure',
    category: 'reliability',
    label: 'Vercel deployment failure preserves receipts and operator-safe errors.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'Vercel provider failure test',
      'preview deployment failure runbook',
    ],
  },
  {
    id: 'reliability_bad_provider_rollback',
    category: 'reliability',
    label: 'Rollback from a bad v0 or Vercel deploy is covered.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'rollback core tests',
      'rollback route',
      'rollback runbook',
    ],
  },
  {
    id: 'reliability_manifest_fallback',
    category: 'reliability',
    label: 'Manifest-hosted fallback remains available when generated-code providers fail.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'manifest rollback test',
      'public shell fallback test',
      'provider failure runbook',
    ],
  },
  {
    id: 'reliability_kill_switch',
    category: 'reliability',
    label: 'Global App Service kill switch is tested.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'feature gate kill switch',
      'feature-off smoke',
      'startup env validation',
    ],
  },
  {
    id: 'reliability_provider_sync_idempotency',
    category: 'reliability',
    label: 'Provider sync is idempotent across repeated polls and retries.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'provider lifecycle upsert conflict targets',
      'provider sync route',
      'provider lifecycle tests',
    ],
  },
  {
    id: 'security_external_deploy_secret_storage',
    category: 'security',
    label: 'External deploy credentials are server-side or encrypted-store only.',
    evidenceKind: 'static_ci',
    requiredEvidence: [
      'V0_API_KEY read server-side',
      'VERCEL_API_TOKEN read server-side',
      'secret requirement plaintext rejection',
      'encrypted secret store reference accepted',
    ],
  },
  {
    id: 'security_secret_requirement_audit',
    category: 'security',
    label: 'Secret requirement connection and change events are audited.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'app_secret_requirement_connected event',
      'app_secret_requirement_changed event',
      'secret requirement route requires write access',
    ],
  },
  {
    id: 'product_final_policy_decisions',
    category: 'product',
    label: 'Final product policy decisions are represented in code and CI.',
    evidenceKind: 'static_ci',
    requiredEvidence: [
      'generated app route pattern',
      'default unlisted visibility',
      '30 day transcript retention',
      'external deployment approval required',
      'community blueprint review required',
    ],
  },
  {
    id: 'product_five_blueprints_e2e',
    category: 'product',
    label: 'Five platform blueprints have end-to-end deploy proof paths.',
    evidenceKind: 'staging_drill',
    requiredEvidence: [
      'five platform blueprints',
      'Lucid-hosted proof pages',
      'v0/Vercel optional deploy path where allowed',
    ],
  },
  {
    id: 'product_owner_cockpit',
    category: 'product',
    label: 'Generated app owner cockpit works through operator SDK routes.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'operator summary route',
      'operator usage route',
      'SDK owner cockpit fixture',
    ],
  },
  {
    id: 'product_setup_checklist',
    category: 'product',
    label: 'Setup checklist detects missing integrations and required launch tasks.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'post deploy checklist',
      'operator readiness warnings',
      'setup_required public runtime state',
    ],
  },
  {
    id: 'product_public_proof_page',
    category: 'product',
    label: 'Public proof page renders service, proof metrics, attribution, and feedback.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'public shell page',
      'proof metrics block',
      'creator attribution',
      'public Playwright smoke',
    ],
  },
  {
    id: 'product_marketplace_remix',
    category: 'product',
    label: 'Marketplace deploy and remix path is represented by App Blueprint APIs.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'blueprints API',
      'app_blueprints migration',
      'marketplace feature flag',
      'blueprint template metadata',
    ],
  },
  {
    id: 'product_feedback_unsafe_flow',
    category: 'product',
    label: 'Feedback and unsafe answer report flow reaches operator visibility.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'public feedback route',
      'unsafe feedback event',
      'operator visibility abuse summary',
    ],
  },
  {
    id: 'product_billing_upgrade_path',
    category: 'product',
    label: 'Billing, usage, and upgrade-path decisions are exposed before provider spend.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'billing entitlements',
      'operator usage route',
      'billing feedback category',
    ],
  },
  {
    id: 'product_beta_feedback_capture',
    category: 'product',
    label: 'In-product beta feedback capture works in the operator cockpit.',
    evidenceKind: 'automated_test',
    requiredEvidence: [
      'operator beta feedback panel',
      'feedback API route',
      'launch analytics event',
    ],
  },
  {
    id: 'ga_lucid_hosted_success_rate',
    category: 'ga_exit',
    label: '95%+ Lucid-hosted deploy success over a seven-day beta window.',
    evidenceKind: 'metric',
    requiredEvidence: ['lucidHostedDeploySuccessRate7d >= 0.95'],
  },
  {
    id: 'ga_blueprint_generation_success_rate',
    category: 'ga_exit',
    label: '90%+ generation success for platform blueprints.',
    evidenceKind: 'metric',
    requiredEvidence: ['platformBlueprintGenerationSuccessRate >= 0.90'],
  },
  {
    id: 'ga_zero_critical_security',
    category: 'ga_exit',
    label: 'Zero critical security issues are open.',
    evidenceKind: 'metric',
    requiredEvidence: ['criticalSecurityIssuesOpen === 0'],
  },
  {
    id: 'ga_zero_p0_p1_blockers',
    category: 'ga_exit',
    label: 'Zero P0/P1 launch blockers are open.',
    evidenceKind: 'metric',
    requiredEvidence: ['p0p1LaunchBlockersOpen === 0'],
  },
  {
    id: 'ga_external_runbook_drill',
    category: 'ga_exit',
    label: 'Runbooks were tested by someone who did not write the feature.',
    evidenceKind: 'manual_signoff',
    requiredEvidence: ['runbookExternalReviewer recorded'],
  },
  {
    id: 'ga_staging_rollback_kill_switch',
    category: 'ga_exit',
    label: 'Production rollback and kill switch were tested in staging.',
    evidenceKind: 'staging_drill',
    requiredEvidence: ['rollbackKillSwitchTestedInStaging === true'],
  },
] as const satisfies readonly AppServiceProductionGateDefinition[]

export const APP_SERVICE_PRODUCTION_BLUEPRINT_SLUGS = [...APP_SERVICE_FIRST_PLATFORM_BLUEPRINT_SLUGS]

export function buildProductionGateEvidenceSkeleton(): Record<string, AppServiceProductionGateEvidence> {
  return Object.fromEntries(
    APP_SERVICE_PRODUCTION_LAUNCH_GATES.map((gate) => [
      gate.id,
      {
        passed: false,
        evidence: [],
      },
    ]),
  )
}

export function appServiceProductionMetricEvidence(
  metrics: AppServiceProductionMetrics,
): Record<string, AppServiceProductionGateEvidence> {
  return {
    ga_lucid_hosted_success_rate: {
      passed: typeof metrics.lucidHostedDeploySuccessRate7d === 'number'
        && metrics.lucidHostedDeploySuccessRate7d >= 0.95,
      measuredValue: metrics.lucidHostedDeploySuccessRate7d,
      threshold: 0.95,
      evidence: ['lucidHostedDeploySuccessRate7d'],
    },
    ga_blueprint_generation_success_rate: {
      passed: typeof metrics.platformBlueprintGenerationSuccessRate === 'number'
        && metrics.platformBlueprintGenerationSuccessRate >= 0.90,
      measuredValue: metrics.platformBlueprintGenerationSuccessRate,
      threshold: 0.90,
      evidence: ['platformBlueprintGenerationSuccessRate'],
    },
    ga_zero_critical_security: {
      passed: metrics.criticalSecurityIssuesOpen === 0,
      measuredValue: metrics.criticalSecurityIssuesOpen,
      threshold: 0,
      evidence: ['criticalSecurityIssuesOpen'],
    },
    ga_zero_p0_p1_blockers: {
      passed: metrics.p0p1LaunchBlockersOpen === 0,
      measuredValue: metrics.p0p1LaunchBlockersOpen,
      threshold: 0,
      evidence: ['p0p1LaunchBlockersOpen'],
    },
    ga_external_runbook_drill: {
      passed: Boolean(metrics.runbookExternalReviewer?.trim()),
      owner: metrics.runbookExternalReviewer,
      evidence: ['runbookExternalReviewer'],
    },
    ga_staging_rollback_kill_switch: {
      passed: metrics.rollbackKillSwitchTestedInStaging === true,
      evidence: ['rollbackKillSwitchTestedInStaging'],
    },
  }
}

export function evaluateAppServiceProductionLaunchReadiness(input: {
  evidence?: Record<string, AppServiceProductionGateEvidence | boolean>
  metrics?: AppServiceProductionMetrics
} = {}): AppServiceProductionReadinessReport {
  const metricEvidence = input.metrics ? appServiceProductionMetricEvidence(input.metrics) : {}
  const evidence = {
    ...(input.evidence ?? {}),
    ...metricEvidence,
  }

  const results = APP_SERVICE_PRODUCTION_LAUNCH_GATES.map((gate): AppServiceProductionGateResult => {
    const raw = evidence[gate.id]
    const gateEvidence = typeof raw === 'boolean' ? { passed: raw } : raw
    const hasExplicitEvidence = Boolean(gateEvidence)
    const passed = gateEvidence?.passed === true
    const failed = gateEvidence?.passed === false
    const evidenceItems = gateEvidence?.evidence ?? []
    const missingEvidence = gate.requiredEvidence.filter((item) => !evidenceItems.includes(item))

    return {
      id: gate.id,
      category: gate.category,
      label: gate.label,
      status: passed ? 'pass' : failed ? 'fail' : hasExplicitEvidence ? 'fail' : 'needs_evidence',
      evidenceKind: gate.evidenceKind,
      missingEvidence: passed ? [] : missingEvidence,
      measuredValue: gateEvidence?.measuredValue,
      threshold: gateEvidence?.threshold,
    }
  })

  const passed = results.filter((result) => result.status === 'pass').map((result) => result.id)
  const failed = results.filter((result) => result.status === 'fail').map((result) => result.id)
  const evidenceNeeded = results.filter((result) => result.status === 'needs_evidence').map((result) => result.id)

  return {
    ready: failed.length === 0 && evidenceNeeded.length === 0,
    blocked: failed.length > 0,
    needsEvidence: evidenceNeeded.length > 0,
    passed,
    failed,
    evidenceNeeded,
    results,
  }
}

export function summarizeAppServiceProductionStaticProofs() {
  return {
    sdkPackageName: APP_SERVICE_INTERNAL_SDK_PACKAGE_NAME,
    generatedAppFixtures: [...APP_SERVICE_GENERATED_APP_FIXTURES],
    mockProviderModes: [...APP_SERVICE_MOCK_PROVIDER_MODES],
    reliabilityRunbooks: [...APP_SERVICE_RELIABILITY_RUNBOOKS],
    productProofPaths: [...APP_SERVICE_PRODUCT_PROOF_PATHS],
    dogfoodBlueprintSlugs: APP_SERVICE_DOGFOOD_BLUEPRINTS.map((blueprint) => blueprint.slug),
    platformBlueprintSlugs: [...APP_SERVICE_PRODUCTION_BLUEPRINT_SLUGS],
    dogfoodBlueprintCount: APP_SERVICE_DOGFOOD_BLUEPRINTS.length,
    platformBlueprintCount: APP_SERVICE_FIRST_PLATFORM_BLUEPRINTS.length,
    productPolicy: summarizeAppServiceProductPolicy(),
    successMetrics: summarizeAppServiceSuccessMetrics(),
    proofPageCount: APP_SERVICE_TEMPLATE_PROOF_PAGES.length,
    onboardingChecklistCount: APP_SERVICE_POST_DEPLOY_ONBOARDING_CHECKLIST.length,
    billingEntitlementCount: APP_SERVICE_BILLING_ENTITLEMENTS.length,
    analyticsEventCount: APP_SERVICE_ANALYTICS_EVENTS.length,
  }
}
