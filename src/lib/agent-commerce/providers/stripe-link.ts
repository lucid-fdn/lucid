import type { AgentCommerceProviderManifest } from '@contracts/agent-commerce'

export const STRIPE_LINK_AGENTS_API_VERSION = '2026-02-25.clover'
export const DEFAULT_STRIPE_LINK_ISSUED_TOKEN_ENDPOINT =
  'https://api.stripe.com/v1/shared_payment/issued_tokens'

/**
 * Stripe Agentic Commerce Suite / Link Agents manifest.
 *
 * Stripe's current public docs describe ACS for agents as profile-scoped Shared
 * Payment Token issuance. Keep this provider preview unless account/API access
 * and promotion evidence prove the concrete account can execute the rail.
 */
export const STRIPE_LINK_AGENTS_PROVIDER_MANIFEST: AgentCommerceProviderManifest = {
  id: 'stripe_link_agents',
  label: 'Stripe Agentic Commerce Suite',
  roles: ['agent_platform'],
  capabilities: [
    'wallet_oauth',
    'spend_request',
    'one_time_card',
    'shared_payment_token',
    'realtime_authorization',
    'catalog_feed',
    'agentic_checkout',
  ],
  rails: ['stripe_link_one_time_card', 'stripe_shared_payment_token'],
  requires_account_access: true,
  provider_version: 'manifest-only-shared-payment-issued-token',
  availability: { mode: 'waitlist', countries: ['US'] },
}

export const STRIPE_SHARED_PAYMENT_TOKENS_PROVIDER_MANIFEST: AgentCommerceProviderManifest = {
  id: 'stripe_shared_payment_tokens',
  label: 'Stripe Shared Payment Tokens',
  roles: ['seller'],
  capabilities: ['shared_payment_token', 'agentic_checkout'],
  rails: ['stripe_shared_payment_token'],
  requires_account_access: true,
  provider_version: 'manifest-only',
  availability: { mode: 'preview', countries: ['US'] },
}

export const STRIPE_ISSUING_AGENTS_PROVIDER_MANIFEST: AgentCommerceProviderManifest = {
  id: 'stripe_issuing',
  label: 'Stripe Issuing for agents',
  roles: ['agent_platform'],
  capabilities: ['one_time_card', 'realtime_authorization'],
  rails: ['stripe_issuing_card'],
  requires_account_access: true,
  provider_version: 'stripe-api-2026-02-25.clover-realtime-auth-preview',
  availability: { mode: 'preview', countries: ['US'] },
}
