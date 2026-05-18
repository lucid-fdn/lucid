import crypto from 'node:crypto'
import { z } from 'zod'

import type { AgentOpsWorkflowId } from './workflow-types'
import { getReleaseQualityChecksForWorkflow } from './release-quality-gates'

export const AGENT_OPS_PROJECT_SAFETY_MODES = [
  'normal',
  'careful',
  'guard',
  'freeze',
  'canary',
] as const

export type AgentOpsProjectSafetyMode = (typeof AGENT_OPS_PROJECT_SAFETY_MODES)[number]

export const AGENT_OPS_CONTEXT_SNAPSHOT_KINDS = [
  'handoff',
  'resume',
  'checkpoint',
  'retro',
  'release',
] as const

export type AgentOpsContextSnapshotKind = (typeof AGENT_OPS_CONTEXT_SNAPSHOT_KINDS)[number]

export interface AgentOpsChecklistItem {
  id: string
  label: string
  promise: string
  required: boolean
  evidenceTypes: readonly string[]
  approvalRequired: boolean
}

export interface AgentOpsTeamBootstrapRequirement {
  id: string
  label: string
  category: 'runtime' | 'workflow' | 'governance' | 'memory' | 'eval' | 'channel'
  required: boolean
  description: string
}

export type AgentOpsTeamBootstrapRequirementStatus = 'ready' | 'missing' | 'optional'

export type AgentOpsTeamBootstrapRequirementWithStatus =
  AgentOpsTeamBootstrapRequirement & { status: AgentOpsTeamBootstrapRequirementStatus }

export interface AgentOpsTeamSetupDoctorSignals {
  performanceHealthStatus?: AgentOpsPerformanceHealthStatus | null
  specialistCount?: number | null
  teamPolicyRequiredCount?: number | null
  evalRunCount?: number | null
  channelReadyCount?: number | null
  learningCount?: number | null
}

export interface AgentOpsSafetyPolicy {
  mode: AgentOpsProjectSafetyMode
  writeActionsAllowed: boolean
  requiresApprovalForWrites: boolean
  requiresHumanBeforeDeploy: boolean
  browserQaRequiredForRelease: boolean
  autoRetryAllowed: boolean
  promptInstruction: string
}

export interface AgentOpsPerformanceBudget {
  avgLatencyMs: number | null
  p95LatencyMs: number | null
  avgCostUsd: number | null
  totalCostUsd: number | null
  failureRatePct: number | null
  minRunCount: number
  minMeasuredRunCount: number
  warningRatio: number
}

export type AgentOpsPerformanceHealthStatus = 'healthy' | 'watch' | 'breach' | 'insufficient_data'

export interface AgentOpsPerformanceSnapshot {
  runCount: number
  completedRunCount: number
  failedRunCount: number
  measuredRunCount: number
  avgLatencyMs: number | null
  p95LatencyMs: number | null
  totalCostUsd: number
  avgCostUsd: number | null
}

export interface AgentOpsPerformanceBudgetSignal {
  id: 'p95_latency' | 'avg_latency' | 'failure_rate' | 'avg_cost' | 'total_cost'
  label: string
  status: AgentOpsPerformanceHealthStatus
  actual: number | null
  budget: number | null
  unit: 'ms' | 'usd' | 'percent'
  message: string
}

export interface AgentOpsPerformanceHealth {
  status: AgentOpsPerformanceHealthStatus
  budget: AgentOpsPerformanceBudget
  signals: AgentOpsPerformanceBudgetSignal[]
  summary: string
}

export interface AgentOpsPerformanceAlert {
  status: Extract<AgentOpsPerformanceHealthStatus, 'watch' | 'breach'>
  title: string
  body: string
  fingerprint: string
  evidence: Record<string, unknown>
  metadata: Record<string, unknown>
  actions: AgentOpsPerformanceAlertAction[]
}

export type AgentOpsPerformanceAlertStatus = AgentOpsPerformanceAlert['status']

export interface AgentOpsPerformanceAlertAck {
  acknowledgedAt: string
  acknowledgedBy: string | null
}

export interface AgentOpsPerformanceAlertResolution {
  resolvedAt: string
  resolvedBy: string | null
  resolvingRunId: string | null
  note: string | null
}

export interface AgentOpsPerformanceAlertControls {
  enabled: boolean
  minStatus: AgentOpsPerformanceAlertStatus
  notifyInApp: boolean
  muted: boolean
  snoozedUntil: string | null
  acknowledgedFingerprints: Record<string, AgentOpsPerformanceAlertAck>
  resolvedFingerprints: Record<string, AgentOpsPerformanceAlertResolution>
}

export interface AgentOpsPerformanceAlertDecision {
  alert: AgentOpsPerformanceAlert | null
  controls: AgentOpsPerformanceAlertControls
  state: 'none' | 'active' | 'acknowledged' | 'resolved' | 'muted' | 'snoozed' | 'below_threshold'
  shouldRecord: boolean
  shouldNotify: boolean
  reason: string | null
}

