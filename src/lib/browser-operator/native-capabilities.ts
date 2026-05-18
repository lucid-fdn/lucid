import type {
  BrowserOperatorMerchantNativeCapability,
  BrowserOperatorNativeCapabilityLevel,
  BrowserOperatorNativeCapabilityStatus,
} from '@contracts/browser-operator'
import type { AgentCommerceMerchantInput } from '@contracts/agent-commerce'

export type BrowserOperatorNativeCapabilityDecision = {
  capability: BrowserOperatorMerchantNativeCapability | null
  executable: boolean
  reason: string
}

const EXECUTABLE_NATIVE_STATUSES = new Set<BrowserOperatorNativeCapabilityStatus>([
  'sandbox',
  'staging',
  'live',
])

const CAPABILITY_RANK: Record<BrowserOperatorNativeCapabilityLevel, number> = {
  native_checkout: 0,
  native_cart_handoff: 1,
  partner_only: 2,
  native_catalog_only: 3,
  browser_required: 4,
  research_only: 5,
}

export function selectBestBrowserOperatorNativeCapability(input: {
  merchant: AgentCommerceMerchantInput
  capabilities: BrowserOperatorMerchantNativeCapability[]
  country?: string | null
  approvedPartnerRailIds?: string[]
}): BrowserOperatorNativeCapabilityDecision {
  const approvedPartnerRailIds = new Set(input.approvedPartnerRailIds ?? [])
  const country = input.country?.trim().toLowerCase() || null
  const matching = input.capabilities
    .filter((capability) => merchantMatchesNativeCapability(input.merchant, capability))
    .filter((capability) => countryMatchesCapability(country, capability))
    .sort(compareNativeCapabilities)

  const capability = matching[0] ?? null
  if (!capability) return { capability: null, executable: false, reason: 'no_native_capability' }
  if (capability.status === 'blocked') return { capability, executable: false, reason: 'native_capability_blocked' }
  if (capability.status === 'deprecated') return { capability, executable: false, reason: 'native_capability_deprecated' }
  if (!EXECUTABLE_NATIVE_STATUSES.has(capability.status)) {
    return { capability, executable: false, reason: `native_capability_${capability.status}` }
  }
  if (capability.capability_level === 'partner_only' && !approvedPartnerRailIds.has(capability.rail_id)) {
    return { capability, executable: false, reason: 'partner_rail_not_approved' }
  }
  if (
    capability.capability_level === 'native_checkout'
    || capability.capability_level === 'native_cart_handoff'
    || capability.capability_level === 'partner_only'
  ) {
    return { capability, executable: true, reason: 'native_capability_selected' }
  }
  return { capability, executable: false, reason: `native_${capability.capability_level}` }
}

export function merchantMatchesNativeCapability(
  merchant: AgentCommerceMerchantInput,
  capability: BrowserOperatorMerchantNativeCapability,
): boolean {
  const merchantKey = merchant.name?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
  if (merchantKey && merchantKey === capability.merchant_key.toLowerCase()) return true
  const merchantDomain = normalizeDomain(merchant.domain ?? merchant.url)
  const capabilityDomain = normalizeDomain(capability.merchant_domain)
  if (!merchantDomain || !capabilityDomain) return false
  return merchantDomain === capabilityDomain || merchantDomain.endsWith(`.${capabilityDomain}`)
}

export function nativeCapabilityIsCheckoutLike(
  capability: BrowserOperatorMerchantNativeCapability | null,
): boolean {
  return capability?.capability_level === 'native_checkout' || capability?.capability_level === 'partner_only'
}

function countryMatchesCapability(
  country: string | null,
  capability: BrowserOperatorMerchantNativeCapability,
): boolean {
  if (!country) return true
  if (!capability.country && capability.countries.length === 0) return true
  const capabilityCountry = capability.country?.toLowerCase()
  if (capabilityCountry && capabilityCountry === country) return true
  return capability.countries.map((item) => item.toLowerCase()).includes(country)
}

function compareNativeCapabilities(
  a: BrowserOperatorMerchantNativeCapability,
  b: BrowserOperatorMerchantNativeCapability,
): number {
  const capabilityRank = CAPABILITY_RANK[a.capability_level] - CAPABILITY_RANK[b.capability_level]
  if (capabilityRank !== 0) return capabilityRank
  const statusRank = statusRankForNativeCapability(a.status) - statusRankForNativeCapability(b.status)
  if (statusRank !== 0) return statusRank
  return (b.last_verified_at ?? '').localeCompare(a.last_verified_at ?? '')
}

function statusRankForNativeCapability(status: BrowserOperatorNativeCapabilityStatus): number {
  switch (status) {
    case 'live':
      return 0
    case 'staging':
      return 1
    case 'sandbox':
      return 2
    case 'requested':
      return 3
    case 'research':
      return 4
    case 'blocked':
      return 5
    case 'deprecated':
      return 6
  }
}

function normalizeDomain(value: string | undefined | null): string | null {
  if (!value) return null
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return value.trim().replace(/^www\./, '').toLowerCase() || null
  }
}
