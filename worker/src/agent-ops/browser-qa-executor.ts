import crypto from 'node:crypto'
import type { Config } from '../config.js'
import type { StepExecutionResult } from '../processors/relay-step.js'
import type { StepRunPacket } from '../runtime/data-sink.js'
import {
  buildBrowserQaOutput,
  buildUnavailableBrowserQaOutput,
  normalizeBrowserQaError,
} from './browser-qa/evidence-normalizer.js'
import {
  evaluateBrowserOperatorTrust,
  normalizeBrowserProcedureRuntimeContext,
  normalizeBrowserTrustShieldContext as normalizeWorkerBrowserTrustShieldContext,
  runBrowserOperatorProcedure,
  type BrowserOperatorTrustEvent,
} from './browser-operator/index.js'
import { resolveBrowserQaProvider } from './browser-qa/provider-registry.js'
import type { BrowserQaExecutionInput } from './browser-qa/types.js'

const BROWSER_QA_WORKFLOWS = new Set([
  'qa',
  'check-page',
  'test-funnel',
  'research-site',
  'extract-data',
  'monitor-page',
  'update-portal',
  'support-repro',
  'canary',
  'design-review',
])
const BROWSER_QA_EVIDENCE = new Set(['screenshot', 'console_log', 'network_log', 'perf_metric'])

