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
  BrowserQaProviderKind,
  BrowserQaScreenshotInput,
  BrowserQaSession,
  BrowserQaSessionInput,
  BrowserQaSnapshot,
  BrowserQaWaitInput,
} from '../types.js'

type BrowserTab = {
  targetId: string
  title?: string
  url?: string
}

type BrowserActionTabResult = {
  ok: true
  targetId: string
  url?: string
}

export class OpenClawCompatibleBrowserQaProvider implements BrowserQaProvider {
  readonly kind: BrowserQaProviderKind

  private readonly client: BrowserQaHttpClient
  private readonly timeoutMs: number

  constructor(config: BrowserQaProviderConfig) {
    this.kind = config.kind
    this.client = new BrowserQaHttpClient(config, {
      passwordHeader: config.kind === 'openclaw-compatible'
        ? 'x-openclaw-password'
        : 'x-browser-control-password',
    })
    this.timeoutMs = config.timeoutMs
  }

  async healthcheck(): Promise<BrowserQaProviderHealth> {
    try {
      await this.ensureRunning()
      return { ok: true, provider: this.kind }
    } catch (error) {
      return { ok: false, provider: this.kind, message: normalizeError(error) }
    }
  }

  async startSession(input: BrowserQaExecutionInput): Promise<BrowserQaSession> {
    await this.ensureRunning()
    const opened = await this.client.json<BrowserTab>('/tabs/open', {
      method: 'POST',
      body: {
        url: input.targetUrl,
        orgId: input.orgId,
        runId: input.runId,
        stepId: input.stepId,
        workflowId: input.workflowId,
        browserAccountId: input.browserAccountId,
        accountProvider: normalizeGatewayProviderKind(input.accountProvider),
        providerSessionRef: input.providerSessionRef,
        providerProfileRef: input.providerProfileRef,
        providerContextRef: input.providerContextRef,
      },
      timeoutMs: 15000,
    })
    return {
      id: opened.targetId,
      provider: this.kind,
      targetId: opened.targetId,
      targetUrl: input.targetUrl,
      finalUrl: opened.url,
      startedAt: new Date().toISOString(),
    }
  }

  async navigate(input: BrowserQaNavigateInput): Promise<BrowserQaNavigationResult> {
    const result = await this.client.json<BrowserActionTabResult>('/navigate', {
      method: 'POST',
      body: {
        ...browserScope(input),
        url: input.targetUrl,
        targetId: input.targetId ?? input.sessionId,
      },
      timeoutMs: this.timeoutMs,
    })
    return {
      finalUrl: result.url,
      targetId: result.targetId,
    }
  }

  async waitForReady(input: BrowserQaWaitInput): Promise<void> {
    await this.client.json('/act', {
      method: 'POST',
      body: {
        kind: 'wait',
        ...browserScope(input),
        targetId: input.targetId ?? input.sessionId,
        loadState: 'networkidle',
        timeoutMs: 5000,
      },
      timeoutMs: 7000,
    })
  }

  async snapshot(input: BrowserQaSessionInput): Promise<BrowserQaSnapshot> {
    return this.client.json('/snapshot', {
      query: {
        ...browserScopeQuery(input),
        targetId: input.targetId ?? input.sessionId,
        format: 'ai',
        maxChars: '12000',
        interactive: 'true',
        compact: 'true',
      },
      timeoutMs: 20000,
    })
  }

  async screenshot(input: BrowserQaScreenshotInput): Promise<BrowserQaArtifact> {
    return this.client.json('/screenshot', {
      method: 'POST',
      body: {
        ...browserScope(input),
        targetId: input.targetId ?? input.sessionId,
        fullPage: input.fullPage ?? true,
        type: 'png',
      },
      timeoutMs: 20000,
    })
  }

  async collectEvidence(input: BrowserQaSessionInput): Promise<BrowserQaEvidenceCollection> {
    const targetId = input.targetId ?? input.sessionId
    const [consoleWarnings, pageErrors, networkRequests, performance] =
      await Promise.all([
        this.client.json<{ messages?: unknown[] }>('/console', {
          query: { ...browserScopeQuery(input), targetId, level: 'warning' },
          timeoutMs: 20000,
        }).catch((error) => ({ error: normalizeError(error) })),
        this.client.json<{ errors?: unknown[] }>('/errors', {
          query: { ...browserScopeQuery(input), targetId },
          timeoutMs: 20000,
        }).catch((error) => ({ error: normalizeError(error) })),
        this.client.json<{ requests?: unknown[] }>('/requests', {
          query: { ...browserScopeQuery(input), targetId },
          timeoutMs: 20000,
        }).catch((error) => ({ error: normalizeError(error) })),
        this.client.json<{ result?: unknown }>('/act', {
          method: 'POST',
          body: {
            ...browserScope(input),
            kind: 'evaluate',
            targetId,
            fn: '() => JSON.stringify({navigation: performance.getEntriesByType("navigation")[0]?.toJSON?.() ?? null, paint: performance.getEntriesByType("paint").map((entry) => entry.toJSON())})',
            approvalState: 'approved',
            timeoutMs: 5000,
          },
          timeoutMs: 7000,
        }).catch((error) => ({ error: normalizeError(error) })),
      ])

    return {
      consoleWarnings,
      pageErrors,
      networkRequests,
      performance,
    }
  }

  async closeSession(input: BrowserQaSessionInput): Promise<void> {
    await this.client.request(`/tabs/${encodeURIComponent(input.targetId ?? input.sessionId)}`, {
      method: 'DELETE',
      query: browserScopeQuery(input),
      timeoutMs: 5000,
    }).catch(() => null)
  }

  private async ensureRunning(): Promise<void> {
    const status = await this.client.json<{ running?: boolean }>('/', { timeoutMs: 1500 })
    if (status.running === false) {
      await this.client.json('/start', { method: 'POST', timeoutMs: 15000 })
    }
  }
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeGatewayProviderKind(kind: BrowserQaProviderKind | null | undefined): string | undefined {
  if (!kind) return undefined
  if (kind === 'remote-cdp') return 'remote-cdp'
  if (kind === 'lucid-managed') return 'playwright'
  if (kind === 'openclaw-compatible' || kind === 'hermes' || kind === 'stagehand') return undefined
  return kind
}

function browserScope(input: BrowserQaExecutionInput): Record<string, string> {
  return {
    ...(input.orgId ? { orgId: input.orgId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
  }
}

function browserScopeQuery(input: BrowserQaExecutionInput): Record<string, string | undefined> {
  return {
    orgId: input.orgId ?? undefined,
    runId: input.runId ?? undefined,
  }
}
