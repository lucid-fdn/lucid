import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import net from 'node:net'

import {
  LocalBrowserQaArtifactStore,
  type BrowserQaArtifactStore,
} from './artifact-store.js'
import {
  noopBrowserQaQuotaGuard,
  noopBrowserQaUsageRecorder,
  type BrowserQaQuotaGuard,
  type BrowserQaUsageEventType,
  type BrowserQaUsageRecorder,
} from './usage-accounting.js'
import {
  assertLocatorNotSensitive,
  classifyGatewayActionRisk,
  normalizeActionKind,
  requiredActionSelector,
} from './action-safety.js'
import type {
  BrowserGatewayActionLayer,
  BrowserGatewayProviderConfig,
  BrowserGatewayProviderKind,
} from './provider-config.js'
import {
  BrowserSessionPool,
  type BrowserPoolLease,
  type BrowserSessionPoolMetrics,
} from '../../../browser-pool/session-pool.js'

type PlaywrightModule = typeof import('playwright')
type Browser = Awaited<ReturnType<PlaywrightModule['chromium']['launch']>>
type BrowserContext = Awaited<ReturnType<Browser['newContext']>>
type Page = Awaited<ReturnType<BrowserContext['newPage']>>

type BrowserTabState = {
  targetId: string
  context: BrowserContext
  page: Page
  createdAt: number
  orgId?: string
  runId?: string
  stepId?: string
  browserAccountId?: string
  accountProvider?: BrowserGatewayProviderKind
  providerSessionRef?: string
  providerProfileRef?: string
  providerContextRef?: string
  lease?: BrowserPoolLease
  consoleMessages: unknown[]
  pageErrors: unknown[]
  requests: Map<string, Record<string, unknown>>
  events: BrowserGatewayReplayEvent[]
  artifactBytes: number
  screenshotCount: number
  actionCount: number
  snapshotCount: number
  navigationCount: number
}

type BrowserGatewayReplayEvent = {
  id: string
  type: string
  timestamp: string
  provider: BrowserGatewayProviderKind
  actionLayer: BrowserGatewayActionLayer
  targetId: string
  orgId?: string | null
  runId?: string | null
  stepId?: string | null
  browserAccountId?: string | null
  accountProvider?: BrowserGatewayProviderKind | null
  providerSessionRef?: string | null
  providerProfileRef?: string | null
  providerContextRef?: string | null
  url?: string | null
  metadata: Record<string, unknown>
}

export type PlaywrightBrowserGatewayConfig = {
  allowPrivateNetwork: boolean
  artifactDir: string
  publicBaseUrl?: string
  headless: boolean
  sessionTtlSeconds: number
  maxConcurrency: number
  maxScreenshotBytes: number
  maxConcurrencyPerOrg: number
  leaseWaitTimeoutMs: number
  memoryPressureLimitMb: number
  artifactStore?: BrowserQaArtifactStore
  quotaGuard?: BrowserQaQuotaGuard
  usageRecorder?: BrowserQaUsageRecorder
  provider?: BrowserGatewayProviderConfig
}

export class PlaywrightBrowserGatewayService {
  private browser: Browser | null = null
  private launchPromise: Promise<Browser> | null = null
  private readonly tabs = new Map<string, BrowserTabState>()
  private readonly allowedUrlCache = new Map<string, boolean>()
  private openingTabs = 0
  private readonly sessionPool: BrowserSessionPool
  private readonly artifactStore: BrowserQaArtifactStore
  private readonly quotaGuard: BrowserQaQuotaGuard
  private readonly usageRecorder: BrowserQaUsageRecorder

  constructor(private readonly config: PlaywrightBrowserGatewayConfig) {
    this.artifactStore = config.artifactStore ?? new LocalBrowserQaArtifactStore({
      artifactDir: config.artifactDir,
      publicBaseUrl: config.publicBaseUrl,
    })
    this.quotaGuard = config.quotaGuard ?? noopBrowserQaQuotaGuard
    this.usageRecorder = config.usageRecorder ?? noopBrowserQaUsageRecorder
    this.sessionPool = new BrowserSessionPool({
      maxConcurrency: Math.max(1, config.maxConcurrency),
      maxConcurrencyPerOrg: Math.max(0, config.maxConcurrencyPerOrg ?? config.maxConcurrency),
      leaseWaitTimeoutMs: Math.max(1, config.leaseWaitTimeoutMs ?? 5000),
      maxLeaseMs: Math.max(1, config.sessionTtlSeconds * 1000),
    })
  }

