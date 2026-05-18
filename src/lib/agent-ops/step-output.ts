import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AGENT_OPS_EVIDENCE_TYPES,
  AGENT_OPS_FINDING_SEVERITIES,
  type AgentOpsEvidenceType,
  type AgentOpsFindingSeverity,
} from './workflow-types'
import {
  buildBrowserQaSessionKey,
  isBrowserQaEvidenceType,
  normalizeBrowserQaArtifactContent,
  resolveBrowserQaTargetUrl,
} from './browser-qa'
import { summarizeError } from '@/lib/logging/safe-log'
import {
  buildCanaryLeakSecurityAttempts,
  checkCanaryLeaks,
  normalizeTrustGuardCanaries,
  type TrustGuardSecurityAttemptInput,
} from '@/lib/security/trust-guard'
import {
  normalizeAgentOpsFailureOwnership,
  serializeAgentOpsFailureOwnership,
  type AgentOpsFailureOwnership,
} from './failure-ownership'
import { normalizeDesignVariantKey } from './design-ops'
import { getAgentOpsQuestion } from './decision-pacing'

const evidenceTypes = new Set<string>(AGENT_OPS_EVIDENCE_TYPES)
const findingSeverities = new Set<string>(AGENT_OPS_FINDING_SEVERITIES)

export interface AgentOpsStructuredFinding {
  severity: AgentOpsFindingSeverity
  title: string
  body: string
  filePath?: string | null
  startLine?: number | null
  endLine?: number | null
  confidence?: number | null
  fingerprint?: string | null
  failureOwnership?: AgentOpsFailureOwnership | null
  metadata?: Record<string, unknown>
}

export interface AgentOpsStructuredEvidence {
  type: AgentOpsEvidenceType
  title: string
  summary?: string | null
  uri?: string | null
  content?: Record<string, unknown>
  checksum?: string | null
}

export interface AgentOpsStructuredStepOutput {
  summary: string
  findings: AgentOpsStructuredFinding[]
  evidence: AgentOpsStructuredEvidence[]
  risks: string[]
  nextActions: string[]
  raw: string
  parsed: boolean
}

export interface ProjectAgentOpsStepOutputInput {
  orgId: string
  runId: string
  dagId: string | null
  dagNodeId: string | null
  stepId: string
  output: string
  payload: unknown
}

export interface ProjectAgentOpsStepOutputResult {
  structured: AgentOpsStructuredStepOutput
  transcriptArtifactId: string | null
  evidenceArtifactIds: string[]
  findingIds: string[]
  securityAttemptIds: string[]
  browserProcedureRunIds: string[]
  browserHostPlaybookIds: string[]
  browserSecurityEventIds: string[]
  browserSessionEventIds: string[]
  browserSessionSharedActionIds: string[]
  operatorProfileIds: string[]
  designFeedbackIds: string[]
  decisionEventIds: string[]
}

export function parseAgentOpsStepOutput(output: string): AgentOpsStructuredStepOutput {
  const raw = output.trim()
  const parsed = parseJsonObject(raw)
  if (!parsed) {
    return {
      summary: raw.slice(0, 4_000),
      findings: [],
      evidence: [],
      risks: [],
      nextActions: [],
      raw,
      parsed: false,
    }
  }

  return {
    summary: getString(parsed.summary) ?? raw.slice(0, 4_000),
    findings: normalizeFindings(parsed.findings),
    evidence: normalizeEvidence(parsed.evidence),
    risks: normalizeStringArray(parsed.risks),
    nextActions: normalizeStringArray(parsed.next_actions ?? parsed.nextActions),
    raw,
    parsed: true,
  }
}

