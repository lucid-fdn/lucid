import {
  BrowserOperatorProxyPolicySchema,
  type BrowserOperatorProxyPolicy,
  type BrowserOperatorProviderKind,
} from '@contracts/browser-operator'
import type { BrowserOperatorTaskClass } from './provider-routing'

export type BrowserOperatorProxyPolicyDecision = {
  allowed: boolean
  fallbackEligible: boolean
  checkoutAllowed: boolean
  sessionAffinityRequired: boolean
  maxRetries: number
  auditLevel: 'summary' | 'full'
  reason: string
}

export const DEFAULT_BROWSER_OPERATOR_PROXY_POLICY: BrowserOperatorProxyPolicy = {
  mode: 'read_only_only',
  allowed_providers: [],
  allowed_countries: [],
  allow_residential: false,
  allow_datacenter: true,
  allow_byo_proxy: false,
  checkout_allowed: false,
  max_retries: 1,
  session_affinity_required: true,
  fallback_allowed_for: 'read_only',
  audit_level: 'summary',
}

export function evaluateBrowserOperatorProxyPolicy(input: {
  taskClass: BrowserOperatorTaskClass
  provider: BrowserOperatorProviderKind
  policy?: Partial<BrowserOperatorProxyPolicy> | null
  country?: string | null
  usesResidentialProxy?: boolean
  usesDatacenterProxy?: boolean
  usesByoProxy?: boolean
  providerChangedAfterApproval?: boolean
  profileChangedAfterApproval?: boolean
  proxyChangedAfterApproval?: boolean
}): BrowserOperatorProxyPolicyDecision {
  const policy = BrowserOperatorProxyPolicySchema.parse({
    ...DEFAULT_BROWSER_OPERATOR_PROXY_POLICY,
    ...(input.policy ?? {}),
  })

  if (policy.mode === 'disabled') {
    return decision(false, false, false, policy, 'proxy_policy_disabled')
  }
  if (policy.allowed_providers.length > 0 && !policy.allowed_providers.includes(input.provider)) {
    return decision(false, false, false, policy, 'provider_not_allowed_by_proxy_policy')
  }
  const country = input.country?.trim().toLowerCase()
  if (country && policy.allowed_countries.length > 0 && !policy.allowed_countries.map((item) => item.toLowerCase()).includes(country)) {
    return decision(false, false, false, policy, 'country_not_allowed_by_proxy_policy')
  }
  if (input.usesResidentialProxy && !policy.allow_residential) {
    return decision(false, false, false, policy, 'residential_proxy_not_allowed')
  }
  if (input.usesDatacenterProxy && !policy.allow_datacenter) {
    return decision(false, false, false, policy, 'datacenter_proxy_not_allowed')
  }
  if (input.usesByoProxy && !policy.allow_byo_proxy) {
    return decision(false, false, false, policy, 'byo_proxy_not_allowed')
  }

  const driftedAfterApproval = Boolean(
    input.providerChangedAfterApproval
    || input.profileChangedAfterApproval
    || input.proxyChangedAfterApproval,
  )
  if (input.taskClass === 'commerce_checkout') {
    if (driftedAfterApproval) return decision(false, false, false, policy, 'checkout_affinity_drift_blocked')
    if (!policy.checkout_allowed) return decision(false, false, false, policy, 'checkout_proxy_not_allowed')
    return decision(true, false, true, policy, 'checkout_proxy_allowed_with_affinity')
  }

  if (input.taskClass === 'authenticated_account') {
    const allowed = policy.mode === 'authenticated_profile' || policy.mode === 'premium_only' || policy.mode === 'byo_only'
    return decision(allowed, false, false, policy, allowed ? 'authenticated_profile_proxy_allowed' : 'authenticated_proxy_not_allowed')
  }

  const fallbackEligible = policy.fallback_allowed_for === 'read_only'
    && input.taskClass === 'read_only_public'
  if (policy.mode === 'read_only_only') {
    return decision(input.taskClass === 'read_only_public', fallbackEligible, false, policy, 'read_only_proxy_policy')
  }

  return decision(true, fallbackEligible, false, policy, 'proxy_policy_allowed')
}

function decision(
  allowed: boolean,
  fallbackEligible: boolean,
  checkoutAllowed: boolean,
  policy: BrowserOperatorProxyPolicy,
  reason: string,
): BrowserOperatorProxyPolicyDecision {
  return {
    allowed,
    fallbackEligible,
    checkoutAllowed,
    sessionAffinityRequired: policy.session_affinity_required,
    maxRetries: checkoutAllowed ? 0 : policy.max_retries,
    auditLevel: policy.audit_level,
    reason,
  }
}
