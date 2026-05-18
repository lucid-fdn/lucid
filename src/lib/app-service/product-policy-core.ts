import type { AppDeploymentTarget } from '@contracts/app-service'

export type AppServiceVisibilityDefault = 'unlisted'
export type AppServiceExternalDeployProvider = 'vercel'
export type AppServiceFrontendGenerationProvider = 'v0'
export type AppServiceSandboxProvider = 'vercel_sandbox'
export type AppServiceSecretStorageSource = 'server_env' | 'encrypted_secret_store'

export type AppServiceProductPolicyDecisionId =
  | 'generated_app_url'
  | 'anonymous_sessions'
  | 'lead_destination'
  | 'beta_publishing_review'
  | 'white_label_plan'
  | 'custom_domain_phase_7'
  | 'self_host_storage'
  | 'transcript_retention'
  | 'public_visibility_default'
  | 'external_deploy_approval'
  | 'first_external_deploy_target'
  | 'first_sandbox_provider'
  | 'first_frontend_generation_provider'
  | 'user_visible_launch_path'
  | 'marketplace_review'
  | 'external_deploy_secret_storage'

export interface AppServiceProductPolicyDecision {
  id: AppServiceProductPolicyDecisionId
  decision: string
  enforcement: string
  ownerSurface: 'runtime' | 'generation' | 'marketplace' | 'billing' | 'devops' | 'security'
}

export const APP_SERVICE_GENERATED_APP_ROUTE_PATTERN = '/apps/[slug]' as const
export const APP_SERVICE_DEFAULT_PUBLIC_VISIBILITY: AppServiceVisibilityDefault = 'unlisted'
export const APP_SERVICE_DEFAULT_TRANSCRIPT_RETENTION_DAYS = 30
export const APP_SERVICE_ANONYMOUS_SESSION_TTL_DAYS = 30
export const APP_SERVICE_LEAD_DEFAULT_DESTINATION = 'lucid_inbox' as const
export const APP_SERVICE_WHITE_LABEL_MIN_PLAN = 'business_plus' as const
export const APP_SERVICE_CUSTOM_DOMAIN_MIN_PLAN = 'business_plus' as const
export const APP_SERVICE_CUSTOM_DOMAIN_PHASE = 'phase_7_enterprise' as const
export const APP_SERVICE_CUSTOM_DOMAIN_PROVIDER_FLOW = 'vercel_domain_alias_after_dns_verification' as const
export const APP_SERVICE_SELF_HOST_OBJECT_STORAGE = 's3_compatible_object_storage' as const
export const APP_SERVICE_EXTERNAL_DEPLOY_DEFAULT_ENABLED = false
export const APP_SERVICE_EXTERNAL_DEPLOY_REQUIRES_USER_APPROVAL = true
export const APP_SERVICE_FIRST_EXTERNAL_DEPLOY_TARGET: AppServiceExternalDeployProvider = 'vercel'
export const APP_SERVICE_FIRST_FRONTEND_GENERATION_PROVIDER: AppServiceFrontendGenerationProvider = 'v0'
export const APP_SERVICE_FIRST_SANDBOX_PROVIDER: AppServiceSandboxProvider = 'vercel_sandbox'
export const APP_SERVICE_MARKETPLACE_COMMUNITY_STATUS = 'pending_review' as const
export const APP_SERVICE_ALLOWED_DEPLOY_SECRET_SOURCES: readonly AppServiceSecretStorageSource[] = [
  'server_env',
  'encrypted_secret_store',
] as const

