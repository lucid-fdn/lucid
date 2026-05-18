import { z } from 'zod'
import type { FrontendBuildBrief } from '@contracts/app-service'
import { AppServiceError } from '../errors'
import { runProviderRequestWithResilience } from '../provider-resilience'

export interface V0ClientOptions {
  apiKey?: string
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export interface V0ProjectResult {
  id: string
  webUrl?: string
  apiUrl?: string
}

export interface V0ChatResult {
  id: string
  projectId?: string
  webUrl?: string
  apiUrl?: string
  latestVersion?: {
    id: string
    status?: 'pending' | 'completed' | 'failed'
    demoUrl?: string
    screenshotUrl?: string
  }
}

export interface V0DeploymentResult {
  id: string
  projectId?: string
  chatId?: string
  versionId?: string
  webUrl?: string
  inspectorUrl?: string
  apiUrl?: string
  readyState?: string
}

export interface V0VersionFile {
  name: string
  content: string
  locked?: boolean
  object?: string
}

export interface V0VersionResult {
  id: string
  status?: 'pending' | 'completed' | 'failed'
  demoUrl?: string
  screenshotUrl?: string
  files: V0VersionFile[]
}

export interface V0DeploymentLogEntry {
  id: string
  deploymentId?: string
  createdAt?: string
  text: string
  type?: 'stdout' | 'stderr'
  level?: 'error' | 'warning' | 'info'
}

export interface V0DeploymentLogsResult {
  logs: V0DeploymentLogEntry[]
  nextSince?: number
}

export interface V0DeploymentErrorsResult {
  error?: string
  fullErrorText?: string
  errorType?: string
  formattedError?: string
}

const V0ProjectResultSchema = z.object({
  id: z.string(),
  webUrl: z.string().optional(),
  apiUrl: z.string().optional(),
}).passthrough()

const V0ChatResultSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  webUrl: z.string().optional(),
  apiUrl: z.string().optional(),
  latestVersion: z.object({
    id: z.string(),
    status: z.enum(['pending', 'completed', 'failed']).optional(),
    demoUrl: z.string().optional(),
    screenshotUrl: z.string().optional(),
  }).passthrough().optional(),
}).passthrough()

const V0DeploymentResultSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  chatId: z.string().optional(),
  versionId: z.string().optional(),
  webUrl: z.string().optional(),
  inspectorUrl: z.string().optional(),
  apiUrl: z.string().optional(),
  readyState: z.string().optional(),
}).passthrough()

const V0VersionFileSchema = z.object({
  name: z.string(),
  content: z.string(),
  locked: z.boolean().optional(),
  object: z.string().optional(),
}).passthrough()

const V0VersionFilesSchema = z.preprocess((value) => {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value !== 'object') return []

  return Object.entries(value as Record<string, unknown>).map(([name, entry]) => {
    if (typeof entry === 'string') {
      return { name, content: entry }
    }
    if (entry && typeof entry === 'object') {
      return {
        name,
        ...(entry as Record<string, unknown>),
      }
    }
    return { name, content: '' }
  })
}, z.array(V0VersionFileSchema))

const V0VersionResultSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  demoUrl: z.string().optional(),
  screenshotUrl: z.string().optional(),
  files: V0VersionFilesSchema.default([]),
}).passthrough()

const V0DeploymentLogEntrySchema = z.object({
  id: z.string(),
  deploymentId: z.string().optional(),
  createdAt: z.string().optional(),
  text: z.string(),
  type: z.enum(['stdout', 'stderr']).optional(),
  level: z.enum(['error', 'warning', 'info']).optional(),
}).passthrough()

const V0DeploymentLogsResultSchema = z.object({
  logs: z.array(V0DeploymentLogEntrySchema).default([]),
  nextSince: z.number().optional(),
}).passthrough()

const V0DeploymentErrorsResultSchema = z.object({
  error: z.string().optional(),
  fullErrorText: z.string().optional(),
  errorType: z.string().optional(),
  formattedError: z.string().optional(),
}).passthrough()

