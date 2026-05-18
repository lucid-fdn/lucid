import {
  AgentCommerceProviderIdSchema,
  type AgentCommerceProviderId,
  type AgentCommerceProviderManifest,
} from '@contracts/agent-commerce'
import {
  AgentCommerceProviderUnavailableError,
  type AgentCommerceProvider,
} from './provider'
import { ManualAgentCommerceProvider, MANUAL_AGENT_COMMERCE_PROVIDER_MANIFEST } from './providers/manual'
import {
  CRYPTO_WALLET_PROVIDER_MANIFEST,
} from './providers/crypto-wallet'
import {
  MACHINE_PAYMENTS_MPP_PROVIDER_MANIFEST,
  MACHINE_PAYMENTS_X402_PROVIDER_MANIFEST,
} from './providers/machine'
import {
  STRIPE_ISSUING_AGENTS_PROVIDER_MANIFEST,
  STRIPE_LINK_AGENTS_PROVIDER_MANIFEST,
  STRIPE_SHARED_PAYMENT_TOKENS_PROVIDER_MANIFEST,
} from './providers/stripe-link'
import { createStripeLinkAgentsProviderFromEnv } from './providers/stripe-link-agents'
import { createStripeSharedPaymentTokensProviderFromEnv } from './providers/stripe-spt'

const providers = new Map<AgentCommerceProviderId, AgentCommerceProvider>()
const manifestOnlyProviders = new Map<AgentCommerceProviderId, AgentCommerceProviderManifest>()

export function registerAgentCommerceProvider(provider: AgentCommerceProvider): void {
  if (providers.has(provider.manifest.id) || manifestOnlyProviders.has(provider.manifest.id)) {
    throw new Error(`Duplicate Agent Commerce provider id registered: ${provider.manifest.id}`)
  }
  providers.set(provider.manifest.id, provider)
}

export function registerAgentCommerceProviderManifest(manifest: AgentCommerceProviderManifest): void {
  if (providers.has(manifest.id) || manifestOnlyProviders.has(manifest.id)) {
    throw new Error(`Duplicate Agent Commerce provider id registered: ${manifest.id}`)
  }
  manifestOnlyProviders.set(manifest.id, manifest)
}

export function getAgentCommerceProvider(providerId: AgentCommerceProviderId): AgentCommerceProvider {
  const provider = providers.get(providerId)
  if (!provider) {
    throw new AgentCommerceProviderUnavailableError(providerId)
  }
  return provider
}

export function hasAgentCommerceProvider(providerId: AgentCommerceProviderId): boolean {
  return providers.has(providerId)
}

export function listAgentCommerceProviders(): AgentCommerceProvider[] {
  return [...providers.values()]
}

export function listAgentCommerceProviderManifests(): AgentCommerceProviderManifest[] {
  return [
    ...providers.values(),
    ...manifestOnlyProviders.values(),
  ].map((entry) => 'manifest' in entry ? entry.manifest : entry)
}

export function resetAgentCommerceProviders(): void {
  providers.clear()
  manifestOnlyProviders.clear()
}

export function resolveDefaultAgentCommerceProvider(
  env: Record<string, string | undefined> = process.env,
): AgentCommerceProviderId {
  const raw = env.AGENT_COMMERCE_PROVIDER?.trim()
  const parsed = AgentCommerceProviderIdSchema.safeParse(raw)
  return parsed.success ? parsed.data : 'manual'
}

export function registerDefaultAgentCommerceProviders(): void {
  if (providers.size > 0 || manifestOnlyProviders.size > 0) return

  registerAgentCommerceProvider(new ManualAgentCommerceProvider())
  const stripeLinkAgentsProvider = createStripeLinkAgentsProviderFromEnv()
  const stripeSharedPaymentTokensProvider = createStripeSharedPaymentTokensProviderFromEnv()
  if (stripeLinkAgentsProvider) {
    registerAgentCommerceProvider(stripeLinkAgentsProvider)
  } else {
    registerAgentCommerceProviderManifest(STRIPE_LINK_AGENTS_PROVIDER_MANIFEST)
  }
  if (stripeSharedPaymentTokensProvider) {
    registerAgentCommerceProvider(stripeSharedPaymentTokensProvider)
  } else {
    registerAgentCommerceProviderManifest(STRIPE_SHARED_PAYMENT_TOKENS_PROVIDER_MANIFEST)
  }
  registerAgentCommerceProviderManifest(STRIPE_ISSUING_AGENTS_PROVIDER_MANIFEST)
  registerAgentCommerceProviderManifest(MACHINE_PAYMENTS_MPP_PROVIDER_MANIFEST)
  registerAgentCommerceProviderManifest(MACHINE_PAYMENTS_X402_PROVIDER_MANIFEST)
  registerAgentCommerceProviderManifest(CRYPTO_WALLET_PROVIDER_MANIFEST)
}

export function defaultAgentCommerceProviderManifests(): AgentCommerceProviderManifest[] {
  return [
    MANUAL_AGENT_COMMERCE_PROVIDER_MANIFEST,
    STRIPE_LINK_AGENTS_PROVIDER_MANIFEST,
    STRIPE_SHARED_PAYMENT_TOKENS_PROVIDER_MANIFEST,
    STRIPE_ISSUING_AGENTS_PROVIDER_MANIFEST,
    MACHINE_PAYMENTS_MPP_PROVIDER_MANIFEST,
    MACHINE_PAYMENTS_X402_PROVIDER_MANIFEST,
    CRYPTO_WALLET_PROVIDER_MANIFEST,
  ]
}