export interface AgentOpsPerformanceAlertHistoryEvent {
  id: string
  title: string
  body: string | null
  evidence: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AgentOpsPerformanceAlertHistoryItem extends AgentOpsPerformanceAlertHistoryEvent {
  status: AgentOpsPerformanceAlertStatus | null
  fingerprint: string | null
  actions: AgentOpsPerformanceAlertAction[]
  lifecycleState: 'recorded' | 'acknowledged' | 'resolved'
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  resolvingRunId: string | null
  resolutionNote: string | null
}

export interface AgentOpsPerformanceAlertAction {
  id: string
  label: string
  description: string
  workflowId: AgentOpsWorkflowId | null
  priority: 'urgent' | 'recommended' | 'optional'
}

export const DEFAULT_AGENT_OPS_PERFORMANCE_BUDGET: AgentOpsPerformanceBudget = Object.freeze({
  avgLatencyMs: 120_000,
  p95LatencyMs: 300_000,
  avgCostUsd: 0.25,
  totalCostUsd: 50,
  failureRatePct: 10,
  minRunCount: 3,
  minMeasuredRunCount: 2,
  warningRatio: 0.8,
})

export const performanceBudgetInputSchema = z.object({
  avg_latency_ms: z.number().nonnegative().nullable().optional(),
  p95_latency_ms: z.number().nonnegative().nullable().optional(),
  avg_cost_usd: z.number().nonnegative().nullable().optional(),
  total_cost_usd: z.number().nonnegative().nullable().optional(),
  failure_rate_pct: z.number().min(0).max(100).nullable().optional(),
  min_run_count: z.number().int().min(1).max(10_000).optional(),
  min_measured_run_count: z.number().int().min(1).max(10_000).optional(),
  warning_ratio: z.number().min(0.1).max(1).optional(),
}).strict()

export type AgentOpsPerformanceBudgetInput = z.infer<typeof performanceBudgetInputSchema>

export const performanceAlertControlsInputSchema = z.object({
  enabled: z.boolean().optional(),
  min_status: z.enum(['watch', 'breach']).optional(),
  notify_in_app: z.boolean().optional(),
  muted: z.boolean().optional(),
  snoozed_until: z.string().datetime({ offset: true }).nullable().optional(),
  acknowledged_fingerprints: z.record(z.string(), z.object({
    acknowledged_at: z.string().datetime({ offset: true }),
    acknowledged_by: z.string().uuid().nullable().optional(),
  })).optional(),
  resolved_fingerprints: z.record(z.string(), z.object({
    resolved_at: z.string().datetime({ offset: true }),
    resolved_by: z.string().uuid().nullable().optional(),
    resolving_run_id: z.string().uuid().nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
  })).optional(),
}).strict()

export type AgentOpsPerformanceAlertControlsInput = z.infer<typeof performanceAlertControlsInputSchema>

const teamSetupDoctorRequirementIdSchema = z.enum([
  'runtime-doctor',
  'capability-doctor',
  'workflow-pack',
  'approval-policy',
  'project-learnings',
  'eval-pack',
  'channel-surface',
])

export const teamSetupDoctorInputSchema = z.object({
  installed_requirement_ids: z.array(teamSetupDoctorRequirementIdSchema).optional().default([]),
  channel_ready_count: z.number().int().nonnegative().optional(),
  channels: z.array(z.string().min(1).max(80)).optional(),
  notes: z.record(z.string(), z.string().max(1000)).optional(),
}).strict()

export type AgentOpsTeamSetupDoctorInput = z.infer<typeof teamSetupDoctorInputSchema>

export const DEFAULT_AGENT_OPS_PERFORMANCE_ALERT_CONTROLS: AgentOpsPerformanceAlertControls = Object.freeze({
  enabled: true,
  minStatus: 'watch',
  notifyInApp: true,
  muted: false,
  snoozedUntil: null,
  acknowledgedFingerprints: {},
  resolvedFingerprints: {},
})

export const contextSnapshotInputSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  assistantId: z.string().uuid().nullable().optional(),
  opsRunId: z.string().uuid().nullable().optional(),
  kind: z.enum(AGENT_OPS_CONTEXT_SNAPSHOT_KINDS).default('checkpoint'),
  title: z.string().min(1).max(240),
  summary: z.string().max(2000).nullable().optional(),
  state: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdBy: z.string().uuid().nullable().optional(),
})

export type AgentOpsContextSnapshotInput = z.infer<typeof contextSnapshotInputSchema>

export const projectSafetyPolicyInputSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  mode: z.enum(AGENT_OPS_PROJECT_SAFETY_MODES),
  metadata: z.record(z.string(), z.unknown()).default({}),
  updatedBy: z.string().uuid().nullable().optional(),
})

export type AgentOpsProjectSafetyPolicyInput = z.infer<typeof projectSafetyPolicyInputSchema>

export const DESIGN_OPS_CHECKLIST: readonly AgentOpsChecklistItem[] = Object.freeze([
  {
    id: 'design-variants',
    label: 'Generate variants',
    promise: 'Explore at least two UI directions before converging.',
    required: true,
    evidenceTypes: ['transcript', 'screenshot'],
    approvalRequired: false,
  },
  {
    id: 'visual-review',
    label: 'Visual review',
    promise: 'Check hierarchy, polish, accessibility, responsiveness, and copy clarity.',
    required: true,
    evidenceTypes: ['screenshot', 'review_finding'],
    approvalRequired: false,
  },
  {
    id: 'design-to-code-prompt',
    label: 'Design-to-code prompt',
    promise: 'Extract implementation guidance that preserves product intent without hard-coding tool details.',
    required: true,
    evidenceTypes: ['transcript'],
    approvalRequired: false,
  },
  {
    id: 'visual-diff',
    label: 'Visual diff',
    promise: 'Compare before/after evidence and call out visible regressions.',
    required: true,
    evidenceTypes: ['screenshot', 'review_finding'],
    approvalRequired: false,
  },
])