export async function projectAgentOpsStepOutput(
  supabase: SupabaseClient,
  input: ProjectAgentOpsStepOutputInput,
): Promise<ProjectAgentOpsStepOutputResult> {
  const structured = parseAgentOpsStepOutput(input.output)
  const agentOps = getAgentOpsContext(input.payload)
  const stepKey = getString(agentOps?.step_id) ?? getString(agentOps?.agent_ops_step) ?? input.stepId
  const stepTitle = getString(agentOps?.step_title) ?? stepKey

  const transcriptArtifactId = await insertArtifact(supabase, {
    orgId: input.orgId,
    runId: input.runId,
    type: 'transcript',
    title: `Agent Ops step transcript: ${stepTitle}`.slice(0, 240),
    summary: structured.summary.slice(0, 1_000),
    content: {
      dag_id: input.dagId,
      dag_node_id: input.dagNodeId,
      step_id: input.stepId,
      step_key: stepKey,
      step_title: stepTitle,
      parsed: structured.parsed,
      structured: structuredToJson(structured),
      raw_output: input.output.slice(0, 100_000),
    },
    sourceKind: 'orchestration_step',
    sourceRef: input.stepId,
  })

  const securityAttemptIds = await recordCanaryLeakAttempts(supabase, {
    orgId: input.orgId,
    runId: input.runId,
    stepId: input.stepId,
    output: input.output,
    agentOps,
  })

  const evidenceArtifactIds: string[] = []
  for (const evidence of structured.evidence.slice(0, 20)) {
    const browserTargetUrl = isBrowserQaEvidenceType(evidence.type)
      ? resolveBrowserQaTargetUrl({
          runId: input.runId,
          input: asRecord(agentOps?.input),
          scope: asRecord(agentOps?.scope),
          evidence,
        })
      : null
    const evidenceContent = browserTargetUrl
      ? normalizeBrowserQaArtifactContent({
          runId: input.runId,
          targetUrl: browserTargetUrl,
          content: evidence.content,
        })
      : evidence.content
    const artifactId = await insertArtifact(supabase, {
      orgId: input.orgId,
      runId: input.runId,
      type: evidence.type,
      title: evidence.title,
      summary: evidence.summary ?? null,
      uri: evidence.uri ?? null,
      checksum: evidence.checksum ?? null,
      content: {
        ...(evidenceContent ?? {}),
        dag_id: input.dagId,
        dag_node_id: input.dagNodeId,
        step_id: input.stepId,
        step_key: stepKey,
      },
      sourceKind: 'orchestration_step',
      sourceRef: input.stepId,
    })
    if (artifactId) {
      evidenceArtifactIds.push(artifactId)
      if (browserTargetUrl) {
        await upsertBrowserQaSession(supabase, {
          orgId: input.orgId,
          runId: input.runId,
          targetUrl: browserTargetUrl,
          artifactId,
          stepId: input.stepId,
          stepKey,
          evidenceType: evidence.type,
          status: resolveBrowserSessionStatus(evidence.content),
          viewport: getViewport(evidence.content),
        })
      }
    }
  }

  const findingIds: string[] = []
  for (const finding of structured.findings.slice(0, 50)) {
    const findingId = await insertFinding(supabase, {
      orgId: input.orgId,
      runId: input.runId,
      finding,
      evidenceArtifactId: evidenceArtifactIds[0] ?? transcriptArtifactId,
      metadata: {
        ...(finding.metadata ?? {}),
        dag_id: input.dagId,
        dag_node_id: input.dagNodeId,
        step_id: input.stepId,
        step_key: stepKey,
      },
    })
    if (findingId) findingIds.push(findingId)
  }

  const browserProcedureRunIds = await recordBrowserProcedureRunsFromStepOutput(supabase, {
    orgId: input.orgId,
    runId: input.runId,
    stepId: input.stepId,
    durationMs: null,
    agentOps,
    structured,
  })
  const browserHostPlaybookIds = await recordBrowserHostPlaybookUsageFromStepOutput(supabase, {
    agentOps,
    structured,
  })
  const browserSecurityEventIds = await recordBrowserSecurityEventsFromStepOutput(supabase, {
    orgId: input.orgId,
    runId: input.runId,
    stepId: input.stepId,
    agentOps,
    structured,
  })
  const browserSessionEventIds = await recordBrowserSessionEventsFromStepOutput(supabase, {
    orgId: input.orgId,
    runId: input.runId,
    structured,
  })
  const browserSessionSharedActionIds = await recordBrowserSessionSharedActionsFromStepOutput(supabase, {
    orgId: input.orgId,
    runId: input.runId,
    agentOps,
    structured,
  })
  const operatorProfileIds = await recordOperatorProfilesFromStepOutput(supabase, {
    orgId: input.orgId,
    agentOps,
    structured,
  })
  const designFeedbackIds = await recordDesignFeedbackFromStepOutput(supabase, {
    orgId: input.orgId,
    runId: input.runId,
    agentOps,
    structured,
    evidenceArtifactIds,
  })
  const decisionEventIds = await recordDecisionEventsFromStepOutput(supabase, {
    orgId: input.orgId,
    runId: input.runId,
    agentOps,
    structured,
  })

  return {
    structured,
    transcriptArtifactId,
    evidenceArtifactIds,
    findingIds,
    securityAttemptIds,
    browserProcedureRunIds,
    browserHostPlaybookIds,
    browserSecurityEventIds,
    browserSessionEventIds,
    browserSessionSharedActionIds,
    operatorProfileIds,
    designFeedbackIds,
    decisionEventIds,
  }
}

export function structuredStepOutputToRunOutput(
  structured: AgentOpsStructuredStepOutput,
  input: Pick<ProjectAgentOpsStepOutputInput, 'dagId' | 'dagNodeId' | 'stepId'>,
): Record<string, unknown> {
  return {
    summary: structured.summary,
    findings: structuredFindingsToJson(structured.findings),
    evidence: structured.evidence,
    risks: structured.risks,
    next_actions: structured.nextActions,
    raw_output: structured.raw,
    parsed: structured.parsed,
    completed_dag_id: input.dagId,
    completed_dag_node_id: input.dagNodeId,
    completed_step_id: input.stepId,
  }
}

function parseJsonObject(output: string): Record<string, unknown> | null {
  const candidates = [
    output,
    extractFence(output, 'json'),
    extractFirstJsonObject(output),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Try next candidate.
    }
  }

  return null
}

function extractFence(output: string, language: string): string | null {
  const pattern = new RegExp(`\`\`\`${language}\\s*([\\s\\S]*?)\`\`\``, 'i')
  return output.match(pattern)?.[1]?.trim() ?? null
}