  async status(): Promise<{
    running: boolean
    tabs: number
    provider: BrowserGatewayProviderKind
    actionLayer: BrowserGatewayActionLayer
    providerRouting: {
      selectedReason: string
      externalProvidersEnabled: boolean
      byoProvidersEnabled: boolean
      premiumFallbackEnabled: boolean
      disabledCandidates: BrowserGatewayProviderKind[]
    }
    pool: BrowserSessionPoolMetrics & {
      memoryPressure: 'normal' | 'high'
      rssMb: number
      limitMb: number
    }
  }> {
    this.cleanupExpiredTabs()
    return {
      running: Boolean(this.browser),
      tabs: this.tabs.size,
      provider: this.providerKind,
      actionLayer: this.actionLayer,
      providerRouting: this.providerRoutingStatus(),
      pool: this.poolStatus(),
    }
  }

  async providerHealth(): Promise<{
    ok: boolean
    provider: BrowserGatewayProviderKind
    actionLayer: BrowserGatewayActionLayer
    running: boolean
    tabs: number
    cdpConfigured: boolean
    actionLayerConfigured: boolean
    providerRouting: {
      selectedReason: string
      externalProvidersEnabled: boolean
      byoProvidersEnabled: boolean
      premiumFallbackEnabled: boolean
      disabledCandidates: BrowserGatewayProviderKind[]
    }
    pool: BrowserSessionPoolMetrics & {
      memoryPressure: 'normal' | 'high'
      rssMb: number
      limitMb: number
    }
    message?: string
  }> {
    this.cleanupExpiredTabs()
    const cdpConfigured = this.providerKind === 'playwright' || Boolean(this.config.provider?.cdpWsUrl)
    const actionLayerConfigured = this.actionLayer === 'none' || Boolean(this.config.provider?.actionLayerControlUrl)
    const ok = cdpConfigured && actionLayerConfigured
    return {
      ok,
      provider: this.providerKind,
      actionLayer: this.actionLayer,
      running: Boolean(this.browser),
      tabs: this.tabs.size,
      cdpConfigured,
      actionLayerConfigured,
      providerRouting: this.providerRoutingStatus(),
      pool: this.poolStatus(),
      message: ok
        ? undefined
        : `Browser gateway provider ${this.providerKind} or action layer ${this.actionLayer} is missing required runtime configuration`,
    }
  }

  async start(): Promise<{
    running: true
    provider: BrowserGatewayProviderKind
    actionLayer: BrowserGatewayActionLayer
  }> {
    await this.ensureBrowser()
    return { running: true, provider: this.providerKind, actionLayer: this.actionLayer }
  }

  async openTab(input: {
    url?: string
    orgId?: string
    runId?: string
    stepId?: string
    browserAccountId?: string
    accountProvider?: BrowserGatewayProviderKind
    providerSessionRef?: string
    providerProfileRef?: string
    providerContextRef?: string
  } = {}): Promise<{ targetId: string; title?: string; url?: string }> {
    this.cleanupExpiredTabs()
    const memoryPressure = this.memoryPressure()
    if (memoryPressure.state === 'high') {
      throw new Error(`Browser pool memory pressure is high (${memoryPressure.rssMb}MB/${memoryPressure.limitMb}MB)`)
    }
    const lease = await this.sessionPool.acquire({ orgId: input.orgId })
    this.openingTabs += 1

    let context: BrowserContext | undefined
    if (input.url) await this.assertAllowedUrl(input.url)

    try {
      await this.quotaGuard.assertCanOpenSession({
        orgId: input.orgId,
        runId: input.runId,
      })
      this.assertAccountProviderAffinity(input)

      const browser = await this.ensureBrowser()
      context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      })
      await context.route('**/*', async (route) => {
        const requestUrl = route.request().url()
        try {
          await this.assertAllowedUrl(requestUrl, { allowBrowserInternal: true })
          await route.continue()
        } catch {
          await route.abort('blockedbyclient')
        }
      })
      const page = await context.newPage()
      const targetId = crypto.randomUUID()
      const started = Date.now()
      const tab: BrowserTabState = {
        targetId,
        context,
        page,
        createdAt: Date.now(),
        orgId: input.orgId,
        runId: input.runId,
        stepId: input.stepId,
        browserAccountId: input.browserAccountId,
        accountProvider: input.accountProvider,
        providerSessionRef: input.providerSessionRef,
        providerProfileRef: input.providerProfileRef,
        providerContextRef: input.providerContextRef,
        lease,
        consoleMessages: [],
        pageErrors: [],
        requests: new Map(),
        events: [],
        artifactBytes: 0,
        screenshotCount: 0,
        actionCount: 0,
        snapshotCount: 0,
        navigationCount: 0,
      }
      this.attachInstrumentation(tab)
      this.tabs.set(targetId, tab)

      if (input.url) {
        await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        tab.navigationCount += 1
      }
      this.audit('tab_opened', tab, { url: page.url() })
      this.recordUsage('session_started', tab, {
        targetUrl: page.url(),
        durationMs: Date.now() - started,
        metadata: {
          initialUrl: input.url ?? null,
          hasInitialNavigation: Boolean(input.url),
        },
      })

