import { AppServiceError } from './errors'
import {
  APP_SERVICE_REQUIRED_BETA_ORG_COUNT,
  betaAllowlistCount,
  isValidAppServiceBetaAccessMode,
  isValidAppServiceBillingMode,
  parseAppServiceBetaAccessMode,
} from './launch-readiness-core'

export type AppServiceEnvSeverity = 'error' | 'warning'

export interface AppServiceEnvIssue {
  severity: AppServiceEnvSeverity
  code: string
  variable: string
  message: string
}

export interface AppServiceStartupEnvReport {
  ok: boolean
  enabledSurfaces: {
    foundry: boolean
    runtimeApi: boolean
    publicApps: boolean
    v0: boolean
    vercel: boolean
  }
  providerModes: {
    appService: 'mock' | 'live'
    v0: 'mock' | 'live'
    vercel: 'mock' | 'live'
    sandbox: 'mock' | 'live'
  }
  killSwitchActive: boolean
  issues: AppServiceEnvIssue[]
}

type EnvSource = Record<string, string | undefined>

const BOOLEAN_ENV_KEYS = [
  'FEATURE_APP_SERVICE_FOUNDRY',
  'FEATURE_APP_RUNTIME_API',
  'FEATURE_APP_PUBLIC_APPS',
  'FEATURE_APP_V0_GENERATION',
  'FEATURE_APP_VERCEL_DEPLOY',
  'APP_SERVICE_KILL_SWITCH',
] as const

const MODE_ENV_KEYS = [
  'APP_SERVICE_PROVIDER_MODE',
  'APP_SERVICE_V0_PROVIDER_MODE',
  'APP_SERVICE_VERCEL_PROVIDER_MODE',
  'APP_SERVICE_SANDBOX_MODE',
] as const

const LAUNCH_MODE_ENV_KEYS = [
  'APP_SERVICE_BETA_ACCESS_MODE',
  'APP_SERVICE_BILLING_MODE',
] as const

function envBoolean(env: EnvSource, key: string): boolean {
  return env[key]?.trim() === 'true'
}

function readMode(env: EnvSource, key: string, defaultMode: 'mock' | 'live'): 'mock' | 'live' {
  return env[key]?.trim() === 'mock' ? 'mock' : defaultMode
}

function isMockMode(env: EnvSource, providerKey?: 'APP_SERVICE_V0_PROVIDER_MODE' | 'APP_SERVICE_VERCEL_PROVIDER_MODE' | 'APP_SERVICE_SANDBOX_MODE') {
  return env.APP_SERVICE_PROVIDER_MODE?.trim() === 'mock' || (providerKey ? env[providerKey]?.trim() === 'mock' : false)
}

function issue(
  severity: AppServiceEnvSeverity,
  code: string,
  variable: string,
  message: string,
): AppServiceEnvIssue {
  return { severity, code, variable, message }
}

function requireOneOf(env: EnvSource, keys: string[], message: string): AppServiceEnvIssue | null {
  if (keys.some((key) => Boolean(env[key]?.trim()))) return null
  return issue('error', 'missing_required_env', keys.join('|'), message)
}

function requireEnv(env: EnvSource, key: string, message: string): AppServiceEnvIssue | null {
  if (env[key]?.trim()) return null
  return issue('error', 'missing_required_env', key, message)
}

function validateBooleanEnv(env: EnvSource, key: string): AppServiceEnvIssue | null {
  const value = env[key]?.trim()
  if (!value || value === 'true' || value === 'false') return null
  return issue('error', 'invalid_boolean_env', key, `${key} must be "true" or "false".`)
}

function validateModeEnv(env: EnvSource, key: string): AppServiceEnvIssue | null {
  const value = env[key]?.trim()
  if (!value || value === 'mock' || value === 'live') return null
  return issue('error', 'invalid_provider_mode', key, `${key} must be "mock" or "live".`)
}

