import { describe, expect, it } from 'vitest'
import { AppServiceSpecSchema } from '@contracts/app-service'
import {
  APP_SERVICE_ANALYTICS_EVENTS,
  APP_SERVICE_BETA_DOC_PATHS,
  APP_SERVICE_BILLING_ENTITLEMENTS,
  APP_SERVICE_DOGFOOD_BLUEPRINTS,
  APP_SERVICE_POST_DEPLOY_ONBOARDING_CHECKLIST,
  APP_SERVICE_PUBLIC_CHANGELOG_ENTRY,
  APP_SERVICE_REQUIRED_BETA_ORG_COUNT,
  APP_SERVICE_TEMPLATE_PROOF_PAGES,
  AppServiceBetaFeedbackInputSchema,
  betaAllowlistCount,
  evaluateAppServiceEntitlement,
  evaluateAppServiceLaunchReadiness,
  isOrgAllowedForAppServiceBeta,
  isOrgBypassedForAppServiceBilling,
  parseAppServiceBillingMode,
  parseAppServiceCsv,
} from '../launch-readiness-core'

describe('app service launch readiness core', () => {
  it('ships five dogfood blueprints that satisfy the shared app service contract', () => {
    expect(APP_SERVICE_DOGFOOD_BLUEPRINTS).toHaveLength(5)
    expect(APP_SERVICE_DOGFOOD_BLUEPRINTS.map((blueprint) => blueprint.slug)).toEqual([
      'support-concierge',
      'sales-qualifier',
      'onboarding-copilot',
      'compliance-intake',
      'research-analyst',
    ])

    for (const blueprint of APP_SERVICE_DOGFOOD_BLUEPRINTS) {
      expect(() => AppServiceSpecSchema.parse(blueprint)).not.toThrow()
      expect(blueprint.deployment.runtime.agent_runtime_target).toBe('shared_worker')
      expect(blueprint.deployment.runtime.generation_runtime_target).toBe('shared_appgen_worker')
      expect(blueprint.deployment.allowed_targets).toContain('lucid_hosted')
      expect(blueprint.marketplace.proof_page_enabled).toBe(true)
    }
  })

  it('parses beta allowlists and requires ten orgs for enforce mode readiness', () => {
    const orgs = Array.from({ length: 10 }, (_, index) => `org-${index + 1}`)
    const env = {
      APP_SERVICE_BETA_ACCESS_MODE: 'enforce',
      APP_SERVICE_BETA_ORG_ALLOWLIST: orgs.join(','),
    }

    expect(parseAppServiceCsv(' one, two ,, three ')).toEqual(['one', 'two', 'three'])
    expect(betaAllowlistCount(env)).toBe(APP_SERVICE_REQUIRED_BETA_ORG_COUNT)
    expect(isOrgAllowedForAppServiceBeta('org-4', env)).toBe(true)
    expect(isOrgAllowedForAppServiceBeta('org-11', env)).toBe(false)
    expect(isOrgAllowedForAppServiceBeta('org-11', { APP_SERVICE_BETA_ACCESS_MODE: 'off' })).toBe(true)
  })

  it('defines production billing entitlements and evaluates plan decisions', () => {
    expect(APP_SERVICE_BILLING_ENTITLEMENTS.map((item) => item.action)).toEqual([
      'create_generation_run',
      'approve_preview',
      'launch_v0_frontend',
      'launch_vercel_deployment',
      'publish_public_app',
    ])
    expect(parseAppServiceBillingMode('meter')).toBe('meter')
    expect(parseAppServiceBillingMode('enforce')).toBe('enforce')
    expect(parseAppServiceBillingMode('unknown')).toBe('off')
    expect(isOrgBypassedForAppServiceBilling('org-a', { APP_SERVICE_BILLING_BYPASS_ORGS: 'org-b,org-a' })).toBe(true)

    expect(evaluateAppServiceEntitlement({
      action: 'launch_v0_frontend',
      plan: 'starter',
      current: 0,
    })).toMatchObject({ allowed: false, limit: 0 })
    expect(evaluateAppServiceEntitlement({
      action: 'launch_v0_frontend',
      plan: 'pro',
      current: 9,
    })).toMatchObject({ allowed: true, remaining: 0 })
    expect(evaluateAppServiceEntitlement({
      action: 'launch_v0_frontend',
      plan: 'pro',
      current: 10,
    })).toMatchObject({ allowed: false, remaining: 0 })
    expect(evaluateAppServiceEntitlement({
      action: 'publish_public_app',
      plan: 'business',
      current: 300,
    })).toMatchObject({ allowed: true, unlimited: true, remaining: null })
  })

  it('validates beta feedback payloads for in-product capture', () => {
    expect(AppServiceBetaFeedbackInputSchema.parse({
      category: 'v0_vercel_launch',
      sentiment: 'blocked',
      message: 'The Vercel preview did not expose the app runtime config.',
      source: 'operator_cockpit',
    })).toMatchObject({
      category: 'v0_vercel_launch',
      sentiment: 'blocked',
    })

    expect(() => AppServiceBetaFeedbackInputSchema.parse({
      category: 'other',
      message: '',
    })).toThrow()
  })

  it('evaluates the complete beta launch checklist', () => {
    const ready = evaluateAppServiceLaunchReadiness({
      dogfoodBlueprintCount: APP_SERVICE_DOGFOOD_BLUEPRINTS.length,
      betaAllowlistCount: APP_SERVICE_REQUIRED_BETA_ORG_COUNT,
      betaDocsPublished: true,
      changelogPublished: true,
      feedbackCaptureEnabled: true,
      killSwitchConfigured: true,
      billingEntitlementsConfigured: true,
      analyticsEventCount: APP_SERVICE_ANALYTICS_EVENTS.length,
      postDeployChecklistCount: APP_SERVICE_POST_DEPLOY_ONBOARDING_CHECKLIST.length,
      proofPageCount: APP_SERVICE_TEMPLATE_PROOF_PAGES.length,
    })

    expect(ready).toEqual({ ready: true, blockers: [], warnings: [] })
    expect(APP_SERVICE_BETA_DOC_PATHS).toContain('docs/superpowers/reference/app-service-beta-launch.md')
    expect(APP_SERVICE_PUBLIC_CHANGELOG_ENTRY).toBe('2026-04-29-app-service-foundry-beta')

    const blocked = evaluateAppServiceLaunchReadiness({
      dogfoodBlueprintCount: 4,
      betaAllowlistCount: 2,
      betaDocsPublished: false,
      changelogPublished: false,
      feedbackCaptureEnabled: false,
      killSwitchConfigured: false,
      billingEntitlementsConfigured: false,
      analyticsEventCount: 1,
      postDeployChecklistCount: 3,
      proofPageCount: 1,
    })

    expect(blocked.ready).toBe(false)
    expect(blocked.blockers).toEqual(expect.arrayContaining([
      'dogfood_blueprints_missing',
      'beta_allowlist_too_small',
      'beta_docs_missing',
      'public_changelog_missing',
      'feedback_capture_missing',
      'kill_switch_missing',
      'billing_entitlements_missing',
      'analytics_events_missing',
      'post_deploy_checklist_incomplete',
    ]))
    expect(blocked.warnings).toContain('template_proof_pages_incomplete')
  })
})
