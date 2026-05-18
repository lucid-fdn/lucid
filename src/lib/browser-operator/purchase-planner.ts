import type { AgentCommerceMerchantInput } from '@contracts/agent-commerce'
import type {
  BrowserOperatorAccount,
  BrowserOperatorMerchantNativeCapability,
  BrowserOperatorProfile,
  BrowserOperatorProxyPolicy,
  BrowserOperatorProviderKind,
} from '@contracts/browser-operator'
import {
  selectBestBrowserOperatorNativeCapability,
  nativeCapabilityIsCheckoutLike,
} from './native-capabilities'
import { evaluateBrowserOperatorProxyPolicy } from './proxy-policy'
import { resolveBrowserOperatorProfileAffinity } from './profile-store'

export type BrowserOperatorPurchaseRail =
  | 'native_commerce'
  | 'authenticated_browser'
  | 'assisted_handoff'
  | 'research_only'

export type BrowserOperatorMerchantReliabilityState =
  | 'native_rail_available'
  | 'live_supported_for_profile'
  | 'assisted_checkout_supported'
  | 'authenticated_or_assisted_required'
  | 'anonymous_browse_supported'
  | 'research_only'
  | 'blocked'

export type BrowserOperatorPurchasePlannerDecision = {
  rail: BrowserOperatorPurchaseRail
  executable: boolean
  reason: string
  nativeCapabilityId: string | null
  nativeRailId: string | null
  provider: BrowserOperatorProviderKind | null
  fallbackEligible: boolean
  requiresHandoff: boolean
  checkoutCanAutoExecute: boolean
  evidence: Record<string, unknown>
}

export type BrowserOperatorNativeRailReadiness = {
  railId: string
  executable: boolean
  reason: string
  missingEnv?: string[]
  missingCredentialRefs?: string[]
  evidence?: Record<string, unknown>
}