export async function maybeExecuteBrowserQaStep(params: {
  packet: StepRunPacket
  payload: Record<string, unknown>
  agentOps: Record<string, unknown>
  config: Config
}): Promise<StepExecutionResult | null> {
  if (!isBrowserQaStep(params.agentOps)) return null

  const provider = resolveBrowserQaProvider(params.config)
  if (!provider) return null

  const started = Date.now()
  const targetUrl = resolveTargetUrl(params.agentOps)
  if (!targetUrl) {
    return {
      ok: true,
      output: JSON.stringify(buildUnavailableBrowserQaOutput({
        reason: 'No valid http(s) target URL was provided for this Browser Operator step.',
        browserAvailable: false,
      })),
      durationMs: Date.now() - started,
    }
  }

  const input: BrowserQaExecutionInput = {
    targetUrl,
    runId: getString(params.agentOps.run_id) ?? params.packet.dagId,
    stepId: getString(params.agentOps.step_id) ?? params.packet.stepId,
    workflowId: getString(params.agentOps.workflow_id),
    orgId: params.packet.assistantConfig?.orgId,
    scenario: getString(asRecord(params.agentOps.input)?.scenario),
  }
  const browserProcedure = normalizeBrowserProcedureRuntimeContext(params.agentOps.browser_procedure)
  const browserHostPlaybooks = normalizeBrowserHostPlaybooks(params.agentOps.browser_host_playbooks)
  const browserTrustShield = normalizeWorkerBrowserTrustShieldContext(params.agentOps.browser_trust_shield)
  const browserLiveSession = normalizeBrowserLiveSessionContext(params.agentOps.browser_live_session)
  const browserSessionSharing = normalizeBrowserSessionSharingContext(params.agentOps.browser_session_sharing)
  const assistantConfigRecord = asRecord(params.packet.assistantConfig)

  try {
    const targetTrust = evaluateBrowserOperatorTrust({
      trustShield: browserTrustShield,
      targetUrl,
      content: params.agentOps.input,
    })
    if (targetTrust.blocked) {
      return {
        ok: true,
        output: JSON.stringify(buildUnavailableBrowserQaOutput({
          reason: `Browser Operator Trust Shield blocked this target before launch: ${targetTrust.events.map((event) => event.event_type).join(', ')}`,
          browserAvailable: false,
        }), null, 2),
        durationMs: Date.now() - started,
      }
    }

    const session = await provider.startSession(input)
    const navigated = await provider.navigate({
      ...input,
      sessionId: session.id,
    })
    const finalUrl = navigated.finalUrl ?? session.finalUrl ?? session.targetUrl ?? targetUrl
    const targetId = navigated.targetId ?? session.targetId ?? session.id

    await provider.waitForReady({ ...input, sessionId: session.id, targetId }).catch(() => null)
    const procedureExecution = browserProcedure
      ? await runBrowserOperatorProcedure({
          provider,
          input,
          sessionId: session.id,
          targetId,
          procedure: browserProcedure,
          trustShield: browserTrustShield,
        })
      : null

    const [snapshot, screenshot, evidence] = await Promise.all([
      provider.snapshot({ ...input, sessionId: session.id, targetId })
        .catch((error) => ({ error: normalizeBrowserQaError(error) })),
      provider.screenshot({ ...input, sessionId: session.id, targetId, fullPage: true })
        .catch((error) => ({ error: normalizeBrowserQaError(error) })),
      provider.collectEvidence({ ...input, sessionId: session.id, targetId })
        .catch((error) => ({ collectionError: normalizeBrowserQaError(error) })),
    ])
    const trustEvents: BrowserOperatorTrustEvent[] = evaluateBrowserTrustEvents({
      trustShield: browserTrustShield,
      targetUrl,
      finalUrl,
      sessionId: session.id,
      content: {
        snapshot,
        screenshot,
        evidence,
        procedureExecution,
      },
    }).concat(procedureExecution?.trustEvents ?? [])
    const procedureHandoff = procedureExecution?.handoff
    if (procedureHandoff && browserLiveSession && !browserLiveSession.handoffState) {
      browserLiveSession.handoffState = procedureHandoff.state
      browserLiveSession.handoffMessage = procedureHandoff.message
    }
    const liveSessionEvents = browserLiveSession
      ? buildBrowserLiveSessionEvents({
          sessionKey: buildBrowserSessionKey(input.runId, targetUrl),
          targetUrl,
          finalUrl,
          provider: provider.kind,
          targetId,
          screenshotUri: getArtifactUri(screenshot),
          trustShieldState: trustEvents.some((event) => event.severity === 'block') ? 'blocked' : 'protected',
          handoffState: browserLiveSession.handoffState,
          handoffMessage: browserLiveSession.handoffMessage,
        })
      : []
    const sessionSharingActions = browserSessionSharing
      ? buildBrowserSessionSharingActions({
          sessionKey: buildBrowserSessionKey(input.runId, targetUrl),
          finalUrl,
          provider: provider.kind,
          targetId,
          runId: input.runId,
          assistantId: getString(params.agentOps.assistant_id),
          runtimeId: getString(assistantConfigRecord?.runtimeId)
            ?? getString(assistantConfigRecord?.runtime_id)
            ?? getString(params.agentOps.runtime_id),
          agentLabel: getString(params.agentOps.step_title) ?? getString(params.agentOps.workflow_id),
          sharing: browserSessionSharing,
        })
      : []

    await provider.closeSession?.({ ...input, sessionId: session.id, targetId }).catch(() => null)

    const output = buildBrowserQaOutput({
      provider: provider.kind,
      targetUrl,
      finalUrl,
      targetId,
      procedure: browserProcedure
        ? {
            id: browserProcedure.id,
            name: browserProcedure.name,
            versionId: browserProcedure.versionId,
            version: browserProcedure.version,
            matchScore: browserProcedure.matchScore,
            matchReasons: browserProcedure.matchReasons,
            actionResults: procedureExecution?.actionResults ?? [],
            fallbackReason: procedureExecution?.fallbackReason ?? null,
          }
        : null,
      hostPlaybooks: browserHostPlaybooks,
      trustShield: browserTrustShield
        ? {
            state: trustEvents.some((event) => event.severity === 'block') ? 'blocked' : 'protected',
            canaries: browserTrustShield.canaries.map((canary) => ({
              tokenHash: canary.tokenHash,
              label: canary.label,
            })),
            events: trustEvents.map(trustEventToRecord),
            lowLevelActionPolicy: browserTrustShield.lowLevelActionPolicy,
            classifier: browserTrustShield.classifier,
          }
        : null,
      liveSession: browserLiveSession
        ? {
            sessionKey: buildBrowserSessionKey(input.runId, targetUrl),
            events: liveSessionEvents,
            handoffState: browserLiveSession.handoffState,
            resumePolicy: browserLiveSession.resumePolicy,
          }
        : null,
      sessionSharing: browserSessionSharing
        ? {
            sessionKey: buildBrowserSessionKey(input.runId, targetUrl),
            enabled: true,
            allowedScopes: browserSessionSharing.allowedScopes,
            tokenTable: browserSessionSharing.tokenTable,
            actionTable: browserSessionSharing.actionTable,
            isolation: browserSessionSharing.isolation,
            attributionRequired: browserSessionSharing.attributionRequired,
            externalSharing: browserSessionSharing.externalSharing,
            actions: sessionSharingActions,
          }
        : null,
      snapshot,
      screenshot,
      consoleWarnings: 'collectionError' in evidence ? undefined : evidence.consoleWarnings,
      pageErrors: 'collectionError' in evidence ? undefined : evidence.pageErrors,
      networkRequests: 'collectionError' in evidence ? undefined : evidence.networkRequests,
      performance: 'collectionError' in evidence ? undefined : evidence.performance,
      trace: 'collectionError' in evidence ? undefined : evidence.trace,
      collectionError: 'collectionError' in evidence ? evidence.collectionError : undefined,
    })

    return {
      ok: true,
      output: JSON.stringify(output, null, 2),
      durationMs: Date.now() - started,
    }
  } catch (error) {
    return {
      ok: true,
      output: JSON.stringify(buildUnavailableBrowserQaOutput({
        reason: normalizeBrowserQaError(error),
        browserAvailable: false,
      }), null, 2),
      durationMs: Date.now() - started,
    }
  }
}

