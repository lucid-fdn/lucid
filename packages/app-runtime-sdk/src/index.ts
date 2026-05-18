export type LucidAuthConfig =
  | { mode: 'cookie' }
  | { mode: 'bearer'; token: string }
  | { mode: 'none' }

export type LucidRuntimeFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface LucidRuntimeClientOptions {
  baseUrl: string
  auth?: LucidAuthConfig
  fetch?: LucidRuntimeFetch
  headers?: HeadersInit
}

export interface PublicAppClientOptions extends LucidRuntimeClientOptions {
  slug: string
  token?: string
}

export interface OperatorAppClientOptions extends LucidRuntimeClientOptions {
  appId: string
  csrfToken?: string
}

export interface ApiSuccessEnvelope<T> {
  data: T
  meta: {
    request_id: string
    app_runtime_api_version: 'v1'
    next_cursor?: string | null
    has_more?: boolean
    agentops_trace_id?: string | null
  }
}

export interface ApiErrorEnvelope {
  error: {
    code: string
    message: string
    details?: unknown
    request_id: string
    retryable?: boolean
  }
}

export type PublicAppCapability =
  | 'chat'
  | 'lead'
  | 'feedback'
  | 'status'
  | 'uploads'
  | 'public_actions'
  | 'paid_actions'

export interface PublicAppConfig {
  app_id: string
  slug: string
  name: string
  description: string | null
  status: 'active' | 'paused' | 'maintenance' | 'setup_required'
  visibility: 'unlisted' | 'public'
  capabilities: PublicAppCapability[]
  theme: Record<string, unknown>
  public_endpoints: Record<string, string>
  commerce: {
    paid_actions: Record<string, unknown>
  }
  consent: {
    privacy_url?: string
    terms_url?: string
    transcript_retention_days?: number
  }
}

export interface AppDiscoveryManifest {
  schema_version: '1.0'
  generated_at: string
  app: {
    id: string
    slug: string
    name: string
    description: string | null
    status: PublicAppConfig['status']
    visibility: PublicAppConfig['visibility']
  }
  runtime: {
    api_version: 'v1'
    openapi_url: string
    public_base_path: string
    endpoints: Record<string, string>
  }
  protocols: Record<string, unknown>
}

export interface VisitorSession {
  id: string
  external_session_id: string
  expires_at: string
}

export interface VisitorSessionCreateRequest {
  external_session_id?: string
  metadata?: Record<string, unknown>
}

export interface PublicChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface PublicChatRequest {
  visitor_session_id?: string
  messages: PublicChatMessage[]
  metadata?: Record<string, unknown>
}

export interface PublicChatResponse {
  conversation_id?: string
  agentops_trace_id: string
  status: 'completed' | 'accepted' | 'streaming' | 'queued' | 'setup_required'
  message?: PublicChatMessage
}

export interface PublicLeadRequest {
  visitor_session_id?: string
  name?: string
  email?: string
  phone?: string
  company?: string
  message?: string
  fields?: Record<string, unknown>
}

export interface PublicLead {
  id: string
  status: 'received' | 'routed' | 'requires_setup'
}

export interface PublicFeedbackRequest {
  visitor_session_id?: string
  agentops_trace_id?: string
  rating?: 'up' | 'down'
  report_type?: 'unsafe' | 'incorrect' | 'unhelpful' | 'other'
  comment?: string
}

export interface PublicActionRequest {
  visitor_session_id?: string
  input?: Record<string, unknown>
  idempotency_key?: string
}

export interface PublicActionResult {
  action: string
  status: 'accepted' | 'completed' | 'queued' | 'setup_required'
  run_id?: string
  result?: unknown
  commerce?: {
    required: boolean
    status: 'not_required' | 'shadow' | 'proof_claimed'
    provider?: string
    rail?: string
    challenge_id?: string
    resource_type?: string
    resource_id?: string
  }
}

export interface OperatorUsage {
  usage: unknown
  abuse: unknown
  launch_readiness?: unknown
}

export interface OperatorPublicToken {
  id: string
  label: string | null
  token_preview: string | null
  capabilities: string[]
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface CreatedOperatorPublicToken {
  id: string
  token: string
  token_preview: string
  capabilities: string[]
  expires_at: string | null
}

export interface OperatorAllowedOrigin {
  id: string
  origin: string
  source: string
  created_by: string | null
  created_at: string
}

export class LucidAppRuntimeApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  readonly requestId: string | undefined
  readonly body: unknown