export const DOCUMENT_RELEASE_CHECKLIST: readonly AgentOpsChecklistItem[] = Object.freeze([
  {
    id: 'copy-ready',
    label: 'Copy ready',
    promise: 'Release docs are clear, scoped, and copy/paste safe.',
    required: true,
    evidenceTypes: ['transcript'],
    approvalRequired: false,
  },
  {
    id: 'artifact-rendered',
    label: 'Artifact rendered',
    promise: 'Markdown or document artifacts are rendered before external handoff.',
    required: true,
    evidenceTypes: ['transcript', 'screenshot'],
    approvalRequired: false,
  },
  {
    id: 'publication-approval',
    label: 'Publication approval',
    promise: 'External-facing docs require explicit human approval.',
    required: true,
    evidenceTypes: ['approval'],
    approvalRequired: true,
  },
])

export const RELEASE_AGENT_CHECKLIST: readonly AgentOpsChecklistItem[] = Object.freeze([
  {
    id: 'version',
    label: 'Version check',
    promise: 'Confirm version/changelog impact and avoid accidental release drift.',
    required: true,
    evidenceTypes: ['diff'],
    approvalRequired: false,
  },
  {
    id: 'changelog',
    label: 'Changelog',
    promise: 'Summarize user-facing changes, risks, and rollback notes.',
    required: true,
    evidenceTypes: ['transcript'],
    approvalRequired: false,
  },
  {
    id: 'pull-request',
    label: 'PR readiness',
    promise: 'Ensure review, tests, and release evidence are attached before merge.',
    required: true,
    evidenceTypes: ['review_finding', 'test_result'],
    approvalRequired: true,
  },
  {
    id: 'deploy',
    label: 'Deploy gate',
    promise: 'Deploy only after release gates and human approval are satisfied.',
    required: true,
    evidenceTypes: ['approval', 'deploy_url'],
    approvalRequired: true,
  },
  {
    id: 'canary',
    label: 'Canary verification',
    promise: 'Verify deploy health with browser/perf/network evidence and rollback criteria.',
    required: true,
    evidenceTypes: ['deploy_url', 'screenshot', 'console_log', 'network_log', 'perf_metric'],
    approvalRequired: false,
  },
])

export const TEAM_MODE_BOOTSTRAP_REQUIREMENTS: readonly AgentOpsTeamBootstrapRequirement[] = Object.freeze([
  {
    id: 'runtime-doctor',
    label: 'Runtime doctor',
    category: 'runtime',
    required: true,
    description: 'Confirm shared or dedicated runtime capability, browser QA support, and health checks.',
  },
  {
    id: 'capability-doctor',
    label: 'Capability doctor',
    category: 'runtime',
    required: true,
    description: 'Validate workflow requirements against the shared runtime capability registry before team workflows are marked ready.',
  },
  {
    id: 'workflow-pack',
    label: 'Workflow pack',
    category: 'workflow',
    required: true,
    description: 'Install Agent Ops workflow verbs for investigate, plan, review, QA, ship, canary, retro, and audit.',
  },
  {
    id: 'approval-policy',
    label: 'Approval policy',
    category: 'governance',
    required: true,
    description: 'Set release, publish, and write-action approval requirements before agents can ship changes.',
  },
  {
    id: 'project-learnings',
    label: 'Project learnings',
    category: 'memory',
    required: true,
    description: 'Enable bounded project learnings and decision preferences for future runs.',
  },
  {
    id: 'eval-pack',
    label: 'Eval pack',
    category: 'eval',
    required: false,
    description: 'Attach regression scenarios for workflow quality, memory recall, channels, and releases.',
  },
  {
    id: 'channel-surface',
    label: 'Channel surface',
    category: 'channel',
    required: false,
    description: 'Configure Slack, Discord, Telegram, WhatsApp, Teams, iMessage, or web surfaces as needed.',
  },
])

export function listPhase8WorkflowIds(): AgentOpsWorkflowId[] {
  return [
    'design-consultation',
    'design-variants',
    'design-review',
    'design-to-code',
    'devex-review',
    'devex-audit',
    'document-release',
    'release-check',
    'version-gate',
    'pr-title-sync',
    'product-quality-lint',
    'ship',
    'canary',
    'retro',
  ]
}

export function buildReleaseChecklist(workflowId: AgentOpsWorkflowId): AgentOpsChecklistItem[] {
  if (workflowId === 'document-release') {
    return [
      ...DOCUMENT_RELEASE_CHECKLIST,
      ...getReleaseQualityChecksForWorkflow(workflowId).map((check) => ({
        id: check.id,
        label: check.label,
        promise: check.promise,
        required: check.required,
        evidenceTypes: check.evidenceTypes,
        approvalRequired: false,
      })),
    ]
  }
  if (
    workflowId === 'devex-review'
    || workflowId === 'release-check'
    || workflowId === 'version-gate'
    || workflowId === 'pr-title-sync'
    || workflowId === 'product-quality-lint'
  ) {
    return getReleaseQualityChecksForWorkflow(workflowId).map((check) => ({
      id: check.id,
      label: check.label,
      promise: check.promise,
      required: check.required,
      evidenceTypes: check.evidenceTypes,
      approvalRequired: false,
    }))
  }
  if (
    workflowId === 'design-consultation'
    || workflowId === 'design-variants'
    || workflowId === 'design-review'
    || workflowId === 'design-to-code'
  ) return [...DESIGN_OPS_CHECKLIST]
  if (workflowId === 'ship' || workflowId === 'canary') return [...RELEASE_AGENT_CHECKLIST]
  return [...RELEASE_AGENT_CHECKLIST.filter((item) => item.id === 'changelog' || item.id === 'canary')]
}