function validateLaunchModeEnv(env: EnvSource, key: typeof LAUNCH_MODE_ENV_KEYS[number]): AppServiceEnvIssue | null {
  const value = env[key]?.trim()
  if (!value) return null
  if (key === 'APP_SERVICE_BETA_ACCESS_MODE' && isValidAppServiceBetaAccessMode(value)) return null
  if (key === 'APP_SERVICE_BILLING_MODE' && isValidAppServiceBillingMode(value)) return null

  const allowed = key === 'APP_SERVICE_BETA_ACCESS_MODE'
    ? 'off or enforce'
    : 'off, meter, or enforce'
  return issue('error', 'invalid_launch_mode', key, `${key} must be ${allowed}.`)
}

function validateIntegerEnv(
  env: EnvSource,
  key: string,
  options: { min: number; max?: number },
): AppServiceEnvIssue | null {
  const value = env[key]?.trim()
  if (!value) return null

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || String(parsed) !== value || parsed < options.min || (options.max && parsed > options.max)) {
    const range = options.max ? `${options.min}-${options.max}` : `>= ${options.min}`
    return issue('error', 'invalid_integer_env', key, `${key} must be an integer ${range}.`)
  }

  return null
}

function validateUrlEnv(env: EnvSource, key: string): AppServiceEnvIssue | null {
  const value = env[key]?.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return null
  } catch {
    // handled below
  }

  return issue('error', 'invalid_url_env', key, `${key} must be a valid http(s) URL.`)
}

function validateCommaListEnv(env: EnvSource, key: string): AppServiceEnvIssue | null {
  const value = env[key]?.trim()
  if (!value) return null
  const entries = value.split(',').map((entry) => entry.trim())
  if (entries.every(Boolean)) return null
  return issue('warning', 'empty_list_entry', key, `${key} contains an empty comma-separated entry.`)
}

function sandboxCanUseImplicitVercelOidc(env: EnvSource): boolean {
  return env.VERCEL === '1' || Boolean(env.VERCEL_ENV?.trim())
}