  constructor(message: string, options: {
    status: number
    code?: string
    requestId?: string
    body?: unknown
  }) {
    super(message)
    this.name = 'LucidAppRuntimeApiError'
    this.status = options.status
    this.code = options.code
    this.requestId = options.requestId
    this.body = options.body
  }
}

class RuntimeHttpClient {
  private readonly baseUrl: URL
  private readonly auth: LucidAuthConfig
  private readonly fetchImpl: LucidRuntimeFetch
  private readonly headers: HeadersInit | undefined

  constructor(options: LucidRuntimeClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.auth = options.auth ?? { mode: 'cookie' }
    this.fetchImpl = options.fetch ?? fetch
    this.headers = options.headers
  }

  get<T>(path: string, headers?: HeadersInit): Promise<T> {
    return this.request<T>(path, { method: 'GET', headers })
  }

  post<T>(path: string, body?: unknown, headers?: HeadersInit): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
    })
  }

  patch<T>(path: string, body?: unknown, headers?: HeadersInit): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
    })
  }

  delete<T>(path: string, headers?: HeadersInit): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', headers })
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(resolvePath(this.baseUrl, path), {
      ...init,
      credentials: this.auth.mode === 'cookie' ? 'include' : 'same-origin',
      headers: this.buildHeaders(init.headers),
    })
    const payload = await readJson(response)
    if (!response.ok) {
      const error = (payload as ApiErrorEnvelope | null)?.error
      throw new LucidAppRuntimeApiError(error?.message ?? `Lucid App Runtime request failed with ${response.status}`, {
        status: response.status,
        code: error?.code,
        requestId: error?.request_id,
        body: payload,
      })
    }
    return (payload as ApiSuccessEnvelope<T>).data
  }

  private buildHeaders(headers?: HeadersInit): Headers {
    const merged = new Headers(this.headers)
    merged.set('Accept', 'application/json')
    if (!merged.has('Content-Type')) merged.set('Content-Type', 'application/json')
    if (this.auth.mode === 'bearer') merged.set('Authorization', `Bearer ${this.auth.token}`)
    new Headers(headers).forEach((value, key) => merged.set(key, value))
    return merged
  }
}

export class PublicAppRuntimeClient {
  private readonly http: RuntimeHttpClient
  private readonly slug: string
  private readonly token: string | undefined

  constructor(options: PublicAppClientOptions) {
    this.http = new RuntimeHttpClient(options)
    this.slug = options.slug
    this.token = options.token
  }

  getConfig(): Promise<{ config: PublicAppConfig }> {
    return this.http.get(this.path('/config'), this.publicHeaders())
  }

  getDiscovery(): Promise<{ discovery: AppDiscoveryManifest }> {
    return this.http.get(this.path('/discovery'), this.publicHeaders())
  }

  getStatus(): Promise<{
    app_id: string
    slug: string
    status: PublicAppConfig['status']
    public_url: string | null
    preview_url: string | null
  }> {
    return this.http.get(this.path('/status'), this.publicHeaders())
  }

  createSession(input: VisitorSessionCreateRequest = {}): Promise<{ session: VisitorSession }> {
    return this.http.post(this.path('/sessions'), input, this.publicHeaders())
  }

  sendChat(input: PublicChatRequest): Promise<{ chat: PublicChatResponse }> {
    return this.http.post(this.path('/chat'), input, this.publicHeaders())
  }

  submitLead(input: PublicLeadRequest): Promise<{ lead: PublicLead }> {
    return this.http.post(this.path('/lead'), input, this.publicHeaders())
  }

  submitFeedback(input: PublicFeedbackRequest): Promise<{ feedback: { status: 'received' } }> {
    return this.http.post(this.path('/feedback'), input, this.publicHeaders())
  }

  runAction(action: string, input: PublicActionRequest = {}): Promise<{ action: PublicActionResult }> {
    return this.http.post(this.path(`/actions/${encodeURIComponent(action)}`), input, this.publicHeaders())
  }

  private path(suffix: string): string {
    return `/api/app-runtime/v1/public/apps/${encodeURIComponent(this.slug)}${suffix}`
  }

  private publicHeaders(): HeadersInit | undefined {
    return this.token ? { Authorization: `Bearer ${this.token}` } : undefined
  }
}

