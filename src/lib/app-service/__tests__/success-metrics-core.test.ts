import { describe, expect, it } from 'vitest'
import {
  APP_SERVICE_SUCCESS_METRICS,
  evaluateAppServiceSuccessMetrics,
  summarizeAppServiceSuccessMetrics,
} from '../success-metrics-core'

describe('success metrics core', () => {
  it('defines activation, quality, business, and north-star metrics', () => {
    expect(summarizeAppServiceSuccessMetrics()).toMatchObject({
      metricCount: 18,
      activationMetricCount: 6,
      qualityMetricCount: 5,
      businessMetricCount: 6,
      northStarMetricId: 'activated_generated_ai_services_7d',
    })
    expect(APP_SERVICE_SUCCESS_METRICS.map((metric) => metric.id)).toEqual(expect.arrayContaining([
      'generated_specs_per_week',
      'preview_opened_rate',
      'deploy_conversion_rate',
      'integration_connected_72h_rate',
      'generation_success_rate',
      'eval_pass_rate',
      'trial_to_paid_after_deploy_rate',
      'apps_retained_7d_rate',
      'apps_retained_30d_rate',
      'marketplace_remix_rate',
      'built_with_lucid_referral_traffic',
      'activated_generated_ai_services_7d',
    ]))
  })

  it('evaluates beta thresholds and handles lower-is-better unsafe report rates', () => {
    const results = evaluateAppServiceSuccessMetrics({
      generated_specs_per_week: { value: 30, evidence: ['generation_run_created', 'generation_planner_ai_completed', 'generation_planner_deterministic'] },
      unsafe_response_report_rate: { value: 0.01, evidence: ['public_runtime_feedback_reported', 'public_feedback_reported'] },
      deploy_conversion_rate: { value: 0.2, evidence: ['generation_preview_deployed'] },
    })

    expect(results.find((result) => result.id === 'generated_specs_per_week')).toMatchObject({ status: 'pass' })
    expect(results.find((result) => result.id === 'unsafe_response_report_rate')).toMatchObject({ status: 'pass' })
    expect(results.find((result) => result.id === 'deploy_conversion_rate')).toMatchObject({
      status: 'fail',
      missingEvidence: ['app_service_generation_approved'],
    })
    expect(results.find((result) => result.id === 'preview_opened_rate')).toMatchObject({ status: 'missing' })
  })
})