export function buildTeamModeBootstrapPlan(input: {
  installedRequirementIds?: string[]
} = {}): AgentOpsTeamBootstrapRequirementWithStatus[] {
  const installed = new Set(input.installedRequirementIds ?? [])
  return TEAM_MODE_BOOTSTRAP_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    status: installed.has(requirement.id)
      ? 'ready'
      : requirement.required ? 'missing' : 'optional',
  }))
}

export function resolveTeamSetupDoctorInstalledRequirementIds(
  metadata?: Record<string, unknown> | null,
  signals: AgentOpsTeamSetupDoctorSignals = {},
): string[] {
  const rawDoctor = readTeamSetupDoctorMetadata(metadata)
  const parsedDoctor = teamSetupDoctorInputSchema.safeParse(rawDoctor)
  const installed = new Set<string>(parsedDoctor.success ? parsedDoctor.data.installed_requirement_ids : [])

  // Workflow verbs are registered in code; runtime/capability readiness stays signal or metadata driven.
  installed.add('workflow-pack')

  if (signals.performanceHealthStatus && signals.performanceHealthStatus !== 'insufficient_data') {
    installed.add('runtime-doctor')
  }
  if ((signals.specialistCount ?? 0) > 0) {
    installed.add('capability-doctor')
  }
  if ((signals.teamPolicyRequiredCount ?? countRequiredTeamPolicyWorkflows(metadata)) > 0) {
    installed.add('approval-policy')
  }
  if ((signals.learningCount ?? 0) > 0) {
    installed.add('project-learnings')
  }
  if ((signals.evalRunCount ?? 0) > 0) {
    installed.add('eval-pack')
  }
  if ((signals.channelReadyCount ?? readChannelReadyCount(rawDoctor)) > 0) {
    installed.add('channel-surface')
  }

  return TEAM_MODE_BOOTSTRAP_REQUIREMENTS
    .map((requirement) => requirement.id)
    .filter((id) => installed.has(id))
}

export function resolveSafetyPolicy(mode: AgentOpsProjectSafetyMode): AgentOpsSafetyPolicy {
  switch (mode) {
    case 'careful':
      return {
        mode,
        writeActionsAllowed: true,
        requiresApprovalForWrites: true,
        requiresHumanBeforeDeploy: true,
        browserQaRequiredForRelease: true,
        autoRetryAllowed: true,
        promptInstruction: 'Use careful mode: prefer reversible actions, ask before writes, and attach evidence before recommendations.',
      }
    case 'guard':
      return {
        mode,
        writeActionsAllowed: true,
        requiresApprovalForWrites: true,
        requiresHumanBeforeDeploy: true,
        browserQaRequiredForRelease: true,
        autoRetryAllowed: false,
        promptInstruction: 'Use guard mode: no automatic retries or write actions without explicit approval and rollback notes.',
      }
    case 'freeze':
      return {
        mode,
        writeActionsAllowed: false,
        requiresApprovalForWrites: true,
        requiresHumanBeforeDeploy: true,
        browserQaRequiredForRelease: true,
        autoRetryAllowed: false,
        promptInstruction: 'Use freeze mode: read-only investigation only; do not mutate code, deploys, configs, data, or channels.',
      }
    case 'canary':
      return {
        mode,
        writeActionsAllowed: true,
        requiresApprovalForWrites: true,
        requiresHumanBeforeDeploy: true,
        browserQaRequiredForRelease: true,
        autoRetryAllowed: false,
        promptInstruction: 'Use canary mode: focus on post-release monitoring, rollback criteria, and evidence-backed go/no-go decisions.',
      }
    case 'normal':
    default:
      return {
        mode: 'normal',
        writeActionsAllowed: true,
        requiresApprovalForWrites: false,
        requiresHumanBeforeDeploy: true,
        browserQaRequiredForRelease: false,
        autoRetryAllowed: true,
        promptInstruction: 'Use normal mode: follow workflow safety gates and escalate destructive or ambiguous actions.',
      }
  }
}