interface BrowserTrustShieldContext {
  state: string
  canaries: Array<{ token: string; tokenHash: string; label: string }>
  deterministicPatterns: string[]
  lowLevelActionPolicy: string
  classifier: Record<string, unknown>
}

interface BrowserLiveSessionContext {
  handoffState: string | null
  handoffMessage: string | null
  resumePolicy: string
}

interface BrowserSessionSharingContext {
  tokenTable: string
  actionTable: string
  allowedScopes: string[]
  isolation: string
  attributionRequired: boolean
  externalSharing: string
}

function normalizeBrowserHostPlaybooks(value: unknown): Array<Record<string, unknown>> {
  return readArray(value)
    .map(asRecord)
    .filter((record): record is Record<string, unknown> =>
      Boolean(record && getString(record.id) && getString(record.trust_state) === 'active'),
    )
    .slice(0, 5)
}

function normalizeBrowserLiveSessionContext(value: unknown): BrowserLiveSessionContext | null {
  const record = asRecord(value)
  if (!record) return null
  return {
    handoffState: getString(record.handoff_state),
    handoffMessage: getString(record.handoff_message),
    resumePolicy: getString(record.resume_policy) ?? 'human_resolves_then_agent_resumes',
  }
}

function normalizeBrowserSessionSharingContext(value: unknown): BrowserSessionSharingContext | null {
  const record = asRecord(value)
  if (!record) return null
  const allowedScopes = readArray(record.allowed_scopes)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return {
    tokenTable: getString(record.token_table) ?? 'agent_ops_browser_session_shares',
    actionTable: getString(record.action_table) ?? 'agent_ops_browser_session_actions',
    allowedScopes: allowedScopes.length > 0
      ? allowedScopes
      : ['read-only', 'browser-drive', 'screenshot-only', 'handoff-only'],
    isolation: getString(record.isolation) ?? 'per_agent_tab',
    attributionRequired: record.attribution_required !== false,
    externalSharing: getString(record.external_sharing) ?? 'disabled_until_reviewed',
  }
}

