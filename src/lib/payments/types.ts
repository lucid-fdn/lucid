export type ProviderId = 'stripe' | 'nowpayments'

export interface CheckoutParams {
  orgId: string
  userId: string
  planName: 'pro' | 'business'
  billingPeriod: 'monthly' | 'yearly'
  successUrl: string
  cancelUrl: string
}

export interface CheckoutResult {
  url: string
  sessionId: string
  provider: ProviderId
}

export interface PaymentProvider {
  id: ProviderId
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>
}