export function resolveAgentOpsPerformanceBudget(metadata?: Record<string, unknown> | null): AgentOpsPerformanceBudget {
  const rawBudget = metadata && typeof metadata.performance_budget === 'object' && metadata.performance_budget !== null
    ? metadata.performance_budget as Record<string, unknown>
    : metadata && typeof metadata.performanceBudget === 'object' && metadata.performanceBudget !== null
      ? metadata.performanceBudget as Record<string, unknown>
      : {}

  return {
    avgLatencyMs: readBudgetNumber(rawBudget.avgLatencyMs ?? rawBudget.avg_latency_ms, DEFAULT_AGENT_OPS_PERFORMANCE_BUDGET.avgLatencyMs),
    p95LatencyMs: readBudgetNumber(rawBudget.p95LatencyMs ?? rawBudget.p95_latency_ms, DEFAULT_AGENT_OPS_PERFORMANCE_BUDGET.p95LatencyMs),
    avgCostUsd: readBudgetNumber(rawBudget.avgCostUsd ?? rawBudget.avg_cost_usd, DEFAULT_AGENT_OPS_PERFORMANCE_BUDGET.avgCostUsd),
    totalCostUsd: readBudgetNumber(rawBudget.totalCostUsd ?? rawBudget.total_cost_usd, DEFAULT_AGENT_OPS_PERFORMANCE_BUDGET.totalCostUsd),
    failureRatePct: readBudgetNumber(rawBudget.failureRatePct ?? rawBudget.failure_rate_pct, DEFAULT_AGENT_OPS_PERFORMANCE_BUDGET.failureRatePct),
    minRunCount: readBudgetInteger(rawBudget.minRunCount ?? rawBudget.min_run_count, DEFAULT_AGENT_OPS_PERFORMANCE_BUDGET.minRunCount),
    minMeasuredRunCount: readBudgetInteger(rawBudget.minMeasuredRunCount ?? rawBudget.min_measured_run_count, DEFAULT_AGENT_OPS_PERFORMANCE_BUDGET.minMeasuredRunCount),
    warningRatio: clampBudgetRatio(rawBudget.warningRatio ?? rawBudget.warning_ratio, DEFAULT_AGENT_OPS_PERFORMANCE_BUDGET.warningRatio),
  }
}

export function resolveAgentOpsPerformanceAlertControls(
  metadata?: Record<string, unknown> | null,
): AgentOpsPerformanceAlertControls {
  const rawControls = metadata && typeof metadata.performance_alerts === 'object' && metadata.performance_alerts !== null
    ? metadata.performance_alerts as Record<string, unknown>
    : metadata && typeof metadata.performanceAlerts === 'object' && metadata.performanceAlerts !== null
      ? metadata.performanceAlerts as Record<string, unknown>
      : {}
  const parsed = performanceAlertControlsInputSchema.safeParse(rawControls)
  const controls = parsed.success ? parsed.data : {}

  return {
    enabled: controls.enabled ?? DEFAULT_AGENT_OPS_PERFORMANCE_ALERT_CONTROLS.enabled,
    minStatus: controls.min_status ?? DEFAULT_AGENT_OPS_PERFORMANCE_ALERT_CONTROLS.minStatus,
    notifyInApp: controls.notify_in_app ?? DEFAULT_AGENT_OPS_PERFORMANCE_ALERT_CONTROLS.notifyInApp,
    muted: controls.muted ?? DEFAULT_AGENT_OPS_PERFORMANCE_ALERT_CONTROLS.muted,
    snoozedUntil: controls.snoozed_until ?? DEFAULT_AGENT_OPS_PERFORMANCE_ALERT_CONTROLS.snoozedUntil,
    acknowledgedFingerprints: mapAcknowledgedFingerprints(controls.acknowledged_fingerprints),
    resolvedFingerprints: mapResolvedFingerprints(controls.resolved_fingerprints),
  }
}

export function evaluateAgentOpsPerformanceHealth(
  snapshot: AgentOpsPerformanceSnapshot,
  budget: AgentOpsPerformanceBudget = DEFAULT_AGENT_OPS_PERFORMANCE_BUDGET,
): AgentOpsPerformanceHealth {
  const failureRate = snapshot.runCount > 0
    ? (snapshot.failedRunCount / snapshot.runCount) * 100
    : null
  const insufficientRuns = snapshot.runCount < budget.minRunCount
  const insufficientMeasurements = snapshot.measuredRunCount < budget.minMeasuredRunCount
  const signals: AgentOpsPerformanceBudgetSignal[] = [
    buildBudgetSignal({
      id: 'p95_latency',
      label: 'p95 latency',
      actual: snapshot.p95LatencyMs,
      budget: budget.p95LatencyMs,
      unit: 'ms',
      warningRatio: budget.warningRatio,
      insufficientData: insufficientMeasurements,
    }),
    buildBudgetSignal({
      id: 'avg_latency',
      label: 'Avg latency',
      actual: snapshot.avgLatencyMs,
      budget: budget.avgLatencyMs,
      unit: 'ms',
      warningRatio: budget.warningRatio,
      insufficientData: insufficientMeasurements,
    }),
    buildBudgetSignal({
      id: 'failure_rate',
      label: 'Failure rate',
      actual: failureRate,
      budget: budget.failureRatePct,
      unit: 'percent',
      warningRatio: budget.warningRatio,
      insufficientData: insufficientRuns,
    }),
    buildBudgetSignal({
      id: 'avg_cost',
      label: 'Avg cost',
      actual: snapshot.avgCostUsd,
      budget: budget.avgCostUsd,
      unit: 'usd',
      warningRatio: budget.warningRatio,
      insufficientData: insufficientRuns,
    }),
    buildBudgetSignal({
      id: 'total_cost',
      label: 'Total cost',
      actual: snapshot.totalCostUsd,
      budget: budget.totalCostUsd,
      unit: 'usd',
      warningRatio: budget.warningRatio,
      insufficientData: insufficientRuns,
    }),
  ]
  const status = rollupPerformanceStatus(signals)
  return {
    status,
    budget,
    signals,
    summary: buildPerformanceHealthSummary(status, signals),
  }
}