export const APP_SERVICE_FINAL_PRODUCT_POLICY_DECISIONS = [
  {
    id: 'generated_app_url',
    decision: `Generated app URLs live under ${APP_SERVICE_GENERATED_APP_ROUTE_PATTERN}.`,
    enforcement: 'Lucid-hosted previews and public shells derive URLs from the deployment slug.',
    ownerSurface: 'runtime',
  },
  {
    id: 'anonymous_sessions',
    decision: 'Anonymous visitor sessions are required for public rate limiting and abuse controls.',
    enforcement: `Visitor sessions expire after ${APP_SERVICE_ANONYMOUS_SESSION_TTL_DAYS} days and participate in public runtime accounting.`,
    ownerSurface: 'runtime',
  },
  {
    id: 'lead_destination',
    decision: 'Leads land in the Lucid inbox by default; CRM delivery is optional setup.',
    enforcement: 'Public lead submissions are recorded as App Service events before optional integration handoff.',
    ownerSurface: 'runtime',
  },
  {
    id: 'beta_publishing_review',
    decision: 'Public publishing requires human preview approval during beta.',
    enforcement: 'Preview approval is an authenticated, CSRF-protected, metered operator action.',
    ownerSurface: 'generation',
  },
  {
    id: 'white_label_plan',
    decision: 'White-label generated apps require Business+.',
    enforcement: 'Billing entitlements remain the source of truth before provider spend or public launch.',
    ownerSurface: 'billing',
  },
  {
    id: 'custom_domain_phase_7',
    decision: 'Custom domains are a Phase 7 Enterprise/Business+ capability with the Lucid `/apps/[slug]` URL kept as the canonical fallback.',
    enforcement: 'Domains must pass DNS ownership verification, origin allowlisting, WAF/rate-limit coverage, and deployment-readiness checks before traffic is promoted.',
    ownerSurface: 'devops',
  },
  {
    id: 'self_host_storage',
    decision: 'Self-host exports use S3-compatible object storage.',
    enforcement: 'Artifact retention policy assumes object storage for source archives, screenshots, logs, and receipts.',
    ownerSurface: 'devops',
  },
  {
    id: 'transcript_retention',
    decision: `Anonymous public chat transcript retention defaults to ${APP_SERVICE_DEFAULT_TRANSCRIPT_RETENTION_DAYS} days unless an org policy overrides it.`,
    enforcement: 'Compiler and manifest sanitizers emit a retention value into public app consent metadata.',
    ownerSurface: 'runtime',
  },
  {
    id: 'public_visibility_default',
    decision: `Generated public visibility defaults to ${APP_SERVICE_DEFAULT_PUBLIC_VISIBILITY}.`,
    enforcement: 'Preview deployment creation uses the policy default unless the operator explicitly chooses private or public.',
    ownerSurface: 'generation',
  },
  {
    id: 'external_deploy_approval',
    decision: 'External deployment is disabled by default until the operator explicitly approves it.',
    enforcement: 'The Vercel launch route requires an explicit externalDeploymentApproval payload.',
    ownerSurface: 'generation',
  },
  {
    id: 'first_external_deploy_target',
    decision: 'The first external deploy target is Vercel.',
    enforcement: 'External deploy launch validates the target before provider calls.',
    ownerSurface: 'devops',
  },
  {
    id: 'first_sandbox_provider',
    decision: 'The first generated-code sandbox provider is Vercel Sandbox behind a provider interface.',
    enforcement: 'Sandbox mode is selected through provider adapters and feature flags.',
    ownerSurface: 'devops',
  },
  {
    id: 'first_frontend_generation_provider',
    decision: 'The first frontend generation provider is v0 behind a provider interface.',
    enforcement: 'v0 receives a provider-safe brief and the public SDK contract only.',
    ownerSurface: 'generation',
  },
  {
    id: 'user_visible_launch_path',
    decision: 'Users see the Lucid preview first, then v0 and Vercel URLs only when generated-code launch is enabled.',
    enforcement: 'Operator visibility exposes Lucid preview, provider web URL, and external deployment URL separately.',
    ownerSurface: 'runtime',
  },
  {
    id: 'marketplace_review',
    decision: 'Community marketplace app blueprints require review until eval and outcome data are mature.',
    enforcement: `Community blueprint submissions are forced to ${APP_SERVICE_MARKETPLACE_COMMUNITY_STATUS}.`,
    ownerSurface: 'marketplace',
  },
  {
    id: 'external_deploy_secret_storage',
    decision: 'External deploy tokens live only in server environment variables or an encrypted secret store.',
    enforcement: 'Provider adapters read deploy credentials server-side and secret requirement APIs reject plaintext secret payloads.',
    ownerSurface: 'security',
  },
] as const satisfies readonly AppServiceProductPolicyDecision[]

