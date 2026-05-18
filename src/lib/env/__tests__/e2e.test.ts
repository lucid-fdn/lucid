import { describe, expect, it } from 'vitest'

import {
  allowsE2EMockResponses,
  allowsE2ERouteHarness,
  allowsLocalProductionE2EHarness,
  allowsPreviewAIGenerationRateLimitBypass,
  allowsPreviewE2ERateLimitBypass,
  isNonProductionEnv,
  isVercelPreviewEnv,
} from '../e2e'

describe('E2E environment helpers', () => {
  it('treats Vercel preview as an explicit E2E-capable route harness', () => {
    const env = { NODE_ENV: 'production', VERCEL_ENV: 'preview' }

    expect(isVercelPreviewEnv(env)).toBe(true)
    expect(isNonProductionEnv(env)).toBe(false)
    expect(allowsE2ERouteHarness(env)).toBe(true)
  })

  it('keeps production routes closed outside preview', () => {
    const env = { NODE_ENV: 'production', VERCEL_ENV: 'production' }

    expect(allowsE2ERouteHarness(env)).toBe(false)
    expect(allowsE2EMockResponses(env)).toBe(false)
    expect(allowsPreviewAIGenerationRateLimitBypass(env)).toBe(false)
  })

  it('allows an explicit local production harness without opening real production', () => {
    const env = {
      E2E_AUTH_BYPASS_SECRET: 'test-secret',
      E2E_DISABLE_AI_GENERATION_RATE_LIMITS: 'true',
      E2E_LOCAL_PRODUCTION_HARNESS: 'true',
      NODE_ENV: 'production',
      VERCEL_ENV: undefined,
    }

    expect(allowsLocalProductionE2EHarness(env)).toBe(true)
    expect(allowsE2ERouteHarness(env)).toBe(true)
    expect(allowsE2EMockResponses(env)).toBe(true)
    expect(allowsPreviewAIGenerationRateLimitBypass(env)).toBe(true)

    expect(allowsLocalProductionE2EHarness({ ...env, VERCEL_ENV: 'production' })).toBe(false)
    expect(allowsLocalProductionE2EHarness({ ...env, E2E_AUTH_BYPASS_SECRET: '' })).toBe(false)
  })

  it('blocks mock responses in CI even when the route harness is available', () => {
    expect(allowsE2EMockResponses({
      CI: 'true',
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
    })).toBe(false)
  })

  it('requires an explicit preview flag for the AI generation rate-limit bypass', () => {
    expect(allowsPreviewAIGenerationRateLimitBypass({
      E2E_DISABLE_AI_GENERATION_RATE_LIMITS: 'true',
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
    })).toBe(true)
    expect(allowsPreviewAIGenerationRateLimitBypass({
      E2E_DISABLE_AI_GENERATION_RATE_LIMITS: 'true',
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
    })).toBe(false)
  })

  it('shares the explicit preview flag for route-level E2E rate-limit bypasses', () => {
    expect(allowsPreviewE2ERateLimitBypass({
      E2E_DISABLE_AI_GENERATION_RATE_LIMITS: 'true',
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
    })).toBe(true)
    expect(allowsPreviewE2ERateLimitBypass({
      E2E_DISABLE_AI_GENERATION_RATE_LIMITS: 'true',
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
    })).toBe(false)
  })
})
