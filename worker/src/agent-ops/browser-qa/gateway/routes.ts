import type { Application, NextFunction, Request, Response as ExpressResponse } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Config } from '../../../config.js'
import { buildBrowserQaArtifactStore } from './artifact-store.js'
import {
  assertBrowserGatewayRuntimePacketSafe,
  evaluateBrowserGatewayCredentialAccess,
  BROWSER_OPERATOR_RAW_CREDENTIALS_FEATURE_FLAG,
  type BrowserGatewayRuntimeCredentialRef,
} from './credential-resolver.js'
import { PlaywrightBrowserGatewayService } from './playwright-service.js'
import { resolveBrowserGatewayProviderConfig } from './provider-config.js'
import { SupabaseBrowserQaQuotaGuard, SupabaseBrowserQaUsageRecorder } from './usage-accounting.js'

export function registerBrowserQaGatewayRoutes(app: Application, config: Config, supabase?: SupabaseClient): {
  close(): Promise<void>
} {
  const artifactStore = buildBrowserQaArtifactStore({
    storeKind: config.BROWSER_QA_ARTIFACT_STORE,
    artifactDir: config.BROWSER_QA_ARTIFACT_DIR,
    bucket: config.BROWSER_QA_ARTIFACT_BUCKET,
    publicBaseUrl: config.BROWSER_QA_PUBLIC_BASE_URL,
    supabase,
  })

  const service = new PlaywrightBrowserGatewayService({
    allowPrivateNetwork: config.BROWSER_QA_ALLOW_PRIVATE_NETWORK,
    artifactDir: config.BROWSER_QA_ARTIFACT_DIR,
    publicBaseUrl: config.BROWSER_QA_PUBLIC_BASE_URL,
    headless: config.BROWSER_QA_HEADLESS,
    maxConcurrency: config.BROWSER_QA_MAX_CONCURRENCY,
    maxConcurrencyPerOrg: config.BROWSER_QA_MAX_CONCURRENCY_PER_ORG,
    leaseWaitTimeoutMs: config.BROWSER_QA_LEASE_WAIT_TIMEOUT_MS,
    memoryPressureLimitMb: config.BROWSER_QA_MEMORY_PRESSURE_LIMIT_MB,
    maxScreenshotBytes: config.BROWSER_QA_MAX_SCREENSHOT_BYTES,
    sessionTtlSeconds: config.BROWSER_QA_SESSION_TTL_SECONDS,
    artifactStore,
    provider: resolveBrowserGatewayProviderConfig(config),
    quotaGuard: supabase ? new SupabaseBrowserQaQuotaGuard(supabase, {
      maxSessionsPerRun: config.BROWSER_QA_MAX_SESSIONS_PER_RUN,
      maxScreenshotsPerRun: config.BROWSER_QA_MAX_SCREENSHOTS_PER_RUN,
    }) : undefined,
    usageRecorder: supabase ? new SupabaseBrowserQaUsageRecorder(supabase) : undefined,
  })

  const requireGatewayAuth = (req: Request, res: ExpressResponse, next: NextFunction) => {
    const expected = config.BROWSER_QA_GATEWAY_TOKEN
      ?? config.BROWSER_QA_CONTROL_TOKEN
      ?? config.WORKER_TRIGGER_SECRET
    if (!expected) return next()
    const authHeader = req.headers.authorization
    if (authHeader !== `Bearer ${expected}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    return next()
  }

  const handle = (
    fn: (req: Request, res: ExpressResponse) => Promise<unknown> | unknown,
  ) => async (req: Request, res: ExpressResponse) => {
    try {
      enforceGatewayPacketSafety(req.body, config)
      const result = await fn(req, res)
      if (!res.headersSent) res.json(result)
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  app.get('/', requireGatewayAuth, handle(() => service.status()))
  app.get('/provider-health', requireGatewayAuth, handle(() => service.providerHealth()))
  app.get('/pool-health', requireGatewayAuth, handle(() => service.status().then((status) => ({
    ok: status.pool.pressure !== 'saturated' && status.pool.memoryPressure !== 'high',
    provider: status.provider,
    pool: status.pool,
    providerRouting: status.providerRouting,
  }))))
  app.post('/start', requireGatewayAuth, handle(() => service.start()))
  app.post('/sessions', requireGatewayAuth, handle((req) => service.openTab({
    url: getOptionalString(req.body?.url),
    orgId: getOptionalString(req.body?.orgId) ?? getOptionalString(req.headers['x-lucid-org-id']),
    runId: getOptionalString(req.body?.runId) ?? getOptionalString(req.headers['x-lucid-run-id']),
    stepId: getOptionalString(req.body?.stepId) ?? getOptionalString(req.headers['x-lucid-step-id']),
    browserAccountId: getOptionalString(req.body?.browserAccountId) ?? getOptionalString(req.body?.browser_account_id),
    accountProvider: normalizeProviderKind(req.body?.accountProvider ?? req.body?.account_provider),
    providerSessionRef: getOptionalString(req.body?.providerSessionRef ?? req.body?.provider_session_ref),
    providerProfileRef: getOptionalString(req.body?.providerProfileRef ?? req.body?.provider_profile_ref),
    providerContextRef: getOptionalString(req.body?.providerContextRef ?? req.body?.provider_context_ref),
  })))
  app.get('/sessions/:sessionKey', requireGatewayAuth, handle((req) => service.sessionDetails(
    scopedTargetId(req, service, getRequiredString(req.params.sessionKey, 'sessionKey')),
  )))
  app.post('/sessions/:sessionKey/actions', requireGatewayAuth, handle((req) => service.act({
    targetId: scopedTargetId(req, service, getRequiredString(req.params.sessionKey, 'sessionKey')),
    kind: getRequiredString(req.body?.kind ?? req.body?.action_kind, 'kind'),
    loadState: normalizeLoadState(req.body?.loadState ?? req.body?.load_state),
    fn: getOptionalString(req.body?.fn),
    instruction: getOptionalString(req.body?.instruction),
    selector: getOptionalString(req.body?.selector),
    value: getOptionalString(req.body?.value),
    approvalState: normalizeApprovalState(req.body?.approvalState ?? req.body?.approval_state),
    timeoutMs: getOptionalNumber(req.body?.timeoutMs ?? req.body?.timeout_ms),
  })))
  app.get('/sessions/:sessionKey/replay', requireGatewayAuth, handle((req) => service.sessionReplay(
    scopedTargetId(req, service, getRequiredString(req.params.sessionKey, 'sessionKey')),
  )))
  app.post('/accounts/:accountId/open', requireGatewayAuth, handle((req) => {
    if (req.body?.credentialRef) {
      const credentialRef = getRuntimeCredentialRef(req.body.credentialRef)
      const decision = evaluateBrowserGatewayCredentialAccess({
        credentialRef,
        rawCredentialsEnabled: config.BROWSER_OPERATOR_RAW_CREDENTIALS_ENABLED,
        enabledFeatureFlags: browserOperatorFeatureFlags(config),
      })
      if (!decision.allowed) {
        throw new Error(`Browser Operator account session denied: ${decision.reasonCodes.join(', ')}`)
      }
    }
    return service.openTab({
      url: getOptionalString(req.body?.url),
      orgId: getOptionalString(req.body?.orgId) ?? getOptionalString(req.headers['x-lucid-org-id']),
      runId: getOptionalString(req.body?.runId) ?? getOptionalString(req.headers['x-lucid-run-id']),
      stepId: getOptionalString(req.body?.stepId) ?? getOptionalString(req.headers['x-lucid-step-id']),
      browserAccountId: getRequiredString(req.params.accountId, 'accountId'),
      accountProvider: normalizeProviderKind(req.body?.accountProvider ?? req.body?.account_provider),
      providerSessionRef: getOptionalString(req.body?.providerSessionRef ?? req.body?.provider_session_ref),
      providerProfileRef: getOptionalString(req.body?.providerProfileRef ?? req.body?.provider_profile_ref),
      providerContextRef: getOptionalString(req.body?.providerContextRef ?? req.body?.provider_context_ref),
    })
  }))
  app.post('/accounts/:accountId/refresh', requireGatewayAuth, handle(async (req) => {
    const status = await service.status()
    return {
      ok: false,
      accountId: getRequiredString(req.params.accountId, 'accountId'),
      status: 'handoff_required',
      reason: 'Account refresh requires provider-specific secure takeover; gateway will not re-authenticate silently.',
      provider: status.provider,
    }
  }))
  app.post('/purchase-runs', requireGatewayAuth, handle((req) => ({
    ok: false,
    status: 'requires_control_plane',
    reason: 'Create Browser Operator purchase runs through the control-plane API so Agent Commerce policy, idempotency, and audit ledgers are recorded before browser side effects.',
    idempotencyKey: getOptionalString(req.body?.idempotencyKey ?? req.body?.idempotency_key) ?? null,
  })))
  app.post('/purchase-runs/:id/policy-check', requireGatewayAuth, handle((req) => ({
    ok: false,
    purchaseRunId: getRequiredString(req.params.id, 'id'),
    status: 'requires_control_plane',
    reason: 'Policy checks must run in the Lucid control plane before checkout automation.',
  })))
  app.post('/purchase-runs/:id/execute', requireGatewayAuth, handle((req) => {
    const approvalState = normalizeApprovalState(req.body?.approvalState ?? req.body?.approval_state)
    if (approvalState !== 'approved') {
      throw new Error('Browser Operator purchase execution requires an approved Agent Commerce decision')
    }
    return {
      ok: false,
      purchaseRunId: getRequiredString(req.params.id, 'id'),
      status: 'provider_adapter_required',
      reason: 'Live checkout execution is intentionally adapter-owned and must be implemented per merchant/provider with receipt capture.',
    }
  }))
  app.post('/purchase-runs/:id/cancel', requireGatewayAuth, handle((req) => ({
    ok: true,
    purchaseRunId: getRequiredString(req.params.id, 'id'),
    status: 'cancel_acknowledged',
    reason: 'Gateway acknowledged cancellation; control plane remains the source of truth for persisted purchase-run state.',
  })))
  app.post('/tabs/open', requireGatewayAuth, handle((req) => service.openTab({
    url: getOptionalString(req.body?.url),
    orgId: getOptionalString(req.body?.orgId) ?? getOptionalString(req.headers['x-lucid-org-id']),
    runId: getOptionalString(req.body?.runId) ?? getOptionalString(req.headers['x-lucid-run-id']),
    stepId: getOptionalString(req.body?.stepId) ?? getOptionalString(req.headers['x-lucid-step-id']),
    browserAccountId: getOptionalString(req.body?.browserAccountId) ?? getOptionalString(req.body?.browser_account_id),
    accountProvider: normalizeProviderKind(req.body?.accountProvider ?? req.body?.account_provider),
    providerSessionRef: getOptionalString(req.body?.providerSessionRef ?? req.body?.provider_session_ref),
    providerProfileRef: getOptionalString(req.body?.providerProfileRef ?? req.body?.provider_profile_ref),
    providerContextRef: getOptionalString(req.body?.providerContextRef ?? req.body?.provider_context_ref),
  })))
  app.post('/navigate', requireGatewayAuth, handle((req) => service.navigate({
    targetId: scopedTargetId(req, service, getRequiredString(req.body?.targetId, 'targetId')),
    url: getRequiredString(req.body?.url, 'url'),
    timeoutMs: getOptionalNumber(req.body?.timeoutMs),
  })))
  app.post('/act', requireGatewayAuth, handle((req) => service.act({
    targetId: scopedTargetId(req, service, getRequiredString(req.body?.targetId, 'targetId')),
    kind: getRequiredString(req.body?.kind, 'kind'),
    loadState: normalizeLoadState(req.body?.loadState),
    fn: getOptionalString(req.body?.fn),
    instruction: getOptionalString(req.body?.instruction),
    selector: getOptionalString(req.body?.selector),
    value: getOptionalString(req.body?.value),
    approvalState: normalizeApprovalState(req.body?.approvalState),
    timeoutMs: getOptionalNumber(req.body?.timeoutMs),
  })))
  app.post('/credential-access/validate', requireGatewayAuth, handle((req) => {
    const credentialRef = getRuntimeCredentialRef(req.body?.credentialRef)
    const decision = evaluateBrowserGatewayCredentialAccess({
      credentialRef,
      rawCredentialsEnabled: config.BROWSER_OPERATOR_RAW_CREDENTIALS_ENABLED,
      enabledFeatureFlags: browserOperatorFeatureFlags(config),
    })
    if (!decision.allowed) {
      return {
        allowed: false,
        reasonCodes: decision.reasonCodes,
      }
    }
    return {
      allowed: true,
      reasonCodes: [],
      runtimeRef: decision.runtimeRef ?? null,
    }
  }))
  app.get('/snapshot', requireGatewayAuth, handle((req) => service.snapshot({
    targetId: scopedTargetId(req, service, getRequiredString(req.query?.targetId, 'targetId')),
    maxChars: getOptionalNumber(req.query?.maxChars),
  })))
  app.post('/screenshot', requireGatewayAuth, handle((req) => service.screenshot({
    targetId: scopedTargetId(req, service, getRequiredString(req.body?.targetId, 'targetId')),
    fullPage: getOptionalBoolean(req.body?.fullPage),
    type: req.body?.type === 'jpeg' ? 'jpeg' : 'png',
  })))
  app.get('/console', requireGatewayAuth, handle((req) => service.consoleMessages(
    scopedTargetId(req, service, getRequiredString(req.query?.targetId, 'targetId')),
  )))
  app.get('/errors', requireGatewayAuth, handle((req) => service.pageErrors(
    scopedTargetId(req, service, getRequiredString(req.query?.targetId, 'targetId')),
  )))
  app.get('/requests', requireGatewayAuth, handle((req) => service.networkRequests(
    scopedTargetId(req, service, getRequiredString(req.query?.targetId, 'targetId')),
  )))
  app.delete('/tabs/:targetId', requireGatewayAuth, handle(async (req) => {
    await service.closeTab(scopedTargetId(req, service, getRequiredString(req.params.targetId, 'targetId')))
    return { ok: true }
  }))
  app.get('/artifacts/*', requireGatewayAuth, handle(async (req, res) => {
    const artifactPath = getRequiredString(req.params[0], 'artifactPath')
    const artifact = await artifactStore.read(artifactPath).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      if (/invalid/i.test(message)) {
        res.status(400).json({ error: 'Invalid artifact path' })
        return null
      }
      if (/not found/i.test(message)) {
        res.status(404).json({ error: 'Artifact not found' })
        return null
      }
      throw error
    })
    if (!artifact) return null

    res.setHeader('Cache-Control', 'private, max-age=3600, immutable')
    res.setHeader('Content-Length', String(artifact.byteLength))
    res.setHeader('Content-Type', artifact.contentType)
    res.send(artifact.bytes)
    return null
  }))

  return {
    close: () => service.closeAll(),
  }
}

function enforceGatewayPacketSafety(body: unknown, config: Config): void {
  assertBrowserGatewayRuntimePacketSafe(body)
  const record = asRecord(body)
  if (!record?.credentialRef) return
  const decision = evaluateBrowserGatewayCredentialAccess({
    credentialRef: getRuntimeCredentialRef(record.credentialRef),
    rawCredentialsEnabled: config.BROWSER_OPERATOR_RAW_CREDENTIALS_ENABLED,
    enabledFeatureFlags: browserOperatorFeatureFlags(config),
  })
  if (!decision.allowed) {
    throw new Error(`Browser Operator credential access denied: ${decision.reasonCodes.join(', ')}`)
  }
}

function scopedTargetId(
  req: Request,
  service: PlaywrightBrowserGatewayService,
  targetId: string,
): string {
  service.assertTabScope({
    targetId,
    orgId: getOptionalString(req.body?.orgId ?? req.body?.org_id ?? req.query?.orgId ?? req.query?.org_id ?? req.headers['x-lucid-org-id']),
    runId: getOptionalString(req.body?.runId ?? req.body?.run_id ?? req.query?.runId ?? req.query?.run_id ?? req.headers['x-lucid-run-id']),
  })
  return targetId
}

function getRequiredString(value: unknown, name: string): string {
  const normalized = getOptionalString(value)
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function getRuntimeCredentialRef(value: unknown): BrowserGatewayRuntimeCredentialRef | null {
  const record = asRecord(value)
  if (!record) return null
  return {
    id: getRequiredString(record.id, 'credentialRef.id'),
    browser_account_id: getRequiredString(record.browser_account_id ?? record.browserAccountId, 'credentialRef.browser_account_id'),
    provider: getRequiredString(record.provider, 'credentialRef.provider'),
    storage_owner: getRequiredString(record.storage_owner ?? record.storageOwner, 'credentialRef.storage_owner') as BrowserGatewayRuntimeCredentialRef['storage_owner'],
    credential_kind: getRequiredString(record.credential_kind ?? record.credentialKind, 'credentialRef.credential_kind'),
    status: getRequiredString(record.status, 'credentialRef.status'),
    requires_feature_flag: getOptionalString(record.requires_feature_flag ?? record.requiresFeatureFlag),
    consent_grant_id: getOptionalString(record.consent_grant_id ?? record.consentGrantId),
  }
}

function browserOperatorFeatureFlags(config: Config): string[] {
  const flags = new Set(
    (config.BROWSER_OPERATOR_FEATURE_FLAGS ?? '')
      .split(',')
      .map((flag) => flag.trim())
      .filter(Boolean),
  )
  if (config.BROWSER_OPERATOR_RAW_CREDENTIALS_ENABLED) {
    flags.add(BROWSER_OPERATOR_RAW_CREDENTIALS_FEATURE_FLAG)
  }
  return Array.from(flags)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function getOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
  }
  return undefined
}

function normalizeLoadState(value: unknown): 'load' | 'domcontentloaded' | 'networkidle' | undefined {
  return value === 'load' || value === 'domcontentloaded' || value === 'networkidle'
    ? value
    : undefined
}

function normalizeProviderKind(value: unknown): 'playwright' | 'browserless' | 'browserbase' | 'steel' | 'remote-cdp' | undefined {
  if (value === 'remote_cdp') return 'remote-cdp'
  if (value === 'playwright' || value === 'browserless' || value === 'browserbase' || value === 'steel' || value === 'remote-cdp') {
    return value
  }
  return undefined
}

function normalizeApprovalState(
  value: unknown,
): 'not_required' | 'required' | 'approved' | 'blocked' | 'expired' | undefined {
  return value === 'not_required'
    || value === 'required'
    || value === 'approved'
    || value === 'blocked'
    || value === 'expired'
    ? value
    : undefined
}
