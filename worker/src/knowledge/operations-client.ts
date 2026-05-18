export type KnowledgeOperationSurface = 'worker_tool' | 'mcp' | 'agent_ops' | 'external_agent'

export interface KnowledgeOperationEnvelope<T = unknown> {
  ok: boolean
  operation: string | null
  requestId: string
  durationMs: number
  result?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

export interface KnowledgeOperationClientOptions {
  controlPlaneUrl: string
  workerTriggerSecret: string
  fetchImpl?: typeof fetch
}

export interface ExternalKnowledgeOperationClientOptions {
  controlPlaneUrl: string
  token: string
  fetchImpl?: typeof fetch
}

export class KnowledgeOperationClient {
  private readonly controlPlaneUrl: string
  private readonly workerTriggerSecret: string
  private readonly fetchImpl: typeof fetch

  constructor(options: KnowledgeOperationClientOptions) {
    this.controlPlaneUrl = options.controlPlaneUrl.replace(/\/+$/, '')
    this.workerTriggerSecret = options.workerTriggerSecret
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async listOperations(): Promise<unknown> {
    const response = await this.fetchImpl(`${this.controlPlaneUrl}/api/knowledge/operations`, {
      method: 'GET',
      headers: this.headers(),
    })
    return parseKnowledgeOperationResponse(response)
  }

  async call<T = unknown>(input: {
    operation: string
    payload: unknown
    surface?: KnowledgeOperationSurface
  }): Promise<KnowledgeOperationEnvelope<T>> {
    const response = await this.fetchImpl(`${this.controlPlaneUrl}/api/knowledge/operations`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        operation: input.operation,
        input: input.payload,
        surface: input.surface ?? 'worker_tool',
      }),
    })
    return parseKnowledgeOperationResponse(response) as Promise<KnowledgeOperationEnvelope<T>>
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.workerTriggerSecret}`,
      'x-worker-trigger-secret': this.workerTriggerSecret,
      ...extra,
    }
  }
}

export class ExternalKnowledgeOperationClient {
  private readonly controlPlaneUrl: string
  private readonly token: string
  private readonly fetchImpl: typeof fetch

  constructor(options: ExternalKnowledgeOperationClientOptions) {
    this.controlPlaneUrl = options.controlPlaneUrl.replace(/\/+$/, '')
    this.token = options.token
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async call<T = unknown>(input: {
    operation: string
    payload?: unknown
  }): Promise<KnowledgeOperationEnvelope<T>> {
    const response = await this.fetchImpl(`${this.controlPlaneUrl}/api/knowledge/external/operations`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        operation: input.operation,
        input: input.payload ?? {},
      }),
    })
    return parseKnowledgeOperationResponse(response) as Promise<KnowledgeOperationEnvelope<T>>
  }

  async listMcpTools(): Promise<unknown> {
    const response = await this.fetchImpl(`${this.controlPlaneUrl}/api/knowledge/mcp`, {
      method: 'GET',
      headers: this.headers(),
    })
    return parseKnowledgeOperationResponse(response)
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      ...extra,
    }
  }
}

async function parseKnowledgeOperationResponse(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const errorBody = body as { error?: { message?: string } | string } | null
    const message = typeof errorBody?.error === 'string'
      ? errorBody.error
      : errorBody?.error?.message ?? `Knowledge operation request failed with ${response.status}`
    throw new Error(String(message))
  }
  return body
}