function buildBrowserSessionSharingActions(input: {
  sessionKey: string
  finalUrl: string
  provider: string
  targetId: string
  runId: string
  assistantId: string | null
  runtimeId: string | null
  agentLabel: string | null
  sharing: BrowserSessionSharingContext
}): Array<Record<string, unknown>> {
  const tabIdentity = buildBrowserShareTabIdentity({
    runId: input.runId,
    sessionKey: input.sessionKey,
    assistantId: input.assistantId,
    runtimeId: input.runtimeId,
    agentLabel: input.agentLabel,
  })
  const base = {
    scope: 'read-only',
    actor_assistant_id: input.assistantId,
    actor_runtime_id: input.runtimeId,
    actor_agent_label: input.agentLabel,
    tab_identity: tabIdentity,
    current_url: input.finalUrl,
    metadata: {
      provider: input.provider,
      target_id: input.targetId,
      isolation: input.sharing.isolation,
      attribution_required: input.sharing.attributionRequired,
    },
  }

  return [
    {
      session_key: input.sessionKey,
      action_type: 'tab_assigned',
      status: 'allowed',
      message: 'Browser Operator assigned an isolated pair-agent tab identity.',
      ...base,
    },
    {
      session_key: input.sessionKey,
      action_type: 'session_observed',
      status: 'allowed',
      message: 'Browser Operator shared session state was observed for runtime coordination.',
      ...base,
    },
  ]
}

function buildBrowserLiveSessionEvents(input: {
  sessionKey: string
  targetUrl: string
  finalUrl: string
  provider: string
  targetId: string
  screenshotUri: string | null
  trustShieldState: string
  handoffState: string | null
  handoffMessage: string | null
}): Array<Record<string, unknown>> {
  const baseMetadata = {
    provider: input.provider,
    target_id: input.targetId,
    trust_shield_state: input.trustShieldState,
  }
  const events: Array<Record<string, unknown>> = [
    {
      session_key: input.sessionKey,
      event_type: 'session_started',
      severity: 'info',
      current_url: input.targetUrl,
      message: 'Browser Operator session started.',
      metadata: baseMetadata,
    },
    {
      session_key: input.sessionKey,
      event_type: 'navigated',
      severity: 'info',
      current_url: input.finalUrl,
      message: 'Browser navigated to the target URL.',
      metadata: baseMetadata,
    },
    {
      session_key: input.sessionKey,
      event_type: 'evidence_collected',
      severity: input.trustShieldState === 'blocked' ? 'warn' : 'info',
      current_url: input.finalUrl,
      screenshot_uri: input.screenshotUri,
      message: 'Browser evidence was collected for Mission Control.',
      metadata: baseMetadata,
    },
  ]
  if (input.handoffState) {
    events.push({
      session_key: input.sessionKey,
      event_type: 'handoff_required',
      severity: 'warn',
      handoff_state: input.handoffState,
      current_url: input.finalUrl,
      screenshot_uri: input.screenshotUri,
      message: input.handoffMessage ?? 'Browser Operator needs a human handoff before continuing.',
      metadata: baseMetadata,
    })
  } else {
    events.push({
      session_key: input.sessionKey,
      event_type: 'session_completed',
      severity: 'info',
      current_url: input.finalUrl,
      screenshot_uri: input.screenshotUri,
      message: 'Browser Operator session completed.',
      metadata: baseMetadata,
    })
  }
  return events
}