export function appServiceGeneratedAppUrlForSlug(slug: string): string {
  return `/apps/${slug}`
}

export function resolveDefaultAppVisibility(
  requested?: 'private' | 'unlisted' | 'public',
): 'private' | 'unlisted' | 'public' {
  return requested ?? APP_SERVICE_DEFAULT_PUBLIC_VISIBILITY
}

export function appServiceVisitorSessionExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + APP_SERVICE_ANONYMOUS_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export function assertExternalDeploymentPolicy(input: {
  target: AppDeploymentTarget
  provider: AppServiceExternalDeployProvider
  userApproved: boolean
}): void {
  if (input.target !== APP_SERVICE_FIRST_EXTERNAL_DEPLOY_TARGET) {
    throw new Error(`External deploy target ${input.target} is not enabled.`)
  }

  if (input.provider !== APP_SERVICE_FIRST_EXTERNAL_DEPLOY_TARGET) {
    throw new Error(`External deploy provider ${input.provider} is not enabled.`)
  }

  if (APP_SERVICE_EXTERNAL_DEPLOY_REQUIRES_USER_APPROVAL && !input.userApproved) {
    throw new Error('External deployment requires explicit operator approval.')
  }
}

export function resolveMarketplaceBlueprintStatus(input: {
  source: 'platform' | 'community' | 'org'
  requestedStatus: 'draft' | 'pending_review' | 'approved' | 'deprecated'
}): 'draft' | 'pending_review' | 'approved' | 'deprecated' {
  if (input.source === 'community' && input.requestedStatus === 'approved') {
    return APP_SERVICE_MARKETPLACE_COMMUNITY_STATUS
  }
  return input.requestedStatus
}

export function summarizeAppServiceProductPolicy() {
  return {
    generatedAppRoutePattern: APP_SERVICE_GENERATED_APP_ROUTE_PATTERN,
    defaultPublicVisibility: APP_SERVICE_DEFAULT_PUBLIC_VISIBILITY,
    defaultTranscriptRetentionDays: APP_SERVICE_DEFAULT_TRANSCRIPT_RETENTION_DAYS,
    anonymousSessionTtlDays: APP_SERVICE_ANONYMOUS_SESSION_TTL_DAYS,
    leadDefaultDestination: APP_SERVICE_LEAD_DEFAULT_DESTINATION,
    whiteLabelMinPlan: APP_SERVICE_WHITE_LABEL_MIN_PLAN,
    customDomainMinPlan: APP_SERVICE_CUSTOM_DOMAIN_MIN_PLAN,
    customDomainPhase: APP_SERVICE_CUSTOM_DOMAIN_PHASE,
    customDomainProviderFlow: APP_SERVICE_CUSTOM_DOMAIN_PROVIDER_FLOW,
    selfHostObjectStorage: APP_SERVICE_SELF_HOST_OBJECT_STORAGE,
    externalDeployDefaultEnabled: APP_SERVICE_EXTERNAL_DEPLOY_DEFAULT_ENABLED,
    externalDeployRequiresUserApproval: APP_SERVICE_EXTERNAL_DEPLOY_REQUIRES_USER_APPROVAL,
    firstExternalDeployTarget: APP_SERVICE_FIRST_EXTERNAL_DEPLOY_TARGET,
    firstFrontendGenerationProvider: APP_SERVICE_FIRST_FRONTEND_GENERATION_PROVIDER,
    firstSandboxProvider: APP_SERVICE_FIRST_SANDBOX_PROVIDER,
    marketplaceCommunityStatus: APP_SERVICE_MARKETPLACE_COMMUNITY_STATUS,
    allowedDeploySecretSources: [...APP_SERVICE_ALLOWED_DEPLOY_SECRET_SOURCES],
    decisionIds: APP_SERVICE_FINAL_PRODUCT_POLICY_DECISIONS.map((decision) => decision.id),
    decisionCount: APP_SERVICE_FINAL_PRODUCT_POLICY_DECISIONS.length,
  }
}
