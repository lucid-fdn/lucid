import { describe, expect, it } from 'vitest'
import {
  assertAppServiceStartupEnvReady,
  validateAppServiceStartupEnv,
} from '../startup-env'

describe('app service startup env validation', () => {
  it('passes when App Service Foundry is fully disabled', () => {
    const report = validateAppServiceStartupEnv({})

    expect(report.ok).toBe(true)
    expect(report.enabledSurfaces).toEqual({
      foundry: false,
      runtimeApi: false,
      publicApps: false,
      v0: false,
      vercel: false,
    })
  })

  it('requires an internal processor secret when foundry is enabled', () => {
    const report = validateAppServiceStartupEnv({
      FEATURE_APP_SERVICE_FOUNDRY: 'true',
    })

    expect(report.ok).toBe(false)
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        variable: 'APP_SERVICE_INTERNAL_SECRET|CRON_SECRET',
      }),
    ]))
  })

  it('allows local mock provider mode without provider secrets', () => {
    const report = validateAppServiceStartupEnv({
      FEATURE_APP_SERVICE_FOUNDRY: 'true',
      FEATURE_APP_V0_GENERATION: 'true',
      FEATURE_APP_VERCEL_DEPLOY: 'true',
      APP_SERVICE_INTERNAL_SECRET: 'internal-secret',
      APP_SERVICE_PROVIDER_MODE: 'mock',
      APP_SERVICE_SANDBOX_MODE: 'mock',
    })

    expect(report.ok).toBe(true)
    expect(report.providerModes).toMatchObject({
      appService: 'mock',
      v0: 'mock',
      vercel: 'mock',
      sandbox: 'mock',
    })
  })

  it('requires v0, Vercel, and sandbox credentials in live provider mode', () => {
    const report = validateAppServiceStartupEnv({
      FEATURE_APP_SERVICE_FOUNDRY: 'true',
      FEATURE_APP_V0_GENERATION: 'true',
      FEATURE_APP_VERCEL_DEPLOY: 'true',
      APP_SERVICE_INTERNAL_SECRET: 'internal-secret',
      APP_SERVICE_PROVIDER_MODE: 'live',
      APP_SERVICE_SANDBOX_MODE: 'live',
    })

    expect(report.ok).toBe(false)
    expect(report.issues.map((envIssue) => envIssue.variable)).toEqual(expect.arrayContaining([
      'V0_API_KEY',
      'VERCEL_API_TOKEN|VERCEL_TOKEN',
      'VERCEL_OIDC_TOKEN',
    ]))
  })

  it('accepts live provider credentials and Vercel runtime OIDC', () => {
    const report = validateAppServiceStartupEnv({
      FEATURE_APP_SERVICE_FOUNDRY: 'true',
      FEATURE_APP_V0_GENERATION: 'true',
      FEATURE_APP_VERCEL_DEPLOY: 'true',
      APP_SERVICE_INTERNAL_SECRET: 'internal-secret',
      V0_API_KEY: 'v0_test',
      VERCEL_TOKEN: 'vercel_test',
      VERCEL: '1',
      V0_API_URL: 'https://api.v0.dev/v1',
      VERCEL_API_BASE_URL: 'https://api.vercel.com',
      APP_SERVICE_GENERATION_BATCH_SIZE: '3',
      APP_SERVICE_GENERATION_POLL_INTERVAL_MS: '15000',
    })

    expect(report.ok).toBe(true)
  })

  it('warns when public runtime token hashes do not have a stable pepper', () => {
    const report = validateAppServiceStartupEnv({
      FEATURE_APP_RUNTIME_API: 'true',
      FEATURE_APP_PUBLIC_APPS: 'true',
    })

    expect(report.ok).toBe(true)
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'warning',
        code: 'missing_public_token_pepper',
        variable: 'APP_SERVICE_PUBLIC_TOKEN_PEPPER',
      }),
    ]))
  })

  it('validates public runtime abuse controls and Turnstile configuration', () => {
    const invalidReport = validateAppServiceStartupEnv({
      FEATURE_APP_RUNTIME_API: 'true',
      FEATURE_APP_PUBLIC_APPS: 'true',
      APP_SERVICE_TURNSTILE_REQUIRED_KINDS: 'lead,chat',
      APP_SERVICE_PUBLIC_IP_RATE_LIMIT: '0',
      APP_SERVICE_PUBLIC_ORG_RATE_LIMIT: 'not-a-number',
    })

    expect(invalidReport.ok).toBe(false)
    expect(invalidReport.issues.map((envIssue) => envIssue.variable)).toEqual(expect.arrayContaining([
      'APP_SERVICE_TURNSTILE_SECRET_KEY',
      'APP_SERVICE_PUBLIC_IP_RATE_LIMIT',
      'APP_SERVICE_PUBLIC_ORG_RATE_LIMIT',
    ]))

    const validReport = validateAppServiceStartupEnv({
      FEATURE_APP_RUNTIME_API: 'true',
      FEATURE_APP_PUBLIC_APPS: 'true',
      APP_SERVICE_PUBLIC_TOKEN_PEPPER: 'pepper',
      APP_SERVICE_TURNSTILE_REQUIRED_KINDS: 'lead,chat',
      APP_SERVICE_TURNSTILE_SECRET_KEY: 'turnstile-secret',
      APP_SERVICE_PUBLIC_RATE_LIMIT_WINDOW_MS: '60000',
      APP_SERVICE_PUBLIC_APP_RATE_LIMIT: '1000',
      APP_SERVICE_PUBLIC_ORG_RATE_LIMIT: '5000',
      APP_SERVICE_PUBLIC_IP_RATE_LIMIT: '100',
      APP_SERVICE_PUBLIC_SESSION_RATE_LIMIT: '40',
    })

    expect(validReport.ok).toBe(true)
  })

  it('validates beta launch access and billing modes', () => {
    const invalidReport = validateAppServiceStartupEnv({
      FEATURE_APP_SERVICE_FOUNDRY: 'true',
      APP_SERVICE_INTERNAL_SECRET: 'internal-secret',
      APP_SERVICE_BETA_ACCESS_MODE: 'invalid',
      APP_SERVICE_BILLING_MODE: 'charge',
    })

    expect(invalidReport.ok).toBe(false)
    expect(invalidReport.issues.map((envIssue) => envIssue.variable)).toEqual(expect.arrayContaining([
      'APP_SERVICE_BETA_ACCESS_MODE',
      'APP_SERVICE_BILLING_MODE',
    ]))

    const tooSmallAllowlist = validateAppServiceStartupEnv({
      FEATURE_APP_SERVICE_FOUNDRY: 'true',
      APP_SERVICE_INTERNAL_SECRET: 'internal-secret',
      APP_SERVICE_BETA_ACCESS_MODE: 'enforce',
      APP_SERVICE_BETA_ORG_ALLOWLIST: 'org-1,org-2',
    })

    expect(tooSmallAllowlist.ok).toBe(false)
    expect(tooSmallAllowlist.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'beta_allowlist_too_small',
        variable: 'APP_SERVICE_BETA_ORG_ALLOWLIST',
      }),
    ]))

    const validReport = validateAppServiceStartupEnv({
      FEATURE_APP_SERVICE_FOUNDRY: 'true',
      APP_SERVICE_INTERNAL_SECRET: 'internal-secret',
      APP_SERVICE_BETA_ACCESS_MODE: 'enforce',
      APP_SERVICE_BETA_ORG_ALLOWLIST: Array.from({ length: 10 }, (_, index) => `org-${index}`).join(','),
      APP_SERVICE_BILLING_MODE: 'meter',
      APP_SERVICE_BILLING_BYPASS_ORGS: 'internal-org',
    })

    expect(validReport.ok).toBe(true)
  })

  it('validates provider resilience and deployment timeout knobs', () => {
    const invalidReport = validateAppServiceStartupEnv({
      APP_SERVICE_PROVIDER_RETRY_MAX_ATTEMPTS: '0',
      APP_SERVICE_PROVIDER_RETRY_BASE_DELAY_MS: '-1',
      APP_SERVICE_PROVIDER_RETRY_MAX_DELAY_MS: '999999',
      APP_SERVICE_PROVIDER_CIRCUIT_FAILURE_THRESHOLD: '0',
      APP_SERVICE_PROVIDER_CIRCUIT_RESET_MS: '9999999',
      VERCEL_DEPLOY_REQUEST_TIMEOUT_MS: '999',
    })

    expect(invalidReport.ok).toBe(false)
    expect(invalidReport.issues.map((envIssue) => envIssue.variable)).toEqual(expect.arrayContaining([
      'APP_SERVICE_PROVIDER_RETRY_MAX_ATTEMPTS',
      'APP_SERVICE_PROVIDER_RETRY_BASE_DELAY_MS',
      'APP_SERVICE_PROVIDER_RETRY_MAX_DELAY_MS',
      'APP_SERVICE_PROVIDER_CIRCUIT_FAILURE_THRESHOLD',
      'APP_SERVICE_PROVIDER_CIRCUIT_RESET_MS',
      'VERCEL_DEPLOY_REQUEST_TIMEOUT_MS',
    ]))

    const validReport = validateAppServiceStartupEnv({
      APP_SERVICE_PROVIDER_RETRY_MAX_ATTEMPTS: '2',
      APP_SERVICE_PROVIDER_RETRY_BASE_DELAY_MS: '0',
      APP_SERVICE_PROVIDER_RETRY_MAX_DELAY_MS: '1000',
      APP_SERVICE_PROVIDER_CIRCUIT_FAILURE_THRESHOLD: '5',
      APP_SERVICE_PROVIDER_CIRCUIT_RESET_MS: '60000',
      VERCEL_DEPLOY_REQUEST_TIMEOUT_MS: '60000',
    })

    expect(validReport.ok).toBe(true)
  })

  it('throws a provider_unavailable error with redacted issue details', () => {
    expect(() => assertAppServiceStartupEnvReady({
      FEATURE_APP_V0_GENERATION: 'true',
    })).toThrowError(expect.objectContaining({
      code: 'provider_unavailable',
      status: 503,
    }))
  })
})
