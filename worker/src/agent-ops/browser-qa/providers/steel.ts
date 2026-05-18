import { BrowserQaHttpClient } from '../http-client.js'
import type {
  BrowserQaArtifact,
  BrowserQaEvidenceCollection,
  BrowserQaExecutionInput,
  BrowserQaNavigateInput,
  BrowserQaNavigationResult,
  BrowserQaProvider,
  BrowserQaProviderConfig,
  BrowserQaProviderHealth,
  BrowserQaScreenshotInput,
  BrowserQaSession,
  BrowserQaSessionInput,
  BrowserQaSnapshot,
} from '../types.js'

type SteelSessionResponse = {
  id?: string
  sessionId?: string
  sessionViewerUrl?: string
  url?: string
  websocketUrl?: string
  websocket_url?: string
}

export class SteelBrowserQaProvider implements BrowserQaProvider {
  readonly kind = 'steel' as const

  private readonly client: BrowserQaHttpClient

  constructor(config: BrowserQaProviderConfig) {
    this.client = new BrowserQaHttpClient(config)
  }

  async healthcheck(): Promise<BrowserQaProviderHealth> {
    try {
      await this.client.request('/health', { timeoutMs: 1500 }).catch(async () => {
        await this.client.request('/', { timeoutMs: 1500 })
      })
      return { ok: true, provider: this.kind }
    } catch (error) {
      return { ok: false, provider: this.kind, message: normalizeError(error) }
    }
  }

  async startSession(input: BrowserQaExecutionInput): Promise<BrowserQaSession> {
    const session: SteelSessionResponse = await this.client.json<SteelSessionResponse>('/v1/sessions', {
      method: 'POST',
      body: {
        metadata: {
          lucid_run_id: input.runId,
          lucid_step_id: input.stepId,
          lucid_workflow_id: input.workflowId,
          lucid_org_id: input.orgId,
        },
      },
      timeoutMs: 15000,
    }).catch(() => ({} as SteelSessionResponse))

    const id = session.id ?? session.sessionId ?? `steel:${input.runId}:${input.stepId}`
    return {
      id,
      provider: this.kind,
      targetUrl: input.targetUrl,
      finalUrl: input.targetUrl,
      startedAt: new Date().toISOString(),
    }
  }

  async navigate(input: BrowserQaNavigateInput): Promise<BrowserQaNavigationResult> {
    return {
      finalUrl: input.targetUrl,
      targetId: input.sessionId,
    }
  }

  async waitForReady(): Promise<void> {
    return undefined
  }

  async snapshot(input: BrowserQaSessionInput): Promise<BrowserQaSnapshot> {
    const scraped = await this.client.json<Record<string, unknown>>('/v1/scrape', {
      method: 'POST',
      body: {
        url: input.targetUrl,
        delay: 1000,
        format: 'markdown',
      },
      timeoutMs: 20000,
    })

    return {
      url: input.targetUrl,
      snapshot: getString(scraped.markdown)
        ?? getString(scraped.content)
        ?? getString(scraped.text)
        ?? JSON.stringify(scraped).slice(0, 12000),
      truncated: false,
      content: {
        provider_payload: scrubProviderPayload(scraped),
      },
    }
  }

  async screenshot(input: BrowserQaScreenshotInput): Promise<BrowserQaArtifact> {
    const response = await this.client.request('/v1/screenshot', {
      method: 'POST',
      body: {
        url: input.targetUrl,
        fullPage: input.fullPage ?? true,
      },
      timeoutMs: 20000,
    })

    const contentType = response.headers.get('content-type') ?? undefined
    if (contentType?.includes('application/json')) {
      const json = await response.json() as Record<string, unknown>
      return {
        uri: getString(json.url) ?? getString(json.path) ?? input.targetUrl,
        url: getString(json.url) ?? undefined,
        path: getString(json.path) ?? undefined,
        contentType,
        content: scrubProviderPayload(json),
      }
    }

    const bytes = await response.arrayBuffer()
    return {
      uri: input.targetUrl,
      contentType,
      byteLength: bytes.byteLength,
      content: {
        provider: this.kind,
        note: 'Steel returned binary screenshot data; durable upload should be handled by the Browser QA gateway artifact store.',
      },
    }
  }

  async collectEvidence(input: BrowserQaSessionInput): Promise<BrowserQaEvidenceCollection> {
    return {
      consoleWarnings: { messages: [] },
      pageErrors: { errors: [] },
      networkRequests: {
        requests: [],
        error: 'Steel quick actions do not expose console/network logs without a connected automation client.',
      },
      performance: {
        result: {
          provider: this.kind,
          note: 'Performance timing requires a connected Playwright/CDP client or Lucid Browser QA gateway.',
          target_url: input.targetUrl,
        },
      },
    }
  }

  async closeSession(input: BrowserQaSessionInput): Promise<void> {
    if (!input.sessionId.startsWith('steel:')) {
      await this.client.request(`/v1/sessions/${encodeURIComponent(input.sessionId)}`, {
        method: 'DELETE',
        timeoutMs: 5000,
      }).catch(() => null)
    }
  }
}

function scrubProviderPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...payload }
  for (const key of Object.keys(copy)) {
    if (/token|secret|password|api[-_]?key/i.test(key)) {
      copy[key] = '[redacted]'
    }
  }
  return copy
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