function evaluateBrowserTrustEvents(input: {
  trustShield: BrowserTrustShieldContext | null
  targetUrl: string
  finalUrl: string
  sessionId: string
  content: unknown
}): BrowserOperatorTrustEvent[] {
  if (!input.trustShield) return []
  const raw = stringifyForScan(input.content)
  const events: BrowserOperatorTrustEvent[] = []
  const host = extractHost(input.finalUrl) ?? extractHost(input.targetUrl)
  const urlHash = hashValue(input.finalUrl)
  const contentHash = hashValue(raw.slice(0, 120_000))

  for (const canary of input.trustShield.canaries) {
    const index = raw.indexOf(canary.token)
    if (index === -1) continue
    events.push({
      event_type: 'canary_leak',
      severity: 'block',
      layer: 'browser_output',
      browser_session_id: input.sessionId,
      host,
      url_hash: urlHash,
      content_hash: contentHash,
      details: {
        token_hash: canary.tokenHash,
        canary_label: canary.label,
        first_index: index,
        context_preview: redactCanaries(
          buildPreview(raw, index, canary.token.length),
          input.trustShield.canaries,
        ),
      },
    })
  }

  const normalized = raw.toLowerCase()
  for (const pattern of input.trustShield.deterministicPatterns) {
    const normalizedPattern = pattern.toLowerCase()
    const index = normalized.indexOf(normalizedPattern)
    if (index === -1) continue
    events.push({
      event_type: 'prompt_injection_pattern',
      severity: 'warn',
      layer: 'browser_content',
      browser_session_id: input.sessionId,
      host,
      url_hash: urlHash,
      content_hash: contentHash,
      details: {
        pattern: normalizedPattern,
        first_index: index,
        context_preview: redactCanaries(
          buildPreview(raw, index, normalizedPattern.length),
          input.trustShield.canaries,
        ),
      },
    })
  }

  return events.slice(0, 20)
}

function trustEventToRecord(event: BrowserOperatorTrustEvent): Record<string, unknown> {
  return { ...event }
}

function isBrowserQaStep(agentOps: Record<string, unknown>): boolean {
  const workflowId = getString(agentOps.workflow_id)
  if (workflowId && BROWSER_QA_WORKFLOWS.has(workflowId)) return true
  const evidenceTypes = Array.isArray(agentOps.evidence_types)
    ? agentOps.evidence_types.map((item) => String(item))
    : []
  return evidenceTypes.some((type) => BROWSER_QA_EVIDENCE.has(type))
}

function resolveTargetUrl(agentOps: Record<string, unknown>): string | null {
  const input = asRecord(agentOps.input)
  const scope = asRecord(agentOps.scope)
  const candidates = [
    input?.target,
    input?.url,
    input?.deployUrl,
    input?.deploy_url,
    scope?.ref,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeHttpUrl(candidate)
    if (normalized) return normalized
  }
  return null
}

function normalizeHttpUrl(value: unknown): string | null {
  const raw = getString(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function extractHost(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}

function stringifyForScan(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function buildPreview(value: string, index: number, length: number): string {
  const start = Math.max(0, index - 80)
  const end = Math.min(value.length, index + length + 80)
  return value.slice(start, end).replace(/\s+/g, ' ').trim()
}

function redactCanaries(
  value: string,
  canaries: ReadonlyArray<{ token: string }>,
): string {
  let redacted = value
  for (const canary of canaries) {
    redacted = redacted.split(canary.token).join('[REDACTED_CANARY]')
  }
  return redacted
}

function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function buildBrowserShareTabIdentity(input: {
  runId: string
  sessionKey: string
  assistantId: string | null
  runtimeId: string | null
  agentLabel: string | null
}): string {
  return `tab_${hashValue([
    input.runId,
    input.sessionKey,
    input.assistantId ?? 'assistant:any',
    input.runtimeId ?? 'runtime:any',
    input.agentLabel ?? 'agent:any',
  ].join('|')).slice(0, 16)}`
}

function buildBrowserSessionKey(runId: string, targetUrl: string): string {
  return hashValue(`${runId}|${targetUrl}`)
}

function getArtifactUri(value: unknown): string | null {
  const record = asRecord(value)
  return getString(record?.uri) ?? getString(record?.url) ?? getString(record?.path)
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