export function evaluateAgentOpsPerformanceAlertDecision(input: {
  alert: AgentOpsPerformanceAlert | null
  controls?: AgentOpsPerformanceAlertControls
  now?: Date
}): AgentOpsPerformanceAlertDecision {
  const controls = input.controls ?? DEFAULT_AGENT_OPS_PERFORMANCE_ALERT_CONTROLS
  const now = input.now ?? new Date()
  if (!input.alert) {
    return {
      alert: null,
      controls,
      state: 'none',
      shouldRecord: false,
      shouldNotify: false,
      reason: null,
    }
  }
  if (!controls.enabled || controls.muted) {
    return {
      alert: input.alert,
      controls,
      state: 'muted',
      shouldRecord: false,
      shouldNotify: false,
      reason: 'Agent Ops performance alerts are muted for this scope.',
    }
  }
  if (controls.snoozedUntil && Date.parse(controls.snoozedUntil) > now.getTime()) {
    return {
      alert: input.alert,
      controls,
      state: 'snoozed',
      shouldRecord: false,
      shouldNotify: false,
      reason: `Agent Ops performance alerts are snoozed until ${controls.snoozedUntil}.`,
    }
  }
  if (controls.minStatus === 'breach' && input.alert.status === 'watch') {
    return {
      alert: input.alert,
      controls,
      state: 'below_threshold',
      shouldRecord: false,
      shouldNotify: false,
      reason: 'Current alert is below the configured breach-only threshold.',
    }
  }
  if (controls.resolvedFingerprints[input.alert.fingerprint]) {
    return {
      alert: input.alert,
      controls,
      state: 'resolved',
      shouldRecord: false,
      shouldNotify: false,
      reason: 'Current alert fingerprint has been resolved. A new alert fingerprint will reopen triage.',
    }
  }
  if (controls.acknowledgedFingerprints[input.alert.fingerprint]) {
    return {
      alert: input.alert,
      controls,
      state: 'acknowledged',
      shouldRecord: true,
      shouldNotify: false,
      reason: 'Current alert fingerprint has already been acknowledged.',
    }
  }

  return {
    alert: input.alert,
    controls,
    state: 'active',
    shouldRecord: true,
    shouldNotify: controls.notifyInApp,
    reason: null,
  }
}

export function buildAgentOpsPerformanceAlertHistory(input: {
  events: AgentOpsPerformanceAlertHistoryEvent[]
  controls?: AgentOpsPerformanceAlertControls
}): AgentOpsPerformanceAlertHistoryItem[] {
  const controls = input.controls ?? DEFAULT_AGENT_OPS_PERFORMANCE_ALERT_CONTROLS
  return input.events.map((event) => {
    const fingerprint = readAlertFingerprint(event)
    const ack = fingerprint ? controls.acknowledgedFingerprints[fingerprint] : undefined
    const resolution = fingerprint ? controls.resolvedFingerprints[fingerprint] : undefined
    return {
      ...event,
      status: readAlertStatus(event),
      fingerprint,
      actions: resolution
        ? []
        : buildAgentOpsPerformanceAlertActions({
            status: readAlertStatus(event),
            signalIds: readAlertSignalIds(event),
          }),
      lifecycleState: resolution ? 'resolved' : ack ? 'acknowledged' : 'recorded',
      acknowledgedAt: ack?.acknowledgedAt ?? null,
      acknowledgedBy: ack?.acknowledgedBy ?? null,
      resolvedAt: resolution?.resolvedAt ?? null,
      resolvedBy: resolution?.resolvedBy ?? null,
      resolvingRunId: resolution?.resolvingRunId ?? null,
      resolutionNote: resolution?.note ?? null,
    }
  })
}

export function buildAgentOpsPerformanceAlert(input: {
  orgId: string
  projectId?: string | null
  assistantId?: string | null
  health: AgentOpsPerformanceHealth
  windowDays: number
}): AgentOpsPerformanceAlert | null {
  if (input.health.status !== 'watch' && input.health.status !== 'breach') return null

  const activeSignals = input.health.signals.filter((signal) => signal.status === input.health.status)
  const signalIdentities = activeSignals.map((signal) => ({
    id: signal.id,
    status: signal.status,
    budget: signal.budget,
    unit: signal.unit,
  }))
  const fingerprint = `agent-ops:performance-alert:v1:${hashJson({
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    assistantId: input.assistantId ?? null,
    status: input.health.status,
    windowDays: input.windowDays,
    signals: signalIdentities,
  })}`
  const title = input.health.status === 'breach'
    ? 'Agent Ops performance budget breached'
    : 'Agent Ops performance budget near limit'
  const body = [
    input.health.summary,
    ...activeSignals.slice(0, 3).map((signal) => signal.message),
  ].join(' ').trim()

  return {
    status: input.health.status,
    title,
    body,
    fingerprint,
    evidence: {
      status: input.health.status,
      summary: input.health.summary,
      signals: activeSignals,
      budget: input.health.budget,
      window_days: input.windowDays,
    },
    metadata: {
      fingerprint,
      alert_kind: 'agent_ops_performance_budget',
      status: input.health.status,
      signal_ids: activeSignals.map((signal) => signal.id),
      assistant_id: input.assistantId ?? null,
      window_days: input.windowDays,
    },
    actions: buildAgentOpsPerformanceAlertActions({
      status: input.health.status,
      signalIds: activeSignals.map((signal) => signal.id),
    }),
  }
}

