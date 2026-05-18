import type { AgentCommerceProviderManifest } from '@contracts/agent-commerce'

export const MACHINE_PAYMENTS_MPP_PROVIDER_MANIFEST: AgentCommerceProviderManifest = {
  id: 'machine_payments_mpp',
  label: 'Machine Payments Protocol',
  roles: ['seller', 'machine_payment'],
  capabilities: ['machine_payment', 'shared_payment_token'],
  rails: ['machine_payment_mpp'],
  requires_account_access: true,
  provider_version: 'manifest-only',
  availability: { mode: 'preview', countries: ['US'] },
}

export const MACHINE_PAYMENTS_X402_PROVIDER_MANIFEST: AgentCommerceProviderManifest = {
  id: 'machine_payments_x402',
  label: 'x402 machine payments',
  roles: ['seller', 'machine_payment'],
  capabilities: ['machine_payment'],
  rails: ['machine_payment_x402'],
  requires_account_access: true,
  provider_version: 'manifest-only',
  availability: { mode: 'preview', countries: [] },
}