function extractFirstJsonObject(output: string): string | null {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  return start >= 0 && end > start ? output.slice(start, end + 1) : null
}

function normalizeFindings(value: unknown): AgentOpsStructuredFinding[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): AgentOpsStructuredFinding | null => {
      const record = asRecord(item)
      if (!record) return null
      const title = getString(record.title)
      const body = getString(record.body ?? record.description ?? record.summary)
      if (!title || !body) return null
      const severityRaw = getString(record.severity)?.toLowerCase()
      const severity = severityRaw && findingSeverities.has(severityRaw)
        ? severityRaw as AgentOpsFindingSeverity
        : 'medium'
      const metadata = asRecord(record.metadata) ?? {}
      const failureOwnership = normalizeAgentOpsFailureOwnership(
        record.failure_ownership
          ?? record.failureOwnership
          ?? metadata.failure_ownership
          ?? metadata.failureOwnership
          ?? metadata.ownership,
      )

      return {
        severity,
        title: title.slice(0, 240),
        body: body.slice(0, 4_000),
        filePath: getString(record.file_path ?? record.filePath),
        startLine: getPositiveInt(record.start_line ?? record.startLine),
        endLine: getPositiveInt(record.end_line ?? record.endLine),
        confidence: getConfidence(record.confidence),
        fingerprint: getString(record.fingerprint),
        failureOwnership,
        metadata: failureOwnership
          ? {
              ...metadata,
              failure_ownership: serializeAgentOpsFailureOwnership(failureOwnership),
            }
          : metadata,
      } satisfies AgentOpsStructuredFinding
    })
    .filter((item): item is AgentOpsStructuredFinding => Boolean(item))
}

function normalizeEvidence(value: unknown): AgentOpsStructuredEvidence[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): AgentOpsStructuredEvidence | null => {
      const record = asRecord(item)
      if (!record) return null
      const typeRaw = getString(record.type)?.toLowerCase()
      const title = getString(record.title)
      if (!typeRaw || !evidenceTypes.has(typeRaw) || !title) return null
      return {
        type: typeRaw as AgentOpsEvidenceType,
        title: title.slice(0, 240),
        summary: getString(record.summary),
        uri: getString(record.uri),
        content: asRecord(record.content) ?? {},
        checksum: getString(record.checksum),
      } satisfies AgentOpsStructuredEvidence
    })
    .filter((item): item is AgentOpsStructuredEvidence => Boolean(item))
}

async function recordBrowserProcedureRunsFromStepOutput(
  supabase: SupabaseClient,
  input: {
    orgId: string
    runId: string
    stepId: string
    durationMs: number | null
    agentOps: Record<string, unknown> | null
    structured: AgentOpsStructuredStepOutput
  },
): Promise<string[]> {
  const payloadProcedure = asRecord(input.agentOps?.browser_procedure)
  const evidenceProcedure = input.structured.evidence
    .map((item) => asRecord(item.content?.browser_procedure))
    .find((item) => item && getString(item.id))
  const procedure = evidenceProcedure ?? payloadProcedure
  const procedureId = getString(procedure?.id)
  if (!procedureId) return []

  const version = asRecord(procedure?.version)
  const versionId = getString(procedure?.version_id) ?? getString(version?.id)
  const used = procedure?.used !== false && !getString(procedure?.fallback_reason)
  const row = {
    procedure_id: procedureId,
    version_id: versionId,
    ops_run_id: input.runId,
    status: used ? 'succeeded' : 'blocked',
    matched_trigger: getString(input.agentOps?.workflow_id) ?? null,
    duration_ms: input.durationMs,
    security_flags: [],
    output_summary: {
      summary: input.structured.summary.slice(0, 1_000),
      evidence_count: input.structured.evidence.length,
      finding_count: input.structured.findings.length,
    },
    metadata: {
      org_id: input.orgId,
      step_id: input.stepId,
      used,
      fallback_reason: getString(procedure?.fallback_reason),
      match_score: getNumber(procedure?.match_score ?? payloadProcedure?.match_score),
      match_reasons: normalizeStringArray(procedure?.match_reasons ?? payloadProcedure?.match_reasons),
      action_results: Array.isArray(procedure?.action_results) ? procedure.action_results.slice(0, 30) : [],
    },
  }

  try {
    const { data, error } = await supabase
      .from('agent_ops_browser_procedure_runs')
      .upsert(row, { onConflict: 'procedure_id,ops_run_id' })
      .select('id')
      .single()
    if (error) return []
    const id = getString((data as { id?: unknown } | null)?.id)
    return id ? [id] : []
  } catch {
    return []
  }
}