export function buildAgentOpsPerformanceAlertActions(input: {
  status: AgentOpsPerformanceAlertStatus | null
  signalIds?: string[]
}): AgentOpsPerformanceAlertAction[] {
  const signalIds = new Set(input.signalIds ?? [])
  const urgent = input.status === 'breach'
  const actions: AgentOpsPerformanceAlertAction[] = []

  if (signalIds.has('p95_latency') || signalIds.has('avg_latency')) {
    actions.push({
      id: 'investigate-latency',
      label: 'Investigate latency',
      description: 'Inspect recent slow Agent Ops runs, runtime health, and evidence before changing budgets.',
      workflowId: 'investigate',
      priority: urgent ? 'urgent' : 'recommended',
    })
    actions.push({
      id: 'qa-slow-path',
      label: 'QA slow path',
      description: 'Run Browser QA or workflow QA against the affected scope to capture screenshots, logs, and timing evidence.',
      workflowId: 'qa',
      priority: 'recommended',
    })
  }

  if (signalIds.has('failure_rate')) {
    actions.push({
      id: 'investigate-failures',
      label: 'Investigate failures',
      description: 'Review failed runs, shared runtime errors, and retry safety before promoting more traffic.',
      workflowId: 'investigate',
      priority: urgent ? 'urgent' : 'recommended',
    })
    actions.push({
      id: 'canary-recovery',
      label: 'Canary recovery',
      description: 'Use canary checks to validate recovery criteria before declaring the system healthy.',
      workflowId: 'canary',
      priority: 'recommended',
    })
  }

  if (signalIds.has('avg_cost') || signalIds.has('total_cost')) {
    actions.push({
      id: 'benchmark-cost',
      label: 'Benchmark model/runtime cost',
      description: 'Compare model, memory, and runtime choices against quality, latency, and cost tradeoffs.',
      workflowId: 'model-benchmark',
      priority: urgent ? 'urgent' : 'recommended',
    })
  }

  actions.push({
    id: 'review-budget-policy',
    label: 'Review budgets',
    description: 'Confirm whether this is a real regression or an operating-envelope change before loosening policy.',
    workflowId: null,
    priority: 'optional',
  })

  return dedupeAlertActions(actions)
}