export class OperatorAppRuntimeClient {
  private readonly http: RuntimeHttpClient
  private readonly appId: string
  private readonly csrfToken: string | undefined

  constructor(options: OperatorAppClientOptions) {
    this.http = new RuntimeHttpClient(options)
    this.appId = options.appId
    this.csrfToken = options.csrfToken
  }

  getSummary(): Promise<{ summary: unknown }> {
    return this.http.get(this.path('/summary'))
  }

  getUsage(): Promise<OperatorUsage> {
    return this.http.get(this.path('/usage'))
  }

  getDiscovery(): Promise<{ discovery: AppDiscoveryManifest }> {
    return this.http.get(this.path('/discovery'))
  }

  updateDiscovery(input: {
    discovery_metadata: {
      schema_version: string
      protocols: Array<'mcp' | 'a2a'>
      mcp: Array<Record<string, unknown>>
      a2a: Array<Record<string, unknown>>
    }
  }): Promise<{ app: unknown; discovery: AppDiscoveryManifest }> {
    return this.http.patch(this.path('/discovery'), input, this.writeHeaders())
  }

  updateSettings(input: Record<string, unknown>): Promise<{ app: unknown }> {
    return this.http.patch(this.path('/settings'), input, this.writeHeaders())
  }

  pause(note?: string): Promise<{ app: unknown }> {
    return this.http.post(this.path('/pause'), { note }, this.writeHeaders())
  }

  resume(input: { note?: string; status?: 'preview' | 'active' } = {}): Promise<{ app: unknown }> {
    return this.http.post(this.path('/resume'), input, this.writeHeaders())
  }

  listTokens(): Promise<{ tokens: OperatorPublicToken[] }> {
    return this.http.get(this.path('/tokens'))
  }

  createToken(input: {
    label?: string
    capabilities?: string[]
    expires_at?: string | null
  } = {}): Promise<{ token: CreatedOperatorPublicToken }> {
    return this.http.post(this.path('/tokens'), input, this.writeHeaders())
  }

  revokeToken(tokenId: string): Promise<{ token: { id: string; revoked: true } }> {
    return this.http.post(this.path(`/tokens/${encodeURIComponent(tokenId)}/revoke`), {}, this.writeHeaders())
  }

  rotateToken(tokenId: string, input: {
    label?: string
    capabilities?: string[]
    expires_at?: string | null
  } = {}): Promise<{ token: CreatedOperatorPublicToken; revoked_token_id: string }> {
    return this.http.post(this.path(`/tokens/${encodeURIComponent(tokenId)}/rotate`), input, this.writeHeaders())
  }

  listOrigins(): Promise<{ origins: OperatorAllowedOrigin[] }> {
    return this.http.get(this.path('/origins'))
  }

  addOrigin(origin: string): Promise<{ origin: OperatorAllowedOrigin }> {
    return this.http.post(this.path('/origins'), { origin }, this.writeHeaders())
  }

  removeOrigin(originId: string): Promise<{ origin: { id: string; removed: true } }> {
    return this.http.delete(this.path(`/origins/${encodeURIComponent(originId)}`), this.writeHeaders())
  }

  private path(suffix: string): string {
    return `/api/app-runtime/v1/operator/apps/${encodeURIComponent(this.appId)}${suffix}`
  }

  private writeHeaders(): HeadersInit | undefined {
    return this.csrfToken ? { 'x-csrf-token': this.csrfToken } : undefined
  }
}

export function createPublicAppRuntimeClient(options: PublicAppClientOptions): PublicAppRuntimeClient {
  return new PublicAppRuntimeClient(options)
}

export function createOperatorAppRuntimeClient(options: OperatorAppClientOptions): OperatorAppRuntimeClient {
  return new OperatorAppRuntimeClient(options)
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new LucidAppRuntimeApiError('Lucid App Runtime returned invalid JSON', {
      status: response.status,
      body: text,
    })
  }
}

function normalizeBaseUrl(baseUrl: string): URL {
  try {
    const url = new URL(baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol')
    return url
  } catch {
    throw new TypeError(`Invalid Lucid App Runtime base URL: ${baseUrl}`)
  }
}

function resolvePath(baseUrl: URL, path: string): URL {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  return new URL(normalizedPath, baseUrl.href.endsWith('/') ? baseUrl : `${baseUrl.href}/`)
}