async function recordBrowserHostPlaybookUsageFromStepOutput(
  supabase: SupabaseClient,
  input: {
    agentOps: Record<string, unknown> | null
    structured: AgentOpsStructuredStepOutput
  },
): Promise<string[]> {
  const payloadPlaybooks = normalizePlaybookReferences(input.agentOps?.browser_host_playbooks)
  const evidencePlaybooks = input.structured.evidence.flatMap((item) =>
    normalizePlaybookReferences(item.content?.browser_host_playbooks),
  )
  const byId = new Map<string, Record<string, unknown>>()
  for (const playbook of [...payloadPlaybooks, ...evidencePlaybooks]) {
    const id = getString(playbook.id)
    if (id) byId.set(id, playbook)
  }
  if (byId.size === 0) return []

  const hasFindings = input.structured.findings.length > 0
  const usedIds: string[] = []
  for (const [id, playbook] of byId) {
    const securityFlagsCount = getPositiveInt(playbook.security_flags_count_delta) ?? 0
    try {
      const rpc = (supabase as unknown as {
        rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ error?: { message?: string } | null }>
      }).rpc
      if (!rpc) continue
      const { error } = await rpc('record_agent_ops_browser_host_playbook_use', {
        p_playbook_id: id,
        p_success: !hasFindings,
        p_security_flags_count: securityFlagsCount,
      })
      if (!error) usedIds.push(id)
    } catch {
      // Host playbook telemetry must never block run projection.
    }
  }
  return usedIds
}

async function recordBrowserSecurityEventsFromStepOutput(
  supabase: SupabaseClient,
  input: {
    orgId: string
    runId: string
    stepId: string
    agentOps: Record<string, unknown> | null
    structured: AgentOpsStructuredStepOutput
  },
): Promise<string[]> {
  const events = input.structured.evidence.flatMap((item) => {
    const shield = asRecord(item.content?.browser_trust_shield)
    return normalizeBrowserSecurityEvents(shield?.events)
  }).slice(0, 20)
  if (events.length === 0) return []

  const ids: string[] = []
  for (const event of events) {
    const id = await insertBrowserSecurityEvent(supabase, {
      orgId: input.orgId,
      projectId: getString(input.agentOps?.project_id),
      opsRunId: input.runId,
      browserSessionId: getString(event.browser_session_id),
      eventType: getString(event.event_type) ?? 'prompt_injection_pattern',
      severity: getString(event.severity) ?? 'warn',
      layer: getString(event.layer) ?? 'browser_content',
      host: getString(event.host),
      urlHash: getString(event.url_hash),
      contentHash: getString(event.content_hash),
      details: asRecord(event.details) ?? {},
    })
    if (id) ids.push(id)

    const severity = getString(event.severity)
    if (severity === 'block' || severity === 'warn') {
      await insertSecurityAttempt(supabase, {
        orgId: input.orgId,
        projectId: getString(input.agentOps?.project_id),
        assistantId: getString(input.agentOps?.assistant_id),
        opsRunId: input.runId,
        sourceKind: getString(event.event_type) === 'canary_leak' ? 'canary_leak' : 'agent_ops_api',
        sourceRef: input.stepId,
        severity: severity === 'block' ? 'critical' : 'high',
        title: browserSecurityAttemptTitle(event),
        body: browserSecurityAttemptBody(event),
        metadata: {
          browser_trust_shield: true,
          browser_security_event_id: id,
          browser_event_type: getString(event.event_type),
          browser_event_layer: getString(event.layer),
          workflow_id: getString(input.agentOps?.workflow_id),
          details: asRecord(event.details) ?? {},
        },
      })
    }
  }
  return ids
}

async function recordBrowserSessionEventsFromStepOutput(
  supabase: SupabaseClient,
  input: {
    orgId: string
    runId: string
    structured: AgentOpsStructuredStepOutput
  },
): Promise<string[]> {
  const events = input.structured.evidence.flatMap((item) => {
    const liveSession = asRecord(item.content?.browser_live_session)
    return normalizeBrowserSessionEvents(liveSession?.events)
  }).slice(0, 40)
  if (events.length === 0) return []

  const ids: string[] = []
  for (const event of events) {
    const id = await insertBrowserSessionEvent(supabase, {
      orgId: input.orgId,
      runId: input.runId,
      sessionKey: getString(event.session_key) ?? buildBrowserQaSessionKey({
        runId: input.runId,
        targetUrl: getString(event.current_url) ?? 'about:blank',
      }),
      eventType: getString(event.event_type) ?? 'heartbeat',
      severity: getString(event.severity) ?? 'info',
      handoffState: getString(event.handoff_state),
      currentUrl: getString(event.current_url),
      artifactId: getString(event.artifact_id),
      screenshotUri: getString(event.screenshot_uri),
      message: getString(event.message),
      metadata: asRecord(event.metadata) ?? {},
    })
    if (id) ids.push(id)
  }
  return ids
}

async function recordBrowserSessionSharedActionsFromStepOutput(
  supabase: SupabaseClient,
  input: {
    orgId: string
    runId: string
    agentOps: Record<string, unknown> | null
    structured: AgentOpsStructuredStepOutput
  },
): Promise<string[]> {
  const actions = input.structured.evidence.flatMap((item) => {
    const sharing = asRecord(item.content?.browser_session_sharing)
    return normalizeBrowserSessionSharedActions(sharing?.actions)
  }).slice(0, 40)
  if (actions.length === 0) return []

  const ids: string[] = []
  for (const action of actions) {
    const id = await insertBrowserSessionSharedAction(supabase, {
      orgId: input.orgId,
      projectId: getString(input.agentOps?.project_id),
      runId: input.runId,
      sessionKey: getString(action.session_key) ?? buildBrowserQaSessionKey({
        runId: input.runId,
        targetUrl: getString(action.current_url) ?? 'about:blank',
      }),
      shareId: getString(action.share_id),
      tokenPrefix: getString(action.token_prefix),
      scope: getString(action.scope),
      actionType: getString(action.action_type) ?? 'session_observed',
      status: getString(action.status) ?? 'allowed',
      actorAssistantId: getString(action.actor_assistant_id),
      actorRuntimeId: getString(action.actor_runtime_id),
      actorAgentLabel: getString(action.actor_agent_label),
      tabIdentity: getString(action.tab_identity),
      currentUrl: getString(action.current_url),
      artifactId: getString(action.artifact_id),
      message: getString(action.message),
      metadata: asRecord(action.metadata) ?? {},
    })
    if (id) ids.push(id)
  }
  return ids
}