export function getV0BaseUrl(): string {
  return (process.env.V0_API_URL || 'https://api.v0.dev/v1').replace(/\/+$/, '')
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (typeof record.message === 'string') return record.message
    if (typeof record.error === 'string') return record.error
    if (record.error && typeof record.error === 'object') {
      const nested = record.error as Record<string, unknown>
      if (typeof nested.message === 'string') return nested.message
      if (typeof nested.code === 'string') return nested.code
    }
  }
  return fallback
}

function truncateMetadataValue(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 500)
  return JSON.stringify(value).slice(0, 500)
}

export function createV0Metadata(metadata: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => key.length > 0 && key.length <= 40)
      .slice(0, 50)
      .map(([key, value]) => [key, truncateMetadataValue(value)]),
  )
}

export const V0_SYSTEM_PROMPT = `
You generate production-ready Next.js frontends for Lucid App Foundry.
Use the provided public App Runtime API contract and @lucid/app-runtime-sdk only.
Prefer SDK helpers for sessions, chat, leads, feedback, status, and public actions.
Only call /api/app-runtime/v1/public/apps/{slug} and /api/app-runtime/v1/sdk/openapi.json.
Never call internal Lucid APIs, request provider secrets, expose hidden prompts, or invent unavailable integrations.
Forbidden route families include /api/app-services, /api/internal, /api/mission-control, /api/orgs, /api/organizations, /api/oauth, /api/provider-keys, /api/billing, /api/subscriptions, /api/runtimes, and /api/app-runtime/v1/operator.
Never include system prompts, provider refs, OAuth tokens, billing data, org/team/operator IDs, service-role secrets, or private memory.
Build a focused AI service webapp with loading, empty, setup-required, rate-limited, and error states.
`.trim()

export function buildV0GenerationPrompt(brief: FrontendBuildBrief): string {
  return [
    'Create the generated frontend for this Lucid AI agent service.',
    '',
    'FrontendBuildBrief:',
    JSON.stringify(brief, null, 2),
    '',
    'Requirements:',
    '- Use Next.js App Router, React, TypeScript, Tailwind, and accessible components.',
    '- Import Lucid runtime helpers from @lucid/app-runtime-sdk for all Lucid runtime calls.',
    '- Call only the public endpoints listed in public_api_contract.',
    '- Allowed Lucid route prefixes: /api/app-runtime/v1/public/apps/{app_slug} and /api/app-runtime/v1/sdk/openapi.json.',
    '- Forbidden Lucid route prefixes: /api/app-services, /api/internal, /api/mission-control, /api/orgs, /api/organizations, /api/oauth, /api/provider-keys, /api/billing, /api/subscriptions, /api/runtimes, /api/app-runtime/v1/operator.',
    '- Treat generated frontend env vars as public only.',
    '- Treat undeclared tools, integrations, auth, billing, and operator data as setup-required states, not direct API calls.',
    '- Do not include system prompts, provider refs, OAuth tokens, provider keys, service-role secrets, or private memory.',
    '- Include polished visitor-facing service UX and operator-safe error states.',
  ].join('\n')
}

export class V0RestClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: V0ClientOptions = {}) {
    const apiKey = options.apiKey || process.env.V0_API_KEY
    if (!apiKey) {
      throw new AppServiceError('provider_unavailable', 'V0_API_KEY is not configured.', 503, {
        retryable: true,
      })
    }

    this.apiKey = apiKey
    this.baseUrl = (options.baseUrl || getV0BaseUrl()).replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? Number.parseInt(process.env.V0_REQUEST_TIMEOUT_MS || '30000', 10)
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async createProject(input: {
    name: string
    description?: string
    instructions?: string
    metadata?: Record<string, unknown>
  }): Promise<V0ProjectResult> {
    const payload = await this.request('/projects', {
      method: 'POST',
      body: {
        name: input.name,
        description: input.description,
        instructions: input.instructions,
        metadata: input.metadata ? createV0Metadata(input.metadata) : undefined,
      },
    })
    return V0ProjectResultSchema.parse(payload)
  }

  async createChat(input: {
    projectId: string
    message: string
    system?: string
    metadata?: Record<string, unknown>
  }): Promise<V0ChatResult> {
    const payload = await this.request('/chats', {
      method: 'POST',
      body: {
        projectId: input.projectId,
        message: input.message,
        system: input.system,
        metadata: input.metadata ? createV0Metadata(input.metadata) : undefined,
        mcpServerIds: [],
      },
    })
    return V0ChatResultSchema.parse(payload)
  }

