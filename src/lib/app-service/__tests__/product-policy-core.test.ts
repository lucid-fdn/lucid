import { describe, expect, it } from 'vitest'
import {
  APP_SERVICE_DEFAULT_PUBLIC_VISIBILITY,
  APP_SERVICE_DEFAULT_TRANSCRIPT_RETENTION_DAYS,
  APP_SERVICE_EXTERNAL_DEPLOY_REQUIRES_USER_APPROVAL,
  APP_SERVICE_FINAL_PRODUCT_POLICY_DECISIONS,
  appServiceGeneratedAppUrlForSlug,
  appServiceVisitorSessionExpiresAt,
  assertExternalDeploymentPolicy,
  resolveMarketplaceBlueprintStatus,
  summarizeAppServiceProductPolicy,
} from '../product-policy-core'

describe('product policy core', () => {
  it('captures the final phase 11 product decisions as executable defaults', () => {
    const summary = summarizeAppServiceProductPolicy()

    expect(APP_SERVICE_FINAL_PRODUCT_POLICY_DECISIONS.map((decision) => decision.id)).toEqual([
      'generated_app_url',
      'anonymous_sessions',
      'lead_destination',
      'beta_publishing_review',
      'white_label_plan',
      'custom_domain_phase_7',
      'self_host_storage',
      'transcript_retention',
      'public_visibility_default',
      'external_deploy_approval',
      'first_external_deploy_target',
      'first_sandbox_provider',
      'first_frontend_generation_provider',
      'user_visible_launch_path',
      'marketplace_review',
      'external_deploy_secret_storage',
    ])
    expect(summary).toMatchObject({
      generatedAppRoutePattern: '/apps/[slug]',
      defaultPublicVisibility: 'unlisted',
      defaultTranscriptRetentionDays: 30,
      leadDefaultDestination: 'lucid_inbox',
      customDomainMinPlan: 'business_plus',
      customDomainPhase: 'phase_7_enterprise',
      customDomainProviderFlow: 'vercel_domain_alias_after_dns_verification',
      externalDeployRequiresUserApproval: true,
      firstExternalDeployTarget: 'vercel',
      firstFrontendGenerationProvider: 'v0',
      firstSandboxProvider: 'vercel_sandbox',
      marketplaceCommunityStatus: 'pending_review',
    })
    expect(APP_SERVICE_DEFAULT_PUBLIC_VISIBILITY).toBe('unlisted')
    expect(APP_SERVICE_DEFAULT_TRANSCRIPT_RETENTION_DAYS).toBe(30)
    expect(APP_SERVICE_EXTERNAL_DEPLOY_REQUIRES_USER_APPROVAL).toBe(true)
  })

  it('derives public URLs and anonymous session expiry from policy', () => {
    const now = new Date('2026-04-30T12:00:00.000Z')

    expect(appServiceGeneratedAppUrlForSlug('support-concierge')).toBe('/apps/support-concierge')
    expect(appServiceVisitorSessionExpiresAt(now)).toBe('2026-05-30T12:00:00.000Z')
  })

  it('fails external deploy policy without explicit approval', () => {
    expect(() => assertExternalDeploymentPolicy({
      target: 'vercel',
      provider: 'vercel',
      userApproved: false,
    })).toThrow('explicit operator approval')

    expect(() => assertExternalDeploymentPolicy({
      target: 'vercel',
      provider: 'vercel',
      userApproved: true,
    })).not.toThrow()
  })

  it('forces community marketplace blueprints through review', () => {
    expect(resolveMarketplaceBlueprintStatus({
      source: 'community',
      requestedStatus: 'approved',
    })).toBe('pending_review')
    expect(resolveMarketplaceBlueprintStatus({
      source: 'platform',
      requestedStatus: 'approved',
    })).toBe('approved')
  })
})
