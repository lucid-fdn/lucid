import type { PaymentProvider, ProviderId } from './types'

const providers = new Map<string, PaymentProvider>()

export function registerProvider(provider: PaymentProvider): void {
  providers.set(provider.id, provider)
}

export function getProvider(id: string): PaymentProvider {
  const p = providers.get(id)
  if (!p) throw new Error(`Unknown payment provider: ${id}`)
  return p
}

export function hasProvider(id: string): boolean {
  return providers.has(id)
}

export function listProviders(): ProviderId[] {
  return Array.from(providers.keys()) as ProviderId[]
}

let initialized = false

export async function ensureProviders(): Promise<void> {
  if (initialized) return
  initialized = true

  if (process.env.STRIPE_SECRET_KEY) {
    const { StripeProvider } = await import('./stripe-provider')
    registerProvider(new StripeProvider())
  }

  if (process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET) {
    const { NOWPaymentsProvider } = await import('./nowpayments-provider')
    registerProvider(new NOWPaymentsProvider())
  } else if (process.env.NOWPAYMENTS_API_KEY && !process.env.NOWPAYMENTS_IPN_SECRET) {
    console.warn('[payments] NowPayments API key set but IPN signing key missing — provider disabled')
  }
}

export function resetRegistry(): void {
  providers.clear()
  initialized = false
}