export function validateAppServiceStartupEnv(env: EnvSource = process.env): AppServiceStartupEnvReport {
  const issues: AppServiceEnvIssue[] = []
  const killSwitchActive = envBoolean(env, 'APP_SERVICE_KILL_SWITCH')
  const enabledSurfaces = {
    foundry: envBoolean(env, 'FEATURE_APP_SERVICE_FOUNDRY'),
    runtimeApi: envBoolean(env, 'FEATURE_APP_RUNTIME_API'),
    publicApps: envBoolean(env, 'FEATURE_APP_PUBLIC_APPS'),
    v0: envBoolean(env, 'FEATURE_APP_V0_GENERATION'),
    vercel: envBoolean(env, 'FEATURE_APP_VERCEL_DEPLOY'),
  }

  const providerModes = {
    appService: readMode(env, 'APP_SERVICE_PROVIDER_MODE', 'live'),
    v0: isMockMode(env, 'APP_SERVICE_V0_PROVIDER_MODE') ? 'mock' as const : 'live' as const,
    vercel: isMockMode(env, 'APP_SERVICE_VERCEL_PROVIDER_MODE') ? 'mock' as const : 'live' as const,
    sandbox: isMockMode(env, 'APP_SERVICE_SANDBOX_MODE') ? 'mock' as const : 'live' as const,
  }

  for (const key of BOOLEAN_ENV_KEYS) {
    const booleanIssue = validateBooleanEnv(env, key)
    if (booleanIssue) issues.push(booleanIssue)
  }

  for (const key of MODE_ENV_KEYS) {
    const modeIssue = validateModeEnv(env, key)
    if (modeIssue) issues.push(modeIssue)
  }

  for (const key of LAUNCH_MODE_ENV_KEYS) {
    const launchModeIssue = validateLaunchModeEnv(env, key)
    if (launchModeIssue) issues.push(launchModeIssue)
  }

  for (const integerIssue of [
    validateIntegerEnv(env, 'APP_SERVICE_GENERATION_POLL_INTERVAL_MS', { min: 5_000, max: 3_600_000 }),
    validateIntegerEnv(env, 'APP_SERVICE_GENERATION_BATCH_SIZE', { min: 1, max: 20 }),
    validateIntegerEnv(env, 'V0_REQUEST_TIMEOUT_MS', { min: 1_000, max: 120_000 }),
    validateIntegerEnv(env, 'VERCEL_REQUEST_TIMEOUT_MS', { min: 1_000, max: 120_000 }),
    validateIntegerEnv(env, 'VERCEL_DEPLOY_REQUEST_TIMEOUT_MS', { min: 1_000, max: 120_000 }),
    validateIntegerEnv(env, 'APP_SERVICE_PROVIDER_RETRY_MAX_ATTEMPTS', { min: 1, max: 5 }),
    validateIntegerEnv(env, 'APP_SERVICE_PROVIDER_RETRY_BASE_DELAY_MS', { min: 0, max: 30_000 }),
    validateIntegerEnv(env, 'APP_SERVICE_PROVIDER_RETRY_MAX_DELAY_MS', { min: 0, max: 60_000 }),
    validateIntegerEnv(env, 'APP_SERVICE_PROVIDER_CIRCUIT_FAILURE_THRESHOLD', { min: 1, max: 100 }),
    validateIntegerEnv(env, 'APP_SERVICE_PROVIDER_CIRCUIT_RESET_MS', { min: 1_000, max: 3_600_000 }),
    validateIntegerEnv(env, 'APP_SERVICE_SANDBOX_TIMEOUT_MS', { min: 30_000, max: 900_000 }),
    validateIntegerEnv(env, 'APP_SERVICE_MAX_GENERATED_SOURCE_BYTES', { min: 1_024, max: 20_971_520 }),
    validateIntegerEnv(env, 'APP_SERVICE_PUBLIC_RATE_LIMIT_WINDOW_MS', { min: 1_000, max: 3_600_000 }),
    validateIntegerEnv(env, 'APP_SERVICE_PUBLIC_APP_RATE_LIMIT', { min: 1, max: 1_000_000 }),
    validateIntegerEnv(env, 'APP_SERVICE_PUBLIC_ORG_RATE_LIMIT', { min: 1, max: 5_000_000 }),
    validateIntegerEnv(env, 'APP_SERVICE_PUBLIC_IP_RATE_LIMIT', { min: 1, max: 100_000 }),
    validateIntegerEnv(env, 'APP_SERVICE_PUBLIC_SESSION_RATE_LIMIT', { min: 1, max: 100_000 }),
  ]) {
    if (integerIssue) issues.push(integerIssue)
  }

  for (const urlIssue of [
    validateUrlEnv(env, 'APP_SERVICE_CONTROL_PLANE_URL'),
    validateUrlEnv(env, 'V0_API_URL'),
    validateUrlEnv(env, 'VERCEL_API_BASE_URL'),
  ]) {
    if (urlIssue) issues.push(urlIssue)
  }

  for (const listIssue of [
    validateCommaListEnv(env, 'APP_SERVICE_ALLOWED_GENERATED_DEPENDENCIES'),
    validateCommaListEnv(env, 'APP_SERVICE_ALLOWED_FRONTEND_HOSTS'),
    validateCommaListEnv(env, 'APP_SERVICE_SANDBOX_BUILD_NETWORK_POLICY'),
    validateCommaListEnv(env, 'APP_SERVICE_TURNSTILE_REQUIRED_KINDS'),
    validateCommaListEnv(env, 'APP_SERVICE_BETA_ORG_ALLOWLIST'),
    validateCommaListEnv(env, 'APP_SERVICE_BILLING_BYPASS_ORGS'),
  ]) {
    if (listIssue) issues.push(listIssue)
  }

  if (
    !killSwitchActive
    && enabledSurfaces.foundry
    && parseAppServiceBetaAccessMode(env.APP_SERVICE_BETA_ACCESS_MODE) === 'enforce'
    && betaAllowlistCount(env) < APP_SERVICE_REQUIRED_BETA_ORG_COUNT
  ) {
    issues.push(issue(
      'error',
      'beta_allowlist_too_small',
      'APP_SERVICE_BETA_ORG_ALLOWLIST',
      `Set at least ${APP_SERVICE_REQUIRED_BETA_ORG_COUNT} beta org ids before enforcing App Service beta access.`,
    ))
  }

  if (!killSwitchActive && enabledSurfaces.foundry) {
    const secretIssue = requireOneOf(
      env,
      ['APP_SERVICE_INTERNAL_SECRET', 'CRON_SECRET'],
      'App generation processors require APP_SERVICE_INTERNAL_SECRET or CRON_SECRET when App Service Foundry is enabled.',
    )
    if (secretIssue) issues.push(secretIssue)
  }

  if (!killSwitchActive && enabledSurfaces.foundry && env.APP_SERVICE_CONTROL_PLANE_URL?.trim() === '') {
    issues.push(issue(
      'warning',
      'empty_control_plane_url',
      'APP_SERVICE_CONTROL_PLANE_URL',
      'Set APP_SERVICE_CONTROL_PLANE_URL on the shared worker when cron processing is enabled.',
    ))
  }

  if (
    !killSwitchActive
    && (enabledSurfaces.runtimeApi || enabledSurfaces.publicApps)
    && !env.APP_SERVICE_PUBLIC_TOKEN_PEPPER?.trim()
    && !env.APP_SERVICE_INTERNAL_SECRET?.trim()
  ) {
    issues.push(issue(
      'warning',
      'missing_public_token_pepper',
      'APP_SERVICE_PUBLIC_TOKEN_PEPPER',
      'Set APP_SERVICE_PUBLIC_TOKEN_PEPPER to keep generated-app public token hashes stable across internal secret rotations.',
    ))
  }

  if (
    !killSwitchActive
    && (enabledSurfaces.runtimeApi || enabledSurfaces.publicApps)
    && env.APP_SERVICE_TURNSTILE_REQUIRED_KINDS?.trim()
    && !env.APP_SERVICE_TURNSTILE_SECRET_KEY?.trim()
  ) {
    issues.push(issue(
      'error',
      'missing_turnstile_secret',
      'APP_SERVICE_TURNSTILE_SECRET_KEY',
      'Set APP_SERVICE_TURNSTILE_SECRET_KEY when APP_SERVICE_TURNSTILE_REQUIRED_KINDS requires human verification.',
    ))
  }

  if (!killSwitchActive && enabledSurfaces.v0 && providerModes.v0 === 'live') {
    const v0Issue = requireEnv(env, 'V0_API_KEY', 'Live v0 generation requires V0_API_KEY.')
    if (v0Issue) issues.push(v0Issue)
  }

  if (!killSwitchActive && enabledSurfaces.vercel && providerModes.vercel === 'live') {
    const vercelIssue = requireOneOf(
      env,
      ['VERCEL_API_TOKEN', 'VERCEL_TOKEN'],
      'Live Vercel deployment requires VERCEL_API_TOKEN or VERCEL_TOKEN.',
    )
    if (vercelIssue) issues.push(vercelIssue)
  }

  if (!killSwitchActive && enabledSurfaces.v0 && providerModes.sandbox === 'live') {
    if (!sandboxCanUseImplicitVercelOidc(env) && !env.VERCEL_OIDC_TOKEN?.trim()) {
      issues.push(issue(
        'error',
        'missing_sandbox_oidc',
        'VERCEL_OIDC_TOKEN',
        'Live generated-code sandbox validation requires VERCEL_OIDC_TOKEN locally or Vercel runtime OIDC in deployment.',
      ))
    }

    if (env.APP_SERVICE_SANDBOX_NETWORK_POLICY?.trim() === 'allow-all') {
      issues.push(issue(
        'warning',
        'sandbox_network_policy_open',
        'APP_SERVICE_SANDBOX_NETWORK_POLICY',
        'Generated-code sandbox network policy should stay deny-all unless a specific allowlist is required.',
      ))
    }
  }

  const errors = issues.filter((envIssue) => envIssue.severity === 'error')

  return {
    ok: errors.length === 0,
    enabledSurfaces,
    providerModes,
    killSwitchActive,
    issues,
  }
}

export function assertAppServiceStartupEnvReady(env: EnvSource = process.env): void {
  const report = validateAppServiceStartupEnv(env)
  if (report.ok) return

  throw new AppServiceError(
    'provider_unavailable',
    'App Service Foundry startup environment is not ready.',
    503,
    {
      retryable: true,
      details: {
        issues: report.issues.filter((envIssue) => envIssue.severity === 'error'),
      },
    },
  )
}
