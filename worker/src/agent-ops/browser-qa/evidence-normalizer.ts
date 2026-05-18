import type { BrowserQaFinding, BrowserQaOutput } from './output-types.js'
import type { BrowserQaArtifact, BrowserQaProviderKind } from './types.js'

export function buildBrowserQaOutput(input: {
  provider: BrowserQaProviderKind
  targetUrl: string
  finalUrl: string
  targetId: string
  procedure?: {
    id: string
    name?: string | null
    versionId?: string | null
    version?: number | null
    matchScore?: number | null
    matchReasons?: string[]
    actionResults?: Array<Record<string, unknown>>
    fallbackReason?: string | null
  } | null
  hostPlaybooks?: Array<Record<string, unknown>>
  trustShield?: {
    state: string
    canaries?: Array<{ tokenHash?: string | null; label?: string | null }>
    events?: Array<Record<string, unknown>>
    lowLevelActionPolicy?: string
    classifier?: Record<string, unknown>
  } | null
  liveSession?: {
    sessionKey: string
    events: Array<Record<string, unknown>>
    handoffState?: string | null
    resumePolicy?: string | null
  } | null
  sessionSharing?: {
    sessionKey: string
    enabled: boolean
    allowedScopes: string[]
    actionTable?: string | null
    tokenTable?: string | null
    isolation?: string | null
    attributionRequired?: boolean
    externalSharing?: string | null
    actions?: Array<Record<string, unknown>>
  } | null
  snapshot: unknown
  screenshot: unknown
  consoleWarnings: unknown
  pageErrors: unknown
  networkRequests: unknown
  performance: unknown
  trace?: BrowserQaArtifact
  collectionError?: string
}): BrowserQaOutput {
  const consoleMessages = getArray(asRecord(input.consoleWarnings)?.messages)
  const pageErrors = getArray(asRecord(input.pageErrors)?.errors)
  const networkRequests = getArray(asRecord(input.networkRequests)?.requests)
  const failedRequests = networkRequests.filter(isFailedNetworkRequest)
  const findings: BrowserQaFinding[] = []

  if (consoleMessages.length > 0 || pageErrors.length > 0) {
    findings.push({
      severity: pageErrors.length > 0 ? 'high' : 'medium',
      title: 'Browser console issues detected',
      body: `Browser QA captured ${consoleMessages.length} warning/error console message(s) and ${pageErrors.length} page error(s).`,
      confidence: 0.85,
      fingerprint: `browser-console:${input.finalUrl}`,
    })
  }

  if (failedRequests.length > 0) {
    findings.push({
      severity: 'high',
      title: 'Failed network requests detected',
      body: `Browser QA captured ${failedRequests.length} failed or 4xx/5xx network request(s).`,
      confidence: 0.85,
      fingerprint: `browser-network:${input.finalUrl}`,
    })
  }

  const screenshot = asRecord(input.screenshot)
  const snapshot = asRecord(input.snapshot)
  const performance = normalizePerformancePayload(input.performance)

  return {
    summary: findings.length > 0
      ? `Browser QA completed for ${input.finalUrl} with ${findings.length} issue group(s).`
      : `Browser QA completed for ${input.finalUrl} with no console, page-error, or failed-request issue groups detected.`,
    findings,
    evidence: [
      {
        type: 'test_result',
        title: 'Browser QA smoke result',
        summary: 'Opened the target, navigated with the configured browser control endpoint, and collected browser evidence.',
        uri: input.finalUrl,
        content: {
          browser_available: true,
          provider: input.provider,
          target_url: input.targetUrl,
          final_url: input.finalUrl,
          target_id: input.targetId,
          browser_procedure: input.procedure
            ? {
                used: !input.procedure.fallbackReason,
                id: input.procedure.id,
                name: input.procedure.name,
                version_id: input.procedure.versionId,
                version: input.procedure.version,
                match_score: input.procedure.matchScore,
                match_reasons: input.procedure.matchReasons ?? [],
                action_results: input.procedure.actionResults ?? [],
                fallback_reason: input.procedure.fallbackReason ?? null,
              }
            : null,
          browser_host_playbooks: (input.hostPlaybooks ?? []).slice(0, 5).map((playbook) => ({
            id: getString(playbook.id),
            title: getString(playbook.title),
            host_pattern: getString(playbook.host_pattern),
            scope: getString(playbook.scope),
            trust_state: getString(playbook.trust_state),
            successful_uses: asNumber(playbook.successful_uses),
            security_flags_count: asNumber(playbook.security_flags_count),
            match_score: asNumber(playbook.match_score),
            match_reasons: getArray(playbook.match_reasons).filter((item): item is string => typeof item === 'string'),
          })).filter((playbook) => playbook.id),
          browser_trust_shield: input.trustShield
            ? {
                state: input.trustShield.state,
                canaries: (input.trustShield.canaries ?? []).map((canary) => ({
                  token_hash: canary.tokenHash,
                  label: canary.label,
                })).filter((canary) => canary.token_hash),
                event_count: input.trustShield.events?.length ?? 0,
                events: (input.trustShield.events ?? []).slice(0, 20),
                low_level_action_policy: input.trustShield.lowLevelActionPolicy ?? 'deny_by_default',
                classifier: input.trustShield.classifier ?? { enabled: false, status: 'disabled' },
              }
            : null,
          browser_live_session: input.liveSession
            ? {
                session_key: input.liveSession.sessionKey,
                event_count: input.liveSession.events.length,
                events: input.liveSession.events.slice(0, 20),
                handoff_state: input.liveSession.handoffState ?? null,
                resume_policy: input.liveSession.resumePolicy ?? 'human_resolves_then_agent_resumes',
              }
            : null,
          browser_session_sharing: input.sessionSharing
            ? {
                session_key: input.sessionSharing.sessionKey,
                enabled: input.sessionSharing.enabled,
                allowed_scopes: input.sessionSharing.allowedScopes,
                token_table: input.sessionSharing.tokenTable ?? 'agent_ops_browser_session_shares',
                action_table: input.sessionSharing.actionTable ?? 'agent_ops_browser_session_actions',
                isolation: input.sessionSharing.isolation ?? 'per_agent_tab',
                attribution_required: input.sessionSharing.attributionRequired ?? true,
                external_sharing: input.sessionSharing.externalSharing ?? 'disabled_until_reviewed',
                action_count: input.sessionSharing.actions?.length ?? 0,
                actions: (input.sessionSharing.actions ?? []).slice(0, 20),
              }
            : null,
          findings_count: findings.length,
          collection_error: input.collectionError,
        },
      },
      {
        type: 'screenshot',
        title: 'Browser screenshot',
        uri: getString(screenshot?.uri)
          ?? getString(screenshot?.path)
          ?? getString(screenshot?.url)
          ?? input.finalUrl,
        content: {
          url: getString(screenshot?.url) ?? input.finalUrl,
          path: getString(screenshot?.path),
          content_type: getString(screenshot?.contentType),
          byte_length: asNumber(screenshot?.byteLength),
          provider_content: asRecord(screenshot?.content),
          collection_error: getString(screenshot?.error),
        },
      },
      {
        type: 'console_log',
        title: 'Browser console warnings and errors',
        content: {
          count: consoleMessages.length,
          page_error_count: pageErrors.length,
          messages: consoleMessages.slice(0, 20),
          page_errors: pageErrors.slice(0, 20),
          collection_error: getString(asRecord(input.consoleWarnings)?.error)
            ?? getString(asRecord(input.pageErrors)?.error),
        },
      },
      {
        type: 'network_log',
        title: 'Browser network activity',
        content: {
          request_count: networkRequests.length,
          failed_request_count: failedRequests.length,
          failed_requests: failedRequests.slice(0, 20),
          collection_error: getString(asRecord(input.networkRequests)?.error),
        },
      },
      {
        type: 'perf_metric',
        title: 'Browser performance timing',
        content: {
          ...performance,
          collection_error: getString(asRecord(input.performance)?.error),
        },
      },
      {
        type: 'browser_snapshot',
        title: 'Browser accessibility snapshot',
        content: {
          url: getString(snapshot?.url) ?? input.finalUrl,
          snapshot: getString(snapshot?.snapshot)?.slice(0, 12000),
          truncated: Boolean(snapshot?.truncated),
          stats: asRecord(snapshot?.stats),
          provider_content: asRecord(snapshot?.content),
          collection_error: getString(snapshot?.error),
        },
      },
      ...(input.trace ? [{
        type: 'trace',
        title: 'Browser trace',
        uri: input.trace.uri ?? input.trace.url ?? input.trace.path,
        content: {
          ...input.trace.content,
          content_type: input.trace.contentType,
          byte_length: input.trace.byteLength,
          collection_error: input.trace.error,
        },
      }] : []),
    ],
    risks: findings.length > 0
      ? ['Review captured browser findings before promoting this run.']
      : [],
    next_actions: findings.length > 0
      ? ['Inspect the Browser QA evidence in Mission Control.', 'Fix the browser findings and rerun QA.']
      : ['Promote this Browser Operator step to recurring checks if this target is release-critical.'],
  }
}