function normalizeBrowserSessionSharedActions(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value
    .map(asRecord)
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && getString(item.action_type)),
    )
}

async function insertBrowserSessionSharedAction(
  supabase: SupabaseClient,
  action: {
    orgId: string
    projectId?: string | null
    runId: string
    sessionKey: string
    shareId?: string | null
    tokenPrefix?: string | null
    scope?: string | null
    actionType: string
    status: string
    actorAssistantId?: string | null
    actorRuntimeId?: string | null
    actorAgentLabel?: string | null
    tabIdentity?: string | null
    currentUrl?: string | null
    artifactId?: string | null
    message?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('agent_ops_browser_session_actions')
    .insert({
      org_id: action.orgId,
      project_id: action.projectId ?? null,
      ops_run_id: action.runId,
      browser_share_id: action.shareId ?? null,
      session_key: action.sessionKey,
      token_prefix: action.tokenPrefix ?? null,
      scope: action.scope ?? null,
      action_type: action.actionType,
      status: action.status,
      actor_assistant_id: action.actorAssistantId ?? null,
      actor_runtime_id: action.actorRuntimeId ?? null,
      actor_agent_label: action.actorAgentLabel ?? null,
      tab_identity: action.tabIdentity ?? null,
      current_url: action.currentUrl ?? null,
      artifact_id: action.artifactId ?? null,
      message: action.message ?? null,
      metadata: action.metadata ?? {},
    })
    .select('id')
    .single()

  if (error) {
    console.warn('[agent-ops] browser session shared action projection failed:', summarizeError(error))
    return null
  }
  return (data as { id?: string } | null)?.id ?? null
}

async function recordOperatorProfilesFromStepOutput(
  supabase: SupabaseClient,
  input: {
    orgId: string
    agentOps: Record<string, unknown> | null
    structured: AgentOpsStructuredStepOutput
  },
): Promise<string[]> {
  const profiles = input.structured.evidence.flatMap((item) => {
    const content = asRecord(item.content)
    const direct = asRecord(content?.operator_profile ?? content?.design_taste_profile)
    return direct ? [direct] : []
  }).slice(0, 10)
  if (profiles.length === 0) return []

  const ids: string[] = []
  for (const profile of profiles) {
    const profileType = getString(profile.profile_type) ?? 'design_taste'
    const { data, error } = await supabase
      .from('agent_ops_operator_profiles')
      .upsert({
        org_id: input.orgId,
        user_id: getString(profile.user_id) ?? null,
        project_id: getString(profile.project_id) ?? getString(input.agentOps?.project_id) ?? null,
        scope_key: `user:${getString(profile.user_id) ?? 'any'}|project:${getString(profile.project_id) ?? getString(input.agentOps?.project_id) ?? 'any'}`,
        profile_type: profileType,
        declared: asRecord(profile.declared) ?? {},
        inferred: asRecord(profile.inferred) ?? {},
        confidence: asRecord(profile.confidence) ?? {},
        decay_policy: asRecord(profile.decay_policy) ?? {},
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,scope_key,profile_type' })
      .select('id')
      .single()
    if (error) {
      console.warn('[agent-ops] operator profile projection failed:', summarizeError(error))
      continue
    }
    const id = getString((data as { id?: unknown } | null)?.id)
    if (id) ids.push(id)
  }
  return ids
}

async function recordDesignFeedbackFromStepOutput(
  supabase: SupabaseClient,
  input: {
    orgId: string
    runId: string
    agentOps: Record<string, unknown> | null
    structured: AgentOpsStructuredStepOutput
    evidenceArtifactIds: string[]
  },
): Promise<string[]> {
  const feedbackItems = input.structured.evidence.flatMap((item, index) => {
    const content = asRecord(item.content)
    const direct = asRecord(content?.design_feedback)
    const variants = Array.isArray(content?.design_variants)
      ? content?.design_variants.map(asRecord).filter((variant): variant is Record<string, unknown> => Boolean(variant))
      : []
    return [
      ...(direct ? [{ item: direct, artifactIndex: index }] : []),
      ...variants.map((variant) => ({ item: variant, artifactIndex: index })),
    ]
  }).slice(0, 20)
  if (feedbackItems.length === 0) return []

  const ids: string[] = []
  for (const { item, artifactIndex } of feedbackItems) {
    const variantKey = normalizeDesignVariantKey(
      item.variant_key ?? item.key ?? item.name,
      `variant-${artifactIndex + 1}`,
    )
    const feedbackType = getString(item.feedback_type) ?? inferDesignFeedbackType(item)
    const fingerprint = hashValue([
      input.orgId,
      getString(input.agentOps?.project_id) ?? 'project:any',
      input.runId,
      variantKey,
      feedbackType,
    ].join('|'))
    const { data, error } = await supabase
      .from('agent_ops_design_feedback')
      .upsert({
        org_id: input.orgId,
        project_id: getString(input.agentOps?.project_id) ?? null,
        ops_run_id: input.runId,
        artifact_id: input.evidenceArtifactIds[artifactIndex] ?? null,
        variant_key: variantKey,
        feedback_type: feedbackType,
        status: getString(item.status) ?? inferDesignVariantStatus(item),
        feedback: getString(item.feedback ?? item.rationale ?? item.notes),
        source: getString(item.source) ?? 'agent',
        fingerprint,
        metadata: {
          ...(asRecord(item.metadata) ?? {}),
          title: getString(item.title ?? item.name),
        },
      }, { onConflict: 'org_id,fingerprint' })
      .select('id')
      .single()
    if (error) {
      console.warn('[agent-ops] design feedback projection failed:', error.message)
      continue
    }
    const id = getString((data as { id?: unknown } | null)?.id)
    if (id) ids.push(id)
  }
  return ids
}

async function recordDecisionEventsFromStepOutput(
  supabase: SupabaseClient,
  input: {
    orgId: string
    runId: string
    agentOps: Record<string, unknown> | null
    structured: AgentOpsStructuredStepOutput
  },
): Promise<string[]> {
  const decisions = input.structured.evidence.flatMap((item) => {
    const content = asRecord(item.content)
    const direct = asRecord(content?.decision_event ?? content?.decision_pacing)
    const list = Array.isArray(content?.decision_events)
      ? content.decision_events.map(asRecord).filter((event): event is Record<string, unknown> => Boolean(event))
      : []
    return direct ? [direct, ...list] : list
  }).slice(0, 30)
  if (decisions.length === 0) return []

  const ids: string[] = []
  for (const decision of decisions) {
    const questionId = getString(decision.question_id) ?? getString(decision.questionId)
    const registryQuestion = questionId ? getAgentOpsQuestion(questionId) : null
    const phase = getString(decision.phase) ?? registryQuestion?.phase ?? 'execute'
    const doorType = getString(decision.door_type ?? decision.doorType) ?? registryQuestion?.doorType ?? 'two_way'
    const rawDecisionMode = getString(decision.decision_mode ?? decision.decisionMode) ?? 'silent_decision'
    const decisionMode = doorType === 'one_way' && rawDecisionMode !== 'flipped'
      ? 'asked'
      : rawDecisionMode
    const selectedOption = asRecord(decision.selected_option ?? decision.selectedOption)
    const { data, error } = await supabase
      .from('agent_ops_decision_events')
      .insert({
        org_id: input.orgId,
        project_id: getString(input.agentOps?.project_id) ?? null,
        ops_run_id: input.runId,
        phase,
        question_id: questionId ?? 'unregistered',
        door_type: doorType,
        decision_mode: decisionMode,
        question: getString(decision.question) ?? registryQuestion?.question ?? 'Agent Ops decision',
        options: Array.isArray(decision.options)
          ? decision.options
          : registryQuestion ? [...registryQuestion.options] : [],
        selected_option: selectedOption,
        risk_reason: getString(decision.risk_reason ?? decision.riskReason) ?? registryQuestion?.riskReason ?? null,
        reversible: decision.reversible !== false && doorType !== 'one_way',
        flipped_from_event_id: getString(decision.flipped_from_event_id ?? decision.flippedFromEventId),
        metadata: asRecord(decision.metadata) ?? {},
      })
      .select('id')
      .single()
    if (error) {
      console.warn('[agent-ops] decision event projection failed:', error.message)
      continue
    }
    const id = getString((data as { id?: unknown } | null)?.id)
    if (id) ids.push(id)
  }
  return ids
}

function inferDesignFeedbackType(item: Record<string, unknown>): string {
  const status = getString(item.status)
  if (status === 'approved' || item.approved === true) return 'approval'
  if (status === 'rejected' || item.rejected === true) return 'rejection'
  return 'preference'
}

function inferDesignVariantStatus(item: Record<string, unknown>): string {
  const status = getString(item.status)
  if (status === 'approved' || status === 'rejected' || status === 'promoted') return status
  if (item.approved === true) return 'approved'
  if (item.rejected === true) return 'rejected'
  return 'proposed'
}

function normalizeBrowserSessionEvents(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value
    .map(asRecord)
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && getString(item.event_type)),
    )
}

async function insertBrowserSessionEvent(
  supabase: SupabaseClient,
  event: {
    orgId: string
    runId: string
    sessionKey: string
    eventType: string
    severity: string
    handoffState?: string | null
    currentUrl?: string | null
    artifactId?: string | null
    screenshotUri?: string | null
    message?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('agent_ops_browser_session_events')
    .insert({
      org_id: event.orgId,
      ops_run_id: event.runId,
      session_key: event.sessionKey,
      event_type: event.eventType,
      severity: event.severity,
      handoff_state: event.handoffState ?? null,
      current_url: event.currentUrl ?? null,
      artifact_id: event.artifactId ?? null,
      screenshot_uri: event.screenshotUri ?? null,
      message: event.message ?? null,
      metadata: event.metadata ?? {},
    })
    .select('id')
    .single()

  if (error) {
    console.warn('[agent-ops] browser session event projection failed:', summarizeError(error))
    return null
  }
  return (data as { id?: string } | null)?.id ?? null
}

function normalizeBrowserSecurityEvents(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value
    .map(asRecord)
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && getString(item.event_type) && getString(item.severity)),
    )
}

