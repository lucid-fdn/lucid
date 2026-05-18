import 'server-only'

import { SellerPaymentGrantSchema, type AgentCommerceProviderManifest, type SellerPaymentGrantInput } from '@contracts/agent-commerce'
import { AgentCommerceError } from '../errors'
import { safeAgentCommerceErrorMessage } from '../observability'
import type { AgentCommerceProviderContext, SellerAgentCommerceProvider } from '../provider'
import { createAgentCommerceEnvSecretRef, resolveAgentCommerceSecretRef } from '../secrets'
import { STRIPE_SHARED_PAYMENT_TOKENS_PROVIDER_MANIFEST } from './stripe-link'

const DEFAULT_STRIPE_API_VERSION = '2026-02-25.clover'
const DEFAULT_SPT_PAYMENT_METHOD_FIELD = 'payment_method_data[shared_payment_granted_token]'

interface StripeSharedPaymentTokensProviderOptions {
  secretKey: string
  apiVersion?: string
  fetchImpl?: typeof fetch
  sptPaymentMethodField?: string
}

interface StripePaymentIntentResponse {
  id?: string
  status?: string
  error?: {
    message?: string
    type?: string
    code?: string
  }
}

function stripePaymentIntentStatus(status?: string): 'accepted' | 'processing' | 'completed' | 'requires_action' {
  if (status === 'succeeded') return 'completed'
  if (status === 'processing') return 'processing'
  if (status === 'requires_action') return 'requires_action'
  return 'accepted'
}

function safeMetadataValue(value: unknown): string | undefined {
  if (value == null) return undefined
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  return raw.length > 500 ? raw.slice(0, 500) : raw
}

function safeMetadataKey(key: string): string {
  return `lucid_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`.slice(0, 40)
}

export function isStripeSharedPaymentTokensExecutionEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.AGENT_COMMERCE_STRIPE_SPT_ENABLED?.trim() === 'true'
    || env.FEATURE_AGENT_COMMERCE_STRIPE_SPT?.trim() === 'true'
}

export class StripeSharedPaymentTokensProvider implements SellerAgentCommerceProvider {
  readonly manifest: AgentCommerceProviderManifest
  private readonly fetchImpl: typeof fetch
  private readonly apiVersion: string
  private readonly sptPaymentMethodField: string

  constructor(private readonly options: StripeSharedPaymentTokensProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.apiVersion = options.apiVersion ?? DEFAULT_STRIPE_API_VERSION
    this.sptPaymentMethodField = options.sptPaymentMethodField ?? DEFAULT_SPT_PAYMENT_METHOD_FIELD
    this.manifest = {
      ...STRIPE_SHARED_PAYMENT_TOKENS_PROVIDER_MANIFEST,
      provider_version: `stripe-api-${this.apiVersion}`,
      availability: {
        ...STRIPE_SHARED_PAYMENT_TOKENS_PROVIDER_MANIFEST.availability,
        mode: 'preview',
      },
    }
  }

  async acceptGrant(
    input: SellerPaymentGrantInput,
    context?: AgentCommerceProviderContext,
  ): Promise<{ payment_id: string; status: 'accepted' | 'processing' | 'completed' | 'requires_action' }> {
    const grant = SellerPaymentGrantSchema.parse(input)
    if (grant.provider !== 'stripe_shared_payment_tokens') {
      throw new AgentCommerceError(
        'validation_failed',
        `Stripe SPT provider cannot accept grant provider ${grant.provider}.`,
        400,
      )
    }
    if (!grant.id) {
      throw new AgentCommerceError('validation_failed', 'Seller grant id is required before provider acceptance.', 400)
    }

    const body = new URLSearchParams()
    body.set('amount', String(grant.amount.amount))
    body.set('currency', grant.amount.currency)
    body.set('confirm', 'true')
    body.set(this.sptPaymentMethodField, grant.grant_id)
    body.set('description', `Lucid Agent Commerce ${grant.resource_type}`)
    body.set('metadata[org_id]', grant.org_id)
    body.set('metadata[seller_grant_id]', grant.id)
    body.set('metadata[agent_commerce_provider]', 'stripe_shared_payment_tokens')
    body.set('metadata[agent_commerce_rail]', grant.rail)
    body.set('metadata[resource_type]', grant.resource_type)
    if (grant.resource_id) body.set('metadata[resource_id]', grant.resource_id)
    if (context?.requestId) body.set('metadata[request_id]', context.requestId)
    for (const [key, value] of Object.entries(grant.metadata)) {
      if (key.startsWith('stripe_') || key.startsWith('agent_commerce_')) continue
      const metadataValue = safeMetadataValue(value)
      if (metadataValue !== undefined) body.set(`metadata[${safeMetadataKey(key)}]`, metadataValue)
    }

    const response = await this.fetchImpl('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        'stripe-version': this.apiVersion,
        'idempotency-key': `agent-commerce:seller-grant:${grant.id}`,
      },
      body,
    })
    const json = await response.json().catch(() => ({})) as StripePaymentIntentResponse
    if (!response.ok || !json.id) {
      throw new AgentCommerceError(
        'provider_unavailable',
        safeAgentCommerceErrorMessage(json.error?.message ?? `Stripe PaymentIntent creation failed with ${response.status}.`),
        response.status >= 500 || response.status === 429 ? 503 : 400,
        { retryable: response.status >= 500 || response.status === 429 },
      )
    }

    return {
      payment_id: json.id,
      status: stripePaymentIntentStatus(json.status),
    }
  }
}

export function createStripeSharedPaymentTokensProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): StripeSharedPaymentTokensProvider | null {
  if (!isStripeSharedPaymentTokensExecutionEnabled(env)) return null
  const secretRef = env.AGENT_COMMERCE_STRIPE_SECRET_REF?.trim()
    || (env.STRIPE_SECRET_KEY?.trim() ? createAgentCommerceEnvSecretRef('STRIPE_SECRET_KEY') : undefined)
  const secretKey = secretRef
    ? resolveAgentCommerceSecretRef({
      secretRef,
      expectedKind: 'provider_api_key',
      provider: 'stripe_shared_payment_tokens',
      env,
    }).value.trim()
    : undefined
  if (!secretKey) return null
  return new StripeSharedPaymentTokensProvider({
    secretKey,
    apiVersion: env.STRIPE_API_VERSION?.trim() || DEFAULT_STRIPE_API_VERSION,
    sptPaymentMethodField: env.AGENT_COMMERCE_STRIPE_SPT_TOKEN_FIELD?.trim() || DEFAULT_SPT_PAYMENT_METHOD_FIELD,
  })
}
