import { FEATURES } from '@/lib/features'
import { AgentCommerceError } from './errors'

export type AgentCommerceSurface = 'core' | 'wallets' | 'seller'

export function isAgentCommerceKillSwitchActive(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.AGENT_COMMERCE_KILL_SWITCH?.trim() === 'true'
}

export function isAgentCommerceEnabled(): boolean {
  return !isAgentCommerceKillSwitchActive() && FEATURES.agentCommerce
}

export function isAgentCommerceWalletsEnabled(): boolean {
  return isAgentCommerceEnabled() && FEATURES.agentCommerceWallets
}

export function isAgentCommerceSellerEnabled(): boolean {
  return isAgentCommerceEnabled() && FEATURES.agentCommerceSeller
}

export function assertAgentCommerceEnabled(surface: AgentCommerceSurface = 'core'): void {
  if (isAgentCommerceKillSwitchActive()) {
    throw new AgentCommerceError(
      'kill_switch_active',
      'Agent Commerce is temporarily disabled.',
      503,
      { retryable: true },
    )
  }

  const enabled = surface === 'wallets'
    ? FEATURES.agentCommerce && FEATURES.agentCommerceWallets
    : surface === 'seller'
      ? FEATURES.agentCommerce && FEATURES.agentCommerceSeller
      : FEATURES.agentCommerce

  if (!enabled) {
    throw new AgentCommerceError(
      'feature_disabled',
      `Agent Commerce ${surface} surface is not enabled.`,
      404,
    )
  }
}