function readAlertFingerprint(event: AgentOpsPerformanceAlertHistoryEvent): string | null {
  const value = event.metadata.fingerprint
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readAlertStatus(event: AgentOpsPerformanceAlertHistoryEvent): AgentOpsPerformanceAlertStatus | null {
  const value = event.metadata.status ?? event.evidence.status
  return value === 'watch' || value === 'breach' ? value : null
}

function readAlertSignalIds(event: AgentOpsPerformanceAlertHistoryEvent): string[] {
  const value = event.metadata.signal_ids
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function dedupeAlertActions(actions: AgentOpsPerformanceAlertAction[]): AgentOpsPerformanceAlertAction[] {
  const seen = new Set<string>()
  return actions.filter((action) => {
    if (seen.has(action.id)) return false
    seen.add(action.id)
    return true
  })
}

export function buildContextSnapshotFingerprint(input: AgentOpsContextSnapshotInput): string {
  const parsed = contextSnapshotInputSchema.parse(input)
  return `agent-ops:snapshot:v1:${hashJson({
    orgId: parsed.orgId,
    projectId: parsed.projectId ?? null,
    assistantId: parsed.assistantId ?? null,
    kind: parsed.kind,
    title: parsed.title,
    summary: parsed.summary ?? null,
    state: parsed.state,
  })}`
}

export function diffContextSnapshots(input: {
  previous?: Record<string, unknown> | null
  current?: Record<string, unknown> | null
}): {
  added: string[]
  removed: string[]
  changed: string[]
  unchanged: string[]
} {
  const previous = input.previous ?? {}
  const current = input.current ?? {}
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort()
  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []
  const unchanged: string[] = []

  for (const key of keys) {
    if (!(key in previous)) {
      added.push(key)
    } else if (!(key in current)) {
      removed.push(key)
    } else if (stableStringify(previous[key]) !== stableStringify(current[key])) {
      changed.push(key)
    } else {
      unchanged.push(key)
    }
  }

  return { added, removed, changed, unchanged }
}

export function buildResumeSummary(input: {
  previousTitle?: string | null
  diff: ReturnType<typeof diffContextSnapshots>
}): string {
  const parts = [
    input.previousTitle ? `Resuming from "${input.previousTitle}".` : 'Resuming from the latest Agent Ops snapshot.',
    input.diff.added.length ? `Added: ${input.diff.added.join(', ')}.` : null,
    input.diff.changed.length ? `Changed: ${input.diff.changed.join(', ')}.` : null,
    input.diff.removed.length ? `Removed: ${input.diff.removed.join(', ')}.` : null,
  ].filter(Boolean)
  return parts.join(' ')
}

function buildBudgetSignal(input: {
  id: AgentOpsPerformanceBudgetSignal['id']
  label: string
  actual: number | null
  budget: number | null
  unit: AgentOpsPerformanceBudgetSignal['unit']
  warningRatio: number
  insufficientData: boolean
}): AgentOpsPerformanceBudgetSignal {
  if (input.budget === null) {
    return {
      id: input.id,
      label: input.label,
      status: 'healthy',
      actual: input.actual,
      budget: null,
      unit: input.unit,
      message: `${input.label} budget is disabled.`,
    }
  }
  if (input.insufficientData || input.actual === null) {
    return {
      id: input.id,
      label: input.label,
      status: 'insufficient_data',
      actual: input.actual,
      budget: input.budget,
      unit: input.unit,
      message: `${input.label} needs more measured runs before judging health.`,
    }
  }
  const status: AgentOpsPerformanceHealthStatus = input.actual > input.budget
    ? 'breach'
    : input.actual >= input.budget * input.warningRatio ? 'watch' : 'healthy'
  return {
    id: input.id,
    label: input.label,
    status,
    actual: roundBudgetValue(input.actual),
    budget: input.budget,
    unit: input.unit,
    message: status === 'breach'
      ? `${input.label} is over budget.`
      : status === 'watch' ? `${input.label} is near budget.` : `${input.label} is within budget.`,
  }
}

function rollupPerformanceStatus(signals: AgentOpsPerformanceBudgetSignal[]): AgentOpsPerformanceHealthStatus {
  if (signals.some((signal) => signal.status === 'breach')) return 'breach'
  if (signals.some((signal) => signal.status === 'watch')) return 'watch'
  if (signals.every((signal) => signal.status === 'insufficient_data')) return 'insufficient_data'
  return 'healthy'
}

function buildPerformanceHealthSummary(
  status: AgentOpsPerformanceHealthStatus,
  signals: AgentOpsPerformanceBudgetSignal[],
): string {
  if (status === 'insufficient_data') return 'Not enough measured Agent Ops runs to judge performance health yet.'
  const activeSignals = signals.filter((signal) => signal.status === status)
  if (status === 'breach') return `${activeSignals.length} Agent Ops performance budget${activeSignals.length === 1 ? '' : 's'} breached.`
  if (status === 'watch') return `${activeSignals.length} Agent Ops performance budget${activeSignals.length === 1 ? '' : 's'} near limit.`
  return 'Agent Ops performance is within configured budgets.'
}

function readBudgetNumber(value: unknown, fallback: number | null): number | null {
  if (value === null) return null
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function readBudgetInteger(value: unknown, fallback: number): number {
  const parsed = readBudgetNumber(value, fallback)
  return parsed === null ? fallback : Math.max(1, Math.round(parsed))
}

function clampBudgetRatio(value: unknown, fallback: number): number {
  const parsed = readBudgetNumber(value, fallback) ?? fallback
  return Math.min(Math.max(parsed, 0.1), 1)
}

function readTeamSetupDoctorMetadata(metadata?: Record<string, unknown> | null): Record<string, unknown> {
  const rawDoctor = metadata?.team_setup_doctor ?? metadata?.teamSetupDoctor
  return rawDoctor && typeof rawDoctor === 'object' && !Array.isArray(rawDoctor)
    ? rawDoctor as Record<string, unknown>
    : {}
}

function countRequiredTeamPolicyWorkflows(metadata?: Record<string, unknown> | null): number {
  const rawPolicy = metadata?.team_policy ?? metadata?.teamPolicy
  const policy = rawPolicy && typeof rawPolicy === 'object' && !Array.isArray(rawPolicy)
    ? rawPolicy as Record<string, unknown>
    : {}
  const workflows = Array.isArray(policy.workflows) ? policy.workflows : []
  return workflows.filter((workflow) => {
    if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return false
    const record = workflow as Record<string, unknown>
    return record.level === 'required' && record.enabled !== false
  }).length
}

function readChannelReadyCount(rawDoctor: Record<string, unknown>): number {
  const channelReadyCount = readNonNegativeInteger(rawDoctor.channel_ready_count ?? rawDoctor.channelReadyCount)
  if (channelReadyCount > 0) return channelReadyCount
  const channels = rawDoctor.channels
  return Array.isArray(channels) ? channels.filter((channel) => typeof channel === 'string' && channel.length > 0).length : 0
}

function readNonNegativeInteger(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
}

function roundBudgetValue(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

function mapAcknowledgedFingerprints(
  input: AgentOpsPerformanceAlertControlsInput['acknowledged_fingerprints'],
): Record<string, AgentOpsPerformanceAlertAck> {
  if (!input) return {}
  return Object.fromEntries(Object.entries(input).map(([fingerprint, ack]) => [
    fingerprint,
    {
      acknowledgedAt: ack.acknowledged_at,
      acknowledgedBy: ack.acknowledged_by ?? null,
    },
  ]))
}

function mapResolvedFingerprints(
  input: AgentOpsPerformanceAlertControlsInput['resolved_fingerprints'],
): Record<string, AgentOpsPerformanceAlertResolution> {
  if (!input) return {}
  return Object.fromEntries(Object.entries(input).map(([fingerprint, resolution]) => [
    fingerprint,
    {
      resolvedAt: resolution.resolved_at,
      resolvedBy: resolution.resolved_by ?? null,
      resolvingRunId: resolution.resolving_run_id ?? null,
      note: resolution.note ?? null,
    },
  ]))
}

function hashJson(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}