async function insertBrowserSecurityEvent(
  supabase: SupabaseClient,
  event: {
    orgId: string
    projectId?: string | null
    opsRunId?: string | null
    browserSessionId?: string | null
    eventType: string
    severity: string
    layer: string
    host?: string | null
    urlHash?: string | null
    contentHash?: string | null
    details?: Record<string, unknown>
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('agent_ops_browser_security_events')
    .insert({
      org_id: event.orgId,
      project_id: event.projectId ?? null,
      ops_run_id: event.opsRunId ?? null,
      browser_session_id: event.browserSessionId ?? null,
      event_type: event.eventType,
      severity: event.severity,
      layer: event.layer,
      host: event.host ?? null,
      url_hash: event.urlHash ?? null,
      content_hash: event.contentHash ?? null,
      details: event.details ?? {},
    })
    .select('id')
    .single()

  if (error) {
    console.warn('[agent-ops] browser security event projection failed:', error.message)
    return null
  }
  return (data as { id?: string } | null)?.id ?? null
}

function browserSecurityAttemptTitle(event: Record<string, unknown>): string {
  const eventType = getString(event.event_type)
  if (eventType === 'canary_leak') return 'Browser Trust Shield canary leaked'
  if (eventType === 'prompt_injection_pattern') return 'Browser prompt-injection pattern detected'
  return 'Browser Trust Shield warning detected'
}

function browserSecurityAttemptBody(event: Record<string, unknown>): string {
  const details = asRecord(event.details)
  const pattern = getString(details?.pattern)
  const eventType = getString(event.event_type)
  if (eventType === 'canary_leak') {
    return 'Browser content or browser-derived output included a Trust Shield canary. Treat the surrounding content as hostile until reviewed.'
  }
  if (pattern) {
    return `Browser content matched the Trust Shield pattern "${pattern}". Review the captured evidence before relying on this page output.`
  }
  return 'Browser Trust Shield recorded a browser security event that should be reviewed before promotion or automation.'
}

function normalizePlaybookReferences(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item && getString(item.id)))
    .slice(0, 10)
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean)
    .slice(0, 50)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getAgentOpsContext(payload: unknown): Record<string, unknown> | null {
  const record = asRecord(payload)
  return asRecord(record?.agent_ops)
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getNumber(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function getPositiveInt(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

function getConfidence(value: unknown): number | null {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null
  return Math.max(0, Math.min(1, numberValue))
}

function structuredToJson(structured: AgentOpsStructuredStepOutput): Record<string, unknown> {
  return {
    summary: structured.summary,
    findings: structuredFindingsToJson(structured.findings),
    evidence: structured.evidence,
    risks: structured.risks,
    next_actions: structured.nextActions,
    parsed: structured.parsed,
  }
}

function structuredFindingsToJson(findings: AgentOpsStructuredFinding[]): Array<Record<string, unknown>> {
  return findings.map((finding) => {
    const { failureOwnership, ...rest } = finding
    return {
      ...rest,
      ...(failureOwnership
        ? { failure_ownership: serializeAgentOpsFailureOwnership(failureOwnership) }
        : {}),
    }
  })
}

async function insertArtifact(
  supabase: SupabaseClient,
  input: {
    orgId: string
    runId: string
    type: AgentOpsEvidenceType
    title: string
    summary?: string | null
    uri?: string | null
    checksum?: string | null
    content: Record<string, unknown>
    sourceKind: string
    sourceRef: string
  },
): Promise<string | null> {
  const { data, error } = await supabase
    .from('agent_ops_artifacts')
    .insert({
      org_id: input.orgId,
      ops_run_id: input.runId,
      artifact_type: input.type,
      title: input.title.slice(0, 240),
      summary: input.summary?.slice(0, 1_000) ?? null,
      uri: input.uri ?? null,
      content: input.content,
      checksum: input.checksum ?? null,
      source_kind: input.sourceKind,
      source_ref: input.sourceRef,
    })
    .select('id')
    .single()

  if (error) {
    console.warn('[agent-ops] artifact projection failed:', error.message)
    return null
  }
  return (data as { id?: string } | null)?.id ?? null
}

async function upsertBrowserQaSession(
  supabase: SupabaseClient,
  input: {
    orgId: string
    runId: string
    targetUrl: string
    artifactId: string
    stepId: string
    stepKey: string
    evidenceType: AgentOpsEvidenceType
    status?: 'completed' | 'handoff_required' | 'waiting_for_human'
    viewport: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await supabase
    .from('agent_ops_browser_qa_sessions')
    .upsert({
      org_id: input.orgId,
      ops_run_id: input.runId,
      session_key: buildBrowserQaSessionKey({
        runId: input.runId,
        targetUrl: input.targetUrl,
      }),
      target_url: input.targetUrl,
      status: input.status ?? 'completed',
      viewport: input.viewport,
      artifact_count: 1,
      last_artifact_id: input.artifactId,
      completed_at: new Date().toISOString(),
      metadata: {
        last_step_id: input.stepId,
        last_step_key: input.stepKey,
        last_evidence_type: input.evidenceType,
      },
    }, { onConflict: 'org_id,ops_run_id,session_key' })

  if (error) {
    console.warn('[agent-ops] browser QA session projection failed:', summarizeError(error))
  }
}

function resolveBrowserSessionStatus(
  content: Record<string, unknown> | undefined,
): 'completed' | 'handoff_required' | 'waiting_for_human' {
  const liveSession = asRecord(content?.browser_live_session)
  const handoffState = getString(liveSession?.handoff_state)
  if (handoffState) return 'handoff_required'
  const events = normalizeBrowserSessionEvents(liveSession?.events)
  if (events.some((event) => getString(event.event_type) === 'handoff_required')) {
    return 'handoff_required'
  }
  return 'completed'
}

async function insertFinding(
  supabase: SupabaseClient,
  input: {
    orgId: string
    runId: string
    finding: AgentOpsStructuredFinding
    evidenceArtifactId: string | null
    metadata: Record<string, unknown>
  },
): Promise<string | null> {
  const fingerprint = input.finding.fingerprint ?? fingerprintFinding(input.runId, input.finding)
  const { data, error } = await supabase
    .from('agent_ops_findings')
    .insert({
      org_id: input.orgId,
      ops_run_id: input.runId,
      severity: input.finding.severity,
      title: input.finding.title,
      body: input.finding.body,
      file_path: input.finding.filePath ?? null,
      start_line: input.finding.startLine ?? null,
      end_line: input.finding.endLine ?? null,
      confidence: input.finding.confidence ?? null,
      evidence_artifact_id: input.evidenceArtifactId,
      fingerprint,
      metadata: input.metadata,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code !== '23505') {
      console.warn('[agent-ops] finding projection failed:', error.message)
    }
    return null
  }
  return (data as { id?: string } | null)?.id ?? null
}

async function recordCanaryLeakAttempts(
  supabase: SupabaseClient,
  input: {
    orgId: string
    runId: string
    stepId: string
    output: string
    agentOps: Record<string, unknown> | null
  },
): Promise<string[]> {
  const canaries = normalizeTrustGuardCanaries(
    input.agentOps?.security_canaries
      ?? input.agentOps?.trust_guard_canaries
      ?? asRecord(input.agentOps?.metadata)?.security_canaries,
  )
  if (canaries.length === 0) return []

  const check = checkCanaryLeaks({
    content: input.output,
    canaries,
    sourceKind: 'agent_ops_api',
    sourceRef: input.stepId,
  })
  const attempts = buildCanaryLeakSecurityAttempts({
    orgId: input.orgId,
    projectId: getString(input.agentOps?.project_id),
    assistantId: getString(input.agentOps?.assistant_id),
    opsRunId: input.runId,
    check,
    metadata: {
      dag_step_id: input.stepId,
      workflow_id: getString(input.agentOps?.workflow_id),
    },
  })

  const ids: string[] = []
  for (const attempt of attempts) {
    const id = await insertSecurityAttempt(supabase, attempt)
    if (id) ids.push(id)
  }
  return ids
}

async function insertSecurityAttempt(
  supabase: SupabaseClient,
  attempt: TrustGuardSecurityAttemptInput,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('agent_ops_security_attempts')
    .insert({
      org_id: attempt.orgId,
      project_id: attempt.projectId ?? null,
      assistant_id: attempt.assistantId ?? null,
      ops_run_id: attempt.opsRunId ?? null,
      source_kind: attempt.sourceKind,
      source_ref: attempt.sourceRef ?? null,
      severity: attempt.severity,
      title: attempt.title,
      body: attempt.body,
      metadata: attempt.metadata ?? {},
    })
    .select('id')
    .single()

  if (error) {
    console.warn('[agent-ops] security-attempt projection failed:', error.message)
    return null
  }
  return (data as { id?: string } | null)?.id ?? null
}

function getViewport(content: Record<string, unknown> | undefined): Record<string, unknown> {
  const direct = asRecord(content?.viewport)
  if (direct) return direct

  const width = getPositiveInt(content?.viewport_width ?? content?.viewportWidth)
  const height = getPositiveInt(content?.viewport_height ?? content?.viewportHeight)
  return {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  }
}

function fingerprintFinding(runId: string, finding: AgentOpsStructuredFinding): string {
  return hashValue([
    runId,
    finding.severity,
    finding.title,
    finding.filePath ?? '',
    finding.startLine ?? '',
    finding.body.slice(0, 500),
  ].join('|'))
}

function hashValue(value: string): string {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex')
}
