export type AppServiceInfrastructureEnvironment = 'staging' | 'production'
export type AppServiceInfrastructureArea =
  | 'redis_pulse'
  | 'artifact_storage'
  | 'cdn_cache'
  | 'waf_rate_limit'
  | 'external_providers'
  | 'service_accounts'

export interface AppServiceInfrastructureRequirement {
  id: string
  area: AppServiceInfrastructureArea
  label: string
  requiredFor: readonly AppServiceInfrastructureEnvironment[]
  requiredEnv: readonly string[]
  evidence: readonly string[]
}

export interface AppServiceInfrastructureReadinessInput {
  environment: AppServiceInfrastructureEnvironment
  env?: Record<string, string | undefined>
  evidence?: Record<string, readonly string[] | undefined>
}

export interface AppServiceInfrastructureRequirementResult {
  id: string
  area: AppServiceInfrastructureArea
  ready: boolean
  missingEnv: string[]
  missingEvidence: string[]
}

export interface AppServiceInfrastructureReadinessReport {
  environment: AppServiceInfrastructureEnvironment
  ready: boolean
  results: AppServiceInfrastructureRequirementResult[]
}

export const APP_SERVICE_INFRASTRUCTURE_REQUIREMENTS = [
  {
    id: 'redis_pulse_streams',
    area: 'redis_pulse',
    label: 'Redis/Pulse is provisioned with production-like stream semantics.',
    requiredFor: ['staging', 'production'],
    requiredEnv: [
      'REDIS_URL',
      'FEATURE_PULSE',
      'APP_SERVICE_CONTROL_PLANE_URL',
      'APP_SERVICE_INTERNAL_SECRET',
    ],
    evidence: [
      'redis_tls_endpoint',
      'pulse_stream_claim_test',
      'pulse_retry_dlq_test',
    ],
  },
  {
    id: 'artifact_bucket',
    area: 'artifact_storage',
    label: 'Artifact bucket is available for generated source, logs, screenshots, and receipts.',
    requiredFor: ['staging', 'production'],
    requiredEnv: [
      'APP_SERVICE_ARTIFACT_BUCKET',
      'APP_SERVICE_ARTIFACT_REGION',
      'APP_SERVICE_ARTIFACT_RETENTION_POLICY',
    ],
    evidence: [
      'bucket_encryption_enabled',
      'bucket_lifecycle_policy_applied',
      'bucket_write_read_smoke',
    ],
  },
  {
    id: 'public_apps_cdn',
    area: 'cdn_cache',
    label: 'CDN/cache policy is configured for public generated app pages.',
    requiredFor: ['staging', 'production'],
    requiredEnv: [
      'APP_SERVICE_PUBLIC_APPS_CDN_PROVIDER',
      'APP_SERVICE_PUBLIC_APPS_CDN_ZONE_ID',
      'APP_SERVICE_PUBLIC_APPS_CACHE_POLICY_ID',
    ],
    evidence: [
      'apps_slug_cache_rule',
      'runtime_api_no_store_rule',
      'cache_purge_test',
    ],
  },
  {
    id: 'public_runtime_waf',
    area: 'waf_rate_limit',
    label: 'WAF and edge rate limiting protect public generated app endpoints.',
    requiredFor: ['staging', 'production'],
    requiredEnv: [
      'APP_SERVICE_PUBLIC_APPS_WAF_PROVIDER',
      'APP_SERVICE_PUBLIC_APPS_RATE_LIMIT_POLICY_ID',
      'APP_SERVICE_PUBLIC_RATE_LIMIT_WINDOW_MS',
      'APP_SERVICE_PUBLIC_IP_RATE_LIMIT',
      'APP_SERVICE_TURNSTILE_REQUIRED_KINDS',
      'APP_SERVICE_TURNSTILE_SECRET_KEY',
    ],
    evidence: [
      'waf_rule_set_attached',
      'edge_rate_limit_rule_attached',
      'turnstile_negative_test',
    ],
  },
  {
    id: 'external_provider_credentials',
    area: 'external_providers',
    label: 'External v0, Vercel, and sandbox credentials are separated by environment.',
    requiredFor: ['staging', 'production'],
    requiredEnv: [
      'V0_API_KEY',
      'VERCEL_API_TOKEN',
      'VERCEL_TEAM_ID',
      'VERCEL_OIDC_TOKEN',
    ],
    evidence: [
      'v0_staging_project_id',
      'vercel_staging_project_id',
      'sandbox_build_smoke',
    ],
  },
  {
    id: 'future_provider_service_accounts',
    area: 'service_accounts',
    label: 'Future GitHub/Vercel/Netlify provider service accounts have owners and rotation policy.',
    requiredFor: ['production'],
    requiredEnv: [
      'APP_SERVICE_PROVIDER_ACCOUNT_OWNER',
      'APP_SERVICE_PROVIDER_SECRET_ROTATION_DAYS',
    ],
    evidence: [
      'github_app_owner_recorded',
      'vercel_service_account_owner_recorded',
      'netlify_service_account_owner_recorded',
      'secret_rotation_calendar',
    ],
  },
] as const satisfies readonly AppServiceInfrastructureRequirement[]

function isPresent(env: Record<string, string | undefined>, key: string): boolean {
  return Boolean(env[key]?.trim())
}

export function evaluateAppServiceInfrastructureReadiness(
  input: AppServiceInfrastructureReadinessInput,
): AppServiceInfrastructureReadinessReport {
  const env = input.env ?? {}
  const evidence = input.evidence ?? {}

  const results = APP_SERVICE_INFRASTRUCTURE_REQUIREMENTS
    .filter((requirement) => (requirement.requiredFor as readonly AppServiceInfrastructureEnvironment[]).includes(input.environment))
    .map((requirement) => {
      const providedEvidence = new Set(evidence[requirement.id] ?? [])
      const missingEnv = requirement.requiredEnv.filter((key) => !isPresent(env, key))
      const missingEvidence = requirement.evidence.filter((item) => !providedEvidence.has(item))

      return {
        id: requirement.id,
        area: requirement.area,
        ready: missingEnv.length === 0 && missingEvidence.length === 0,
        missingEnv,
        missingEvidence,
      }
    })

  return {
    environment: input.environment,
    ready: results.every((result) => result.ready),
    results,
  }
}

export function summarizeAppServiceInfrastructureRequirements() {
  return {
    requirementCount: APP_SERVICE_INFRASTRUCTURE_REQUIREMENTS.length,
    areas: [...new Set(APP_SERVICE_INFRASTRUCTURE_REQUIREMENTS.map((requirement) => requirement.area))].sort(),
    stagingRequirementIds: APP_SERVICE_INFRASTRUCTURE_REQUIREMENTS
      .filter((requirement) => (requirement.requiredFor as readonly AppServiceInfrastructureEnvironment[]).includes('staging'))
      .map((requirement) => requirement.id),
    productionRequirementIds: APP_SERVICE_INFRASTRUCTURE_REQUIREMENTS
      .filter((requirement) => (requirement.requiredFor as readonly AppServiceInfrastructureEnvironment[]).includes('production'))
      .map((requirement) => requirement.id),
  }
}