export function buildUnavailableBrowserQaOutput(input: {
  reason: string
  browserAvailable: boolean
}): BrowserQaOutput {
  return {
    summary: `Browser QA could not run: ${input.reason}`,
    findings: [],
    evidence: [
      {
        type: 'test_result',
        title: 'Browser QA unavailable',
        summary: input.reason,
        content: {
          browser_available: input.browserAvailable,
          reason: input.reason,
        },
      },
    ],
    risks: ['This step did not produce browser-grade visual, console, network, or performance evidence.'],
    next_actions: ['Configure BROWSER_QA_CONTROL_URL for a runtime with browser control and rerun the step.'],
  }
}

export function normalizeBrowserQaError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizePerformancePayload(value: unknown): Record<string, unknown> {
  const result = asRecord(value)?.result
  if (typeof result === 'string') {
    try {
      return JSON.parse(result) as Record<string, unknown>
    } catch {
      return { raw: result }
    }
  }
  return asRecord(result) ?? {}
}

function isFailedNetworkRequest(value: unknown): boolean {
  const record = asRecord(value)
  if (!record) return false
  const status = Number(record.status ?? record.statusCode)
  const failed = record.failed === true || Boolean(record.failure) || Boolean(record.errorText)
  return failed || (Number.isFinite(status) && status >= 400)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