  async sendMessage(input: {
    chatId: string
    message: string
    metadata?: Record<string, unknown>
  }): Promise<V0ChatResult> {
    const payload = await this.request(`/chats/${encodeURIComponent(input.chatId)}/messages`, {
      method: 'POST',
      body: {
        message: input.message,
        metadata: input.metadata ? createV0Metadata(input.metadata) : undefined,
      },
    })
    return V0ChatResultSchema.parse(payload)
  }

  async getChat(chatId: string): Promise<V0ChatResult> {
    const payload = await this.request(`/chats/${encodeURIComponent(chatId)}`, {
      method: 'GET',
    })
    return V0ChatResultSchema.parse(payload)
  }

  async getVersion(input: {
    chatId: string
    versionId: string
    includeDefaultFiles?: boolean
  }): Promise<V0VersionResult> {
    const search = new URLSearchParams()
    if (input.includeDefaultFiles) search.set('includeDefaultFiles', 'true')
    const suffix = search.size > 0 ? `?${search.toString()}` : ''
    const payload = await this.request(
      `/chats/${encodeURIComponent(input.chatId)}/versions/${encodeURIComponent(input.versionId)}${suffix}`,
      { method: 'GET' },
    )
    return V0VersionResultSchema.parse(payload)
  }

  async createDeployment(input: {
    projectId: string
    chatId: string
    versionId: string
  }): Promise<V0DeploymentResult> {
    const payload = await this.request('/deployments', {
      method: 'POST',
      body: input,
    })
    return V0DeploymentResultSchema.parse(payload)
  }

  async getDeployment(deploymentId: string): Promise<V0DeploymentResult> {
    const payload = await this.request(`/deployments/${encodeURIComponent(deploymentId)}`, {
      method: 'GET',
    })
    return V0DeploymentResultSchema.parse(payload)
  }

  async findDeploymentLogs(input: {
    deploymentId: string
    since?: number
  }): Promise<V0DeploymentLogsResult> {
    const search = new URLSearchParams()
    if (typeof input.since === 'number' && Number.isFinite(input.since)) {
      search.set('since', String(input.since))
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : ''
    const payload = await this.request(
      `/deployments/${encodeURIComponent(input.deploymentId)}/logs${suffix}`,
      { method: 'GET' },
    )
    return V0DeploymentLogsResultSchema.parse(payload)
  }

  async findDeploymentErrors(deploymentId: string): Promise<V0DeploymentErrorsResult> {
    const payload = await this.request(`/deployments/${encodeURIComponent(deploymentId)}/errors`, {
      method: 'GET',
    })
    return V0DeploymentErrorsResultSchema.parse(payload)
  }

  private async request(path: string, init: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: Record<string, unknown>
  }): Promise<unknown> {
    return runProviderRequestWithResilience({
      provider: 'v0',
      operation: `${init.method} ${path.split('?')[0]}`,
      execute: async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
        try {
          const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method: init.method,
            headers: {
              authorization: `Bearer ${this.apiKey}`,
              'content-type': 'application/json',
            },
            body: init.body ? JSON.stringify(init.body) : undefined,
            signal: controller.signal,
          })

          const text = await response.text()
          const payload = text ? JSON.parse(text) as unknown : null

          if (!response.ok) {
            throw new AppServiceError(
              response.status === 429 ? 'rate_limited' : 'provider_unavailable',
              getErrorMessage(payload, `v0 API request failed with status ${response.status}.`),
              response.status === 429 ? 429 : 502,
              {
                retryable: response.status === 429 || response.status >= 500,
                details: { provider: 'v0', status: response.status, payload },
              },
            )
          }

          return payload
        } catch (error) {
          if (error instanceof AppServiceError) throw error
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw new AppServiceError('provider_unavailable', 'v0 API request timed out.', 504, {
              retryable: true,
              details: { provider: 'v0' },
            })
          }
          throw error
        } finally {
          clearTimeout(timeout)
        }
      },
    })
  }
}
