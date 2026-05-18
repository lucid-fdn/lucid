import { describe, expect, it } from 'vitest'
import {
  APP_SERVICE_INFRASTRUCTURE_REQUIREMENTS,
  evaluateAppServiceInfrastructureReadiness,
  summarizeAppServiceInfrastructureRequirements,
} from '../infrastructure-readiness-core'

describe('infrastructure-readiness-core', () => {
  it('defines the Step 1 production infrastructure areas', () => {
    expect(summarizeAppServiceInfrastructureRequirements()).toMatchObject({
      requirementCount: 6,
      areas: [
        'artifact_storage',
        'cdn_cache',
        'external_providers',
        'redis_pulse',
        'service_accounts',
        'waf_rate_limit',
      ],
    })
    expect(APP_SERVICE_INFRASTRUCTURE_REQUIREMENTS.map((requirement) => requirement.id)).toEqual([
      'redis_pulse_streams',
      'artifact_bucket',
      'public_apps_cdn',
      'public_runtime_waf',
      'external_provider_credentials',
      'future_provider_service_accounts',
    ])
  })

  it('keeps staging blocked until required environment and evidence are attached', () => {
    const report = evaluateAppServiceInfrastructureReadiness({
      environment: 'staging',
      env: {
        REDIS_URL: 'rediss://redis.example:6379',
        FEATURE_PULSE: 'true',
      },
      evidence: {
        redis_pulse_streams: ['redis_tls_endpoint'],
      },
    })

    expect(report.ready).toBe(false)
    expect(report.results.find((result) => result.id === 'redis_pulse_streams')).toMatchObject({
      ready: false,
      missingEnv: ['APP_SERVICE_CONTROL_PLANE_URL', 'APP_SERVICE_INTERNAL_SECRET'],
      missingEvidence: ['pulse_stream_claim_test', 'pulse_retry_dlq_test'],
    })
  })

  it('passes when staging requirements have env and evidence', () => {
    const env = Object.fromEntries(
      APP_SERVICE_INFRASTRUCTURE_REQUIREMENTS
        .filter((requirement) => requirement.requiredFor.includes('staging'))
        .flatMap((requirement) => requirement.requiredEnv.map((key) => [key, `${key.toLowerCase()}_value`])),
    )
    const evidence = Object.fromEntries(
      APP_SERVICE_INFRASTRUCTURE_REQUIREMENTS
        .filter((requirement) => requirement.requiredFor.includes('staging'))
        .map((requirement) => [requirement.id, requirement.evidence]),
    )

    expect(evaluateAppServiceInfrastructureReadiness({
      environment: 'staging',
      env,
      evidence,
    }).ready).toBe(true)
  })
})
