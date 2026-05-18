import crypto from 'node:crypto'

export interface AgentCommerceClientConfig {
  baseUrl: string
  internalSecret: string
  fetchImpl?: typeof fetch
}

export interface RuntimeSpendRequestInput {
  org_id: string
  project_id?: string
  assistant_id: string
  run_id?: string
  tool_call_id?: string
  merchant: {
    name: string
    url?: string
    domain?: string
    country?: string
    category?: string
  }
  amount: {
    amount: number
    currency: string
  }
  purpose: string
  resource?: {
    type: string
    id?: string
    url?: string
  }
  preferred_provider?: string
  preferred_rail?: string
  idempotency_key: string
  metadata?: Record<string, unknown>
}

function buildAuthHeaders(body: string, secret: string): Record<string, string> {
  const requestId = crypto.randomUUID()
  const timestamp = Date.now().toString()
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${requestId}:${timestamp}:${body}`)
    .digest('hex')

  return {
    'content-type': 'application/json',
    'x-request-id': requestId,
    'x-timestamp': timestamp,
    'x-signature': signature,
  }
}

export class AgentCommerceClient {
  private readonly fetchImpl: typeof fetch

  constructor(private readonly config: AgentCommerceClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const payload = JSON.stringify(body)
    const response = await this.fetchImpl(new URL(path, this.config.baseUrl), {
      method: 'POST',
      headers: buildAuthHeaders(payload, this.config.internalSecret),
      body: payload,
    })
    const json = await response.json().catch(() => ({})) as { error?: { message?: string } }
    if (!response.ok) {
      const message = typeof json.error?.message === 'string'
        ? json.error.message
        : `Agent Commerce API failed with ${response.status}`
      throw new Error(message)
    }
    return json
  }

  createSpendRequest(input: RuntimeSpendRequestInput): Promise<unknown> {
    return this.post('/api/internal/agent-commerce/spend-requests', input)
  }

  getSpendRequest(id: string, orgId: string): Promise<unknown> {
    return this.post(`/api/internal/agent-commerce/spend-requests/${id}`, { orgId })
  }

  issueCredential(id: string, orgId: string): Promise<unknown> {
    return this.post(`/api/internal/agent-commerce/spend-requests/${id}/issue-credential`, { orgId })
  }

  getProviderCapabilities(): Promise<unknown> {
    return this.post('/api/internal/agent-commerce/providers', {})
  }

  acceptSellerGrant(id: string, orgId: string): Promise<unknown> {
    return this.post(`/api/internal/agent-commerce/seller/grants/${id}/accept`, { orgId })
  }

  createMachineChallenge(input: Record<string, unknown>): Promise<unknown> {
    return this.post('/api/internal/agent-commerce/machine/challenges', input)
  }

  claimMachineProof(input: Record<string, unknown>): Promise<unknown> {
    return this.post('/api/internal/agent-commerce/machine/proofs/claim', input)
  }
}

export function createAgentCommerceClientFromEnv(env: Record<string, string | undefined> = process.env): AgentCommerceClient | null {
  const baseUrl = env.AGENT_COMMERCE_CONTROL_PLANE_URL || env.LUCID_CONTROL_PLANE_URL
  const internalSecret = env.AGENT_COMMERCE_INTERNAL_SECRET || env.APP_SERVICE_INTERNAL_SECRET
  if (!baseUrl || !internalSecret) return null
  return new AgentCommerceClient({ baseUrl, internalSecret })
}
