import { describe, expect, it } from 'vitest'
import {
  APP_SERVICE_GENERATED_APP_FIXTURES,
  APP_SERVICE_INTERNAL_SDK_PACKAGE_NAME,
  APP_SERVICE_MOCK_PROVIDER_MODES,
  APP_SERVICE_PRODUCTION_BLUEPRINT_SLUGS,
  APP_SERVICE_PRODUCTION_LAUNCH_GATES,
  appServiceProductionMetricEvidence,
  evaluateAppServiceProductionLaunchReadiness,
  summarizeAppServiceProductionStaticProofs,
} from '../production-launch-core'

describe('production launch core', () => {
  it('defines executable production launch gates for the remaining 9.9 checklist', () => {
    expect(APP_SERVICE_GENERATED_APP_FIXTURES).toContain('packages/app-runtime-sdk/examples/generated-public-app.ts')
    expect(APP_SERVICE_INTERNAL_SDK_PACKAGE_NAME).toBe('@lucid/app-runtime-sdk')
    expect(APP_SERVICE_MOCK_PROVIDER_MODES).toContain('APP_SERVICE_PROVIDER_MODE=mock')
    expect(APP_SERVICE_PRODUCTION_BLUEPRINT_SLUGS).toEqual([
      'support-concierge',
      'ai-sdr-lead-qualifier',
      'content-engine',
      'ops-monitor',
      'internal-knowledge-assistant',
    ])

    const gateIds = APP_SERVICE_PRODUCTION_LAUNCH_GATES.map((gate) => gate.id)
    expect(gateIds).toEqual(expect.arrayContaining([
      'contract_sdk_internal_package',
      'contract_mock_providers',
      'reliability_provider_timeout_retry_circuit',
      'reliability_redis_degraded_mode',
      'reliability_v0_quota_exhaustion',
      'reliability_vercel_deployment_failure',
      'reliability_bad_provider_rollback',
      'reliability_manifest_fallback',
      'reliability_kill_switch',
      'reliability_provider_sync_idempotency',
      'security_external_deploy_secret_storage',
      'security_secret_requirement_audit',
      'product_final_policy_decisions',
      'product_five_blueprints_e2e',
      'product_owner_cockpit',
      'product_setup_checklist',
      'product_public_proof_page',
      'product_marketplace_remix',
      'product_feedback_unsafe_flow',
      'product_billing_upgrade_path',
      'product_beta_feedback_capture',
    ]))
  })

  it('evaluates production readiness from evidence and GA metrics', () => {
    const evidence = Object.fromEntries(
      APP_SERVICE_PRODUCTION_LAUNCH_GATES
        .filter((gate) => gate.category !== 'ga_exit')
        .map((gate) => [
          gate.id,
          {
            passed: true,
            evidence: [...gate.requiredEvidence],
          },
        ]),
    )

    const report = evaluateAppServiceProductionLaunchReadiness({
      evidence,
      metrics: {
        lucidHostedDeploySuccessRate7d: 0.97,
        platformBlueprintGenerationSuccessRate: 0.92,
        criticalSecurityIssuesOpen: 0,
        p0p1LaunchBlockersOpen: 0,
        runbookExternalReviewer: 'staging-oncall@example.com',
        rollbackKillSwitchTestedInStaging: true,
      },
    })

    expect(report.ready).toBe(true)
    expect(report.blocked).toBe(false)
    expect(report.needsEvidence).toBe(false)
    expect(report.failed).toEqual([])
    expect(report.evidenceNeeded).toEqual([])
  })

  it('keeps GA blocked until real beta evidence is attached', () => {
    const report = evaluateAppServiceProductionLaunchReadiness({
      metrics: {
        lucidHostedDeploySuccessRate7d: 0.94,
        platformBlueprintGenerationSuccessRate: 0.89,
        criticalSecurityIssuesOpen: 1,
        p0p1LaunchBlockersOpen: 1,
        rollbackKillSwitchTestedInStaging: false,
      },
    })

    expect(report.ready).toBe(false)
    expect(report.blocked).toBe(true)
    expect(report.failed).toEqual(expect.arrayContaining([
      'ga_lucid_hosted_success_rate',
      'ga_blueprint_generation_success_rate',
      'ga_zero_critical_security',
      'ga_zero_p0_p1_blockers',
      'ga_external_runbook_drill',
      'ga_staging_rollback_kill_switch',
    ]))
  })

  it('summarizes static production proofs for validators and docs', () => {
    expect(appServiceProductionMetricEvidence({
      lucidHostedDeploySuccessRate7d: 0.95,
      platformBlueprintGenerationSuccessRate: 0.90,
      criticalSecurityIssuesOpen: 0,
      p0p1LaunchBlockersOpen: 0,
      runbookExternalReviewer: 'ops',
      rollbackKillSwitchTestedInStaging: true,
    }).ga_lucid_hosted_success_rate).toMatchObject({
      passed: true,
      threshold: 0.95,
    })

    expect(summarizeAppServiceProductionStaticProofs()).toMatchObject({
      sdkPackageName: '@lucid/app-runtime-sdk',
      dogfoodBlueprintCount: 5,
      platformBlueprintCount: 5,
      productPolicy: expect.objectContaining({
        defaultPublicVisibility: 'unlisted',
        defaultTranscriptRetentionDays: 30,
        firstExternalDeployTarget: 'vercel',
      }),
      successMetrics: expect.objectContaining({
        northStarMetricId: 'activated_generated_ai_services_7d',
        metricCount: 18,
      }),
      proofPageCount: 5,
      billingEntitlementCount: 5,
    })
  })
})
