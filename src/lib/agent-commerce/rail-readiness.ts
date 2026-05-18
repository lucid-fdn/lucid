import type {
  AgentCommerceProviderManifest,
  AgentCommerceRole,
  CommerceRail,
} from '@contracts/agent-commerce'

export interface AgentCommerceLiveRail {
  provider: AgentCommerceProviderManifest['id']
  label: string
  rail: CommerceRail
  roles: AgentCommerceRole[]
  requiresAccountAccess: boolean
}

export interface AgentCommerceRailReadinessSummary {
  agent_platform: AgentCommerceLiveRail[]
  seller: AgentCommerceLiveRail[]
  machine_payment: AgentCommerceLiveRail[]
  has_live_agent_platform_rail: boolean
  has_live_seller_rail: boolean
}

function liveRailsForRole(
  manifests: AgentCommerceProviderManifest[],
  role: AgentCommerceRole,
): AgentCommerceLiveRail[] {
  return manifests.flatMap((manifest) => {
    if (manifest.availability.mode !== 'live' || !manifest.roles.includes(role)) return []
    return manifest.rails.map((rail) => ({
      provider: manifest.id,
      label: manifest.label,
      rail,
      roles: manifest.roles,
      requiresAccountAccess: manifest.requires_account_access,
    }))
  })
}

export function summarizeAgentCommerceRailReadiness(
  manifests: AgentCommerceProviderManifest[],
): AgentCommerceRailReadinessSummary {
  const agentPlatform = liveRailsForRole(manifests, 'agent_platform')
  const seller = liveRailsForRole(manifests, 'seller')
  const machinePayment = liveRailsForRole(manifests, 'machine_payment')

  return {
    agent_platform: agentPlatform,
    seller,
    machine_payment: machinePayment,
    has_live_agent_platform_rail: agentPlatform.length > 0,
    has_live_seller_rail: seller.length > 0,
  }
}
