type RuntimeEnv = Partial<Pick<
  NodeJS.ProcessEnv,
  'CI' | 'E2E_AUTH_BYPASS_SECRET' | 'E2E_DISABLE_AI_GENERATION_RATE_LIMITS' | 'E2E_LOCAL_PRODUCTION_HARNESS' | 'NODE_ENV' | 'VERCEL_ENV'
>>

export function isVercelPreviewEnv(env: RuntimeEnv = process.env): boolean {
  return env.VERCEL_ENV === 'preview'
}

export function isNonProductionEnv(env: RuntimeEnv = process.env): boolean {
  return env.NODE_ENV !== 'production'
}

export function allowsLocalProductionE2EHarness(env: RuntimeEnv = process.env): boolean {
  return env.NODE_ENV === 'production' &&
    env.VERCEL_ENV !== 'production' &&
    env.E2E_LOCAL_PRODUCTION_HARNESS === 'true' &&
    Boolean(env.E2E_AUTH_BYPASS_SECRET?.trim())
}

export function allowsE2ERouteHarness(env: RuntimeEnv = process.env): boolean {
  return isNonProductionEnv(env) || isVercelPreviewEnv(env) || allowsLocalProductionE2EHarness(env)
}

export function allowsE2EMockResponses(env: RuntimeEnv = process.env): boolean {
  return allowsE2ERouteHarness(env) && env.CI !== 'true'
}

export function allowsPreviewAIGenerationRateLimitBypass(env: RuntimeEnv = process.env): boolean {
  return (isVercelPreviewEnv(env) || allowsLocalProductionE2EHarness(env)) &&
    env.E2E_DISABLE_AI_GENERATION_RATE_LIMITS === 'true'
}

export function allowsPreviewE2ERateLimitBypass(env: RuntimeEnv = process.env): boolean {
  return allowsPreviewAIGenerationRateLimitBypass(env)
}
