import {
  AgentSpendRequestSchema,
  CreateAgentSpendRequestSchema,
  type AgentCommerceCredential,
  type AgentCommerceProviderManifest,
  type AgentSpendRequest,
  type CreateAgentSpendRequest,
} from '@contracts/agent-commerce'
import { AgentCommerceError } from '../errors'
import { safeAgentCommerceErrorMessage } from '../observability'
import type { AgentCommerceProviderContext, AgentWalletCommerceProvider } from '../provider'
import {
  createAgentCommerceEnvSecretRef,
  createAgentCommerceSecretRef,
  resolveAgentCommerceSecretRef,
} from '../secrets'
import {
  DEFAULT_STRIPE_LINK_ISSUED_TOKEN_ENDPOINT,
  STRIPE_LINK_AGENTS_API_VERSION,
  STRIPE_LINK_AGENTS_PROVIDER_MANIFEST,
} from './stripe-link'

interface StripeLinkAgentsProviderOptions {
  secretKey: string
  apiVersion?: string
  issuedTokenEndpoint?: string
  requestedSessionEndpoint?: string
  fetchImpl?: typeof fetch
  env?: Record<string, string | undefined>
}

interface StripeLinkIssuedTokenResponse {
  id?: string
  object?: string
  status?: string
  next_action?: Record<string, unknown>
  payment_method_details?: Record<string, unknown>
  usage_limits?: Record<string, unknown>
  seller_details?: Record<string, unknown>
  error?: {
    message?: string
    type?: string
    code?: string
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function objectValueOrUndefined(value: unknown): Record<string, unknown> | undefined {
  const object = objectValue(value)
  return Object.keys(object).length > 0 ? object : undefined
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function spendMetadataObject(spendRequest: AgentSpendRequest, key: string): Record<string, unknown> | undefined {
  const value = spendRequest.metadata[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function spendMetadataString(spendRequest: AgentSpendRequest, key: string): string | undefined {
  const value = spendRequest.metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function paymentMethodIdForSpendRequest(spendRequest: AgentSpendRequest): string | undefined {
  return spendMetadataString(spendRequest, 'stripe_payment_method_id')
    ?? spendMetadataString(spendRequest, 'payment_method_id')
    ?? spendMetadataString(spendRequest, 'payment_method')
}

function sellerNetworkBusinessProfileForSpendRequest(spendRequest: AgentSpendRequest): string | undefined {
  const seller = spendMetadataObject(spendRequest, 'seller')
  return spendMetadataString(spendRequest, 'stripe_seller_network_business_profile')
    ?? spendMetadataString(spendRequest, 'seller_network_business_profile')
    ?? spendMetadataString(spendRequest, 'network_business_profile')
    ?? stringValue(
      seller?.network_business_profile,
      seller?.networkBusinessProfile,
      seller?.stripe_profile,
      seller?.profile,
    )
}

function returnUrlForSpendRequest(
  spendRequest: AgentSpendRequest,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return spendMetadataString(spendRequest, 'stripe_return_url')
    ?? spendMetadataString(spendRequest, 'return_url')
    ?? env.AGENT_COMMERCE_STRIPE_LINK_RETURN_URL?.trim()
}

function usageLimitExpiry(spendRequest: AgentSpendRequest): number {
  const expiry = spendRequest.expires_at ?? spendRequest.policy.expires_at
  if (expiry) {
    const timestamp = Date.parse(expiry)
    if (Number.isFinite(timestamp) && timestamp > Date.now()) return Math.floor(timestamp / 1000)
  }
  return Math.floor((Date.now() + 30 * 60 * 1000) / 1000)
}

function isAllowedReturnUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function credentialStatus(status?: string): AgentCommerceCredential['status'] {
  if (!status) return 'issued'
  if (['pending', 'open', 'requires_action', 'requires_confirmation', 'processing'].includes(status)) {
    return 'pending'
  }
  if (['failed', 'canceled', 'cancelled', 'expired', 'deactivated'].includes(status)) return 'failed'
  return 'issued'
}

function buildStripeLinkMetadata(spendRequest: AgentSpendRequest, context?: AgentCommerceProviderContext): Record<string, string> {
  return {
    org_id: spendRequest.org_id,
    agent_spend_request_id: spendRequest.id,
    agent_commerce_provider: 'stripe_link_agents',
    agent_commerce_rail: spendRequest.rail,
    ...(spendRequest.project_id ? { project_id: spendRequest.project_id } : {}),
    ...(spendRequest.assistant_id ? { assistant_id: spendRequest.assistant_id } : {}),
    ...(spendRequest.run_id ? { run_id: spendRequest.run_id } : {}),
    ...(spendRequest.tool_call_id ? { tool_call_id: spendRequest.tool_call_id } : {}),
    ...(context?.requestId ? { request_id: context.requestId } : {}),
  }
}

function createSecretRefForCredential(params: {
  providerCredentialId?: string
  spendRequest: AgentSpendRequest
  env?: Record<string, string | undefined>
}): string | undefined {
  if (!params.providerCredentialId) return undefined
  return createAgentCommerceSecretRef({
    value: params.providerCredentialId,
    kind: 'payment_credential',
    provider: 'stripe_link_agents',
    env: params.env,
    metadata: {
      provider_credential_id: params.providerCredentialId,
      spend_request_id: params.spendRequest.id,
      org_id: params.spendRequest.org_id,
      rail: params.spendRequest.rail,
    },
  })
}

export function isStripeLinkAgentsExecutionEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.AGENT_COMMERCE_STRIPE_LINK_AGENTS_ENABLED?.trim() === 'true'
    || env.FEATURE_AGENT_COMMERCE_STRIPE_LINK_AGENTS?.trim() === 'true'
}

export class StripeLinkAgentsProvider implements AgentWalletCommerceProvider {
  readonly manifest: AgentCommerceProviderManifest
  private readonly fetchImpl: typeof fetch
  private readonly apiVersion: string
  private readonly issuedTokenEndpoint: string
  private readonly env?: Record<string, string | undefined>

  constructor(private readonly options: StripeLinkAgentsProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.apiVersion = options.apiVersion ?? STRIPE_LINK_AGENTS_API_VERSION
    this.issuedTokenEndpoint = options.issuedTokenEndpoint
      ?? options.requestedSessionEndpoint
      ?? DEFAULT_STRIPE_LINK_ISSUED_TOKEN_ENDPOINT
    this.env = options.env
    this.manifest = {
      ...STRIPE_LINK_AGENTS_PROVIDER_MANIFEST,
      provider_version: `stripe-api-${this.apiVersion}-shared-payment-issued-token-preview`,
      availability: {
        ...STRIPE_LINK_AGENTS_PROVIDER_MANIFEST.availability,
        mode: 'preview',
      },
    }
  }

  async createSpendRequest(
    input: CreateAgentSpendRequest,
    _context?: AgentCommerceProviderContext,
  ): Promise<AgentSpendRequest> {
    const parsed = CreateAgentSpendRequestSchema.parse(input)
    const now = new Date().toISOString()
    return AgentSpendRequestSchema.parse({
      ...parsed,
      id: crypto.randomUUID(),
      provider: 'stripe_link_agents',
      rail: parsed.rail ?? 'stripe_link_one_time_card',
      status: 'requires_approval',
      approval_required: true,
      created_at: now,
      updated_at: now,
      metadata: parsed.metadata ?? {},
    })
  }

  async retrieveSpendRequest(): Promise<AgentSpendRequest | null> {
    return null
  }

  async issueCredential(
    spendRequest: AgentSpendRequest,
    context?: AgentCommerceProviderContext,
  ): Promise<AgentCommerceCredential> {
    if (spendRequest.provider !== 'stripe_link_agents') {
      throw new AgentCommerceError(
        'validation_failed',
        `Stripe Link Agents cannot issue credential for provider ${spendRequest.provider}.`,
        400,
      )
    }
    if (spendRequest.rail !== 'stripe_shared_payment_token') {
      throw new AgentCommerceError(
        'validation_failed',
        `Stripe Link Agents SPT issuance cannot issue credential for rail ${spendRequest.rail}.`,
        400,
      )
    }

    const paymentMethod = paymentMethodIdForSpendRequest(spendRequest)
    if (!paymentMethod) {
      throw new AgentCommerceError(
        'validation_failed',
        'Stripe Link Agents SPT issuance requires a Stripe PaymentMethod id in metadata.payment_method_id.',
        400,
      )
    }

    const sellerNetworkBusinessProfile = sellerNetworkBusinessProfileForSpendRequest(spendRequest)
    if (!sellerNetworkBusinessProfile) {
      throw new AgentCommerceError(
        'validation_failed',
        'Stripe Link Agents SPT issuance requires the seller Stripe network business profile.',
        400,
      )
    }

    const returnUrl = returnUrlForSpendRequest(spendRequest, this.env)
    if (!returnUrl || !isAllowedReturnUrl(returnUrl)) {
      throw new AgentCommerceError(
        'validation_failed',
        'Stripe Link Agents SPT issuance requires an HTTPS return URL or localhost test URL.',
        400,
      )
    }

    const body = new URLSearchParams()
    body.set('payment_method', paymentMethod)
    body.set('seller_details[network_business_profile]', sellerNetworkBusinessProfile)
    body.set('usage_limits[currency]', spendRequest.amount.currency)
    body.set('usage_limits[max_amount]', String(spendRequest.amount.amount))
    body.set('usage_limits[expires_at]', String(usageLimitExpiry(spendRequest)))
    body.set('return_url', returnUrl)

    const response = await this.fetchImpl(this.issuedTokenEndpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        'stripe-version': this.apiVersion,
        'idempotency-key': `agent-commerce:spend-request:${spendRequest.id}`,
      },
      body,
    })
    const json = await response.json().catch(() => ({})) as StripeLinkIssuedTokenResponse
    if (!response.ok) {
      throw new AgentCommerceError(
        'provider_unavailable',
        safeAgentCommerceErrorMessage(json.error?.message ?? `Stripe Link Agents request failed with ${response.status}.`),
        response.status >= 500 || response.status === 429 ? 503 : 400,
        { retryable: response.status >= 500 || response.status === 429 },
      )
    }

    const providerCredentialId = stringValue(json.id)
    if (!providerCredentialId) {
      throw new AgentCommerceError('provider_unavailable', 'Stripe Link Agents response is missing an issued SPT id.', 503, {
        retryable: true,
      })
    }

    const paymentMethodDetails = objectValueOrUndefined(json.payment_method_details) ?? {}
    const cardDetails = objectValueOrUndefined(paymentMethodDetails.card) ?? {}
    const secretRef = createSecretRefForCredential({
      providerCredentialId,
      spendRequest,
      env: this.env,
    })
    const metadata = buildStripeLinkMetadata(spendRequest, context)

    return {
      kind: 'shared_payment_token',
      provider: 'stripe_link_agents',
      spend_request_id: spendRequest.id,
      org_id: spendRequest.org_id,
      status: credentialStatus(stringValue(json.status)),
      usage_limits: spendRequest.policy,
      secret_ref: secretRef,
      display: {
        label: 'Stripe shared payment token',
        last4: stringValue(paymentMethodDetails.last4, cardDetails.last4),
      },
      metadata: {
        provider_credential_id: providerCredentialId,
        provider_status: stringValue(json.status),
        provider_object: stringValue(json.object),
        seller_network_business_profile: sellerNetworkBusinessProfile,
        usage_limit_currency: spendRequest.amount.currency,
        usage_limit_max_amount: spendRequest.amount.amount,
        usage_limit_expires_at: numberValue(objectValue(json.usage_limits).expires_at),
        payment_method_brand: stringValue(paymentMethodDetails.brand, cardDetails.brand),
        next_action_type: stringValue(objectValue(json.next_action).type),
        ...metadata,
      },
    }
  }
}

export function createStripeLinkAgentsProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): StripeLinkAgentsProvider | null {
  if (!isStripeLinkAgentsExecutionEnabled(env)) return null
  const secretRef = env.AGENT_COMMERCE_STRIPE_LINK_SECRET_REF?.trim()
    || env.AGENT_COMMERCE_STRIPE_SECRET_REF?.trim()
    || (env.STRIPE_SECRET_KEY?.trim() ? createAgentCommerceEnvSecretRef('STRIPE_SECRET_KEY') : undefined)
  const secretKey = secretRef
    ? resolveAgentCommerceSecretRef({
      secretRef,
      expectedKind: 'provider_api_key',
      provider: 'stripe_link_agents',
      env,
    }).value.trim()
    : undefined
  if (!secretKey) return null

  return new StripeLinkAgentsProvider({
    secretKey,
    apiVersion: env.STRIPE_API_VERSION?.trim() || STRIPE_LINK_AGENTS_API_VERSION,
    issuedTokenEndpoint: env.AGENT_COMMERCE_STRIPE_LINK_ISSUED_TOKEN_ENDPOINT?.trim()
      || env.AGENT_COMMERCE_STRIPE_LINK_REQUESTED_SESSION_ENDPOINT?.trim()
      || DEFAULT_STRIPE_LINK_ISSUED_TOKEN_ENDPOINT,
    env,
  })
}