      return {
        targetId,
        title: await page.title().catch(() => undefined),
        url: page.url(),
      }
    } catch (error) {
      await context?.close().catch(() => null)
      this.sessionPool.release(lease.id)
      throw error
    } finally {
      this.openingTabs -= 1
    }
  }

  sessionDetails(targetId: string): {
    ok: true
    targetId: string
    sessionKey: string
    url: string
    createdAt: string
    provider: BrowserGatewayProviderKind
    actionLayer: BrowserGatewayActionLayer
    browserAccountId?: string
    accountProvider?: BrowserGatewayProviderKind
    providerSessionRef?: string
    providerProfileRef?: string
    providerContextRef?: string
    stats: Record<string, unknown>
  } {
    const tab = this.getTab(targetId)
    return {
      ok: true,
      targetId: tab.targetId,
      sessionKey: tab.targetId,
      url: tab.page.url(),
      createdAt: new Date(tab.createdAt).toISOString(),
      provider: this.providerKind,
      actionLayer: this.actionLayer,
      browserAccountId: tab.browserAccountId,
      accountProvider: tab.accountProvider,
      providerSessionRef: tab.providerSessionRef,
      providerProfileRef: tab.providerProfileRef,
      providerContextRef: tab.providerContextRef,
      stats: this.sessionUsageMetadata(tab),
    }
  }

  assertTabScope(input: {
    targetId: string
    orgId?: string | null
    runId?: string | null
  }): void {
    const tab = this.getTab(input.targetId)
    if (tab.orgId && input.orgId !== tab.orgId) {
      throw new Error('Browser tab org scope mismatch')
    }
    if (tab.runId && input.runId !== tab.runId) {
      throw new Error('Browser tab run scope mismatch')
    }
  }

  sessionReplay(targetId: string): {
    ok: true
    targetId: string
    sessionKey: string
    provider: BrowserGatewayProviderKind
    actionLayer: BrowserGatewayActionLayer
    events: BrowserGatewayReplayEvent[]
  } {
    const tab = this.getTab(targetId)
    return {
      ok: true,
      targetId: tab.targetId,
      sessionKey: tab.targetId,
      provider: this.providerKind,
      actionLayer: this.actionLayer,
      events: tab.events.slice(-500),
    }
  }

  async navigate(input: {
    targetId: string
    url: string
    timeoutMs?: number
  }): Promise<{ ok: true; targetId: string; url: string }> {
    const tab = this.getTab(input.targetId)
    await this.assertAllowedUrl(input.url)
    const started = Date.now()
    await tab.page.goto(input.url, {
      waitUntil: 'domcontentloaded',
      timeout: input.timeoutMs ?? 30_000,
    })
    tab.navigationCount += 1
    this.audit('navigated', tab, { url: tab.page.url() })
    this.recordUsage('navigation', tab, {
      targetUrl: tab.page.url(),
      durationMs: Date.now() - started,
      metadata: { requestedUrl: input.url },
    })
    return {
      ok: true,
      targetId: tab.targetId,
      url: tab.page.url(),
    }
  }

  async act(input: {
    targetId: string
    kind: string
    loadState?: 'load' | 'domcontentloaded' | 'networkidle'
    fn?: string
    instruction?: string
    selector?: string
    value?: string
    approvalState?: 'not_required' | 'required' | 'approved' | 'blocked' | 'expired'
    timeoutMs?: number
  }): Promise<Record<string, unknown>> {
    const tab = this.getTab(input.targetId)
    const started = Date.now()
    const kind = normalizeActionKind(input.kind)
    const risk = classifyGatewayActionRisk(kind)
    if ((risk === 'medium' || risk === 'high') && input.approvalState !== 'approved') {
      throw new Error(`Browser action ${kind} requires approval before execution`)
    }

    if (kind === 'wait') {
      await tab.page.waitForLoadState(input.loadState ?? 'networkidle', {
        timeout: input.timeoutMs ?? 5000,
      })
      tab.actionCount += 1
      this.recordUsage('action', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        metadata: { kind, risk, loadState: input.loadState ?? 'networkidle' },
      })
      return { ok: true, targetId: tab.targetId, url: tab.page.url() }
    }

    if (kind === 'evaluate') {
      if (!input.fn) throw new Error('evaluate action requires fn')
      const result = await tab.page.evaluate(input.fn)
      tab.actionCount += 1
      this.recordUsage('action', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        metadata: { kind, risk },
      })
      return { ok: true, targetId: tab.targetId, url: tab.page.url(), result }
    }

    if (kind === 'click') {
      const selector = requiredActionSelector(input.selector, kind)
      await tab.page.locator(selector).first().click({ timeout: input.timeoutMs ?? 10_000 })
      tab.actionCount += 1
      this.recordUsage('action', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        metadata: { kind, risk, selector },
      })
      return { ok: true, targetId: tab.targetId, url: tab.page.url() }
    }

    if (kind === 'hover') {
      const selector = requiredActionSelector(input.selector, kind)
      await tab.page.locator(selector).first().hover({ timeout: input.timeoutMs ?? 10_000 })
      tab.actionCount += 1
      this.recordUsage('action', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        metadata: { kind, risk, selector },
      })
      return { ok: true, targetId: tab.targetId, url: tab.page.url() }
    }

    if (kind === 'press') {
      const selector = requiredActionSelector(input.selector, kind)
      await assertLocatorNotSensitive(tab.page.locator(selector).first(), selector)
      const key = input.value?.trim()
      if (!key) throw new Error('Browser action press requires value')
      await tab.page.locator(selector).first().press(key, { timeout: input.timeoutMs ?? 10_000 })
      tab.actionCount += 1
      this.recordUsage('action', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        metadata: { kind, risk, selector, keyLength: key.length },
      })
      return { ok: true, targetId: tab.targetId, url: tab.page.url() }
    }

    if (kind === 'type') {
      const selector = requiredActionSelector(input.selector, kind)
      await assertLocatorNotSensitive(tab.page.locator(selector).first(), selector)
      await tab.page.locator(selector).first().fill(input.value ?? '', { timeout: input.timeoutMs ?? 10_000 })
      tab.actionCount += 1
      this.recordUsage('action', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        metadata: { kind, risk, selector, valueLength: input.value?.length ?? 0 },
      })
      return { ok: true, targetId: tab.targetId, url: tab.page.url() }
    }

    if (kind === 'select') {
      const selector = requiredActionSelector(input.selector, kind)
      await tab.page.locator(selector).first().selectOption(input.value ?? '', { timeout: input.timeoutMs ?? 10_000 })
      tab.actionCount += 1
      this.recordUsage('action', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        metadata: { kind, risk, selector, valueLength: input.value?.length ?? 0 },
      })
      return { ok: true, targetId: tab.targetId, url: tab.page.url() }
    }

    if (kind === 'check' || kind === 'uncheck') {
      const selector = requiredActionSelector(input.selector, kind)
      const locator = tab.page.locator(selector).first()
      if (kind === 'check') {
        await locator.check({ timeout: input.timeoutMs ?? 10_000 })
      } else {
        await locator.uncheck({ timeout: input.timeoutMs ?? 10_000 })
      }
      tab.actionCount += 1
      this.recordUsage('action', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        metadata: { kind, risk, selector },
      })
      return { ok: true, targetId: tab.targetId, url: tab.page.url() }
    }

    if (kind === 'wait_for_selector') {
      const selector = requiredActionSelector(input.selector, kind)
      await tab.page.locator(selector).first().waitFor({
        state: 'visible',
        timeout: input.timeoutMs ?? 10_000,
      })
      tab.actionCount += 1
      this.recordUsage('action', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        metadata: { kind, risk, selector },
      })
      return { ok: true, targetId: tab.targetId, url: tab.page.url() }
    }

    if (kind === 'scroll') {
      const distance = Number(input.value ?? 800)
      await tab.page.evaluate((scrollY) => {
        const pageGlobal = globalThis as unknown as {
          scrollBy: (options: { top: number; behavior: 'instant' }) => void
        }
        pageGlobal.scrollBy({ top: scrollY, behavior: 'instant' })
      }, Number.isFinite(distance) ? distance : 800)
      tab.actionCount += 1
      this.recordUsage('action', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        metadata: { kind, risk },
      })
      return { ok: true, targetId: tab.targetId, url: tab.page.url() }
    }

    if (kind === 'submit') {
      const selector = requiredActionSelector(input.selector, kind)
      await tab.page.locator(selector).first().click({ timeout: input.timeoutMs ?? 10_000 })
      tab.actionCount += 1
      this.recordUsage('action', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        metadata: { kind, risk, selector, approvalState: input.approvalState },
      })
      return { ok: true, targetId: tab.targetId, url: tab.page.url() }
    }

    if (kind === 'stagehand' || kind === 'browser_use' || kind === 'extract') {
      const result = await this.executeActionLayer({
        tab,
        instruction: input.instruction ?? input.fn ?? '',
        timeoutMs: input.timeoutMs,
      })
      tab.actionCount += 1
      this.recordUsage('action', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        metadata: { kind, risk, actionLayer: this.actionLayer },
      })
      return { ok: true, targetId: tab.targetId, url: tab.page.url(), result }
    }

    throw new Error(`Unsupported browser action kind: ${kind}`)
  }

  async snapshot(input: {
    targetId: string
    maxChars?: number
  }): Promise<{
    ok: true
    targetId: string
    url: string
    snapshot: string
    truncated: boolean
    stats: Record<string, unknown>
  }> {
    const tab = this.getTab(input.targetId)
    const started = Date.now()
    const maxChars = input.maxChars ?? 12_000
    const [title, text, links, buttons] = await Promise.all([
      tab.page.title().catch(() => ''),
      tab.page.locator('body').innerText({ timeout: 3000 }).catch(() => ''),
      tab.page.locator('a').evaluateAll((nodes) => nodes.slice(0, 50).map((node) => ({
        text: (node.textContent ?? '').trim(),
        href: (node as { href?: string }).href,
      }))).catch(() => []),
      tab.page.locator('button, [role="button"], input[type="button"], input[type="submit"]').evaluateAll((nodes) =>
        nodes.slice(0, 50).map((node) => (node.textContent ?? (node as { value?: string }).value ?? '').trim()),
      ).catch(() => []),
    ])

    const snapshot = [
      title ? `# ${title}` : '',
      `URL: ${tab.page.url()}`,
      '',
      text,
      '',
      links.length > 0 ? `Links: ${JSON.stringify(links)}` : '',
      buttons.length > 0 ? `Buttons: ${JSON.stringify(buttons)}` : '',
    ].filter(Boolean).join('\n')
    tab.snapshotCount += 1
    this.recordUsage('snapshot', tab, {
      targetUrl: tab.page.url(),
      durationMs: Date.now() - started,
      metadata: {
        chars: snapshot.length,
        truncated: snapshot.length > maxChars,
        links: links.length,
        buttons: buttons.length,
      },
    })

    return {
      ok: true,
      targetId: tab.targetId,
      url: tab.page.url(),
      snapshot: snapshot.slice(0, maxChars),
      truncated: snapshot.length > maxChars,
      stats: {
        chars: snapshot.length,
        links: links.length,
        buttons: buttons.length,
      },
    }
  }

  async screenshot(input: {
    targetId: string
    fullPage?: boolean
    type?: 'png' | 'jpeg'
  }): Promise<{
    ok: true
    targetId: string
    url: string
    contentType: string
    byteLength: number
    uri: string
    path?: string
  }> {
    const tab = this.getTab(input.targetId)
    await this.quotaGuard.assertCanCaptureScreenshot({
      orgId: tab.orgId,
      runId: tab.runId,
    })
    const started = Date.now()
    const type = input.type ?? 'png'
    const screenshotOptions = {
      fullPage: input.fullPage ?? true,
      type,
      timeout: 20_000,
    } as const
    const bytes = await captureScreenshotWithRetry(tab.page, screenshotOptions)
    const contentType = type === 'jpeg' ? 'image/jpeg' : 'image/png'
    if (bytes.byteLength > this.config.maxScreenshotBytes) {
      this.audit('screenshot_capped', tab, {
        byteLength: bytes.byteLength,
        maxScreenshotBytes: this.config.maxScreenshotBytes,
      })
      this.recordUsage('screenshot', tab, {
        targetUrl: tab.page.url(),
        durationMs: Date.now() - started,
        bytes: bytes.byteLength,
        metadata: {
          capped: true,
          type,
          maxScreenshotBytes: this.config.maxScreenshotBytes,
        },
      })
      return {
        ok: true,
        targetId: tab.targetId,
        url: tab.page.url(),
        contentType,
        byteLength: bytes.byteLength,
        uri: '',
      }
    }
    const artifact = await this.writeArtifact(tab, {
      extension: type === 'jpeg' ? 'jpg' : 'png',
      contentType,
      bytes,
    })
    tab.screenshotCount += 1
    tab.artifactBytes += bytes.byteLength
    this.recordUsage('screenshot', tab, {
      targetUrl: tab.page.url(),
      durationMs: Date.now() - started,
      bytes: bytes.byteLength,
      metadata: {
        type,
        fullPage: input.fullPage ?? true,
        artifactUri: artifact.uri,
      },
    })
    return {
      ok: true,
      targetId: tab.targetId,
      url: tab.page.url(),
      contentType,
      byteLength: bytes.byteLength,
      uri: artifact.uri,
      path: artifact.path,
    }
  }

  consoleMessages(targetId: string): { messages: unknown[] } {
    return { messages: this.getTab(targetId).consoleMessages.slice(-100) }
  }

  pageErrors(targetId: string): { errors: unknown[] } {
    return { errors: this.getTab(targetId).pageErrors.slice(-100) }
  }

  networkRequests(targetId: string): { requests: unknown[] } {
    return { requests: Array.from(this.getTab(targetId).requests.values()).slice(-250) }
  }

  async closeTab(targetId: string): Promise<void> {
    const tab = this.tabs.get(targetId)
    if (!tab) return
    this.tabs.delete(targetId)
    this.audit('tab_closed', tab)
    this.recordUsage('session_closed', tab, {
      targetUrl: tab.page.url(),
      durationMs: Date.now() - tab.createdAt,
      metadata: this.sessionUsageMetadata(tab),
    })
    this.sessionPool.release(tab.lease?.id)
    await tab.context.close().catch(() => null)
  }

  async closeAll(): Promise<void> {
    const tabs = Array.from(this.tabs.keys())
    await Promise.all(tabs.map((targetId) => this.closeTab(targetId)))
    await this.browser?.close().catch(() => null)
    this.browser = null
    this.launchPromise = null
  }

  private get providerKind(): BrowserGatewayProviderKind {
    return this.config.provider?.providerKind ?? 'playwright'
  }

  private providerRoutingStatus(): {
    selectedReason: string
    externalProvidersEnabled: boolean
    byoProvidersEnabled: boolean
    premiumFallbackEnabled: boolean
    disabledCandidates: BrowserGatewayProviderKind[]
  } {
    return {
      selectedReason: this.config.provider?.selectedReason ?? 'lucid_playwright_default',
      externalProvidersEnabled: this.config.provider?.externalProvidersEnabled ?? false,
      byoProvidersEnabled: this.config.provider?.byoProvidersEnabled ?? false,
      premiumFallbackEnabled: this.config.provider?.premiumFallbackEnabled ?? false,
      disabledCandidates: this.config.provider?.disabledCandidates ?? [],
    }
  }

  private get actionLayer(): BrowserGatewayActionLayer {
    return this.config.provider?.actionLayer ?? 'none'
  }

  private assertAccountProviderAffinity(input: {
    browserAccountId?: string
    accountProvider?: BrowserGatewayProviderKind
    providerSessionRef?: string
    providerProfileRef?: string
    providerContextRef?: string
  }): void {
    if (!input.browserAccountId) return
    const accountProvider = input.accountProvider
    if (!accountProvider) return
    if (accountProvider !== this.providerKind) {
      throw new Error(
        `Browser account ${input.browserAccountId} is pinned to ${accountProvider}; gateway is configured for ${this.providerKind}. Reconnect or route to the matching browser gateway before opening an authenticated session.`,
      )
    }
    if (
      accountProvider !== 'playwright'
      && !input.providerSessionRef
      && !input.providerProfileRef
      && !input.providerContextRef
    ) {
      throw new Error(
        `Browser account ${input.browserAccountId} is pinned to ${accountProvider} but no provider session/profile/context ref was supplied.`,
      )
    }
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser) return this.browser
    if (this.launchPromise) return this.launchPromise

    this.launchPromise = (async () => {
      const { chromium } = await import('playwright')
      const browser = this.providerKind === 'playwright'
        ? await chromium.launch({
            headless: this.config.headless,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
          })
        : await chromium.connectOverCDP(
            this.buildCdpEndpoint(),
            this.buildCdpConnectOptions(),
          )
      this.browser = browser
      browser.on('disconnected', () => {
        this.sessionPool.recordBrowserCrash()
      })
      return browser
    })()

    try {
      return await this.launchPromise
    } finally {
      this.launchPromise = null
    }
  }

  private buildCdpEndpoint(): string {
    const endpoint = this.config.provider?.cdpWsUrl
    if (!endpoint) {
      throw new Error(`Browser gateway provider ${this.providerKind} requires a CDP websocket URL`)
    }
    if (this.providerKind !== 'browserless') return endpoint

    const token = this.config.provider?.cdpToken
    if (!token) return endpoint

    const url = new URL(endpoint)
    if (!url.searchParams.has('token')) {
      url.searchParams.set('token', token)
    }
    return url.toString()
  }

  private buildCdpConnectOptions(): Record<string, unknown> | undefined {
    const token = this.config.provider?.cdpToken
    if (!token) return undefined
    return {
      headers: {
        authorization: `Bearer ${token}`,
      },
      timeout: 30_000,
    }
  }

  private attachInstrumentation(tab: BrowserTabState): void {
    tab.page.on('console', (message) => {
      if (!['warning', 'error'].includes(message.type())) return
      tab.consoleMessages.push({
        type: message.type(),
        text: message.text(),
        location: message.location(),
        timestamp: new Date().toISOString(),
      })
    })
    tab.page.on('pageerror', (error) => {
      tab.pageErrors.push({
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      })
    })
    tab.page.on('request', (request) => {
      tab.requests.set(request.url(), {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        startedAt: new Date().toISOString(),
      })
    })
    tab.page.on('response', (response) => {
      const request = response.request()
      tab.requests.set(request.url(), {
        ...(tab.requests.get(request.url()) ?? {}),
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        status: response.status(),
        statusText: response.statusText(),
        finishedAt: new Date().toISOString(),
      })
    })
    tab.page.on('requestfailed', (request) => {
      tab.requests.set(request.url(), {
        ...(tab.requests.get(request.url()) ?? {}),
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        failed: true,
        errorText: request.failure()?.errorText,
        finishedAt: new Date().toISOString(),
      })
    })
  }

  private async assertAllowedUrl(
    rawUrl: string,
    options: { allowBrowserInternal?: boolean } = {},
  ): Promise<void> {
    let url: URL
    try {
      url = new URL(rawUrl)
    } catch {
      throw new Error('Browser QA target must be a valid URL')
    }
    if (
      options.allowBrowserInternal
      && ['about:', 'blob:', 'data:'].includes(url.protocol)
    ) {
      return
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Browser QA target must use http or https')
    }
    if (this.config.allowPrivateNetwork) return

    const hostname = url.hostname.toLowerCase()
    const cacheKey = `${url.protocol}//${hostname}`
    if (this.allowedUrlCache.get(cacheKey)) return

    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw new Error('Browser QA target resolves to a private or local network address')
    }

    const directIpVersion = net.isIP(hostname)
    const addresses = directIpVersion > 0
      ? [{ address: hostname }]
      : await dns.lookup(hostname, { all: true, verbatim: false })

    if (addresses.some(({ address }) => isPrivateOrLocalAddress(address))) {
      throw new Error('Browser QA target resolves to a private or local network address')
    }
    this.allowedUrlCache.set(cacheKey, true)
  }

  private audit(event: string, tab: BrowserTabState, extra: Record<string, unknown> = {}): void {
    const replayEvent: BrowserGatewayReplayEvent = {
      id: crypto.randomUUID(),
      type: event,
      timestamp: new Date().toISOString(),
      provider: this.providerKind,
      actionLayer: this.actionLayer,
      targetId: tab.targetId,
      orgId: tab.orgId ?? null,
      runId: tab.runId ?? null,
      stepId: tab.stepId ?? null,
      browserAccountId: tab.browserAccountId ?? null,
      accountProvider: tab.accountProvider ?? null,
      providerSessionRef: tab.providerSessionRef ?? null,
      providerProfileRef: tab.providerProfileRef ?? null,
      providerContextRef: tab.providerContextRef ?? null,
      url: safeCurrentUrl(tab),
      metadata: scrubProviderPayload(extra),
    }
    tab.events.push(replayEvent)
    if (tab.events.length > 1000) tab.events.splice(0, tab.events.length - 1000)

    console.info('[browser-qa-gateway]', {
      event,
      provider: this.providerKind,
      actionLayer: this.actionLayer,
      targetId: tab.targetId,
      orgId: tab.orgId ?? null,
      runId: tab.runId ?? null,
      stepId: tab.stepId ?? null,
      browserAccountId: tab.browserAccountId ?? null,
      ...extra,
    })
  }

  private async writeArtifact(
    tab: BrowserTabState,
    input: {
      extension: string
      contentType: string
      bytes: Buffer
    },
  ): Promise<{ uri: string; path?: string }> {
    const now = new Date()
    const safeOrg = safePathSegment(tab.orgId ?? 'unknown-org')
    const safeRun = safePathSegment(tab.runId ?? 'unknown-run')
    const safeStep = safePathSegment(tab.stepId ?? 'unknown-step')
    const fileName = `${now.toISOString().replace(/[:.]/g, '-')}-${tab.targetId}.${input.extension}`
    const artifact = await this.artifactStore.write({
      pathSegments: [
        safeOrg,
        safeRun,
        safeStep,
      ],
      fileName,
      bytes: input.bytes,
      contentType: input.contentType,
    })

    this.audit('artifact_written', tab, {
      uri: artifact.uri,
      byteLength: input.bytes.byteLength,
      contentType: input.contentType,
      storageKind: artifact.storageKind,
    })
    this.recordUsage('artifact_written', tab, {
      targetUrl: tab.page.url(),
      bytes: input.bytes.byteLength,
      metadata: {
        uri: artifact.uri,
        artifactKey: artifact.key,
        storageKind: artifact.storageKind,
        contentType: input.contentType,
      },
    })
    return { uri: artifact.uri, path: artifact.path }
  }

  private getTab(targetId: string): BrowserTabState {
    this.cleanupExpiredTabs()
    const tab = this.tabs.get(targetId)
    if (!tab) throw new Error(`Browser tab not found: ${targetId}`)
    return tab
  }

  private cleanupExpiredTabs(): void {
    this.sessionPool.sweepExpired()
    const cutoff = Date.now() - this.config.sessionTtlSeconds * 1000
    for (const [targetId, tab] of this.tabs.entries()) {
      if (tab.createdAt < cutoff) {
        this.tabs.delete(targetId)
        this.audit('tab_expired', tab)
        this.recordUsage('session_expired', tab, {
          targetUrl: tab.page.url(),
          durationMs: Date.now() - tab.createdAt,
          metadata: this.sessionUsageMetadata(tab),
        })
        this.sessionPool.release(tab.lease?.id)
        void tab.context.close().catch(() => null)
      }
    }
  }

  private recordUsage(
    eventType: BrowserQaUsageEventType,
    tab: BrowserTabState,
    input: {
      targetUrl?: string
      durationMs?: number
      bytes?: number
      metadata?: Record<string, unknown>
    } = {},
  ): void {
    const event = {
      orgId: tab.orgId,
      runId: tab.runId,
      stepId: tab.stepId,
      sessionKey: tab.targetId,
      targetId: tab.targetId,
      provider: this.providerKind,
      eventType,
      targetUrl: input.targetUrl,
      durationMs: input.durationMs,
      bytes: input.bytes,
      requestCount: tab.requests.size,
      consoleErrorCount: tab.consoleMessages.length,
      pageErrorCount: tab.pageErrors.length,
      metadata: input.metadata,
    }

    try {
      void this.usageRecorder.record(event).catch((error) => {
        this.auditUsageFailure(tab, error)
      })
    } catch (error) {
      this.auditUsageFailure(tab, error)
    }
  }

  private auditUsageFailure(tab: BrowserTabState, error: unknown): void {
    console.warn('[browser-qa-gateway]', {
      event: 'usage_accounting_failed',
      targetId: tab.targetId,
      orgId: tab.orgId ?? null,
      runId: tab.runId ?? null,
      stepId: tab.stepId ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  private sessionUsageMetadata(tab: BrowserTabState): Record<string, unknown> {
    return {
      provider: this.providerKind,
      actionLayer: this.actionLayer,
      artifactBytes: tab.artifactBytes,
      screenshotCount: tab.screenshotCount,
      actionCount: tab.actionCount,
      snapshotCount: tab.snapshotCount,
      navigationCount: tab.navigationCount,
      requestCount: tab.requests.size,
      consoleErrorCount: tab.consoleMessages.length,
      pageErrorCount: tab.pageErrors.length,
      leaseWaitMs: tab.lease?.waitMs ?? 0,
      poolPressure: this.sessionPool.metrics().pressure,
    }
  }

  private poolStatus(): BrowserSessionPoolMetrics & {
    memoryPressure: 'normal' | 'high'
    rssMb: number
    limitMb: number
  } {
    const memoryPressure = this.memoryPressure()
    return {
      ...this.sessionPool.metrics(),
      memoryPressure: memoryPressure.state,
      rssMb: memoryPressure.rssMb,
      limitMb: memoryPressure.limitMb,
    }
  }

  private memoryPressure(): { state: 'normal' | 'high'; rssMb: number; limitMb: number } {
    const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024)
    const limitMb = this.config.memoryPressureLimitMb ?? 0
    if (limitMb <= 0) return { state: 'normal', rssMb, limitMb }
    return {
      state: rssMb >= limitMb ? 'high' : 'normal',
      rssMb,
      limitMb,
    }
  }

  private async executeActionLayer(input: {
    tab: BrowserTabState
    instruction: string
    timeoutMs?: number
  }): Promise<Record<string, unknown>> {
    if (this.actionLayer !== 'stagehand' && this.actionLayer !== 'browser-use') {
      throw new Error('Browser action layer is not configured for extraction actions')
    }

    if (!this.config.provider?.actionLayerControlUrl) {
      throw new Error(`${this.actionLayer} action layer requires a control URL on the browser gateway`)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 20_000)
    try {
      const response = await fetch(this.config.provider.actionLayerControlUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.provider.actionLayerApiKey
            ? { authorization: `Bearer ${this.config.provider.actionLayerApiKey}` }
            : {}),
        },
        body: JSON.stringify({
          instruction: input.instruction,
          targetId: input.tab.targetId,
          url: input.tab.page.url(),
        }),
        signal: controller.signal,
      })
      const text = await response.text()
      const payload = parseJsonObject(text) ?? { text }
      if (!response.ok) {
        throw new Error(`${this.actionLayer} action layer failed (${response.status}): ${truncate(text, 500)}`)
      }
      return {
        provider: this.actionLayer,
        mode: 'gateway-control',
        payload: scrubProviderPayload(payload),
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}

function safePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 120)
    || 'unknown'
}

function safeCurrentUrl(tab: BrowserTabState): string | null {
  try {
    return tab.page.url()
  } catch {
    return null
  }
}

async function captureScreenshotWithRetry(
  page: Page,
  options: NonNullable<Parameters<Page['screenshot']>[0]>,
): Promise<Buffer> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await page.screenshot(options)
    } catch (error) {
      lastError = error
      if (!isTransientScreenshotError(error) || attempt === 1) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw lastError
}

function isTransientScreenshotError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Page\.captureScreenshot|Unable to capture screenshot|Target page, context or browser has been closed/i.test(message)
}

function isPrivateOrLocalAddress(address: string): boolean {
  const version = net.isIP(address)
  if (version === 4) return isPrivateOrLocalIpv4(address)
  if (version === 6) return isPrivateOrLocalIpv6(address)
  return false
}

function isPrivateOrLocalIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }
  const [a, b] = parts
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224
}

function isPrivateOrLocalIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:169.254.')
    || normalized.startsWith('::ffff:192.168.')
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
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

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value
}