export function planBrowserOperatorPurchaseRail(input: {
  merchant: AgentCommerceMerchantInput
  nativeCapabilities?: BrowserOperatorMerchantNativeCapability[]
  nativeRailPlans?: BrowserOperatorNativeRailReadiness[]
  approvedPartnerRailIds?: string[]
  merchantReliability?: BrowserOperatorMerchantReliabilityState | null
  account?: BrowserOperatorAccount | null
  profiles?: BrowserOperatorProfile[]
  proxyPolicy?: Partial<BrowserOperatorProxyPolicy> | null
  country?: string | null
  checkoutRequested?: boolean
  usesProxy?: boolean
  providerChangedAfterApproval?: boolean
  profileChangedAfterApproval?: boolean
  proxyChangedAfterApproval?: boolean
}): BrowserOperatorPurchasePlannerDecision {
  const native = selectBestBrowserOperatorNativeCapability({
    merchant: input.merchant,
    capabilities: input.nativeCapabilities ?? [],
    country: input.country,
    approvedPartnerRailIds: input.approvedPartnerRailIds,
  })

  if (native.executable && native.capability && native.capability.capability_level !== 'native_catalog_only') {
    const nativeRailPlan = input.nativeRailPlans?.find((plan) => plan.railId === native.capability?.rail_id)
    if (!nativeRailPlan) {
      return researchOnly('native_rail_readiness_missing', native)
    }
    if (!nativeRailPlan.executable) {
      return researchOnly(nativeRailPlan.reason || 'native_rail_not_executable', native, {
        native_rail_plan: {
          rail_id: nativeRailPlan.railId,
          missing_env: nativeRailPlan.missingEnv ?? [],
          missing_credential_refs: nativeRailPlan.missingCredentialRefs ?? [],
          evidence: nativeRailPlan.evidence ?? {},
        },
      })
    }
    return {
      rail: 'native_commerce',
      executable: true,
      reason: native.reason,
      nativeCapabilityId: native.capability.id,
      nativeRailId: native.capability.rail_id,
      provider: null,
      fallbackEligible: !nativeCapabilityIsCheckoutLike(native.capability),
      requiresHandoff: false,
      checkoutCanAutoExecute: nativeCapabilityIsCheckoutLike(native.capability),
      evidence: {
        capability_level: native.capability.capability_level,
        capability_status: native.capability.status,
        access_model: native.capability.access_model,
        supported_operations: native.capability.supported_operations,
        native_rail_plan: {
          rail_id: nativeRailPlan.railId,
          reason: nativeRailPlan.reason,
          evidence: nativeRailPlan.evidence ?? {},
        },
      },
    }
  }

  if (input.merchantReliability === 'blocked') {
    return researchOnly('merchant_reliability_blocked', native)
  }

  const account = input.account ?? null
  if (account?.auth_state === 'connected') {
    const profileAffinity = resolveBrowserOperatorProfileAffinity({
      account,
      profiles: input.profiles ?? [],
    })
    if (profileAffinity.usable) {
      const proxyDecision = evaluateBrowserOperatorProxyPolicy({
        taskClass: input.checkoutRequested ? 'commerce_checkout' : 'authenticated_account',
        provider: profileAffinity.provider,
        policy: input.proxyPolicy,
        country: input.country,
        usesDatacenterProxy: Boolean(input.usesProxy),
        providerChangedAfterApproval: input.providerChangedAfterApproval,
        profileChangedAfterApproval: input.profileChangedAfterApproval,
        proxyChangedAfterApproval: input.proxyChangedAfterApproval,
      })
      if (!proxyDecision.allowed && input.checkoutRequested) {
        return {
          rail: 'assisted_handoff',
          executable: false,
          reason: proxyDecision.reason,
          nativeCapabilityId: native.capability?.id ?? null,
          nativeRailId: native.capability?.rail_id ?? null,
          provider: profileAffinity.provider,
          fallbackEligible: false,
          requiresHandoff: true,
          checkoutCanAutoExecute: false,
          evidence: {
            profile_affinity: profileAffinity.reason,
            proxy_policy: proxyDecision.reason,
          },
        }
      }
      return {
        rail: input.merchantReliability === 'authenticated_or_assisted_required'
          || input.merchantReliability === 'assisted_checkout_supported'
          ? 'assisted_handoff'
          : 'authenticated_browser',
        executable: input.merchantReliability !== 'authenticated_or_assisted_required'
          && input.merchantReliability !== 'assisted_checkout_supported',
        reason: input.merchantReliability === 'authenticated_or_assisted_required'
          ? 'merchant_requires_takeover_before_checkout'
          : input.merchantReliability === 'assisted_checkout_supported'
            ? 'merchant_assisted_checkout_required'
            : 'authenticated_profile_selected',
        nativeCapabilityId: native.capability?.id ?? null,
        nativeRailId: native.capability?.rail_id ?? null,
        provider: profileAffinity.provider,
        fallbackEligible: false,
        requiresHandoff: input.merchantReliability === 'authenticated_or_assisted_required'
          || input.merchantReliability === 'assisted_checkout_supported',
        checkoutCanAutoExecute: Boolean(input.checkoutRequested && proxyDecision.checkoutAllowed),
        evidence: {
          profile_affinity: profileAffinity.reason,
          provider_profile_ref: profileAffinity.profileRef ?? null,
          provider_context_ref: profileAffinity.contextRef ?? null,
          proxy_policy: proxyDecision.reason,
          native_reason: native.reason,
        },
      }
    }
  }

  if (
    account
    || input.merchantReliability === 'authenticated_or_assisted_required'
    || input.merchantReliability === 'assisted_checkout_supported'
  ) {
    return {
      rail: 'assisted_handoff',
      executable: false,
      reason: account ? 'connected_account_profile_not_usable' : 'connect_account_required',
      nativeCapabilityId: native.capability?.id ?? null,
      nativeRailId: native.capability?.rail_id ?? null,
      provider: account?.provider ?? null,
      fallbackEligible: false,
      requiresHandoff: true,
      checkoutCanAutoExecute: false,
      evidence: {
        account_auth_state: account?.auth_state ?? null,
        native_reason: native.reason,
      },
    }
  }

  return researchOnly(native.reason, native)
}

function researchOnly(
  reason: string,
  native: ReturnType<typeof selectBestBrowserOperatorNativeCapability>,
  extraEvidence: Record<string, unknown> = {},
): BrowserOperatorPurchasePlannerDecision {
  return {
    rail: 'research_only',
    executable: false,
    reason,
    nativeCapabilityId: native.capability?.id ?? null,
    nativeRailId: native.capability?.rail_id ?? null,
    provider: null,
    fallbackEligible: true,
    requiresHandoff: false,
    checkoutCanAutoExecute: false,
    evidence: {
      native_reason: native.reason,
      capability_level: native.capability?.capability_level ?? null,
      capability_status: native.capability?.status ?? null,
      ...extraEvidence,
    },
  }
}
