'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PackageCheck,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Workflow as WorkflowIcon,
} from 'lucide-react'

import { AutonomyStatusHero } from '@/components/agent-ops/autonomy-status-hero'
import { TrustSignals } from '@/components/agent-ops/trust-signals'
import { AdvancedDiagnosticsSection } from '@/components/agent-ops/advanced-diagnostics'
import { WorkflowPicker } from '@/components/agent-ops/workflow-picker'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/mission-control/empty-state'
import { CapabilityGate } from '@/components/mission-control/capability-gate'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { parseAgentOpsLaunchParams } from '@/lib/agent-ops/context-launch'
import {
  normalizeAgentOpsFailureOwnership,
  type AgentOpsFailureOwnership,
} from '@/lib/agent-ops/failure-ownership'
import { cn } from '@/lib/utils'
import type {
  AgentOpsArtifact,
  AgentOpsBrowserQaSession,
  AgentOpsEvidenceType,
  AgentOpsExecutionMode,
  AgentOpsFinding,
  AgentOpsFindingSeverity,
  AgentOpsFindingStatus,
  AgentOpsInputField,
  AgentOpsRun,
  AgentOpsRunMode,
  AgentOpsRunStatus,
  AgentOpsSafetyMode,
  AgentOpsScopeType,
  AgentOpsWorkflowId,
  AgentOpsOutputSection,
} from '@/lib/agent-ops/workflow-types'
import {
  AGENT_OPS_FINDING_SEVERITIES,
  AGENT_OPS_FINDING_STATUSES,
  AGENT_OPS_RUN_MODES,
  AGENT_OPS_SCOPE_TYPES,
} from '@/lib/agent-ops/workflow-types'
import {
  buildAgentOpsTrustCenterModel,
  type AgentOpsTrustAction,
} from '@/lib/agent-ops/trust-center'

interface AgentOpsWorkflowSummary {
  id: AgentOpsWorkflowId
  slug: string
  version: string
  name: string
  description: string
  promise: string
  triggerPhrases: string[]
  defaultAgentRole: string
  executionMode: AgentOpsExecutionMode
  safetyMode: AgentOpsSafetyMode
  requiredCapabilities: string[]
  inputFields: AgentOpsInputField[]
  outputSections: AgentOpsOutputSection[]
  evidenceTypes: AgentOpsEvidenceType[]
  approvalGates: Array<{ id: string; label: string; reason: string; requiredFor: string[] }>
  teamOps?: AgentOpsTeamOpsProjection
}

interface AgentOpsTeamOpsSpecialist {
  slug: string
  name: string
  category: string
  requiredCapabilities: string[]
  evidenceTypes: string[]
  critical: boolean
}

interface AgentOpsTeamOpsMissingRuntime {
  profileId: string
  missingCapabilities: string[]
}

interface AgentOpsTeamOpsChannelCompatibility {
  channelId: string
  label: string
  launchSupported: boolean
  reportSupported: boolean
  notes: string[]
}

interface AgentOpsTeamOpsAdaptiveDecision {
  slug: string
  name: string
  reason: string
}

interface AgentOpsTeamOpsAdaptiveDispatch {
  enabled: boolean
  baseTier: string
  finalTier: string
  policySignals: string[]
  telemetrySignals: string[]
  skippedSpecialists: AgentOpsTeamOpsAdaptiveDecision[]
  protectedSpecialists: AgentOpsTeamOpsAdaptiveDecision[]
}

interface AgentOpsTeamOpsChannelLaunchStatus {
  channelType: string
  channelLabel: string
  surfaceId: string
  status: string
  reportStatus: string
  reportMode: string | null
  launchedAt: string | null
}

interface AgentOpsTeamOpsProjection {
  dispatchTier: string
  dispatchReason: string
  specialists: AgentOpsTeamOpsSpecialist[]
  compatibleRuntimeProfiles: string[]
  partialRuntimeProfiles: string[]
  missingRuntimeProfiles: AgentOpsTeamOpsMissingRuntime[]
  channelCompatibility: AgentOpsTeamOpsChannelCompatibility[]
  channelLaunchStatus: AgentOpsTeamOpsChannelLaunchStatus[]
  adaptiveDispatch: AgentOpsTeamOpsAdaptiveDispatch | null
}

interface AgentOpsTeamPolicyItem {
  workflowId: string
  level: 'required' | 'recommended' | 'optional'
  gateTargets: string[]
  freshnessHours: number | null
  enabled: boolean
}

interface AgentOpsTeamSetupDoctorItem {
  id: string
  label: string
  category: 'runtime' | 'workflow' | 'governance' | 'memory' | 'eval' | 'channel'
  required: boolean
  description: string
  status: 'ready' | 'missing' | 'optional'
}

interface LucidPackSummary {
  id: string
  packKey: string
  name: string
  description: string
  version: string
  status: 'active' | 'deprecated' | 'archived'
  manifest: {
    resources: Array<{
      key: string
      kind: string
      name: string
      policy: string
    }>
  }
}

interface LucidPackInstallSummary {
  id: string
  orgId: string
  projectId?: string | null
  packId: string
  status: 'active' | 'paused' | 'archived'
  createdAt: string
  updatedAt: string
}

interface LucidPackManagedResourceSummary {
  id: string
  installId: string
  resourceKey: string
  resourceKind: string
  managementPolicy: string
  status: 'active' | 'drifted' | 'forked' | 'archived'
  metadata: Record<string, unknown>
  lastReconciledAt?: string | null
  forkedFromResourceId?: string | null
  forkedAt?: string | null
  forkReason?: string | null
  uninstalledAt?: string | null
  uninstallReason?: string | null
}

type LucidPackInstallAction = 'pause' | 'resume' | 'archive' | 'uninstall' | 'reconcile' | 'fork_resource'

interface AgentOpsRunDetail {
  run: AgentOpsRun
  artifacts: AgentOpsArtifact[]
  findings: AgentOpsFinding[]
  browserQaSessions: AgentOpsBrowserQaSession[]
  evalReceipts?: EvalReceiptSummary[]
  browserSessionEvents?: AgentOpsBrowserSessionEvent[]
  browserSessionShares?: AgentOpsBrowserSessionShare[]
  browserSessionSharedActions?: AgentOpsBrowserSessionSharedAction[]
  browserOperator?: BrowserOperatorConsoleSummary
  operatorProfiles?: AgentOpsOperatorProfile[]
  designFeedback?: AgentOpsDesignFeedback[]
  decisionEvents?: AgentOpsDecisionEvent[]
  links: Array<{
    id: string
    linkType: string
    refId: string | null
    refText: string | null
    label: string | null
    metadata: Record<string, unknown>
    createdAt: string
  }>
  timelineEvents: Array<{
    id: string
    eventType: string
    title: string
    body: string | null
    evidence: Record<string, unknown>
    metadata: Record<string, unknown>
    createdAt: string
  }>
  usageEvents: Array<{
    id: string
    sourceKind: string
    sourceRef: string | null
    durationMs: number | null
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    costUsd: number | null
    metadata: Record<string, unknown>
    createdAt: string
  }>
}

interface EvalReceiptSummary {
  id: string
  sourceType: string
  sourceId: string
  task: string
  outputHash: string
  dimensions: string[]
  judges: Array<{
    providerClass: string
    model: string
    ok: boolean
    scores?: Record<string, number>
    error?: string
    durationMs: number
  }>
  verdict: 'pass' | 'fail' | 'inconclusive'
  aggregate: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: string
}

interface AgentOpsBrowserSessionEvent {
  id?: string
  runId: string
  browserSessionId?: string | null
  sessionKey: string
  eventType: string
  severity: 'info' | 'warn' | 'error'
  handoffState?: string | null
  currentUrl?: string | null
  artifactId?: string | null
  screenshotUri?: string | null
  message?: string | null
  metadata: Record<string, unknown>
  createdAt?: string
}

interface AgentOpsBrowserSessionShare {
  id: string
  runId: string
  sessionKey: string
  tokenPrefix?: string | null
  scope: string
  status: 'active' | 'revoked' | 'expired'
  grantedToAssistantId?: string | null
  grantedToRuntimeId?: string | null
  grantedToAgentLabel?: string | null
  tabIdentity: string
  rateLimitPerMinute: number
  expiresAt: string
  revokedAt?: string | null
  metadata: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

interface AgentOpsBrowserSessionSharedAction {
  id?: string
  runId: string
  sessionKey: string
  shareId?: string | null
  tokenPrefix?: string | null
  scope?: string | null
  actionType: string
  status: 'allowed' | 'blocked' | 'failed'
  actorAssistantId?: string | null
  actorRuntimeId?: string | null
  actorAgentLabel?: string | null
  tabIdentity?: string | null
  currentUrl?: string | null
  artifactId?: string | null
  message?: string | null
  metadata: Record<string, unknown>
  createdAt?: string
}

interface AgentOpsOperatorProfile {
  id?: string
  profileType: string
  declared: Record<string, unknown>
  inferred: Record<string, unknown>
  confidence: Record<string, unknown>
  decayPolicy: Record<string, unknown>
  updatedAt?: string
}

interface AgentOpsDesignFeedback {
  id?: string
  runId?: string | null
  artifactId?: string | null
  variantKey: string
  feedbackType: string
  status: 'proposed' | 'approved' | 'rejected' | 'promoted'
  feedback?: string | null
  source: string
  metadata: Record<string, unknown>
  createdAt?: string
}

interface AgentOpsDecisionEvent {
  id?: string
  orgId: string
  projectId?: string | null
  runId?: string | null
  phase: 'scope' | 'plan' | 'execute' | 'review' | 'ship' | 'monitor' | 'retro'
  questionId: string
  doorType: 'one_way' | 'two_way'
  decisionMode: 'asked' | 'auto_applied' | 'silent_decision' | 'flipped'
  question: string
  options: Array<{
    id: string
    label: string
    description: string
    reversible: boolean
  }>
  selectedOption?: Record<string, unknown> | null
  riskReason?: string | null
  reversible: boolean
  flippedFromEventId?: string | null
  metadata: Record<string, unknown>
  createdByUserId?: string | null
  createdAt?: string
}

interface AgentOpsQualityGate {
  id: string
  label: string
  phase: string
  required: boolean
  destructive: boolean
  live: boolean
  evidence: string[]
  source: string
  description: string
  command: {
    command: string
    args: string[]
  }
}

interface AgentOpsQualityGateReport {
  schemaVersion: 1
  target: 'local' | 'staging' | 'production'
  summary: {
    total: number
    required: number
    live: number
    destructive: number
    byPhase: Array<{
      phase: string
      total: number
      required: number
      live: number
      destructive: number
    }>
  }
  gates: AgentOpsQualityGate[]
  evidenceContract: Record<string, string[]>
  notes: string[]
}

interface AgentOpsCompletionArea {
  id: string
  label: string
  layer: string
  status: 'implemented' | 'verified'
  sourceRefs: string[]
  testRefs: string[]
  docRefs: string[]
  qualityGateEvidence: string[]
  tenantScoped: boolean
  runtimeAgnostic: boolean
  engineAgnostic: boolean
  channelAgnostic: boolean
  notes: string
}

interface AgentOpsCompletionMatrix {
  summary: {
    version: string
    total: number
    implemented: number
    verified: number
    tenantScoped: number
    runtimeAgnostic: number
    engineAgnostic: number
    channelAgnostic: number
    missingEvidence: Array<{
      id: string
      missing: string[]
    }>
  }
  areas: AgentOpsCompletionArea[]
}

interface AgentOpsOverview {
  learnings: Array<{
    id: string
    type: string
    trustLevel: string
    status?: string
    title: string
    body?: string
    confidence?: number
    updatedAt: string
  }>
  decisionPreferences: Array<{
    id: string
    key: string
    riskLevel: string
    status: string
  }>
  evalRuns: Array<{
    id: string
    workflowId: string | null
    targetKind: string
    targetRef: string | null
    score: number | null
    passRate: number | null
    status?: string
    latencyMs?: number | null
    costUsd?: number | null
    tokenCount?: number | null
    metadata?: Record<string, unknown>
    createdAt: string
  }>
  evalReceipts?: EvalReceiptSummary[]
  securityAttempts: Array<{
    id: string
    severity: string
    status: string
    title: string
    createdAt: string
  }>
  contextSnapshots?: Array<{
    id: string
    kind: string
    title: string
    createdAt: string
  }>
  projectPolicy?: {
    safetyMode: string
    metadata?: Record<string, unknown>
  } | null
  performance?: {
    runCount: number
    completedRunCount: number
    failedRunCount: number
    measuredRunCount: number
    avgLatencyMs: number | null
    p95LatencyMs: number | null
    totalCostUsd: number
    avgCostUsd: number | null
    totalTokens: number
    avgTokens: number | null
    windowDays: number
  }
  performanceHealth?: {
    status: 'healthy' | 'watch' | 'breach' | 'insufficient_data'
    summary: string
    budget: {
      avgLatencyMs: number | null
      p95LatencyMs: number | null
      avgCostUsd: number | null
      totalCostUsd: number | null
      failureRatePct: number | null
      minRunCount: number
      minMeasuredRunCount: number
      warningRatio: number
    }
    signals: Array<{
      id: string
      label: string
      status: 'healthy' | 'watch' | 'breach' | 'insufficient_data'
      actual: number | null
      budget: number | null
      unit: 'ms' | 'usd' | 'percent'
      message: string
    }>
  }
  performanceAlert?: {
    status: 'watch' | 'breach'
    title: string
    body: string
    fingerprint: string
    actions: AgentOpsAlertAction[]
  } | null
  performanceAlertDecision?: {
    state: 'none' | 'active' | 'acknowledged' | 'resolved' | 'muted' | 'snoozed' | 'below_threshold'
    shouldRecord: boolean
    shouldNotify: boolean
    reason: string | null
    controls: {
      enabled: boolean
      minStatus: 'watch' | 'breach'
      notifyInApp: boolean
      muted: boolean
      snoozedUntil: string | null
      acknowledgedFingerprints: Record<string, { acknowledgedAt: string; acknowledgedBy: string | null }>
      resolvedFingerprints: Record<string, {
        resolvedAt: string
        resolvedBy: string | null
        resolvingRunId: string | null
        note: string | null
      }>
    }
  }
  performanceAlertHistory?: Array<{
    id: string
    title: string
    body: string | null
    status: 'watch' | 'breach' | null
    fingerprint: string | null
    lifecycleState: 'recorded' | 'acknowledged' | 'resolved'
    acknowledgedAt: string | null
    acknowledgedBy: string | null
    resolvedAt: string | null
    resolvedBy: string | null
    resolvingRunId: string | null
    resolutionNote: string | null
    actions: AgentOpsAlertAction[]
    createdAt: string
  }>
  specialistTelemetry?: Array<{
    slug: string
    name: string
    category: string
    critical: boolean
    selectedCount: number
    runCount: number
    completedRunCount: number
    failedRunCount: number
    blockedRunCount: number
    findingCount: number
    openCount: number
    acceptedCount: number
    fixedCount: number
    dismissedCount: number
    needsInfoCount: number
    usefulFindingCount: number
    falsePositiveCount: number
    criticalFindingCount: number
    highSeverityFindingCount: number
    avgConfidence: number | null
    usefulnessRate: number | null
    avgLatencyMs: number | null
    totalCostUsd: number
    totalTokens: number
    lastSeenAt: string | null
    signal: 'high_value' | 'watch' | 'needs_tuning' | 'insufficient_data'
    recommendation: string
  }>
  browserProcedures?: Array<{
    id: string
    projectId: string | null
    hostPattern: string
    name: string
    slug: string
    description: string
    intentTriggers: string[]
    procedureType: string
    scope: string
    trustState: 'draft' | 'quarantined' | 'active' | 'deprecated' | 'blocked'
    sourceRunId: string | null
    updatedAt: string
  }>
  browserHostPlaybooks?: Array<{
    id: string
    projectId: string | null
    hostPattern: string
    title: string
    bodyMd: string
    scope: string
    trustState: 'quarantined' | 'active' | 'deprecated' | 'blocked'
    successfulUses: number
    securityFlagsCount: number
    lastUsedAt: string | null
    sourceRunId: string | null
    updatedAt: string
  }>
  browserSecurityEvents?: Array<{
    id?: string
    eventType: string
    severity: 'info' | 'warn' | 'block'
    layer: string
    host: string | null
    browserSessionId: string | null
    details: Record<string, unknown>
    createdAt?: string
  }>
  browserSessionEvents?: AgentOpsBrowserSessionEvent[]
  browserSessionShares?: AgentOpsBrowserSessionShare[]
  browserSessionSharedActions?: AgentOpsBrowserSessionSharedAction[]
  browserOperator?: BrowserOperatorConsoleSummary
  operatorProfiles?: AgentOpsOperatorProfile[]
  designFeedback?: AgentOpsDesignFeedback[]
  decisionEvents?: AgentOpsDecisionEvent[]
  qualityGateReport?: AgentOpsQualityGateReport
  completionMatrix?: AgentOpsCompletionMatrix
  teamSetupDoctor?: AgentOpsTeamSetupDoctorItem[]
  summary: {
    learningCount: number
    decisionPreferenceCount: number
    latestEvalScore: number | null
    evalReceiptCount?: number
    latestEvalReceiptVerdict?: 'pass' | 'fail' | 'inconclusive' | null
    openSecurityAttemptCount: number
    contextSnapshotCount?: number
    safetyMode?: string
    runCount?: number
    avgLatencyMs?: number | null
    totalCostUsd?: number
    totalTokens?: number
    performanceHealth?: 'healthy' | 'watch' | 'breach' | 'insufficient_data'
    specialistCount?: number
    specialistUsefulFindingCount?: number
    browserProcedureCount?: number
    activeBrowserProcedureCount?: number
    browserHostPlaybookCount?: number
    activeBrowserHostPlaybookCount?: number
    browserSecurityEventCount?: number
    blockingBrowserSecurityEventCount?: number
    browserSessionEventCount?: number
    browserHandoffRequiredCount?: number
    browserSessionShareCount?: number
    activeBrowserSessionShareCount?: number
    browserSessionSharedActionCount?: number
    browserOperatorHealth?: 'ready' | 'needs_review' | 'blocked' | 'empty'
    browserOperatorActiveSessionCount?: number
    browserOperatorResumableSessionCount?: number
    operatorProfileCount?: number
    designTasteProfileCount?: number
    designFeedbackCount?: number
    approvedDesignFeedbackCount?: number
    teamSetupReadyCount?: number
    teamSetupRequiredMissingCount?: number
    qualityGateCount?: number
    requiredQualityGateCount?: number
    liveQualityGateCount?: number
    destructiveQualityGateCount?: number
    completionAreaCount?: number
    verifiedCompletionAreaCount?: number
    runtimeAgnosticCompletionAreaCount?: number
    completionMatrixGapCount?: number
    decisionEventCount?: number
    askedDecisionCount?: number
    silentDecisionCount?: number
    flippedDecisionCount?: number
    oneWayDecisionCount?: number
  }
}

interface BrowserOperatorConsoleSummary {
  schemaVersion: 1
  health: 'ready' | 'needs_review' | 'blocked' | 'empty'
  summary: {
    procedureCount: number
    activeProcedureCount: number
    quarantinedProcedureCount: number
    playbookCount: number
    activePlaybookCount: number
    sessionCount: number
    activeSessionCount: number
    handoffSessionCount: number
    resumableSessionCount: number
    blockingTrustEventCount: number
    warningTrustEventCount: number
    activeShareCount: number
  }
  procedures: Array<{
    id: string
    name: string
    hostPattern: string
    procedureType: string
    scope: string
    trustState: 'draft' | 'quarantined' | 'active' | 'deprecated' | 'blocked'
    sourceRunId: string | null
    triggerPreview: string
    updatedAt: string
  }>
  playbooks: Array<{
    id: string
    title: string
    hostPattern: string
    scope: string
    trustState: 'quarantined' | 'active' | 'deprecated' | 'blocked'
    successfulUses: number
    securityFlagsCount: number
    lastUsedAt: string | null
    updatedAt: string
  }>
  sessions: Array<{
    sessionKey: string
    runId: string
    browserSessionId: string | null
    status: 'active' | 'handoff_required' | 'resumable' | 'completed' | 'failed'
    trustState: 'protected' | 'degraded' | 'blocked'
    latestEventType: string
    latestMessage: string | null
    currentUrl: string | null
    screenshotUri: string | null
    handoffState: string | null
    eventCount: number
    shareCount: number
    activeShareCount: number
    sharedActionCount: number
    blockingTrustEventCount: number
    warningTrustEventCount: number
    updatedAt: string | null
  }>
  warnings: string[]
}

interface AgentOpsAlertAction {
  id: string
  label: string
  description: string
  workflowId: AgentOpsWorkflowId | null
  priority: 'urgent' | 'recommended' | 'optional'
}

interface PerformanceAlertFormValues {
  enabled: boolean
  minStatus: 'watch' | 'breach'
  notifyInApp: boolean
  muted: boolean
  snoozedUntil: string
}

interface PerformanceBudgetFormValues {
  avgLatencySeconds: string
  p95LatencySeconds: string
  avgCostUsd: string
  totalCostUsd: string
  failureRatePct: string
  minRunCount: string
  minMeasuredRunCount: string
  warningPct: string
}

interface AgentOpsAgentOption {
  id: string
  name: string
  projectName?: string | null
  mc_status?: string | null
  runtime?: {
    runtimeId: string | null
    runtimeName: string | null
    runtimeStatus: string | null
    runtimeProvider: string | null
  }
}

interface AgentOpsClientProps {
  orgId: string
  workspaceSlug: string
}

type FindingSeverityFilter = AgentOpsFindingSeverity | 'all'
type FindingStatusFilter = AgentOpsFindingStatus | 'all'
type ArtifactTypeFilter = AgentOpsEvidenceType | 'all'
type EvalStatusFilter = 'all' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
type BrowserProcedureTrustAction = 'promote' | 'deprecate' | 'quarantine' | 'block' | 'restore_draft'
type BrowserPlaybookTrustAction = 'promote' | 'deprecate' | 'quarantine' | 'block'
type BrowserSessionHandoffAction = 'resolve' | 'resume'
type BrowserSessionActionTarget = {
  sessionKey: string
  runId: string
  browserSessionId?: string | null
  currentUrl?: string | null
  handoffState?: string | null
}

const WORKFLOW_PRIORITY: AgentOpsWorkflowId[] = [
  'investigate',
  'autoplan',
  'review',
  'qa',
  'ship',
  'canary',
  'retro',
  'security-audit',
]

const STATUS_STYLES: Record<AgentOpsRunStatus, string> = {
  queued: 'bg-blue-500/15 text-blue-500 border-blue-500/20',
  running: 'bg-amber-500/15 text-amber-500 border-amber-500/20',
  blocked: 'bg-orange-500/15 text-orange-500 border-orange-500/20',
  completed: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
  failed: 'bg-red-500/15 text-red-500 border-red-500/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not started'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined).format(value ?? 0)
}

function formatCost(value: number | null | undefined) {
  const amount = value ?? 0
  if (amount === 0) return '$0.00'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount < 0.01 ? 6 : 2,
  }).format(amount)
}

function formatDuration(value: number | null | undefined) {
  if (value == null) return '-'
  if (value < 1_000) return `${value}ms`
  const seconds = value / 1_000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}

function parseBudgetNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function budgetNumberToInput(value: number | null | undefined, divisor = 1) {
  if (value == null) return ''
  return String(Math.round((value / divisor) * 1_000) / 1_000)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : []
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBoolean(value: unknown): boolean {
  return value === true
}

function readFindingFailureOwnership(finding: AgentOpsFinding): AgentOpsFailureOwnership | null {
  return normalizeAgentOpsFailureOwnership(
    finding.metadata.failure_ownership
      ?? finding.metadata.failureOwnership
      ?? finding.metadata.ownership,
  )
}

function readTeamOpsProjection(value: unknown): AgentOpsTeamOpsProjection | null {
  const record = readRecord(value)
  const dispatchTier = readString(record.dispatchTier)
  const dispatchReason = readString(record.dispatchReason)
  if (!dispatchTier || !dispatchReason) return null

  return {
    dispatchTier,
    dispatchReason,
    specialists: Array.isArray(record.specialists)
      ? record.specialists.map(readTeamOpsSpecialist).filter((item): item is AgentOpsTeamOpsSpecialist => Boolean(item))
      : [],
    compatibleRuntimeProfiles: readStringArray(record.compatibleRuntimeProfiles),
    partialRuntimeProfiles: readStringArray(record.partialRuntimeProfiles),
    missingRuntimeProfiles: Array.isArray(record.missingRuntimeProfiles)
      ? record.missingRuntimeProfiles.map(readMissingRuntimeProfile).filter((item): item is AgentOpsTeamOpsMissingRuntime => Boolean(item))
      : [],
    channelCompatibility: Array.isArray(record.channelCompatibility)
      ? record.channelCompatibility.map(readChannelCompatibility).filter((item): item is AgentOpsTeamOpsChannelCompatibility => Boolean(item))
      : [],
    channelLaunchStatus: readChannelLaunchStatuses(record.channelLaunchStatus),
    adaptiveDispatch: readAdaptiveDispatch(record.adaptiveDispatch),
  }
}

function readChannelLaunchStatuses(value: unknown): AgentOpsTeamOpsChannelLaunchStatus[] {
  return Object.values(readRecord(value))
    .map((item) => {
      const record = readRecord(item)
      const channelType = readString(record.channelType)
      const channelLabel = readString(record.channelLabel)
      const surfaceId = readString(record.surfaceId)
      if (!channelType || !channelLabel || !surfaceId) return null
      return {
        channelType,
        channelLabel,
        surfaceId,
        status: readString(record.status) ?? 'unknown',
        reportStatus: readString(record.reportStatus) ?? 'unknown',
        reportMode: readString(record.reportMode),
        launchedAt: readString(record.launchedAt),
      }
    })
    .filter((item): item is AgentOpsTeamOpsChannelLaunchStatus => Boolean(item))
}

function readAdaptiveDispatch(value: unknown): AgentOpsTeamOpsAdaptiveDispatch | null {
  const record = readRecord(value)
  const baseTier = readString(record.baseTier)
  const finalTier = readString(record.finalTier)
  if (!baseTier || !finalTier) return null
  return {
    enabled: readBoolean(record.enabled),
    baseTier,
    finalTier,
    policySignals: readStringArray(record.policySignals),
    telemetrySignals: readStringArray(record.telemetrySignals),
    skippedSpecialists: Array.isArray(record.skippedSpecialists)
      ? record.skippedSpecialists.map(readAdaptiveDecision).filter((item): item is AgentOpsTeamOpsAdaptiveDecision => Boolean(item))
      : [],
    protectedSpecialists: Array.isArray(record.protectedSpecialists)
      ? record.protectedSpecialists.map(readAdaptiveDecision).filter((item): item is AgentOpsTeamOpsAdaptiveDecision => Boolean(item))
      : [],
  }
}

function readAdaptiveDecision(value: unknown): AgentOpsTeamOpsAdaptiveDecision | null {
  const record = readRecord(value)
  const slug = readString(record.slug)
  const name = readString(record.name)
  const reason = readString(record.reason)
  if (!slug || !name || !reason) return null
  return { slug, name, reason }
}

function readTeamOpsSpecialist(value: unknown): AgentOpsTeamOpsSpecialist | null {
  const record = readRecord(value)
  const slug = readString(record.slug)
  const name = readString(record.name)
  if (!slug || !name) return null
  return {
    slug,
    name,
    category: readString(record.category) ?? 'specialist',
    requiredCapabilities: readStringArray(record.requiredCapabilities),
    evidenceTypes: readStringArray(record.evidenceTypes),
    critical: readBoolean(record.critical),
  }
}

function readMissingRuntimeProfile(value: unknown): AgentOpsTeamOpsMissingRuntime | null {
  const record = readRecord(value)
  const profileId = readString(record.profileId)
  if (!profileId) return null
  return {
    profileId,
    missingCapabilities: readStringArray(record.missingCapabilities),
  }
}

function readChannelCompatibility(value: unknown): AgentOpsTeamOpsChannelCompatibility | null {
  const record = readRecord(value)
  const channelId = readString(record.channelId)
  const label = readString(record.label)
  if (!channelId || !label) return null
  return {
    channelId,
    label,
    launchSupported: readBoolean(record.launchSupported),
    reportSupported: readBoolean(record.reportSupported),
    notes: readStringArray(record.notes),
  }
}

function readTeamPolicy(metadata: Record<string, unknown> | undefined): AgentOpsTeamPolicyItem[] {
  const policy = readRecord(metadata?.team_policy ?? metadata?.teamPolicy)
  const workflows = Array.isArray(policy.workflows) ? policy.workflows : [
    { workflow_id: 'review', level: 'recommended', gate_targets: ['ship', 'deploy'], freshness_hours: 168, enabled: true },
    { workflow_id: 'qa', level: 'recommended', gate_targets: ['ship', 'deploy', 'promotion'], freshness_hours: 72, enabled: true },
    { workflow_id: 'canary', level: 'optional', gate_targets: ['promotion'], freshness_hours: 24, enabled: true },
    { workflow_id: 'retro', level: 'optional', gate_targets: [], freshness_hours: null, enabled: true },
  ]
  return workflows
    .map(readTeamPolicyItem)
    .filter((item): item is AgentOpsTeamPolicyItem => Boolean(item))
}

function readTeamPolicyItem(value: unknown): AgentOpsTeamPolicyItem | null {
  const record = readRecord(value)
  const workflowId = readString(record.workflow_id ?? record.workflowId)
  const level = readString(record.level)
  if (!workflowId || (level !== 'required' && level !== 'recommended' && level !== 'optional')) return null
  const freshness = record.freshness_hours ?? record.freshnessHours
  return {
    workflowId,
    level,
    gateTargets: readStringArray(record.gate_targets ?? record.gateTargets),
    freshnessHours: typeof freshness === 'number' && Number.isFinite(freshness) ? freshness : null,
    enabled: record.enabled !== false,
  }
}

function dateTimeLocalToInput(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

function inferScopeType(workflow: AgentOpsWorkflowSummary): AgentOpsScopeType {
  const primaryFieldType = workflow.inputFields[0]?.type
  if (primaryFieldType === 'url') return 'url'
  if (primaryFieldType === 'repo') return 'repository'
  if (primaryFieldType === 'branch') return 'branch'
  if (primaryFieldType === 'pull_request') return 'pull_request'
  if (primaryFieldType === 'deploy') return 'deploy'
  return workflow.id === 'canary' ? 'deploy' : 'project'
}

function isAgentOpsScopeType(value: string | undefined): value is AgentOpsScopeType {
  return Boolean(value && (AGENT_OPS_SCOPE_TYPES as readonly string[]).includes(value))
}

function getPrimaryValue(workflow: AgentOpsWorkflowSummary, values: Record<string, string>) {
  const firstField = workflow.inputFields[0]
  if (!firstField) return ''
  return values[firstField.key]?.trim() ?? ''
}

async function ensureCsrfToken() {
  let token = getCSRFTokenFromCookie()
  if (!token) {
    await fetch('/api/auth/csrf').catch(() => {})
    token = getCSRFTokenFromCookie()
  }
  return token
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body
      ? String(body.error)
      : 'Request failed'
    throw new Error(message)
  }
  return body as T
}

async function readJsonOrNull<T>(response: Response): Promise<T | null> {
  if (response.status === 429) return null
  return readJson<T>(response)
}

async function readJsonBestEffort<T>(response: Response): Promise<T | null> {
  if (!response.ok) return null
  return readJson<T>(response)
}

export function AgentOpsClient({ orgId, workspaceSlug }: AgentOpsClientProps) {
  const searchParams = useSearchParams()
  const [workflows, setWorkflows] = useState<AgentOpsWorkflowSummary[]>([])
  const [agents, setAgents] = useState<AgentOpsAgentOption[]>([])
  const [runs, setRuns] = useState<AgentOpsRun[]>([])
  const [overview, setOverview] = useState<AgentOpsOverview | null>(null)
  const [packs, setPacks] = useState<LucidPackSummary[]>([])
  const [packInstalls, setPackInstalls] = useState<LucidPackInstallSummary[]>([])
  const [packResources, setPackResources] = useState<LucidPackManagedResourceSummary[]>([])
  const [detail, setDetail] = useState<AgentOpsRunDetail | null>(null)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<AgentOpsWorkflowId>('review')
  const [selectedAssistantId, setSelectedAssistantId] = useState<string>('')
  const [selectedRunMode, setSelectedRunMode] = useState<AgentOpsRunMode>('execute')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<AgentOpsRunStatus | 'all'>('all')
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const runCheckRef = useRef<HTMLDivElement | null>(null)
  const evidenceRef = useRef<HTMLDivElement | null>(null)
  const diagnosticsRef = useRef<HTMLDivElement | null>(null)

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? workflows[0] ?? null,
    [selectedWorkflowId, workflows],
  )

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAssistantId) ?? null,
    [agents, selectedAssistantId],
  )
  const launchParams = useMemo(() => parseAgentOpsLaunchParams(searchParams), [searchParams])

  const orderedWorkflows = useMemo(() => {
    const priority = new Map(WORKFLOW_PRIORITY.map((id, index) => [id, index]))
    return [...workflows].sort((a, b) => {
      const aRank = priority.get(a.id) ?? 99
      const bRank = priority.get(b.id) ?? 99
      if (aRank !== bRank) return aRank - bRank
      return a.name.localeCompare(b.name)
    })
  }, [workflows])

  const primaryWorkflows = useMemo(() => {
    const selected = selectedWorkflow
    const top = orderedWorkflows.slice(0, 6)
    if (!selected || top.some((workflow) => workflow.id === selected.id)) return top
    return [selected, ...top.slice(0, 5)]
  }, [orderedWorkflows, selectedWorkflow])

  const trustCenter = useMemo(
    () => buildAgentOpsTrustCenterModel({ overview, runs, workflows }),
    [overview, runs, workflows],
  )

  const scrollIntoView = useCallback((node: HTMLElement | null) => {
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleTrustAction = useCallback((action: AgentOpsTrustAction) => {
    if (action.runId) {
      setSelectedRunId(action.runId)
      scrollIntoView(evidenceRef.current)
      return
    }
    if (action.workflowId) {
      setSelectedWorkflowId(action.workflowId)
      scrollIntoView(runCheckRef.current)
      return
    }
    if (action.href) {
      window.location.href = action.href
      return
    }
    scrollIntoView(diagnosticsRef.current)
  }, [scrollIntoView])

  const loadRuns = useCallback(async () => {
    const params = new URLSearchParams({ org_id: orgId, limit: '50' })
    if (statusFilter !== 'all') params.set('status', statusFilter)
    const data = await readJsonOrNull<{ runs: AgentOpsRun[] }>(
      await fetch(`/api/agent-ops/runs?${params.toString()}`),
    )
    if (!data) {
      setNotice('Agent Ops is briefly rate limited. Keeping the current run list visible while Lucid cools down.')
      return
    }
    setRuns(data.runs ?? [])
  }, [orgId, statusFilter])

  const loadAll = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const overviewParams = new URLSearchParams({ org_id: orgId })
      if (launchParams.projectId) overviewParams.set('project_id', launchParams.projectId)
      if (launchParams.assistantId) overviewParams.set('assistant_id', launchParams.assistantId)
      const [workflowData, overviewData] = await Promise.all([
        readJson<{ workflows: AgentOpsWorkflowSummary[] }>(await fetch('/api/agent-ops/workflows')),
        readJsonBestEffort<AgentOpsOverview>(
          await fetch(`/api/agent-ops/overview?${overviewParams.toString()}`),
        ),
        readJsonOrNull<{ packs: LucidPackSummary[] }>(
          await fetch(`/api/agent-ops/packs?org_id=${orgId}&status=active&limit=24`),
        ).then((data) => {
          if (data) setPacks(data.packs ?? [])
        }),
        readJsonOrNull<{ installs: LucidPackInstallSummary[]; resources?: LucidPackManagedResourceSummary[] }>(
          await fetch(`/api/agent-ops/packs/install?org_id=${orgId}&include_resources=true&limit=24`),
        ).then((data) => {
          if (!data) return
          setPackInstalls(data.installs ?? [])
          setPackResources(data.resources ?? [])
        }),
        readJson<{ agents: AgentOpsAgentOption[] }>(
          await fetch(`/api/mission-control/agents?org_id=${orgId}`),
        ).then((data) => {
          setAgents(data.agents ?? [])
          setSelectedAssistantId((current) => {
            if (current && data.agents?.some((agent) => agent.id === current)) return current
            const preferred = data.agents?.find((agent) => agent.mc_status === 'active') ?? data.agents?.[0]
            return preferred?.id ?? ''
          })
        }),
        loadRuns(),
      ])
      setWorkflows(workflowData.workflows ?? [])
      setOverview(overviewData)
      if (workflowData.workflows?.length) {
        setSelectedWorkflowId((current) =>
          launchParams.workflowId && workflowData.workflows.some((workflow) => workflow.id === launchParams.workflowId)
            ? launchParams.workflowId as AgentOpsWorkflowId
            : workflowData.workflows.some((workflow) => workflow.id === current)
              ? current
              : workflowData.workflows[0].id,
        )
      }
      if (launchParams.assistantId) setSelectedAssistantId(launchParams.assistantId)
      if (Object.keys(launchParams.inputDefaults).length > 0) {
        setInputValues((current) => ({ ...launchParams.inputDefaults, ...current }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Agent Ops')
      setWorkflows([])
      setRuns([])
      setPacks([])
      setPackInstalls([])
      setPackResources([])
      setOverview(null)
    } finally {
      setLoading(false)
    }
  }, [launchParams, loadRuns, orgId])

  const refreshPackState = useCallback(async () => {
    const [packData, installData] = await Promise.all([
      readJson<{ packs: LucidPackSummary[] }>(
        await fetch(`/api/agent-ops/packs?org_id=${orgId}&status=active&limit=24`),
      ),
      readJson<{ installs: LucidPackInstallSummary[]; resources?: LucidPackManagedResourceSummary[] }>(
        await fetch(`/api/agent-ops/packs/install?org_id=${orgId}&include_resources=true&limit=24`),
      ),
    ])
    setPacks(packData.packs ?? [])
    setPackInstalls(installData.installs ?? [])
    setPackResources(installData.resources ?? [])
  }, [orgId])

  const loadRunDetail = useCallback(async (runId: string) => {
    setDetailLoading(true)
    try {
      const params = new URLSearchParams({ org_id: orgId })
      const data = await readJson<AgentOpsRunDetail>(
        await fetch(`/api/agent-ops/runs/${runId}?${params.toString()}`),
      )
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run detail')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [orgId])

  const installPack = useCallback(async (packId: string) => {
    setBusyAction(`pack:install:${packId}`)
    setError(null)
    setNotice(null)
    try {
      const csrf = await ensureCsrfToken()
      await readJson<{ install: LucidPackInstallSummary; resources: LucidPackManagedResourceSummary[] }>(
        await fetch(`/api/agent-ops/packs/${packId}/install`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
          },
          body: JSON.stringify({
            org_id: orgId,
            project_id: launchParams.projectId ?? null,
            config: {
              installed_from: 'mission_control_agent_ops',
            },
          }),
        }),
      )
      await refreshPackState()
      setNotice('Pack installed and managed resources reconciled.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install pack')
    } finally {
      setBusyAction(null)
    }
  }, [launchParams.projectId, orgId, refreshPackState])

  const updatePackInstall = useCallback(async (
    installId: string,
    action: LucidPackInstallAction,
    options?: { resourceKey?: string; reason?: string },
  ) => {
    setBusyAction(options?.resourceKey ? `pack:${action}:${installId}:${options.resourceKey}` : `pack:${action}:${installId}`)
    setError(null)
    setNotice(null)
    try {
      const csrf = await ensureCsrfToken()
      await readJson<unknown>(
        await fetch(`/api/agent-ops/packs/install/${installId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
          },
          body: JSON.stringify({
            org_id: orgId,
            action,
            ...(options?.resourceKey ? { resource_key: options.resourceKey } : {}),
            ...(options?.reason ? { reason: options.reason } : {}),
          }),
        }),
      )
      await refreshPackState()
      setNotice(action === 'archive' || action === 'uninstall'
        ? 'Pack uninstalled safely. Managed resources are archived and preserved for audit.'
        : action === 'reconcile'
          ? 'Pack resources reconciled.'
          : action === 'fork_resource'
            ? 'Managed resource forked for local ownership.'
            : `Pack ${action === 'pause' ? 'paused' : 'resumed'}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} pack`)
    } finally {
      setBusyAction(null)
    }
  }, [orgId, refreshPackState])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!selectedRunId && runs.length > 0) {
      setSelectedRunId(runs[0].id)
      return
    }
    if (selectedRunId && runs.length > 0 && !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs[0].id)
      return
    }
    if (runs.length === 0) {
      setSelectedRunId(null)
      setDetail(null)
    }
  }, [runs, selectedRunId])

  useEffect(() => {
    if (selectedRunId) void loadRunDetail(selectedRunId)
  }, [loadRunDetail, selectedRunId])

  async function launchWorkflow() {
    if (!selectedWorkflow) return

    const missingField = selectedWorkflow.inputFields.find((field) =>
      field.required && !inputValues[field.key]?.trim(),
    )
    if (missingField) {
      setError(`${missingField.label} is required to launch ${selectedWorkflow.name}.`)
      return
    }

    setBusyAction(`launch:${selectedWorkflow.id}`)
    setError(null)
    setNotice(null)
    try {
      const csrf = await ensureCsrfToken()
      const target = getPrimaryValue(selectedWorkflow, inputValues)
      const scopeType = isAgentOpsScopeType(launchParams.scopeType)
        ? launchParams.scopeType
        : inferScopeType(selectedWorkflow)
      const scopeRef = launchParams.scopeRef ?? target
      const scopeLabel = launchParams.scopeLabel ?? target
      const response = await fetch('/api/agent-ops/runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          assistant_id: selectedAssistantId || null,
          workflow_id: selectedWorkflow.id,
          run_mode: selectedRunMode,
          scope: {
            type: scopeType,
            ...(scopeRef ? { ref: scopeRef } : {}),
            ...(scopeLabel ? { label: scopeLabel } : {}),
            metadata: {
              source: launchParams.source ?? 'mission_control_agent_ops',
              contextual_launch: Boolean(launchParams.source),
            },
          },
          input: Object.fromEntries(
            selectedWorkflow.inputFields.map((field) => [field.key, inputValues[field.key]?.trim() ?? '']),
          ),
          metadata: {
            launched_from: 'mission_control',
            workflow_name: selectedWorkflow.name,
            execution_agent_name: selectedAgent?.name ?? null,
          },
        }),
      })
      const data = await readJson<{ run: AgentOpsRun }>(response)
      setStatusFilter('all')
      setRuns((current) => [data.run, ...current.filter((run) => run.id !== data.run.id)])
      setSelectedRunId(data.run.id)
      setDetail({ run: data.run, artifacts: [], findings: [], browserQaSessions: [], browserSessionEvents: [], browserSessionShares: [], browserSessionSharedActions: [], operatorProfiles: [], designFeedback: [], links: [], timelineEvents: [], usageEvents: [] })
      setInputValues({})
      setNotice(`${selectedWorkflow.name} started.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch workflow')
    } finally {
      setBusyAction(null)
    }
  }

  async function updateRun(run: AgentOpsRun, action: 'cancel' | 'retry') {
    setBusyAction(`${action}:${run.id}`)
    setError(null)
    setNotice(null)
    try {
      const csrf = await ensureCsrfToken()
      const response = await fetch(`/api/agent-ops/runs/${run.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          action,
          ...(action === 'cancel' ? { reason: 'Cancelled from Mission Control Agent Ops.' } : {}),
        }),
      })
      const data = await readJson<{ run: AgentOpsRun }>(response)
      setRuns((current) => current.map((item) => (item.id === data.run.id ? data.run : item)))
      setDetail((current) => current && current.run.id === data.run.id ? { ...current, run: data.run } : current)
      setNotice(action === 'retry' ? 'Retry requested.' : 'Run cancelled.')
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} run`)
    } finally {
      setBusyAction(null)
    }
  }

  async function runAgain(run: AgentOpsRun) {
    setBusyAction(`run-again:${run.id}`)
    setError(null)
    setNotice(null)
    try {
      const csrf = await ensureCsrfToken()
      const response = await fetch('/api/agent-ops/runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          project_id: run.projectId ?? null,
          assistant_id: run.assistantId ?? (selectedAssistantId || null),
          workflow_id: run.workflowId,
          run_mode: run.runMode,
          scope: run.scope,
          input: run.input,
          metadata: {
            launched_from: 'mission_control_run_again',
            source_run_id: run.id,
          },
        }),
      })
      const data = await readJson<{ run: AgentOpsRun }>(response)
      setStatusFilter('all')
      setRuns((current) => [data.run, ...current.filter((item) => item.id !== data.run.id)])
      setSelectedRunId(data.run.id)
      setDetail({ run: data.run, artifacts: [], findings: [], browserQaSessions: [], browserSessionEvents: [], browserSessionShares: [], browserSessionSharedActions: [], operatorProfiles: [], designFeedback: [], links: [], timelineEvents: [], usageEvents: [] })
      setNotice('Run again started with the same workflow, scope, and input.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run again')
    } finally {
      setBusyAction(null)
    }
  }

  async function promoteRunToRecurring(run: AgentOpsRun) {
    const assistantId = run.assistantId ?? (selectedAssistantId || null)
    if (!assistantId) {
      setError('Choose an execution agent before promoting this run to a recurring workflow.')
      return
    }

    setBusyAction(`promote-recurring:${run.id}`)
    setError(null)
    setNotice(null)
    try {
      const prompt = [
        `Run the Agent Ops ${formatLabel(run.workflowId)} workflow for this target.`,
        `Scope: ${run.scope.label ?? run.scope.ref ?? formatLabel(run.scope.type)}`,
        `Workflow input: ${JSON.stringify(run.input)}`,
        'Return the standard Agent Ops sections: Summary, Findings, Evidence, Risks, and Next actions.',
      ].join('\n')
      const response = await fetch('/api/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          assistant_id: assistantId,
          name: `Recurring ${formatLabel(run.workflowId)}`,
          description: `Promoted from Agent Ops run ${run.id}`,
          task_prompt: prompt,
          cron_expression: '0 9 * * 1-5',
          timezone: 'UTC',
          idempotency_key: `agent-ops-recurring:${run.id}`,
          source_kind: 'agent_ops',
        }),
      })
      await readJson<{ routine: { id: string } }>(response)
      setNotice('Recurring workflow created: weekdays at 09:00 UTC.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote run to recurring workflow')
    } finally {
      setBusyAction(null)
    }
  }

  async function promoteRunToBrowserProcedure(run: AgentOpsRun) {
    setBusyAction(`promote-browser-procedure:${run.id}`)
    setError(null)
    setNotice(null)
    try {
      const csrf = await ensureCsrfToken()
      const response = await fetch(`/api/agent-ops/runs/${run.id}/promote-browser-procedure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
        }),
      })
      const data = await readJson<{ procedure: { name: string; trustState?: string }; existing?: boolean }>(response)
      await loadAll()
      setNotice(data.existing
        ? `Browser Procedure already exists: ${data.procedure.name}.`
        : `Browser Procedure promoted to ${formatLabel(data.procedure.trustState ?? 'quarantined')}: ${data.procedure.name}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote Browser Procedure')
    } finally {
      setBusyAction(null)
    }
  }

  async function updateBrowserProcedureTrust(procedureId: string, action: BrowserProcedureTrustAction) {
    setBusyAction(`browser-procedure:${action}:${procedureId}`)
    setError(null)
    setNotice(null)
    try {
      const csrf = await ensureCsrfToken()
      await readJson<unknown>(
        await fetch(`/api/agent-ops/browser-procedures/${procedureId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
          },
          body: JSON.stringify({
            org_id: orgId,
            action,
            metadata: {
              source: 'mission_control_browser_operator',
            },
          }),
        }),
      )
      await loadAll()
      setNotice(`Browser procedure ${formatLabel(action)} recorded.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Browser Procedure')
    } finally {
      setBusyAction(null)
    }
  }

  async function updateBrowserHostPlaybookTrust(playbookId: string, action: BrowserPlaybookTrustAction) {
    setBusyAction(`browser-playbook:${action}:${playbookId}`)
    setError(null)
    setNotice(null)
    try {
      const csrf = await ensureCsrfToken()
      await readJson<unknown>(
        await fetch(`/api/agent-ops/browser-host-playbooks/${playbookId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
          },
          body: JSON.stringify({
            org_id: orgId,
            action,
            metadata: {
              source: 'mission_control_browser_operator',
            },
          }),
        }),
      )
      await loadAll()
      setNotice(`Host playbook ${formatLabel(action)} recorded.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update host playbook')
    } finally {
      setBusyAction(null)
    }
  }

  async function updateBrowserSessionHandoff(
    session: BrowserSessionActionTarget,
    action: BrowserSessionHandoffAction,
  ) {
    setBusyAction(`browser-handoff:${action}:${session.sessionKey}`)
    setError(null)
    setNotice(null)
    try {
      const csrf = await ensureCsrfToken()
      await readJson<unknown>(
        await fetch(`/api/agent-ops/browser-sessions/${encodeURIComponent(session.sessionKey)}/handoff`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
          },
          body: JSON.stringify({
            org_id: orgId,
            project_id: launchParams.projectId ?? null,
            run_id: session.runId,
            browser_session_id: session.browserSessionId ?? null,
            action,
            handoff_state: session.handoffState ?? null,
            current_url: session.currentUrl ?? null,
            actor_agent_label: 'Mission Control operator',
          }),
        }),
      )
      await loadAll()
      if (selectedRunId === session.runId) await loadRunDetail(session.runId)
      setNotice(action === 'resolve'
        ? 'Browser handoff marked resolved.'
        : 'Browser Operator resume requested.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update browser handoff')
    } finally {
      setBusyAction(null)
    }
  }

  async function updateLearning(learningId: string, action: 'archive' | 'promote' | 'reject') {
    setBusyAction(`learning:${action}:${learningId}`)
    setError(null)
    try {
      const csrf = await ensureCsrfToken()
      const response = await fetch('/api/agent-ops/learnings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          learning_id: learningId,
          action,
        }),
      })
      const data = await readJson<{ learning: AgentOpsOverview['learnings'][number] }>(response)
      setOverview((current) => {
        if (!current) return current
        if (action === 'archive' || action === 'reject') {
          const learnings = current.learnings.filter((learning) => learning.id !== learningId)
          return {
            ...current,
            learnings,
            summary: {
              ...current.summary,
              learningCount: Math.max(0, (current.summary.learningCount ?? current.learnings.length) - 1),
            },
          }
        }
        return {
          ...current,
          learnings: current.learnings.map((learning) =>
            learning.id === learningId ? { ...learning, ...data.learning } : learning,
          ),
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} learning`)
    } finally {
      setBusyAction(null)
    }
  }

  async function updatePerformanceBudget(values: PerformanceBudgetFormValues) {
    setBusyAction('performance-budget:update')
    setError(null)
    try {
      const csrf = await ensureCsrfToken()
      const currentMetadata = overview?.projectPolicy?.metadata ?? {}
      const response = await fetch('/api/agent-ops/project-policy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          project_id: launchParams.projectId ?? null,
          safety_mode: overview?.projectPolicy?.safetyMode ?? overview?.summary.safetyMode ?? 'normal',
          metadata: currentMetadata,
          performance_budget: {
            avg_latency_ms: parseBudgetNumber(values.avgLatencySeconds) === null ? null : Math.round(parseBudgetNumber(values.avgLatencySeconds)! * 1_000),
            p95_latency_ms: parseBudgetNumber(values.p95LatencySeconds) === null ? null : Math.round(parseBudgetNumber(values.p95LatencySeconds)! * 1_000),
            avg_cost_usd: parseBudgetNumber(values.avgCostUsd),
            total_cost_usd: parseBudgetNumber(values.totalCostUsd),
            failure_rate_pct: parseBudgetNumber(values.failureRatePct),
            min_run_count: Math.max(1, Math.round(parseBudgetNumber(values.minRunCount) ?? 3)),
            min_measured_run_count: Math.max(1, Math.round(parseBudgetNumber(values.minMeasuredRunCount) ?? 2)),
            warning_ratio: Math.min(Math.max((parseBudgetNumber(values.warningPct) ?? 80) / 100, 0.1), 1),
          },
        }),
      })
      await readJson<{ policy: unknown }>(response)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update performance budget')
    } finally {
      setBusyAction(null)
    }
  }

  async function updatePerformanceAlertControls(values: PerformanceAlertFormValues) {
    setBusyAction('performance-alerts:update')
    setError(null)
    try {
      const csrf = await ensureCsrfToken()
      const currentMetadata = overview?.projectPolicy?.metadata ?? {}
      const currentAlerts = readRecord(currentMetadata.performance_alerts)
      const response = await fetch('/api/agent-ops/project-policy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          project_id: launchParams.projectId ?? null,
          safety_mode: overview?.projectPolicy?.safetyMode ?? overview?.summary.safetyMode ?? 'normal',
          metadata: currentMetadata,
          performance_alerts: {
            ...currentAlerts,
            enabled: values.enabled,
            min_status: values.minStatus,
            notify_in_app: values.notifyInApp,
            muted: values.muted,
            snoozed_until: values.snoozedUntil ? new Date(values.snoozedUntil).toISOString() : null,
          },
        }),
      })
      await readJson<{ policy: unknown }>(response)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update performance alert controls')
    } finally {
      setBusyAction(null)
    }
  }

  async function acknowledgePerformanceAlert() {
    const fingerprint = overview?.performanceAlert?.fingerprint
    if (!fingerprint) return
    setBusyAction('performance-alerts:ack')
    setError(null)
    try {
      const csrf = await ensureCsrfToken()
      const currentMetadata = overview?.projectPolicy?.metadata ?? {}
      const currentAlerts = readRecord(currentMetadata.performance_alerts)
      const acknowledged = readRecord(currentAlerts.acknowledged_fingerprints)
      const response = await fetch('/api/agent-ops/project-policy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          project_id: launchParams.projectId ?? null,
          safety_mode: overview?.projectPolicy?.safetyMode ?? overview?.summary.safetyMode ?? 'normal',
          metadata: currentMetadata,
          performance_alerts: {
            ...currentAlerts,
            acknowledged_fingerprints: {
              ...acknowledged,
              [fingerprint]: {
                acknowledged_at: new Date().toISOString(),
                acknowledged_by: null,
              },
            },
          },
        }),
      })
      await readJson<{ policy: unknown }>(response)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge performance alert')
    } finally {
      setBusyAction(null)
    }
  }

  async function resolvePerformanceAlert(input: {
    fingerprint: string | null
    title: string
  }) {
    if (!input.fingerprint || !launchParams.projectId) return
    setBusyAction(`performance-alerts:resolve:${input.fingerprint}`)
    setError(null)
    try {
      const csrf = await ensureCsrfToken()
      const response = await fetch('/api/agent-ops/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          action: 'resolve',
          org_id: orgId,
          project_id: launchParams.projectId,
          assistant_id: launchParams.assistantId ?? null,
          fingerprint: input.fingerprint,
          title: input.title,
          note: 'Resolved from Mission Control Agent Ops.',
          resolving_ops_run_id: selectedRunId ?? null,
          safety_mode: overview?.projectPolicy?.safetyMode ?? overview?.summary.safetyMode ?? 'normal',
        }),
      })
      await readJson<{ resolution: unknown }>(response)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve performance alert')
    } finally {
      setBusyAction(null)
    }
  }

  async function flipDecisionEvent(event: AgentOpsDecisionEvent, option: AgentOpsDecisionEvent['options'][number]) {
    if (!event.id) return
    setBusyAction(`decision-flip:${event.id}:${option.id}`)
    setError(null)
    setNotice(null)
    try {
      const csrf = await ensureCsrfToken()
      await readJson<{ event: AgentOpsDecisionEvent }>(
        await fetch(`/api/agent-ops/decision-events/${event.id}/flip`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
          },
          body: JSON.stringify({
            org_id: orgId,
            selected_option: option,
            reason: `Operator flipped ${event.questionId} from Mission Control.`,
          }),
        }),
      )
      if (selectedRunId) await loadRunDetail(selectedRunId)
      await loadAll()
      setNotice(`Decision flipped to ${option.label}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to flip decision')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <CapabilityGate
      capability="advanced:agent-ops"
      fallback={
        <div className="space-y-4 p-6">
          <EmptyState
            icon={<ClipboardCheck className="h-8 w-8" />}
            title="Agent Ops unavailable"
            description="Your current plan does not include Agent Ops workflows."
          />
          <AgentOpsPackManagerPanel
            packs={packs}
            installs={packInstalls}
            resources={packResources}
            loading={loading}
            busyAction={busyAction}
            onInstall={(packId) => void installPack(packId)}
            onUpdateInstall={(installId, action) => void updatePackInstall(installId, action)}
            onForkResource={(installId, resourceKey) => void updatePackInstall(installId, 'fork_resource', {
              resourceKey,
              reason: 'Operator forked from Mission Control before local edits.',
            })}
          />
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-muted/20">
        <div className="border-b bg-background px-6 py-4">
          {loading ? (
            <div className="space-y-4">
              <div className="h-48 animate-pulse rounded-[28px] bg-muted/60" />
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="h-40 animate-pulse rounded-2xl bg-muted/60" />
                <div className="h-40 animate-pulse rounded-2xl bg-muted/60" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <AutonomyStatusHero
                model={trustCenter}
                onAction={handleTrustAction}
              />
            </div>
          )}
        </div>

        {error && (
          <div className="border-b border-red-500/20 bg-red-500/10 px-6 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        {notice && (
          <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-6 py-2 text-sm text-emerald-600">
            {notice}
          </div>
        )}

        <div ref={runCheckRef} className="grid min-h-[680px] shrink-0 scroll-mt-4 grid-cols-1 lg:grid-cols-[320px_minmax(320px,460px)_1fr]">
          <WorkflowPicker
            workflows={primaryWorkflows}
            selectedWorkflowId={selectedWorkflow?.id}
            loading={loading}
            totalCount={orderedWorkflows.length}
            onSelectWorkflow={(workflowId) => setSelectedWorkflowId(workflowId as AgentOpsWorkflowId)}
            onRefresh={() => void loadAll()}
            onOpenCatalog={() => scrollIntoView(diagnosticsRef.current)}
          />

          <section className="min-h-0 border-r bg-background">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Run check</h2>
            </div>
            <div className="space-y-5 p-4">
              {selectedWorkflow ? (
                <>
                  <div className="rounded-2xl border bg-gradient-to-br from-background to-muted/40 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold">{selectedWorkflow.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {selectedWorkflow.description}
                        </p>
                      </div>
                      <ShieldCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {selectedWorkflow.outputSections.map((section) => (
                        <Badge key={section} variant="outline">
                          {formatLabel(section)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">Execution agent</span>
                    <select
                      value={selectedAssistantId}
                      onChange={(event) => setSelectedAssistantId(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <option value="">Queue without an execution agent</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                          {agent.projectName ? ` · ${agent.projectName}` : ''}
                          {agent.runtime?.runtimeName ? ` · ${agent.runtime.runtimeName}` : ''}
                        </option>
                      ))}
                    </select>
                    {!selectedAssistantId && selectedWorkflow.executionMode === 'dag' && (
                      <span className="block rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                        This check will stay queued until an agent is assigned.
                      </span>
                    )}
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">Run mode</span>
                    <select
                      value={selectedRunMode}
                      onChange={(event) => setSelectedRunMode(event.target.value as AgentOpsRunMode)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {AGENT_OPS_RUN_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {formatLabel(mode)}
                        </option>
                      ))}
                    </select>
                    <span className="block rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      Risky actions still require compatibility checks, policy, and approvals.
                    </span>
                  </label>

                  <div className="space-y-3">
                    {selectedWorkflow.inputFields.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                        This check does not require input. It will run against the current scope.
                      </div>
                    ) : (
                      selectedWorkflow.inputFields.map((field) => (
                        <label key={field.key} className="block space-y-1.5">
                          <span className="flex items-center gap-1 text-sm font-medium">
                            {field.label}
                            {field.required && <span className="text-red-500">*</span>}
                          </span>
                          {field.description && (
                            <span className="block text-xs text-muted-foreground">{field.description}</span>
                          )}
                          {field.type === 'text' || field.type === 'json' ? (
                            <Textarea
                              value={inputValues[field.key] ?? ''}
                              onChange={(event) =>
                                setInputValues((current) => ({ ...current, [field.key]: event.target.value }))
                              }
                              placeholder={field.type === 'json' ? '{"key":"value"}' : `Enter ${field.label.toLowerCase()}`}
                            />
                          ) : (
                            <Input
                              type={field.type === 'url' ? 'url' : 'text'}
                              value={inputValues[field.key] ?? ''}
                              onChange={(event) =>
                                setInputValues((current) => ({ ...current, [field.key]: event.target.value }))
                              }
                              placeholder={`Enter ${field.label.toLowerCase()}`}
                            />
                          )}
                        </label>
                      ))
                    )}
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => void launchWorkflow()}
                    disabled={busyAction === `launch:${selectedWorkflow.id}`}
                  >
                    {busyAction === `launch:${selectedWorkflow.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Run {selectedWorkflow.name}
                  </Button>
                </>
              ) : (
                <EmptyState
                  icon={<ClipboardCheck className="h-8 w-8" />}
                  title="Choose a workflow"
                  description="Pick a check to run it from Mission Control."
                />
              )}
            </div>
          </section>

          <section ref={evidenceRef} className="grid min-h-0 scroll-mt-4 grid-cols-1 xl:grid-cols-[380px_1fr]">
            <div className="min-h-0 border-r bg-background/80">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Run history</h2>
                </div>
              </div>
              <div className="border-b px-4 py-2">
                <div className="flex flex-wrap gap-1">
                  {(['all', 'queued', 'running', 'blocked', 'completed', 'failed'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs transition-colors',
                        statusFilter === status
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )}
                    >
                      {formatLabel(status)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-h-0 overflow-y-auto">
                {loading ? (
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={index} className="h-20 animate-pulse rounded-lg bg-muted/60" />
                    ))}
                  </div>
                ) : runs.length === 0 ? (
                  <EmptyState
                    icon={<WorkflowIcon className="h-8 w-8" />}
                    title="No history yet"
                    description="Run something from the Checks section to see results here. Verifiable proof lives in Proof Receipts."
                  />
                ) : (
                  <ul className="divide-y">
                    {runs.map((run) => (
                      <li key={run.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedRunId(run.id)}
                          className={cn(
                            'w-full px-4 py-3 text-left transition-colors hover:bg-accent/40',
                            selectedRunId === run.id && 'bg-accent/60',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{formatLabel(run.workflowId)}</p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {run.scope.label ?? run.scope.ref ?? formatLabel(run.scope.type)}
                              </p>
                            </div>
                            <Badge variant="outline" className={cn('text-[10px]', STATUS_STYLES[run.status])}>
                              {formatLabel(run.status)}
                            </Badge>
                          </div>
                          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span>{formatDate(run.createdAt)}</span>
                            <span>{run.artifactCount} artifacts</span>
                            <span>{run.findingCount} findings</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <RunDetailPanel
              detail={detail}
              workflows={workflows}
              loading={detailLoading}
              busyAction={busyAction}
              onCancel={(run) => void updateRun(run, 'cancel')}
              onRetry={(run) => void updateRun(run, 'retry')}
              onRunAgain={(run) => void runAgain(run)}
              onPromoteRecurring={(run) => void promoteRunToRecurring(run)}
              onPromoteBrowserProcedure={(run) => void promoteRunToBrowserProcedure(run)}
              onFlipDecision={(event, option) => void flipDecisionEvent(event, option)}
            />
          </section>
        </div>

        <div ref={diagnosticsRef} className="shrink-0 scroll-mt-4 space-y-3 border-t bg-background px-6 py-5">
          <div>
            <p className="text-base font-semibold tracking-tight">Advanced</p>
          </div>
          <AdvancedDiagnosticsSection
            title="Diagnostics"
            defaultOpen={trustCenter.state === 'blocked'}
          >
            <TrustSignals signals={trustCenter.signals} onAction={handleTrustAction} />
            <AgentOpsPerformancePanel overview={overview} loading={loading} />
            <AgentOpsTeamSetupDoctorPanel overview={overview} loading={loading} />
            <AgentOpsQualityGatePanel overview={overview} loading={loading} />
            <AgentOpsCompletionMatrixPanel overview={overview} loading={loading} />
            <AgentOpsTeamPolicyPanel overview={overview} loading={loading} />
            <AgentOpsBudgetControls
              overview={overview}
              loading={loading}
              busy={busyAction === 'performance-budget:update'}
              scopeLabel={launchParams.projectId ? 'Project budget' : 'Workspace budget'}
              onSave={(values) => void updatePerformanceBudget(values)}
            />
            <AgentOpsAlertControls
              overview={overview}
              loading={loading}
              busy={busyAction === 'performance-alerts:update'}
              ackBusy={busyAction === 'performance-alerts:ack'}
              scopeLabel={launchParams.projectId ? 'Project alerts' : 'Workspace alerts'}
              onSave={(values) => void updatePerformanceAlertControls(values)}
              onAcknowledge={() => void acknowledgePerformanceAlert()}
              onSelectWorkflow={setSelectedWorkflowId}
              onResolve={(alert) => void resolvePerformanceAlert(alert)}
              resolveBusy={Boolean(overview?.performanceAlert?.fingerprint && busyAction === `performance-alerts:resolve:${overview.performanceAlert.fingerprint}`)}
            />
            <AgentOpsAlertHistoryPanel
              overview={overview}
              loading={loading}
              onSelectWorkflow={setSelectedWorkflowId}
              onResolve={(alert) => void resolvePerformanceAlert(alert)}
              busyAction={busyAction}
            />
          </AdvancedDiagnosticsSection>

          <AdvancedDiagnosticsSection
            title="Agent behavior"
          >
            <AgentOpsSpecialistTelemetryPanel overview={overview} loading={loading} />
            <AgentOpsDecisionPacingPanel overview={overview} loading={loading} />
            <AgentOpsDesignOpsPanel overview={overview} loading={loading} />
            <AgentOpsIntelligencePanel
              overview={overview}
              loading={loading}
              busyAction={busyAction}
              onArchiveLearning={(learningId) => void updateLearning(learningId, 'archive')}
              onPromoteLearning={(learningId) => void updateLearning(learningId, 'promote')}
              onRejectLearning={(learningId) => void updateLearning(learningId, 'reject')}
            />
          </AdvancedDiagnosticsSection>

          <AdvancedDiagnosticsSection
            title="Browser and external actions"
          >
            <AgentOpsBrowserOperatorCockpitPanel
              overview={overview}
              loading={loading}
              busyAction={busyAction}
              onProcedureTrust={(procedureId, action) => void updateBrowserProcedureTrust(procedureId, action)}
              onPlaybookTrust={(playbookId, action) => void updateBrowserHostPlaybookTrust(playbookId, action)}
              onSessionHandoff={(session, action) => void updateBrowserSessionHandoff(session, action)}
            />
            <AgentOpsBrowserTrustShieldPanel overview={overview} loading={loading} />
            <AgentOpsBrowserLiveSessionsPanel
              overview={overview}
              loading={loading}
              busyAction={busyAction}
              onSessionHandoff={(session, action) => void updateBrowserSessionHandoff(session, action)}
            />
            <AgentOpsBrowserSharingPanel overview={overview} loading={loading} />
            <AgentOpsBrowserProceduresPanel
              overview={overview}
              loading={loading}
              busyAction={busyAction}
              onTrustAction={(procedureId, action) => void updateBrowserProcedureTrust(procedureId, action)}
            />
            <AgentOpsBrowserHostPlaybooksPanel
              overview={overview}
              loading={loading}
              busyAction={busyAction}
              onTrustAction={(playbookId, action) => void updateBrowserHostPlaybookTrust(playbookId, action)}
            />
          </AdvancedDiagnosticsSection>

          <AdvancedDiagnosticsSection
            title="Check library"
          >
            <WorkflowPicker
              title="All checks"
              variant="panel"
              workflows={orderedWorkflows}
              selectedWorkflowId={selectedWorkflow?.id}
              loading={loading}
              onSelectWorkflow={(workflowId) => {
                setSelectedWorkflowId(workflowId as AgentOpsWorkflowId)
                scrollIntoView(runCheckRef.current)
              }}
            />
            <AgentOpsAdvancedConfigurationPanel workspaceSlug={workspaceSlug} />
            <AgentOpsPackManagerPanel
              packs={packs}
              installs={packInstalls}
              resources={packResources}
              loading={loading}
              busyAction={busyAction}
              onInstall={(packId) => void installPack(packId)}
              onUpdateInstall={(installId, action) => void updatePackInstall(installId, action)}
              onForkResource={(installId, resourceKey) => void updatePackInstall(installId, 'fork_resource', {
                resourceKey,
                reason: 'Operator forked from Mission Control before local edits.',
              })}
            />
          </AdvancedDiagnosticsSection>
        </div>
      </div>
    </CapabilityGate>
  )
}

function AgentOpsPerformancePanel({
  overview,
  loading,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
}) {
  if (loading) return null
  const performance = overview?.performance
  if (!performance || performance.runCount === 0) return null
  const health = overview?.performanceHealth
  const completionRate = performance.runCount > 0
    ? Math.round((performance.completedRunCount / performance.runCount) * 100)
    : 0
  const notableSignals = health?.signals.filter((signal) => signal.status === 'breach' || signal.status === 'watch').slice(0, 3) ?? []

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Performance window</h3>
          <p className="text-xs text-muted-foreground">
            {health?.summary ?? `Last ${performance.windowDays} days across the selected Agent Ops scope.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {health && (
            <Badge variant={health.status === 'breach' ? 'destructive' : health.status === 'watch' ? 'secondary' : 'outline'}>
              {formatLabel(health.status)}
            </Badge>
          )}
          <Badge variant="outline">{formatNumber(performance.runCount)} runs</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <PerformanceStat
          label="Avg latency"
          value={formatDuration(performance.avgLatencyMs)}
          detail={`p95 ${formatDuration(performance.p95LatencyMs)}`}
        />
        <PerformanceStat
          label="Cost"
          value={formatCost(performance.totalCostUsd)}
          detail={`${formatCost(performance.avgCostUsd)} avg / run`}
        />
        <PerformanceStat
          label="Tokens"
          value={formatNumber(performance.totalTokens)}
          detail={`${formatNumber(performance.avgTokens)} avg / run`}
        />
        <PerformanceStat
          label="Completion"
          value={`${completionRate}%`}
          detail={`${formatNumber(performance.completedRunCount)} completed`}
        />
        <PerformanceStat
          label="Attention"
          value={formatNumber(performance.failedRunCount)}
          detail={`${formatNumber(performance.measuredRunCount)} measured`}
          tone={performance.failedRunCount > 0 ? 'warning' : 'default'}
        />
      </div>
      {notableSignals.length > 0 && (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {notableSignals.map((signal) => (
            <div
              key={signal.id}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs',
                signal.status === 'breach'
                  ? 'border-red-500/30 bg-red-500/5 text-red-600'
                  : 'border-amber-500/30 bg-amber-500/5 text-amber-700',
              )}
            >
              <p className="font-medium">{signal.label}</p>
              <p className="mt-1 text-muted-foreground">{signal.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PerformanceStat({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string
  value: string
  detail: string
  tone?: 'default' | 'warning'
}) {
  return (
    <div className={cn(
      'rounded-lg border bg-background/70 p-3',
      tone === 'warning' && 'border-amber-500/30 bg-amber-500/5',
    )}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function AgentOpsSpecialistTelemetryPanel({
  overview,
  loading,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
}) {
  if (loading) return null
  const telemetry = overview?.specialistTelemetry ?? []
  if (telemetry.length === 0) return null

  const usefulFindings = overview?.summary.specialistUsefulFindingCount
    ?? telemetry.reduce((sum, specialist) => sum + specialist.usefulFindingCount, 0)
  const highValueCount = telemetry.filter((specialist) => specialist.signal === 'high_value').length
  const tuningCount = telemetry.filter((specialist) => specialist.signal === 'needs_tuning').length

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Specialist telemetry</h3>
          <p className="text-xs text-muted-foreground">
            Outcomes from Team Ops dispatch, findings, latency, cost, and operator decisions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{formatNumber(overview?.summary.specialistCount ?? telemetry.length)} specialists</Badge>
          <Badge variant="outline">{formatNumber(usefulFindings)} useful findings</Badge>
          {highValueCount > 0 && <Badge variant="secondary">{formatNumber(highValueCount)} high value</Badge>}
          {tuningCount > 0 && <Badge variant="outline" className="border-amber-500/40 text-amber-600">{formatNumber(tuningCount)} tune</Badge>}
        </div>
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        {telemetry.slice(0, 6).map((specialist) => (
          <div
            key={specialist.slug}
            className={cn(
              'rounded-lg border bg-background/70 p-3',
              specialist.signal === 'needs_tuning' && 'border-amber-500/30 bg-amber-500/5',
              specialist.signal === 'high_value' && 'border-emerald-500/30 bg-emerald-500/5',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{specialist.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatLabel(specialist.category)} · selected {formatNumber(specialist.selectedCount)}x
                </p>
              </div>
              <Badge
                variant={specialist.signal === 'high_value' ? 'secondary' : 'outline'}
                className={cn(
                  'shrink-0 text-[10px]',
                  specialist.signal === 'needs_tuning' && 'border-amber-500/40 text-amber-600',
                )}
              >
                {formatLabel(specialist.signal)}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <SpecialistTelemetryStat label="Findings" value={formatNumber(specialist.findingCount)} />
              <SpecialistTelemetryStat label="Useful" value={formatNumber(specialist.usefulFindingCount)} />
              <SpecialistTelemetryStat label="Usefulness" value={specialist.usefulnessRate == null ? '-' : `${specialist.usefulnessRate}%`} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>Open {formatNumber(specialist.openCount)}</span>
              <span>Dismissed {formatNumber(specialist.dismissedCount)}</span>
              <span>Latency {formatDuration(specialist.avgLatencyMs)}</span>
              <span>Cost {formatCost(specialist.totalCostUsd)}</span>
              {specialist.lastSeenAt && <span>{formatDate(specialist.lastSeenAt)}</span>}
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{specialist.recommendation}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SpecialistTelemetryStat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function AgentOpsTeamSetupDoctorPanel({
  overview,
  loading,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
}) {
  if (loading) return null
  const items = overview?.teamSetupDoctor ?? []
  if (items.length === 0) return null

  const readyCount = items.filter((item) => item.status === 'ready').length
  const requiredMissingCount = items.filter((item) => item.required && item.status === 'missing').length
  const statusCopy = requiredMissingCount > 0
    ? `${formatNumber(requiredMissingCount)} required setup item${requiredMissingCount === 1 ? '' : 's'} missing`
    : 'Team setup is ready'

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Team setup doctor</h3>
          <p className="text-xs text-muted-foreground">
            Readiness checklist for runtimes, capabilities, workflow packs, approvals, memory, evals, and channels.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={requiredMissingCount > 0 ? 'destructive' : 'secondary'}>{statusCopy}</Badge>
          <Badge variant="outline">{formatNumber(readyCount)}/{formatNumber(items.length)} ready</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'rounded-lg border bg-background/70 p-3',
              item.status === 'ready' && 'border-emerald-500/30 bg-emerald-500/5',
              item.status === 'missing' && item.required && 'border-amber-500/30 bg-amber-500/5',
              item.status === 'optional' && 'border-dashed',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{formatLabel(item.category)}</p>
              </div>
              <Badge
                variant={item.status === 'ready' ? 'secondary' : 'outline'}
                className={cn(
                  'shrink-0 text-[10px]',
                  item.status === 'ready' && 'border-emerald-500/40 text-emerald-700',
                  item.status === 'missing' && item.required && 'border-amber-500/40 text-amber-700',
                )}
              >
                {formatLabel(item.status)}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentOpsAdvancedConfigurationPanel({ workspaceSlug }: { workspaceSlug: string }) {
  const items = [
    {
      title: 'Workflow templates',
      description: 'Edit reusable check definitions used by Agent Ops.',
      href: `/${workspaceSlug}/mission-control/dags/templates`,
      label: 'Open templates',
    },
    {
      title: 'Experiments',
      description: 'Compare agent variants, prompts, models, or tools before promoting changes.',
      href: `/${workspaceSlug}/mission-control/experiments`,
      label: 'Open experiments',
    },
  ]

  return (
    <section className="mt-4 rounded-xl border bg-card/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Advanced configuration</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Builder surfaces for workflow assets that support Agent Ops, kept here instead of top-level navigation.
          </p>
        </div>
        <Badge variant="outline">Advanced</Badge>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="group rounded-lg border bg-background/70 p-3 transition-colors hover:border-border hover:bg-accent/30"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
            <p className="mt-3 text-xs font-medium text-foreground">{item.label}</p>
          </a>
        ))}
      </div>
    </section>
  )
}

function AgentOpsQualityGatePanel({
  overview,
  loading,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
}) {
  if (loading) return null
  const report = overview?.qualityGateReport
  if (!report) return null

  const riskyCount = report.summary.live + report.summary.destructive
  const gatePreview = report.gates.slice(0, 6)

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Quality gate pack</h3>
          <p className="text-xs text-muted-foreground">
            CI and operator readiness contract for source hygiene, generated docs, release quality, evals, and stress/latency.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={riskyCount > 0 ? 'destructive' : 'secondary'}>
            {riskyCount > 0 ? `${formatNumber(riskyCount)} live/destructive` : 'Read-only'}
          </Badge>
          <Badge variant="outline">{formatNumber(report.summary.required)}/{formatNumber(report.summary.total)} required</Badge>
          <Badge variant="outline">{formatLabel(report.target)}</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {report.summary.byPhase.map((phase) => (
          <div key={phase.phase} className="rounded-lg border bg-background/70 p-3">
            <p className="line-clamp-1 text-sm font-medium">{formatLabel(phase.phase)}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{formatNumber(phase.total)}</p>
            <p className="text-xs text-muted-foreground">
              {formatNumber(phase.required)} required
              {phase.live > 0 ? ` · ${formatNumber(phase.live)} live` : ''}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {gatePreview.map((gate) => (
          <div key={gate.id} className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{gate.label}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{formatLabel(gate.phase)}</p>
              </div>
              <Badge variant={gate.live || gate.destructive ? 'destructive' : 'outline'} className="shrink-0 text-[10px]">
                {gate.live ? 'Live' : gate.destructive ? 'Destructive' : 'Safe'}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{gate.description}</p>
            <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
              {[gate.command.command, ...gate.command.args].join(' ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentOpsPackManagerPanel({
  packs,
  installs,
  resources,
  loading,
  busyAction,
  onInstall,
  onUpdateInstall,
  onForkResource,
}: {
  packs: LucidPackSummary[]
  installs: LucidPackInstallSummary[]
  resources: LucidPackManagedResourceSummary[]
  loading: boolean
  busyAction: string | null
  onInstall: (packId: string) => void
  onUpdateInstall: (installId: string, action: LucidPackInstallAction) => void
  onForkResource: (installId: string, resourceKey: string) => void
}) {
  if (loading) return null
  const activeInstalls = installs.filter((install) => install.status !== 'archived')
  const installedPackIds = new Set(activeInstalls.map((install) => install.packId))
  const installablePacks = packs.filter((pack) => !installedPackIds.has(pack.id)).slice(0, 4)
  const driftedCount = resources.filter((resource) => resource.status === 'drifted' || resource.status === 'forked').length
  const activeResourceCount = resources.filter((resource) => resource.status === 'active').length

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <PackageCheck className="h-4 w-4" />
            Managed packs
          </h3>
          <p className="text-xs text-muted-foreground">
            Install/package UX for agents, teams, workflows, Knowledge sources, browser procedures, host playbooks, skills, docs, policies, and channel commands.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={driftedCount > 0 ? 'destructive' : 'secondary'}>
            {driftedCount > 0 ? `${formatNumber(driftedCount)} drift/fork` : 'No drift'}
          </Badge>
          <Badge variant="outline">{formatNumber(activeInstalls.length)} installed</Badge>
          <Badge variant="outline">{formatNumber(activeResourceCount)} active resources</Badge>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border bg-background/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Installed packs</p>
              <p className="text-xs text-muted-foreground">Reconcile updates managed resources; archive never deletes run history or evidence.</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {activeInstalls.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                No packs installed yet. Install a pack to create a governed resource ledger.
              </p>
            ) : activeInstalls.slice(0, 5).map((install) => {
              const pack = packs.find((candidate) => candidate.id === install.packId)
              const installResources = resources.filter((resource) => resource.installId === install.id)
              const reviewResources = installResources.filter((resource) => resource.status === 'drifted' || resource.status === 'forked')
              const needsReview = reviewResources.length > 0
              return (
                <div key={install.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={needsReview ? 'destructive' : 'outline'}>{formatLabel(install.status)}</Badge>
                        {needsReview ? <Badge variant="outline">review drift</Badge> : null}
                      </div>
                      <p className="mt-2 text-sm font-medium">{pack?.name ?? install.packId}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatNumber(installResources.length)} managed resource{installResources.length === 1 ? '' : 's'} · {formatDate(install.updatedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={busyAction === `pack:reconcile:${install.id}`}
                        onClick={() => onUpdateInstall(install.id, 'reconcile')}
                      >
                        {busyAction === `pack:reconcile:${install.id}` ? <Loader2 className="animate-spin" /> : null}
                        Reconcile
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={busyAction === `pack:${install.status === 'paused' ? 'resume' : 'pause'}:${install.id}`}
                        onClick={() => onUpdateInstall(install.id, install.status === 'paused' ? 'resume' : 'pause')}
                      >
                        {install.status === 'paused' ? 'Resume' : 'Pause'}
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={busyAction === `pack:uninstall:${install.id}`}
                        onClick={() => onUpdateInstall(install.id, 'uninstall')}
                      >
                        Uninstall
                      </Button>
                    </div>
                  </div>
                  {installResources.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {installResources.slice(0, 6).map((resource) => (
                        <Badge
                          key={resource.id}
                          variant={resource.status === 'active' ? 'secondary' : 'outline'}
                          className={cn((resource.status === 'drifted' || resource.status === 'forked') && 'border-amber-500/40 text-amber-700')}
                        >
                          {formatLabel(resource.resourceKind)} · {formatLabel(resource.status)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {reviewResources.length > 0 ? (
                    <div className="mt-3 space-y-1.5 rounded-md border border-amber-500/30 bg-amber-50/50 p-2">
                      {reviewResources.slice(0, 3).map((resource) => {
                        const reason = readString(resource.metadata.reconcile_reason)
                          ?? readString(resource.metadata.reason)
                          ?? 'This resource differs from the pack manifest and needs operator review.'
                        const desiredHash = readString(resource.metadata.desired_spec_hash)
                        const previousHash = readString(resource.metadata.previous_spec_hash)
                        return (
                          <div key={`${resource.id}-review`} className="text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-amber-900">
                                {resource.resourceKey} · {formatLabel(resource.status)}
                              </p>
                              {resource.status === 'drifted' ? (
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="outline"
                                  disabled={busyAction === `pack:fork_resource:${install.id}:${resource.resourceKey}`}
                                  onClick={() => onForkResource(install.id, resource.resourceKey)}
                                >
                                  {busyAction === `pack:fork_resource:${install.id}:${resource.resourceKey}` ? <Loader2 className="animate-spin" /> : null}
                                  Fork
                                </Button>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-amber-800">{reason}</p>
                            {(desiredHash || previousHash) ? (
                              <p className="mt-0.5 font-mono text-[10px] text-amber-700">
                                {previousHash ? `current ${previousHash.slice(0, 10)}` : 'current n/a'}
                                {' -> '}
                                {desiredHash ? `pack ${desiredHash.slice(0, 10)}` : 'pack removed'}
                              </p>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-lg border bg-background/70 p-3">
          <p className="text-sm font-medium">Available packs</p>
          <p className="text-xs text-muted-foreground">
            Packs are setup bundles. Runtime truth still lives in Agent Ops, Mission Control, Knowledge, and channels.
          </p>
          <div className="mt-3 space-y-2">
            {installablePacks.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                No additional active packs are available for this workspace.
              </p>
            ) : installablePacks.map((pack) => (
              <div key={pack.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">v{pack.version}</Badge>
                      <Badge variant="outline">{formatNumber(pack.manifest.resources.length)} resources</Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium">{pack.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{pack.description}</p>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    disabled={busyAction === `pack:install:${pack.id}`}
                    onClick={() => onInstall(pack.id)}
                  >
                    {busyAction === `pack:install:${pack.id}` ? <Loader2 className="animate-spin" /> : null}
                    Install
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AgentOpsCompletionMatrixPanel({
  overview,
  loading,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
}) {
  if (loading) return null
  const matrix = overview?.completionMatrix
  if (!matrix) return null

  const layerSummaries = Array.from(
    matrix.areas.reduce((map, area) => {
      const current = map.get(area.layer) ?? { layer: area.layer, total: 0, verified: 0 }
      current.total += 1
      if (area.status === 'verified') current.verified += 1
      map.set(area.layer, current)
      return map
    }, new Map<string, { layer: string; total: number; verified: number }>()),
  ).map(([, value]) => value)
  const missingCount = matrix.summary.missingEvidence.length
  const areaPreview = matrix.areas.slice(0, 6)

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Agent Ops completion matrix</h3>
          <p className="text-xs text-muted-foreground">
            Code-owned closure ledger for shipped Agent Ops capabilities, source refs, tests, docs, and architecture-neutral evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={missingCount > 0 ? 'destructive' : 'secondary'}>
            {missingCount > 0 ? `${formatNumber(missingCount)} evidence gaps` : 'No evidence gaps'}
          </Badge>
          <Badge variant="outline">{formatNumber(matrix.summary.verified)}/{formatNumber(matrix.summary.total)} verified</Badge>
          <Badge variant="outline">{formatNumber(matrix.summary.runtimeAgnostic)} runtime-neutral</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {layerSummaries.map((layer) => (
          <div key={layer.layer} className="rounded-lg border bg-background/70 p-3">
            <p className="line-clamp-1 text-sm font-medium">{formatLabel(layer.layer)}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{formatNumber(layer.verified)}</p>
            <p className="text-xs text-muted-foreground">{formatNumber(layer.total)} shipped area{layer.total === 1 ? '' : 's'}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {areaPreview.map((area) => (
          <div key={area.id} className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{area.label}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{formatLabel(area.layer)}</p>
              </div>
              <Badge variant={area.status === 'verified' ? 'secondary' : 'outline'} className="shrink-0 text-[10px]">
                {formatLabel(area.status)}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{area.notes}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">{formatNumber(area.sourceRefs.length)} source</Badge>
              <Badge variant="outline" className="text-[10px]">{formatNumber(area.testRefs.length)} tests</Badge>
              <Badge variant="outline" className="text-[10px]">{formatNumber(area.qualityGateEvidence.length)} evidence</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentOpsTeamPolicyPanel({
  overview,
  loading,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
}) {
  if (loading) return null
  const items = readTeamPolicy(overview?.projectPolicy?.metadata)
  if (items.length === 0) return null

  const requiredCount = items.filter((item) => item.enabled && item.level === 'required').length
  const gatedCount = items.filter((item) => item.enabled && item.gateTargets.length > 0).length

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Team policy gates</h3>
          <p className="text-xs text-muted-foreground">
            Required workflows can block ship, deploy, or promotion until fresh evidence exists.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={requiredCount > 0 ? 'secondary' : 'outline'}>{formatNumber(requiredCount)} required</Badge>
          <Badge variant="outline">{formatNumber(gatedCount)} gated</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div
            key={`${item.workflowId}:${item.level}:${item.gateTargets.join(',')}`}
            className={cn(
              'rounded-lg border bg-background/70 p-3',
              item.level === 'required' && item.enabled && 'border-amber-500/30 bg-amber-500/5',
              !item.enabled && 'opacity-60',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{formatLabel(item.workflowId)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.gateTargets.length > 0
                    ? `Gates ${item.gateTargets.map(formatLabel).join(', ')}`
                    : 'Readiness signal only'}
                </p>
              </div>
              <Badge
                variant={item.level === 'required' ? 'secondary' : 'outline'}
                className={cn('shrink-0 text-[10px]', item.level === 'required' && 'border-amber-500/40 text-amber-700')}
              >
                {formatLabel(item.level)}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {item.freshnessHours ? `Fresh for ${item.freshnessHours}h` : 'No freshness window'}
              {!item.enabled && ' · disabled'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentOpsBudgetControls({
  overview,
  loading,
  busy,
  scopeLabel,
  onSave,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
  busy: boolean
  scopeLabel: string
  onSave: (values: PerformanceBudgetFormValues) => void
}) {
  const budget = overview?.performanceHealth?.budget
  const [values, setValues] = useState<PerformanceBudgetFormValues>(() => ({
    avgLatencySeconds: '',
    p95LatencySeconds: '',
    avgCostUsd: '',
    totalCostUsd: '',
    failureRatePct: '',
    minRunCount: '3',
    minMeasuredRunCount: '2',
    warningPct: '80',
  }))

  useEffect(() => {
    if (!budget) return
    setValues({
      avgLatencySeconds: budgetNumberToInput(budget.avgLatencyMs, 1_000),
      p95LatencySeconds: budgetNumberToInput(budget.p95LatencyMs, 1_000),
      avgCostUsd: budgetNumberToInput(budget.avgCostUsd),
      totalCostUsd: budgetNumberToInput(budget.totalCostUsd),
      failureRatePct: budgetNumberToInput(budget.failureRatePct),
      minRunCount: String(budget.minRunCount),
      minMeasuredRunCount: String(budget.minMeasuredRunCount),
      warningPct: budgetNumberToInput(budget.warningRatio * 100),
    })
  }, [budget])

  if (loading || !overview?.performanceHealth) return null

  function updateField(field: keyof PerformanceBudgetFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Performance budgets</h3>
          <p className="text-xs text-muted-foreground">
            {scopeLabel}. Empty latency, cost, or failure fields disable that specific budget.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onSave(values)}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Save budgets
        </Button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BudgetInput
          label="Avg latency"
          suffix="seconds"
          value={values.avgLatencySeconds}
          onChange={(value) => updateField('avgLatencySeconds', value)}
        />
        <BudgetInput
          label="p95 latency"
          suffix="seconds"
          value={values.p95LatencySeconds}
          onChange={(value) => updateField('p95LatencySeconds', value)}
        />
        <BudgetInput
          label="Failure rate"
          suffix="%"
          value={values.failureRatePct}
          onChange={(value) => updateField('failureRatePct', value)}
        />
        <BudgetInput
          label="Avg cost"
          suffix="USD"
          value={values.avgCostUsd}
          onChange={(value) => updateField('avgCostUsd', value)}
        />
        <BudgetInput
          label="Total cost"
          suffix="USD / window"
          value={values.totalCostUsd}
          onChange={(value) => updateField('totalCostUsd', value)}
        />
        <BudgetInput
          label="Min runs"
          suffix="runs"
          value={values.minRunCount}
          onChange={(value) => updateField('minRunCount', value)}
        />
        <BudgetInput
          label="Min measured"
          suffix="runs"
          value={values.minMeasuredRunCount}
          onChange={(value) => updateField('minMeasuredRunCount', value)}
        />
        <BudgetInput
          label="Watch threshold"
          suffix="% of budget"
          value={values.warningPct}
          onChange={(value) => updateField('warningPct', value)}
        />
      </div>
    </div>
  )
}

function BudgetInput({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string
  suffix: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <Input
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8"
        />
        <span className="w-20 shrink-0 text-xs text-muted-foreground">{suffix}</span>
      </div>
    </label>
  )
}

function AgentOpsAlertControls({
  overview,
  loading,
  busy,
  ackBusy,
  scopeLabel,
  onSave,
  onAcknowledge,
  onSelectWorkflow,
  onResolve,
  resolveBusy,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
  busy: boolean
  ackBusy: boolean
  scopeLabel: string
  onSave: (values: PerformanceAlertFormValues) => void
  onAcknowledge: () => void
  onSelectWorkflow: (workflowId: AgentOpsWorkflowId) => void
  onResolve: (alert: { fingerprint: string | null; title: string }) => void
  resolveBusy: boolean
}) {
  const controls = overview?.performanceAlertDecision?.controls
  const decision = overview?.performanceAlertDecision
  const alert = overview?.performanceAlert
  const [values, setValues] = useState<PerformanceAlertFormValues>(() => ({
    enabled: true,
    minStatus: 'watch',
    notifyInApp: true,
    muted: false,
    snoozedUntil: '',
  }))

  useEffect(() => {
    if (!controls) return
    setValues({
      enabled: controls.enabled,
      minStatus: controls.minStatus,
      notifyInApp: controls.notifyInApp,
      muted: controls.muted,
      snoozedUntil: dateTimeLocalToInput(controls.snoozedUntil),
    })
  }, [controls])

  if (loading || !overview?.performanceHealth || !controls || !decision) return null

  const hasCurrentAlert = Boolean(alert)
  const acknowledged = decision.state === 'acknowledged'
  const resolved = decision.state === 'resolved'
  const stateTone = decision.state === 'active'
    ? alert?.status === 'breach' ? 'destructive' : 'secondary'
    : decision.state === 'muted' || decision.state === 'snoozed' || decision.state === 'acknowledged' || decision.state === 'resolved'
      ? 'outline'
      : 'secondary'

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Alert controls</h3>
          <p className="text-xs text-muted-foreground">
            {scopeLabel}. Timeline alerts stay the source of truth; notifications follow these controls.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={stateTone}>{formatLabel(decision.state)}</Badge>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onSave(values)}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Save alerts
          </Button>
          {hasCurrentAlert && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAcknowledge}
              disabled={ackBusy || acknowledged || resolved}
            >
              {ackBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {acknowledged ? 'Acknowledged' : 'Acknowledge'}
            </Button>
          )}
          {hasCurrentAlert && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onResolve({ fingerprint: alert?.fingerprint ?? null, title: alert?.title ?? 'Agent Ops performance alert' })}
              disabled={resolveBusy || resolved || !alert?.fingerprint}
            >
              {resolveBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {resolved ? 'Resolved' : 'Resolve'}
            </Button>
          )}
        </div>
      </div>

      {alert && (
        <div className={cn(
          'mt-3 rounded-lg border px-3 py-2 text-xs',
          alert.status === 'breach'
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-amber-500/30 bg-amber-500/5',
        )}>
          <p className="font-medium">{alert.title}</p>
          <p className="mt-1 text-muted-foreground">{decision.reason ?? alert.body}</p>
          {!resolved && <AlertActionList actions={alert.actions} onSelectWorkflow={onSelectWorkflow} />}
        </div>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <ToggleControl
          label="Alerts enabled"
          description="Allow budget alerts for this scope."
          checked={values.enabled}
          onChange={(checked) => setValues((current) => ({ ...current, enabled: checked }))}
        />
        <ToggleControl
          label="Inbox fanout"
          description="Send new alerts to org members."
          checked={values.notifyInApp}
          onChange={(checked) => setValues((current) => ({ ...current, notifyInApp: checked }))}
        />
        <ToggleControl
          label="Muted"
          description="Suppress recording and fanout."
          checked={values.muted}
          onChange={(checked) => setValues((current) => ({ ...current, muted: checked }))}
        />
        <div className="rounded-lg border bg-background/70 p-3">
          <label className="text-xs font-medium">Minimum status</label>
          <select
            className="mt-2 h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={values.minStatus}
            onChange={(event) => setValues((current) => ({ ...current, minStatus: event.target.value as 'watch' | 'breach' }))}
          >
            <option value="watch">Watch and breach</option>
            <option value="breach">Breach only</option>
          </select>
        </div>
        <div className="rounded-lg border bg-background/70 p-3">
          <label className="text-xs font-medium">Snoozed until</label>
          <Input
            className="mt-2"
            type="datetime-local"
            value={values.snoozedUntil}
            onChange={(event) => setValues((current) => ({ ...current, snoozedUntil: event.target.value }))}
          />
        </div>
      </div>
    </div>
  )
}

function AgentOpsAlertHistoryPanel({
  overview,
  loading,
  onSelectWorkflow,
  onResolve,
  busyAction,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
  onSelectWorkflow: (workflowId: AgentOpsWorkflowId) => void
  onResolve: (alert: { fingerprint: string | null; title: string }) => void
  busyAction: string | null
}) {
  if (loading) return null
  const history = overview?.performanceAlertHistory ?? []
  if (!overview?.performanceHealth && history.length === 0) return null

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Alert center</h3>
          <p className="text-xs text-muted-foreground">
            Recent Agent Ops performance alerts from the project timeline.
          </p>
        </div>
        <Badge variant="outline">{history.length} recent</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {history.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            No timeline alerts recorded yet. New budget watch or breach events will appear here once they pass alert policy.
          </p>
        ) : (
          history.map((alert) => (
            <div key={alert.id} className="rounded-lg border bg-background/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-medium">{alert.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {alert.body ?? alert.fingerprint ?? 'Agent Ops performance alert'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {alert.status && (
                    <Badge variant={alert.status === 'breach' ? 'destructive' : 'secondary'}>
                      {formatLabel(alert.status)}
                    </Badge>
                  )}
                  <Badge variant={alert.lifecycleState === 'resolved' || alert.lifecycleState === 'acknowledged' ? 'outline' : 'secondary'}>
                    {formatLabel(alert.lifecycleState)}
                  </Badge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{formatDate(alert.createdAt)}</span>
                {alert.acknowledgedAt && <span>Ack {formatDate(alert.acknowledgedAt)}</span>}
                {alert.resolvedAt && <span>Resolved {formatDate(alert.resolvedAt)}</span>}
                {alert.resolutionNote && <span>{alert.resolutionNote}</span>}
                {alert.fingerprint && <span className="max-w-full truncate font-mono">{alert.fingerprint}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {alert.lifecycleState !== 'resolved' && alert.fingerprint && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onResolve({ fingerprint: alert.fingerprint, title: alert.title })}
                    disabled={busyAction === `performance-alerts:resolve:${alert.fingerprint}`}
                  >
                    {busyAction === `performance-alerts:resolve:${alert.fingerprint}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    Resolve
                  </Button>
                )}
                <AlertActionList actions={alert.actions} onSelectWorkflow={onSelectWorkflow} compact />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function AlertActionList({
  actions,
  onSelectWorkflow,
  compact = false,
}: {
  actions: AgentOpsAlertAction[]
  onSelectWorkflow: (workflowId: AgentOpsWorkflowId) => void
  compact?: boolean
}) {
  if (actions.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-2', !compact && 'mt-3')}>
      {actions.slice(0, 4).map((action) => (
        <Button
          key={action.id}
          type="button"
          size="sm"
          variant={action.priority === 'urgent' ? 'destructive' : action.priority === 'recommended' ? 'secondary' : 'outline'}
          onClick={() => {
            if (action.workflowId) onSelectWorkflow(action.workflowId)
          }}
          disabled={!action.workflowId}
          title={action.description}
        >
          {action.workflowId ? <Play className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {action.label}
        </Button>
      ))}
    </div>
  )
}

function ToggleControl({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background/70 p-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-xs font-medium">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}

function AgentOpsIntelligencePanel({
  overview,
  loading,
  busyAction,
  onArchiveLearning,
  onPromoteLearning,
  onRejectLearning,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
  busyAction: string | null
  onArchiveLearning: (learningId: string) => void
  onPromoteLearning: (learningId: string) => void
  onRejectLearning: (learningId: string) => void
}) {
  const [evalStatusFilter, setEvalStatusFilter] = useState<EvalStatusFilter>('all')

  if (loading) return null
  const learnings = overview?.learnings.slice(0, 3) ?? []
  const evalRuns = overview?.evalRuns ?? []
  const evalReceipts = overview?.evalReceipts ?? []
  const visibleEvalRuns = evalRuns
    .filter((run) => evalStatusFilter === 'all' || run.status === evalStatusFilter)
    .slice(0, 8)
  if (learnings.length === 0 && evalRuns.length === 0 && evalReceipts.length === 0) return null

  return (
    <div className="mt-3 grid gap-3 xl:grid-cols-2">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Learning controls</h3>
            <p className="text-xs text-muted-foreground">Promote trusted project memory or prune noisy suggestions.</p>
          </div>
          <Badge variant="outline">{overview?.summary.learningCount ?? learnings.length} active</Badge>
        </div>
        <div className="mt-3 space-y-2">
          {learnings.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              No active learnings yet. Retro and review runs can suggest safe project memory.
            </p>
          ) : (
            learnings.map((learning) => (
              <div key={learning.id} className="rounded-lg border bg-background/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium">{learning.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {learning.body ?? `${formatLabel(learning.type)} · ${formatLabel(learning.trustLevel)}`}
                    </p>
                  </div>
                  <Badge variant={learning.trustLevel === 'operator_approved' ? 'default' : 'outline'} className="shrink-0 text-[10px]">
                    {formatLabel(learning.trustLevel)}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onPromoteLearning(learning.id)}
                    disabled={learning.trustLevel === 'operator_approved' || busyAction === `learning:promote:${learning.id}`}
                  >
                    {busyAction === `learning:promote:${learning.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Promote
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onArchiveLearning(learning.id)}
                    disabled={busyAction === `learning:archive:${learning.id}`}
                  >
                    {busyAction === `learning:archive:${learning.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                    Archive
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRejectLearning(learning.id)}
                    disabled={busyAction === `learning:reject:${learning.id}`}
                  >
                    {busyAction === `learning:reject:${learning.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                    Reject
                  </Button>
                  {typeof learning.confidence === 'number' && (
                    <span className="text-xs text-muted-foreground">{Math.round(learning.confidence * 100)}% confidence</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Eval history</h3>
            <p className="text-xs text-muted-foreground">Workflow, model, channel, memory, and runtime quality signals.</p>
          </div>
          <Badge variant="outline">{evalRuns.length + evalReceipts.length} recent</Badge>
        </div>
        {evalReceipts.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quality records</p>
              <Badge variant="secondary">{evalReceipts.length}</Badge>
            </div>
            {evalReceipts.slice(0, 4).map((receipt) => {
              const overallAverage = readNumber(receipt.aggregate.overallAverage)
              const okJudgeCount = receipt.judges.filter((judge) => judge.ok).length
              return (
                <div key={receipt.id} className="rounded-lg border bg-background/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-medium">{receipt.task}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatLabel(receipt.sourceType)} · {receipt.outputHash.slice(0, 12)} · {formatDate(receipt.createdAt)}
                      </p>
                    </div>
                    <Badge
                      variant={receipt.verdict === 'pass' ? 'default' : receipt.verdict === 'fail' ? 'destructive' : 'outline'}
                      className="shrink-0"
                    >
                      {formatLabel(receipt.verdict)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{okJudgeCount}/{receipt.judges.length} judges</span>
                    {overallAverage !== null && <span>avg {overallAverage.toFixed(1)}/10</span>}
                    {receipt.dimensions.slice(0, 4).map((dimension) => (
                      <span key={dimension}>{formatLabel(dimension)}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1">
          {(['all', 'queued', 'running', 'completed', 'failed', 'cancelled'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setEvalStatusFilter(status)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                evalStatusFilter === status
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              {formatLabel(status)}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {visibleEvalRuns.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              {evalRuns.length === 0
                ? 'No eval runs yet. Ship, canary, model benchmark, channel UX, and memory recall packs can publish here.'
                : 'No eval runs match this filter.'}
            </p>
          ) : (
            visibleEvalRuns.map((run) => {
              const benchmarkSummary = readRecord(run.metadata?.benchmark_summary)
              return (
              <div key={run.id} className="rounded-lg border bg-background/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium">
                      {run.targetRef ?? run.workflowId ?? formatLabel(run.targetKind)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatLabel(run.targetKind)} · {formatDate(run.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">{run.score ?? '-'}</p>
                    <p className="text-[10px] text-muted-foreground">score</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Pass rate {run.passRate ?? '-'}%</span>
                  {run.status && <span>{formatLabel(run.status)}</span>}
                  {run.workflowId && <span>{formatLabel(run.workflowId)}</span>}
                  {typeof run.latencyMs === 'number' && <span>{formatDuration(run.latencyMs)}</span>}
                  {typeof run.costUsd === 'number' && <span>{formatCost(run.costUsd)}</span>}
                  {typeof run.tokenCount === 'number' && <span>{formatNumber(run.tokenCount)} tokens</span>}
                </div>
                {Object.keys(benchmarkSummary).length > 0 && (
                  <pre className="mt-2 max-h-24 overflow-auto rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
                    {JSON.stringify(benchmarkSummary, null, 2)}
                  </pre>
                )}
              </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function AgentOpsBrowserOperatorCockpitPanel({
  overview,
  loading,
  busyAction,
  onProcedureTrust,
  onPlaybookTrust,
  onSessionHandoff,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
  busyAction: string | null
  onProcedureTrust: (procedureId: string, action: BrowserProcedureTrustAction) => void
  onPlaybookTrust: (playbookId: string, action: BrowserPlaybookTrustAction) => void
  onSessionHandoff: (session: BrowserSessionActionTarget, action: BrowserSessionHandoffAction) => void
}) {
  if (loading) return null
  const operator = overview?.browserOperator
  if (!operator) return null
  const hasContent = operator.procedures.length > 0 || operator.playbooks.length > 0 || operator.sessions.length > 0
  if (!hasContent) return null

  const healthTone = operator.health === 'blocked'
    ? 'destructive'
    : operator.health === 'needs_review'
      ? 'secondary'
      : operator.health === 'ready'
        ? 'default'
        : 'outline'
  const handoffSessions = operator.sessions.filter((session) => session.status === 'handoff_required')
  const resumableSessions = operator.sessions.filter((session) => session.status === 'resumable')

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Browser Operator cockpit</h3>
          <p className="text-xs text-muted-foreground">
            Procedures, host memory, live handoffs, and Trust Shield state in one operator-safe view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={healthTone}>{formatLabel(operator.health)}</Badge>
          <Badge variant="outline">{operator.summary.activeProcedureCount}/{operator.summary.procedureCount} procedures active</Badge>
          <Badge variant={handoffSessions.length > 0 ? 'destructive' : 'outline'}>{operator.summary.handoffSessionCount} handoffs</Badge>
          <Badge variant="outline">{operator.summary.activeShareCount} active shares</Badge>
        </div>
      </div>

      {operator.warnings.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {operator.warnings.slice(0, 4).map((warning) => (
            <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <div className="rounded-lg border bg-background/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Procedures</p>
            <Badge variant="outline" className="text-[10px]">{operator.summary.quarantinedProcedureCount} quarantined</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {operator.procedures.slice(0, 3).map((procedure) => (
              <div key={procedure.id} className="rounded-md border bg-card p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium">{procedure.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{procedure.hostPattern} - {procedure.triggerPreview}</p>
                  </div>
                  <Badge variant={procedure.trustState === 'active' ? 'default' : procedure.trustState === 'blocked' ? 'destructive' : 'outline'} className="shrink-0 text-[10px]">
                    {formatLabel(procedure.trustState)}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {procedure.trustState !== 'active' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onProcedureTrust(procedure.id, 'promote')}
                      disabled={busyAction === `browser-procedure:promote:${procedure.id}`}
                    >
                      {busyAction === `browser-procedure:promote:${procedure.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Activate
                    </Button>
                  )}
                  {procedure.trustState !== 'quarantined' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onProcedureTrust(procedure.id, 'quarantine')}
                      disabled={busyAction === `browser-procedure:quarantine:${procedure.id}`}
                    >
                      Quarantine
                    </Button>
                  )}
                  {procedure.trustState !== 'blocked' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onProcedureTrust(procedure.id, 'block')}
                      disabled={busyAction === `browser-procedure:block:${procedure.id}`}
                    >
                      Block
                    </Button>
                  )}
                  {procedure.trustState === 'blocked' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onProcedureTrust(procedure.id, 'restore_draft')}
                      disabled={busyAction === `browser-procedure:restore_draft:${procedure.id}`}
                    >
                      Restore draft
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-background/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live sessions</p>
            <Badge variant={resumableSessions.length > 0 ? 'secondary' : 'outline'} className="text-[10px]">
              {operator.summary.resumableSessionCount} resumable
            </Badge>
          </div>
          <div className="mt-3 space-y-2">
            {operator.sessions.slice(0, 3).map((session) => (
              <div key={session.sessionKey} className="rounded-md border bg-card p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium">{formatLabel(session.status)}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {session.latestMessage ?? session.currentUrl ?? session.sessionKey}
                    </p>
                  </div>
                  <Badge variant={session.trustState === 'blocked' ? 'destructive' : session.trustState === 'degraded' ? 'secondary' : 'outline'} className="shrink-0 text-[10px]">
                    {formatLabel(session.trustState)}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{session.eventCount} events</Badge>
                  <Badge variant="outline" className="text-[10px]">{session.activeShareCount} shares</Badge>
                  {session.currentUrl && <Badge variant="outline" className="max-w-[180px] truncate text-[10px]">{session.currentUrl}</Badge>}
                </div>
                {(session.status === 'handoff_required' || session.status === 'resumable') && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {session.status === 'handoff_required' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onSessionHandoff(session, 'resolve')}
                        disabled={!session.runId || busyAction === `browser-handoff:resolve:${session.sessionKey}`}
                      >
                        {busyAction === `browser-handoff:resolve:${session.sessionKey}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Mark resolved
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSessionHandoff(session, 'resume')}
                      disabled={!session.runId || busyAction === `browser-handoff:resume:${session.sessionKey}`}
                    >
                      {busyAction === `browser-handoff:resume:${session.sessionKey}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Resume
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-background/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Host playbooks</p>
            <Badge variant="outline" className="text-[10px]">{operator.summary.activePlaybookCount}/{operator.summary.playbookCount} active</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {operator.playbooks.slice(0, 3).map((playbook) => (
              <div key={playbook.id} className="rounded-md border bg-card p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium">{playbook.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{playbook.hostPattern} - {playbook.successfulUses} uses</p>
                  </div>
                  <Badge variant={playbook.trustState === 'active' ? 'default' : playbook.trustState === 'blocked' ? 'destructive' : 'outline'} className="shrink-0 text-[10px]">
                    {formatLabel(playbook.trustState)}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {playbook.trustState !== 'active' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onPlaybookTrust(playbook.id, 'promote')}
                      disabled={busyAction === `browser-playbook:promote:${playbook.id}`}
                    >
                      Activate
                    </Button>
                  )}
                  {playbook.trustState !== 'quarantined' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onPlaybookTrust(playbook.id, 'quarantine')}
                      disabled={busyAction === `browser-playbook:quarantine:${playbook.id}`}
                    >
                      Quarantine
                    </Button>
                  )}
                  {playbook.trustState !== 'blocked' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onPlaybookTrust(playbook.id, 'block')}
                      disabled={busyAction === `browser-playbook:block:${playbook.id}`}
                    >
                      Block
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AgentOpsBrowserProceduresPanel({
  overview,
  loading,
  busyAction,
  onTrustAction,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
  busyAction: string | null
  onTrustAction: (procedureId: string, action: BrowserProcedureTrustAction) => void
}) {
  if (loading) return null
  const procedures = overview?.browserProcedures ?? []
  if (procedures.length === 0) return null

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Browser procedures</h3>
          <p className="text-xs text-muted-foreground">
            Reusable Browser Operator playbooks. They are visible here before execution is wired on purpose.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{overview?.summary.browserProcedureCount ?? procedures.length} procedures</Badge>
          <Badge variant="secondary">{overview?.summary.activeBrowserProcedureCount ?? procedures.filter((item) => item.trustState === 'active').length} active</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {procedures.slice(0, 6).map((procedure) => (
          <div key={procedure.id} className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{procedure.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{procedure.description}</p>
              </div>
              <Badge
                variant={procedure.trustState === 'active' ? 'default' : procedure.trustState === 'quarantined' ? 'secondary' : 'outline'}
                className="shrink-0 text-[10px]"
              >
                {formatLabel(procedure.trustState)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">{procedure.hostPattern}</Badge>
              <Badge variant="outline" className="text-[10px]">{formatLabel(procedure.procedureType)}</Badge>
              <Badge variant="outline" className="text-[10px]">{formatLabel(procedure.scope)}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{procedure.intentTriggers.slice(0, 2).join(', ') || procedure.slug}</span>
              <span>Updated {formatDate(procedure.updatedAt)}</span>
              {procedure.sourceRunId && <span>Source run {procedure.sourceRunId.slice(0, 8)}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {procedure.trustState !== 'active' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onTrustAction(procedure.id, 'promote')}
                  disabled={busyAction === `browser-procedure:promote:${procedure.id}`}
                >
                  {busyAction === `browser-procedure:promote:${procedure.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Activate
                </Button>
              )}
              {procedure.trustState !== 'quarantined' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTrustAction(procedure.id, 'quarantine')}
                  disabled={busyAction === `browser-procedure:quarantine:${procedure.id}`}
                >
                  Quarantine
                </Button>
              )}
              {procedure.trustState !== 'blocked' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTrustAction(procedure.id, 'block')}
                  disabled={busyAction === `browser-procedure:block:${procedure.id}`}
                >
                  Block
                </Button>
              )}
              {procedure.trustState === 'blocked' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTrustAction(procedure.id, 'restore_draft')}
                  disabled={busyAction === `browser-procedure:restore_draft:${procedure.id}`}
                >
                  Restore draft
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentOpsBrowserTrustShieldPanel({
  overview,
  loading,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
}) {
  if (loading) return null
  const events = overview?.browserSecurityEvents ?? []
  if (events.length === 0) return null
  const blocking = events.filter((event) => event.severity === 'block').length

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Browser Trust Shield</h3>
          <p className="text-xs text-muted-foreground">
            Browser-specific prompt-injection, canary, and low-level action signals for Browser Operator runs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{overview?.summary.browserSecurityEventCount ?? events.length} events</Badge>
          <Badge variant={blocking > 0 ? 'destructive' : 'secondary'}>{overview?.summary.blockingBrowserSecurityEventCount ?? blocking} blocking</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {events.slice(0, 6).map((event, index) => {
          const pattern = typeof event.details?.pattern === 'string' ? event.details.pattern : null
          const preview = typeof event.details?.context_preview === 'string' ? event.details.context_preview : null
          return (
            <div key={event.id ?? `${event.eventType}-${index}`} className="rounded-lg border bg-background/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-medium">{formatLabel(event.eventType)}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {preview ?? pattern ?? event.host ?? formatLabel(event.layer)}
                  </p>
                </div>
                <Badge
                  variant={event.severity === 'block' ? 'destructive' : event.severity === 'warn' ? 'secondary' : 'outline'}
                  className="shrink-0 text-[10px]"
                >
                  {formatLabel(event.severity)}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px]">{formatLabel(event.layer)}</Badge>
                {event.host && <Badge variant="outline" className="text-[10px]">{event.host}</Badge>}
                {event.browserSessionId && <Badge variant="outline" className="text-[10px]">Session {event.browserSessionId.slice(0, 8)}</Badge>}
              </div>
              {event.createdAt && (
                <p className="mt-2 text-xs text-muted-foreground">Recorded {formatDate(event.createdAt)}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AgentOpsBrowserLiveSessionsPanel({
  overview,
  loading,
  busyAction,
  onSessionHandoff,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
  busyAction: string | null
  onSessionHandoff: (session: BrowserSessionActionTarget, action: BrowserSessionHandoffAction) => void
}) {
  if (loading) return null
  const events = overview?.browserSessionEvents ?? []
  if (events.length === 0) return null
  const handoffs = events.filter((event) => event.eventType === 'handoff_required')

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Live browser sessions</h3>
          <p className="text-xs text-muted-foreground">
            Browser Operator timeline events for watch, handoff, resume, and evidence collection.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{overview?.summary.browserSessionEventCount ?? events.length} events</Badge>
          <Badge variant={handoffs.length > 0 ? 'destructive' : 'secondary'}>{overview?.summary.browserHandoffRequiredCount ?? handoffs.length} handoffs</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {events.slice(0, 6).map((event, index) => (
          <div key={event.id ?? `${event.sessionKey}-${index}`} className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{formatLabel(event.eventType)}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {event.message ?? event.currentUrl ?? event.sessionKey}
                </p>
              </div>
              <Badge
                variant={event.severity === 'error' ? 'destructive' : event.severity === 'warn' ? 'secondary' : 'outline'}
                className="shrink-0 text-[10px]"
              >
                {formatLabel(event.severity)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">Session {event.sessionKey.slice(0, 8)}</Badge>
              {event.handoffState && <Badge variant="destructive" className="text-[10px]">{formatLabel(event.handoffState)}</Badge>}
              {event.currentUrl && <Badge variant="outline" className="max-w-[220px] truncate text-[10px]">{event.currentUrl}</Badge>}
            </div>
            {event.createdAt && (
              <p className="mt-2 text-xs text-muted-foreground">Recorded {formatDate(event.createdAt)}</p>
            )}
            {(event.eventType === 'handoff_required' || event.eventType === 'handoff_resolved' || event.eventType === 'session_resumed') && (
              <div className="mt-3 flex flex-wrap gap-2">
                {event.eventType === 'handoff_required' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onSessionHandoff({
                      sessionKey: event.sessionKey,
                      runId: event.runId,
                      browserSessionId: event.browserSessionId,
                      currentUrl: event.currentUrl,
                      handoffState: event.handoffState,
                    }, 'resolve')}
                    disabled={busyAction === `browser-handoff:resolve:${event.sessionKey}`}
                  >
                    {busyAction === `browser-handoff:resolve:${event.sessionKey}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Mark resolved
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSessionHandoff({
                    sessionKey: event.sessionKey,
                    runId: event.runId,
                    browserSessionId: event.browserSessionId,
                    currentUrl: event.currentUrl,
                    handoffState: event.handoffState,
                  }, 'resume')}
                  disabled={busyAction === `browser-handoff:resume:${event.sessionKey}`}
                >
                  {busyAction === `browser-handoff:resume:${event.sessionKey}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Resume
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentOpsBrowserSharingPanel({
  overview,
  loading,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
}) {
  if (loading) return null
  const shares = overview?.browserSessionShares ?? []
  const actions = overview?.browserSessionSharedActions ?? []
  if (shares.length === 0 && actions.length === 0) return null
  const activeShares = shares.filter((share) => share.status === 'active')

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Pair-agent browser sharing</h3>
          <p className="text-xs text-muted-foreground">
            Scoped session tokens, isolated tabs, and runtime/agent attribution for shared Browser Operator work.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{overview?.summary.browserSessionShareCount ?? shares.length} shares</Badge>
          <Badge variant={activeShares.length > 0 ? 'secondary' : 'outline'}>
            {overview?.summary.activeBrowserSessionShareCount ?? activeShares.length} active
          </Badge>
          <Badge variant="outline">{overview?.summary.browserSessionSharedActionCount ?? actions.length} actions</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {shares.slice(0, 4).map((share) => (
          <div key={share.id} className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">
                  {share.grantedToAgentLabel ?? share.grantedToRuntimeId ?? 'Shared browser access'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tab {share.tabIdentity} - expires {formatDate(share.expiresAt)}
                </p>
              </div>
              <Badge variant={share.status === 'active' ? 'secondary' : 'outline'} className="shrink-0 text-[10px]">
                {formatLabel(share.status)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">{formatLabel(share.scope)}</Badge>
              <Badge variant="outline" className="text-[10px]">{share.rateLimitPerMinute}/min</Badge>
              <Badge variant="outline" className="text-[10px]">Session {share.sessionKey.slice(0, 8)}</Badge>
              {share.grantedToRuntimeId && <Badge variant="outline" className="text-[10px]">{share.grantedToRuntimeId}</Badge>}
            </div>
          </div>
        ))}
        {actions.slice(0, 4).map((action, index) => (
          <div key={action.id ?? `${action.sessionKey}-${index}`} className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{formatLabel(action.actionType)}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {action.message ?? action.currentUrl ?? action.actorAgentLabel ?? action.sessionKey}
                </p>
              </div>
              <Badge variant={action.status === 'blocked' || action.status === 'failed' ? 'destructive' : 'outline'} className="shrink-0 text-[10px]">
                {formatLabel(action.status)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {action.scope && <Badge variant="outline" className="text-[10px]">{formatLabel(action.scope)}</Badge>}
              {action.tabIdentity && <Badge variant="outline" className="text-[10px]">{action.tabIdentity}</Badge>}
              {action.actorRuntimeId && <Badge variant="outline" className="text-[10px]">{action.actorRuntimeId}</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentOpsBrowserHostPlaybooksPanel({
  overview,
  loading,
  busyAction,
  onTrustAction,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
  busyAction: string | null
  onTrustAction: (playbookId: string, action: BrowserPlaybookTrustAction) => void
}) {
  if (loading) return null
  const playbooks = overview?.browserHostPlaybooks ?? []
  if (playbooks.length === 0) return null

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Host playbooks</h3>
          <p className="text-xs text-muted-foreground">
            Active domain knowledge injected into Browser Operator runs. Quarantined notes stay visible for review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{overview?.summary.browserHostPlaybookCount ?? playbooks.length} playbooks</Badge>
          <Badge variant="secondary">{overview?.summary.activeBrowserHostPlaybookCount ?? playbooks.filter((item) => item.trustState === 'active').length} active</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {playbooks.slice(0, 6).map((playbook) => (
          <div key={playbook.id} className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{playbook.title}</p>
                <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{playbook.bodyMd}</p>
              </div>
              <Badge
                variant={playbook.trustState === 'active' ? 'default' : playbook.trustState === 'quarantined' ? 'secondary' : 'outline'}
                className="shrink-0 text-[10px]"
              >
                {formatLabel(playbook.trustState)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">{playbook.hostPattern}</Badge>
              <Badge variant="outline" className="text-[10px]">{formatLabel(playbook.scope)}</Badge>
              <Badge variant={playbook.securityFlagsCount > 0 ? 'destructive' : 'outline'} className="text-[10px]">
                {playbook.securityFlagsCount} security flags
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{playbook.successfulUses} successful uses</span>
              {playbook.lastUsedAt && <span>Last used {formatDate(playbook.lastUsedAt)}</span>}
              <span>Updated {formatDate(playbook.updatedAt)}</span>
              {playbook.sourceRunId && <span>Source run {playbook.sourceRunId.slice(0, 8)}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {playbook.trustState !== 'active' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onTrustAction(playbook.id, 'promote')}
                  disabled={busyAction === `browser-playbook:promote:${playbook.id}`}
                >
                  {busyAction === `browser-playbook:promote:${playbook.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Activate
                </Button>
              )}
              {playbook.trustState !== 'quarantined' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTrustAction(playbook.id, 'quarantine')}
                  disabled={busyAction === `browser-playbook:quarantine:${playbook.id}`}
                >
                  Quarantine
                </Button>
              )}
              {playbook.trustState !== 'blocked' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTrustAction(playbook.id, 'block')}
                  disabled={busyAction === `browser-playbook:block:${playbook.id}`}
                >
                  Block
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentOpsDesignOpsPanel({
  overview,
  loading,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
}) {
  if (loading) return null
  const profiles = overview?.operatorProfiles ?? []
  const feedback = overview?.designFeedback ?? []
  if (profiles.length === 0 && feedback.length === 0) return null
  const tasteProfiles = profiles.filter((profile) => profile.profileType === 'design_taste')
  const approved = feedback.filter((item) => item.status === 'approved')

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Design Ops</h3>
          <p className="text-xs text-muted-foreground">
            Transparent taste profiles, variant feedback, and design rationale for non-dev and product workflows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{overview?.summary.operatorProfileCount ?? profiles.length} profiles</Badge>
          <Badge variant="secondary">{overview?.summary.designTasteProfileCount ?? tasteProfiles.length} taste</Badge>
          <Badge variant="outline">{overview?.summary.designFeedbackCount ?? feedback.length} feedback</Badge>
          <Badge variant={approved.length > 0 ? 'secondary' : 'outline'}>{overview?.summary.approvedDesignFeedbackCount ?? approved.length} approved</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {profiles.slice(0, 4).map((profile, index) => (
          <div key={profile.id ?? `${profile.profileType}-${index}`} className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{formatLabel(profile.profileType)} profile</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  Declared {Object.keys(profile.declared).length} signal(s), inferred {Object.keys(profile.inferred).length} signal(s).
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {profile.updatedAt ? formatDate(profile.updatedAt) : 'Profile'}
              </Badge>
            </div>
            <pre className="mt-3 max-h-24 overflow-auto rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
              {JSON.stringify({ declared: profile.declared, inferred: profile.inferred }, null, 2)}
            </pre>
          </div>
        ))}
        {feedback.slice(0, 4).map((item, index) => (
          <div key={item.id ?? `${item.variantKey}-${index}`} className="rounded-lg border bg-background/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{formatLabel(item.variantKey)}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {item.feedback ?? readString(item.metadata.title) ?? `${formatLabel(item.feedbackType)} from ${formatLabel(item.source)}`}
                </p>
              </div>
              <Badge
                variant={item.status === 'approved' || item.status === 'promoted' ? 'secondary' : item.status === 'rejected' ? 'destructive' : 'outline'}
                className="shrink-0 text-[10px]"
              >
                {formatLabel(item.status)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">{formatLabel(item.feedbackType)}</Badge>
              <Badge variant="outline" className="text-[10px]">{formatLabel(item.source)}</Badge>
              {item.runId && <Badge variant="outline" className="text-[10px]">Run {item.runId.slice(0, 8)}</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentOpsDecisionPacingPanel({
  overview,
  loading,
}: {
  overview: AgentOpsOverview | null
  loading: boolean
}) {
  if (loading) return null
  const events = overview?.decisionEvents ?? []
  if (events.length === 0) return null
  const oneWay = events.filter((event) => event.doorType === 'one_way')
  const silent = events.filter((event) => event.decisionMode === 'silent_decision')
  const flipped = events.filter((event) => event.decisionMode === 'flipped')

  return (
    <div className="mt-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Decision pacing</h3>
          <p className="text-xs text-muted-foreground">
            One-way choices stay visible; low-risk two-way choices can be auto-applied, silent, and flipped later.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{overview?.summary.decisionEventCount ?? events.length} events</Badge>
          <Badge variant={oneWay.length > 0 ? 'secondary' : 'outline'}>{overview?.summary.oneWayDecisionCount ?? oneWay.length} one-way</Badge>
          <Badge variant={silent.length > 0 ? 'outline' : 'secondary'}>{overview?.summary.silentDecisionCount ?? silent.length} silent</Badge>
          <Badge variant="outline">{overview?.summary.flippedDecisionCount ?? flipped.length} flipped</Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {events.slice(0, 6).map((event, index) => (
          <DecisionEventCard key={event.id ?? `${event.questionId}-${index}`} event={event} />
        ))}
      </div>
    </div>
  )
}

function DecisionEventCard({
  event,
  busyAction,
  onFlipOption,
}: {
  event: AgentOpsDecisionEvent
  busyAction?: string | null
  onFlipOption?: (event: AgentOpsDecisionEvent, option: AgentOpsDecisionEvent['options'][number]) => void
}) {
  const selectedLabel = readDecisionSelectedLabel(event)
  const selectedId = readString(event.selectedOption?.id ?? event.selectedOption?.option_id)
  const flippableOptions = event.reversible && onFlipOption
    ? event.options.filter((option) => option.id !== selectedId)
    : []
  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-medium">{event.question}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {event.riskReason ?? `${formatLabel(event.phase)} decision`}
          </p>
        </div>
        <Badge
          variant={event.doorType === 'one_way' ? 'destructive' : event.decisionMode === 'flipped' ? 'secondary' : 'outline'}
          className="shrink-0 text-[10px]"
        >
          {formatLabel(event.decisionMode)}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-[10px]">{formatLabel(event.doorType)}</Badge>
        <Badge variant="outline" className="text-[10px]">{formatLabel(event.phase)}</Badge>
        {selectedLabel && <Badge variant="secondary" className="text-[10px]">{selectedLabel}</Badge>}
        {event.reversible && <Badge variant="outline" className="text-[10px]">Flippable</Badge>}
        {event.flippedFromEventId && <Badge variant="outline" className="text-[10px]">Flip of {event.flippedFromEventId.slice(0, 8)}</Badge>}
      </div>
      {event.createdAt && (
        <p className="mt-2 text-xs text-muted-foreground">{formatDate(event.createdAt)}</p>
      )}
      {flippableOptions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {flippableOptions.slice(0, 4).map((option) => {
            const busy = busyAction === `decision-flip:${event.id}:${option.id}`
            return (
              <Button
                key={option.id}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => onFlipOption?.(event, option)}
                disabled={busy}
                title={option.description}
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                Flip to {option.label}
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function readDecisionSelectedLabel(event: AgentOpsDecisionEvent): string | null {
  const selectedId = readString(event.selectedOption?.id ?? event.selectedOption?.option_id)
  if (selectedId) {
    return event.options.find((option) => option.id === selectedId)?.label ?? selectedId
  }
  return readString(event.selectedOption?.label)
}

function RunDetailPanel({
  detail,
  workflows,
  loading,
  busyAction,
  onCancel,
  onRetry,
  onRunAgain,
  onPromoteRecurring,
  onPromoteBrowserProcedure,
  onFlipDecision,
}: {
  detail: AgentOpsRunDetail | null
  workflows: AgentOpsWorkflowSummary[]
  loading: boolean
  busyAction: string | null
  onCancel: (run: AgentOpsRun) => void
  onRetry: (run: AgentOpsRun) => void
  onRunAgain: (run: AgentOpsRun) => void
  onPromoteRecurring: (run: AgentOpsRun) => void
  onPromoteBrowserProcedure: (run: AgentOpsRun) => void
  onFlipDecision: (event: AgentOpsDecisionEvent, option: AgentOpsDecisionEvent['options'][number]) => void
}) {
  const [findingSeverityFilter, setFindingSeverityFilter] = useState<FindingSeverityFilter>('all')
  const [findingStatusFilter, setFindingStatusFilter] = useState<FindingStatusFilter>('all')
  const [artifactTypeFilter, setArtifactTypeFilter] = useState<ArtifactTypeFilter>('all')

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <div className="h-28 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-40 animate-pulse rounded-xl bg-muted/60" />
      </div>
    )
  }

  if (!detail) {
    return (
      <EmptyState
        icon={<ArrowRight className="h-8 w-8" />}
        title="Select a check"
        description="The flight recorder will show what was checked, what happened, evidence, and next actions."
      />
    )
  }

  const {
    run,
    artifacts,
    findings,
    browserQaSessions,
    evalReceipts = [],
    browserSessionEvents = [],
    browserSessionShares = [],
    browserSessionSharedActions = [],
    decisionEvents = [],
    links,
    timelineEvents,
    usageEvents,
  } = detail
  const workflowTeamOps = workflows.find((workflow) => workflow.id === run.workflowId)?.teamOps ?? null
  const teamOps = readTeamOpsProjection(run.metadata.team_ops) ?? workflowTeamOps
  const runModePolicy = readRecord(run.metadata.run_mode_policy)
  const runModeReason = readString(runModePolicy.reason)
  const allowedChanges = readStringArray(runModePolicy.allowedMutations)
  const requiredQuestions = Array.isArray(runModePolicy.requiredQuestions)
    ? runModePolicy.requiredQuestions.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : []
  const canCancel = run.status === 'queued' || run.status === 'running' || run.status === 'blocked'
  const filteredFindings = findings.filter((finding) =>
    (findingSeverityFilter === 'all' || finding.severity === findingSeverityFilter)
    && (findingStatusFilter === 'all' || finding.status === findingStatusFilter)
  )
  const filteredArtifacts = artifacts.filter((artifact) =>
    artifactTypeFilter === 'all' || artifact.type === artifactTypeFilter
  )
  const artifactTypeOptions = Array.from(new Set(artifacts.map((artifact) => artifact.type))).sort()
  const browserEvidenceArtifacts = artifacts.filter(isBrowserQaEvidenceArtifact)
  const canPromoteBrowserProcedure = browserQaSessions.length > 0 || browserEvidenceArtifacts.length > 0

  return (
    <div className="min-h-0 overflow-y-auto bg-background">
      <div className="border-b px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Flight Recorder
            </p>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">{formatLabel(run.workflowId)}</h2>
              <Badge variant="outline" className={cn('text-[10px]', STATUS_STYLES[run.status])}>
                {formatLabel(run.status)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {run.scope.label ?? run.scope.ref ?? formatLabel(run.scope.type)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => onRunAgain(run)}
              disabled={busyAction === `run-again:${run.id}`}
            >
              {busyAction === `run-again:${run.id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run again
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPromoteRecurring(run)}
              disabled={busyAction === `promote-recurring:${run.id}`}
            >
              {busyAction === `promote-recurring:${run.id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarClock className="h-4 w-4" />
              )}
              Make recurring
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPromoteBrowserProcedure(run)}
              disabled={!canPromoteBrowserProcedure || busyAction === `promote-browser-procedure:${run.id}`}
              title={canPromoteBrowserProcedure ? 'Create a quarantined Browser Procedure from this run.' : 'This run has no Browser Operator evidence to promote.'}
            >
              {busyAction === `promote-browser-procedure:${run.id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <WorkflowIcon className="h-4 w-4" />
              )}
              Procedure
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetry(run)}
              disabled={busyAction === `retry:${run.id}`}
            >
              {busyAction === `retry:${run.id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Retry
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCancel(run)}
              disabled={!canCancel || busyAction === `cancel:${run.id}`}
            >
              {busyAction === `cancel:${run.id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              Cancel
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <DetailStat label="Started" value={formatDate(run.startedAt)} />
          <DetailStat label="Updated" value={formatDate(run.updatedAt)} />
          <DetailStat label="Completed" value={formatDate(run.completedAt)} />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <DetailStat label="Latency" value={formatDuration(run.latencyMs)} />
          <DetailStat label="Cost" value={formatCost(run.costUsd)} />
          <DetailStat label="Tokens" value={formatNumber(run.totalTokens)} />
          <DetailStat label="Usage events" value={formatNumber(usageEvents.length)} />
        </div>

        <section className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">Run mode</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Plan/execute/handoff policy is stored on the run before dispatch and is runtime-agnostic.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{formatLabel(run.runMode)}</Badge>
              {readString(runModePolicy.effectiveMode) && readString(runModePolicy.effectiveMode) !== run.runMode ? (
                <Badge variant="secondary">Effective {formatLabel(readString(runModePolicy.effectiveMode) ?? 'execute')}</Badge>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-3">
            <div className="rounded-lg border p-3 lg:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Policy reason</p>
              <p className="mt-2 text-sm text-foreground">{runModeReason ?? 'No run-mode policy reason recorded.'}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Allowed changes</p>
              <p className="mt-2 text-sm text-foreground">
                {allowedChanges.length > 0 ? allowedChanges.map(formatLabel).join(', ') : 'None'}
              </p>
            </div>
            {requiredQuestions.length > 0 ? (
              <div className="rounded-lg border p-3 lg:col-span-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Required questions</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {requiredQuestions.map((question, index) => (
                    <div key={readString(question.id) ?? index} className="rounded-md bg-muted/50 p-3">
                      <p className="text-sm font-medium">{readString(question.prompt) ?? 'Question required'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{readString(question.reason) ?? 'Needed before execution.'}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <RunContextIntelligenceSection run={run} links={links} timelineEvents={timelineEvents} />

        {run.errorMessage && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
            {run.errorMessage}
          </div>
        )}

        <TeamOpsDispatchSection teamOps={teamOps} />

        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">Quality records</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Cross-provider quality judgment for this run output, stored separately from raw artifacts.
              </p>
            </div>
            <Badge variant="outline">{evalReceipts.length}</Badge>
          </div>
          {evalReceipts.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No quality records yet for this run.
            </p>
          ) : (
            <div className="grid gap-3 p-4 lg:grid-cols-2">
              {evalReceipts.map((receipt) => {
                const overallAverage = readNumber(receipt.aggregate.overallAverage)
                const okJudgeCount = receipt.judges.filter((judge) => judge.ok).length
                return (
                  <div key={receipt.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-medium">{receipt.task}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatLabel(receipt.sourceType)} · hash {receipt.outputHash.slice(0, 12)}
                        </p>
                      </div>
                      <Badge
                        variant={receipt.verdict === 'pass' ? 'default' : receipt.verdict === 'fail' ? 'destructive' : 'outline'}
                        className="shrink-0"
                      >
                        {formatLabel(receipt.verdict)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                      <span>{okJudgeCount}/{receipt.judges.length} judges</span>
                      <span>{overallAverage !== null ? `${overallAverage.toFixed(1)}/10 avg` : 'No avg'}</span>
                      <span>{formatDate(receipt.createdAt)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {receipt.dimensions.map((dimension) => (
                        <Badge key={dimension} variant="outline" className="text-[10px]">
                          {formatLabel(dimension)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">Decision pacing</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Audit trail for asked, auto-applied, silent, and flipped operator decisions.
              </p>
            </div>
            <Badge variant="outline">{decisionEvents.length}</Badge>
          </div>
          {decisionEvents.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No decision events recorded yet for this run.
            </p>
          ) : (
            <div className="grid gap-3 p-4 lg:grid-cols-2">
              {decisionEvents.map((event, index) => (
                <DecisionEventCard
                  key={event.id ?? `${event.questionId}-${index}`}
                  event={event}
                  busyAction={busyAction}
                  onFlipOption={onFlipDecision}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Provenance</h3>
            <Badge variant="outline">{links.length + timelineEvents.length}</Badge>
          </div>
          {links.length === 0 && timelineEvents.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No source links or project timeline events recorded yet.
            </p>
          ) : (
            <div className="divide-y">
              {links.map((link) => (
                <div key={link.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {link.label ?? link.refText ?? link.refId ?? formatLabel(link.linkType)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatLabel(link.linkType)}
                        {(link.refText || link.refId) ? ` - ${link.refText ?? link.refId}` : ''}
                      </p>
                      {Object.keys(link.metadata).length > 0 && (
                        <p className="mt-2 line-clamp-2 rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                          {JSON.stringify(link.metadata)}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline">{formatDate(link.createdAt)}</Badge>
                  </div>
                </div>
              ))}
              {timelineEvents.map((event) => (
                <div key={event.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{event.title}</p>
                      {event.body && <p className="mt-1 text-sm text-muted-foreground">{event.body}</p>}
                    </div>
                    <Badge variant="outline">{formatLabel(event.eventType)}</Badge>
                  </div>
                  {Object.keys(event.evidence).length > 0 && (
                    <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
                      {JSON.stringify(event.evidence, null, 2)}
                    </pre>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">{formatDate(event.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Usage</h3>
            <Badge variant="outline">{usageEvents.length}</Badge>
          </div>
          {usageEvents.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No usage events recorded yet.
            </p>
          ) : (
            <ul className="divide-y">
              {usageEvents.map((event) => (
                <li key={event.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{formatLabel(event.sourceKind)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.sourceRef ?? 'No source reference'} - {formatDate(event.createdAt)}
                      </p>
                    </div>
                    <Badge variant="outline">{formatDuration(event.durationMs)}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <span>{formatNumber(event.totalTokens ?? 0)} tokens</span>
                    <span>{formatCost(event.costUsd)}</span>
                    <span>{formatNumber(event.inputTokens ?? 0)} in / {formatNumber(event.outputTokens ?? 0)} out</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Output</h3>
          </div>
          <div className="p-4 text-sm text-muted-foreground">
            {run.output ? (
              <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs text-foreground">
                {JSON.stringify(run.output, null, 2)}
              </pre>
            ) : (
              <p>
                No structured output yet. Queued runs become executable when the worker orchestration adapter claims them.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Findings</h3>
              <Badge variant="outline">{filteredFindings.length}/{findings.length}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(['all', ...AGENT_OPS_FINDING_SEVERITIES] as const).map((severity) => (
                <button
                  key={severity}
                  type="button"
                  onClick={() => setFindingSeverityFilter(severity)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs transition-colors',
                    findingSeverityFilter === severity
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  {formatLabel(severity)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['all', ...AGENT_OPS_FINDING_STATUSES] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFindingStatusFilter(status)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs transition-colors',
                    findingStatusFilter === status
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  {formatLabel(status)}
                </button>
              ))}
            </div>
          </div>
          {filteredFindings.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {findings.length === 0 ? 'No findings recorded yet.' : 'No findings match these filters.'}
            </p>
          ) : (
            <ul className="divide-y">
              {filteredFindings.map((finding) => {
                const ownership = readFindingFailureOwnership(finding)
                return (
                  <li key={finding.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{finding.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{finding.body}</p>
                      </div>
                      <Badge variant="outline">{formatLabel(finding.severity)}</Badge>
                    </div>
                    {finding.filePath && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {finding.filePath}
                        {finding.startLine ? `:${finding.startLine}` : ''}
                      </p>
                    )}
                    {ownership && (
                      <div className="mt-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            Ownership: {ownership.label}
                          </Badge>
                          {typeof ownership.confidence === 'number' && (
                            <span className="text-muted-foreground">{Math.round(ownership.confidence * 100)}% confidence</span>
                          )}
                          {ownership.requiresHuman && <span className="text-muted-foreground">Human follow-up needed</span>}
                          {ownership.owner && <span className="text-muted-foreground">Owner: {ownership.owner}</span>}
                        </div>
                        {ownership.reason && (
                          <p className="mt-2 text-muted-foreground">{ownership.reason}</p>
                        )}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{formatLabel(finding.status)}</span>
                      {typeof finding.confidence === 'number' && <span>{Math.round(finding.confidence * 100)}% confidence</span>}
                      {finding.fingerprint && <span className="max-w-full truncate font-mono">{finding.fingerprint}</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Browser QA</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{browserQaSessions.length} sessions</Badge>
              <Badge variant="outline">{browserEvidenceArtifacts.length} evidence</Badge>
            </div>
          </div>
          {browserQaSessions.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No browser session evidence indexed yet.
            </p>
          ) : (
            <ul className="divide-y">
              {browserQaSessions.map((session) => (
                <li key={session.id} className="p-4">
                  {(() => {
                    const evidence = browserEvidenceArtifacts.filter((artifact) => artifactBelongsToBrowserSession(artifact, session))
                    const sessionEvents = browserSessionEvents.filter((event) => event.sessionKey === session.sessionKey)
                    const metadata = session.metadata
                    const provider = readString(metadata.provider) ?? readString(metadata.browser_provider)
                    return (
                      <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{session.targetUrl}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {session.artifactCount} artifacts - updated {formatDate(session.updatedAt)}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {session.sessionKey}
                      </p>
                    </div>
                    <Badge variant="outline">{formatLabel(session.status)}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <span>Started {formatDate(session.startedAt)}</span>
                    <span>Expires {formatDate(session.expiresAt)}</span>
                    <span>{provider ? `Provider ${provider}` : session.ownerRuntimeId ? `Runtime ${session.ownerRuntimeId}` : 'No runtime owner'}</span>
                  </div>
                  {session.lastError && (
                    <p className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-500">
                      {session.lastError}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {session.lastArtifactId && (
                      <Badge variant="secondary">Last artifact {session.lastArtifactId.slice(0, 8)}</Badge>
                    )}
                    {Object.keys(session.viewport).length > 0 && (
                      <Badge variant="outline">Viewport {JSON.stringify(session.viewport)}</Badge>
                    )}
                  </div>
                  {evidence.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {evidence.slice(0, 4).map((artifact) => (
                        <EvidenceArtifactRow key={artifact.id} artifact={artifact} dense />
                      ))}
                    </div>
                  )}
                  {sessionEvents.length > 0 && (
                    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs font-medium">Session timeline</p>
                      <div className="mt-2 space-y-2">
                        {sessionEvents.slice(0, 5).map((event, index) => (
                          <div key={event.id ?? `${event.sessionKey}-${index}`} className="flex items-start justify-between gap-3 text-xs">
                            <div className="min-w-0">
                              <p className="font-medium">{formatLabel(event.eventType)}</p>
                              <p className="line-clamp-1 text-muted-foreground">{event.message ?? event.currentUrl ?? event.sessionKey}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {event.handoffState && <Badge variant="destructive" className="text-[10px]">{formatLabel(event.handoffState)}</Badge>}
                              <Badge variant={event.severity === 'error' ? 'destructive' : event.severity === 'warn' ? 'secondary' : 'outline'} className="text-[10px]">
                                {formatLabel(event.severity)}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(browserSessionShares.some((share) => share.sessionKey === session.sessionKey)
                    || browserSessionSharedActions.some((action) => action.sessionKey === session.sessionKey)) && (
                    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs font-medium">Pair-agent sharing</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {browserSessionShares
                          .filter((share) => share.sessionKey === session.sessionKey)
                          .slice(0, 4)
                          .map((share) => (
                            <Badge key={share.id} variant={share.status === 'active' ? 'secondary' : 'outline'} className="text-[10px]">
                              {formatLabel(share.scope)} to {share.grantedToAgentLabel ?? share.grantedToRuntimeId ?? share.tabIdentity}
                            </Badge>
                          ))}
                      </div>
                      <div className="mt-2 space-y-2">
                        {browserSessionSharedActions
                          .filter((action) => action.sessionKey === session.sessionKey)
                          .slice(0, 5)
                          .map((action, index) => (
                            <div key={action.id ?? `${action.sessionKey}-${index}`} className="flex items-start justify-between gap-3 text-xs">
                              <div className="min-w-0">
                                <p className="font-medium">{formatLabel(action.actionType)}</p>
                                <p className="line-clamp-1 text-muted-foreground">
                                  {action.message ?? action.currentUrl ?? action.actorAgentLabel ?? action.tabIdentity}
                                </p>
                              </div>
                              <Badge variant={action.status === 'allowed' ? 'outline' : 'destructive'} className="text-[10px]">
                                {formatLabel(action.status)}
                              </Badge>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                      </>
                    )
                  })()}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Evidence</h3>
              <Badge variant="outline">{filteredArtifacts.length}/{artifacts.length}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(['all', ...artifactTypeOptions] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setArtifactTypeFilter(type)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs transition-colors',
                    artifactTypeFilter === type
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  {formatLabel(type)}
                </button>
              ))}
            </div>
          </div>
          {filteredArtifacts.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {artifacts.length === 0 ? 'No evidence artifacts attached yet.' : 'No evidence artifacts match this filter.'}
            </p>
          ) : (
            <ul className="divide-y">
              {filteredArtifacts.map((artifact) => (
                <li key={artifact.id} className="p-4">
                  <EvidenceArtifactRow artifact={artifact} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function RunContextIntelligenceSection({
  run,
  links,
  timelineEvents,
}: {
  run: AgentOpsRun
  links: AgentOpsRunDetail['links']
  timelineEvents: AgentOpsRunDetail['timelineEvents']
}) {
  const metadata = readRecord(run.metadata)
  const knowledgeThink = readRecord(metadata.knowledge_think ?? metadata.knowledgeThink)
  const knowledgeThinkOutput = readString(knowledgeThink.output)
    ?? readString(knowledgeThink.summary)
    ?? readString(knowledgeThink.answer)
    ?? readString(knowledgeThink.digest)
  const claimsUsed = uniqueStrings([
    ...readStringArray(metadata.claims_used ?? metadata.claimsUsed),
    ...links
      .filter((link) => link.linkType.includes('claim') && readString(link.metadata.direction) !== 'created')
      .map((link) => link.label ?? link.refText ?? link.refId ?? ''),
  ])
  const claimsCreated = uniqueStrings([
    ...readStringArray(metadata.claims_created ?? metadata.claimsCreated),
    ...links
      .filter((link) => link.linkType.includes('claim') && readString(link.metadata.direction) === 'created')
      .map((link) => link.label ?? link.refText ?? link.refId ?? ''),
  ])
  const notices = readRecordArray(metadata.notices ?? metadata.system_notices ?? metadata.systemNotices)
  const knowledgeTimeline = timelineEvents.filter((event) =>
    event.eventType.includes('knowledge') || event.title.toLowerCase().includes('knowledge'),
  )

  if (
    !knowledgeThinkOutput
    && claimsUsed.length === 0
    && claimsCreated.length === 0
    && notices.length === 0
    && knowledgeTimeline.length === 0
  ) {
    return null
  }

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Context intelligence</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Knowledge Think output, claims, and run notices consumed or produced by this run.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{claimsUsed.length} used</Badge>
          <Badge variant="outline">{claimsCreated.length} created</Badge>
          {notices.length > 0 ? <Badge variant="secondary">{notices.length} notices</Badge> : null}
        </div>
      </div>
      <div className="grid gap-3 p-4 lg:grid-cols-3">
        <div className="rounded-lg border p-3 lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Knowledge Think</p>
          <p className="mt-2 text-sm text-foreground">
            {knowledgeThinkOutput ?? 'No structured Think output stored on run metadata.'}
          </p>
          {knowledgeTimeline.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {knowledgeTimeline.slice(0, 4).map((event) => (
                <Badge key={event.id} variant="outline" className="text-[10px]">
                  {event.title}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notices</p>
          {notices.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No run-scoped notices.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {notices.slice(0, 4).map((notice, index) => (
                <div key={readString(notice.id) ?? index} className="rounded-md bg-muted/50 p-2">
                  <p className="text-xs font-medium">{readString(notice.title) ?? readString(notice.kind) ?? 'Notice'}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {readString(notice.body) ?? readString(notice.message) ?? 'No detail recorded.'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        <ClaimList title="Claims used" claims={claimsUsed} empty="No claim usage recorded." />
        <ClaimList title="Claims created" claims={claimsCreated} empty="No new claim links recorded." />
      </div>
    </section>
  )
}

function ClaimList({
  title,
  claims,
  empty,
}: {
  title: string
  claims: string[]
  empty: string
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {claims.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {claims.slice(0, 10).map((claim) => (
            <Badge key={claim} variant="outline" className="max-w-full truncate text-[10px]">
              {claim}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function TeamOpsDispatchSection({ teamOps }: { teamOps: AgentOpsTeamOpsProjection | null }) {
  if (!teamOps) {
    return (
      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Team Ops dispatch</h3>
        </div>
        <p className="p-4 text-sm text-muted-foreground">
          No Team Ops dispatch projection is available for this run yet.
        </p>
      </section>
    )
  }

  const partialProfiles = teamOps.partialRuntimeProfiles.filter((profile) =>
    teamOps.compatibleRuntimeProfiles.includes(profile),
  )
  const channelCount = teamOps.channelCompatibility.length
  const fullySupportedChannels = teamOps.channelCompatibility.filter((channel) =>
    channel.launchSupported && channel.reportSupported,
  ).length

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Team Ops dispatch</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Centralized runtime/engine-agnostic dispatch decision for this run.
          </p>
        </div>
        <Badge variant="outline">{formatLabel(teamOps.dispatchTier)}</Badge>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Dispatch reason</p>
          <p className="mt-1 text-sm">{teamOps.dispatchReason}</p>
        </div>

        {teamOps.adaptiveDispatch && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Adaptive dispatch
              </p>
              <Badge variant="outline" className="text-[10px]">
                {formatLabel(teamOps.adaptiveDispatch.baseTier)} → {formatLabel(teamOps.adaptiveDispatch.finalTier)}
              </Badge>
              <Badge variant={teamOps.adaptiveDispatch.enabled ? 'secondary' : 'outline'} className="text-[10px]">
                {teamOps.adaptiveDispatch.enabled ? 'Policy/telemetry aware' : 'Static fallback'}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <AdaptiveSignalList title="Policy signals" signals={teamOps.adaptiveDispatch.policySignals} />
              <AdaptiveSignalList title="Telemetry signals" signals={teamOps.adaptiveDispatch.telemetrySignals} />
            </div>
            {(teamOps.adaptiveDispatch.protectedSpecialists.length > 0 || teamOps.adaptiveDispatch.skippedSpecialists.length > 0) && (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <AdaptiveDecisionList title="Protected specialists" decisions={teamOps.adaptiveDispatch.protectedSpecialists} />
                <AdaptiveDecisionList title="Skipped for tuning" decisions={teamOps.adaptiveDispatch.skippedSpecialists} />
              </div>
            )}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Selected specialists
            </h4>
            <Badge variant="outline">{teamOps.specialists.length}</Badge>
          </div>
          {teamOps.specialists.length === 0 ? (
            <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              No specialist profiles selected for this workflow.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {teamOps.specialists.map((specialist) => (
                <div key={specialist.slug} className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{specialist.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatLabel(specialist.category)}</p>
                    </div>
                    {specialist.critical && <Badge variant="outline" className="border-red-500/30 text-red-500">Critical</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {specialist.requiredCapabilities.slice(0, 3).map((capability) => (
                      <Badge key={capability} variant="secondary" className="text-[10px]">
                        {capability}
                      </Badge>
                    ))}
                    {specialist.requiredCapabilities.length > 3 && (
                      <Badge variant="secondary" className="text-[10px]">
                        +{specialist.requiredCapabilities.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Runtime compatibility
            </h4>
            <Badge variant="outline">{teamOps.compatibleRuntimeProfiles.length} compatible</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <RuntimeProfileCard
              label="Compatible"
              profiles={teamOps.compatibleRuntimeProfiles}
              empty="No compatible runtimes recorded."
            />
            <RuntimeProfileCard
              label="Partial warnings"
              profiles={partialProfiles}
              empty="No partial runtime warnings."
              warning
            />
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Blocked profiles</p>
              {teamOps.missingRuntimeProfiles.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No blocked runtime profiles.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {teamOps.missingRuntimeProfiles.map((runtime) => (
                    <div key={runtime.profileId} className="rounded-md bg-background/70 p-2">
                      <p className="text-sm font-medium">{formatLabel(runtime.profileId)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Missing {runtime.missingCapabilities.join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Channel compatibility
            </h4>
            <Badge variant="outline">{fullySupportedChannels}/{channelCount} ready</Badge>
          </div>
          {teamOps.channelCompatibility.length === 0 ? (
            <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              No channel compatibility projection recorded.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {teamOps.channelCompatibility.map((channel) => (
                <div key={channel.channelId} className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{channel.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{channel.channelId}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <CapabilityStatusBadge label="Launch" supported={channel.launchSupported} />
                      <CapabilityStatusBadge label="Report" supported={channel.reportSupported} />
                    </div>
                  </div>
                  {channel.notes.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {channel.notes.map((note) => (
                        <p key={note} className="flex gap-1.5 text-xs text-amber-600">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{note}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Live channel reports
            </h4>
            <Badge variant="outline">{teamOps.channelLaunchStatus.length}</Badge>
          </div>
          {teamOps.channelLaunchStatus.length === 0 ? (
            <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              No channel-launched report has been recorded for this run.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {teamOps.channelLaunchStatus.map((channel) => (
                <div key={`${channel.channelType}:${channel.surfaceId}`} className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{channel.channelLabel}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{channel.surfaceId}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {channel.reportMode ? `${formatLabel(channel.reportMode)} - ` : ''}
                        {channel.launchedAt ? formatDate(channel.launchedAt) : 'Launch time not recorded'}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{formatLabel(channel.status)}</Badge>
                      <Badge variant="secondary" className="text-[10px]">Report {formatLabel(channel.reportStatus)}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function AdaptiveSignalList({ title, signals }: { title: string; signals: string[] }) {
  return (
    <div className="rounded-md bg-background/70 p-2">
      <p className="text-xs font-medium">{title}</p>
      {signals.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No signals.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {signals.slice(0, 4).map((signal) => (
            <li key={signal} className="text-xs text-muted-foreground">{signal}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AdaptiveDecisionList({
  title,
  decisions,
}: {
  title: string
  decisions: AgentOpsTeamOpsAdaptiveDecision[]
}) {
  return (
    <div className="rounded-md bg-background/70 p-2">
      <p className="text-xs font-medium">{title}</p>
      {decisions.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">None.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {decisions.slice(0, 4).map((decision) => (
            <li key={decision.slug} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{decision.name}</span>: {decision.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RuntimeProfileCard({
  label,
  profiles,
  empty,
  warning = false,
}: {
  label: string
  profiles: string[]
  empty: string
  warning?: boolean
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {profiles.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {profiles.map((profile) => (
            <Badge
              key={profile}
              variant={warning ? 'outline' : 'secondary'}
              className={cn('text-[10px]', warning && 'border-amber-500/40 text-amber-600')}
            >
              {formatLabel(profile)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function CapabilityStatusBadge({ label, supported }: { label: string; supported: boolean }) {
  return (
    <Badge
      variant={supported ? 'secondary' : 'outline'}
      className={cn('text-[10px]', !supported && 'border-amber-500/40 text-amber-600')}
    >
      {label}: {supported ? 'Ready' : 'Limited'}
    </Badge>
  )
}

function EvidenceArtifactRow({
  artifact,
  dense = false,
}: {
  artifact: AgentOpsArtifact
  dense?: boolean
}) {
  const sessionKey = readString(artifact.content.session_key) ?? readString(artifact.content.sessionKey)
  const source = readString(artifact.content.source) ?? readString(artifact.content.provider)
  const preview = buildArtifactPreview(artifact)

  return (
    <div className={cn('rounded-lg', dense ? 'border bg-muted/30 p-3' : '')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{artifact.title}</p>
          {artifact.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{artifact.summary}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{formatDate(artifact.createdAt)}</span>
            {sessionKey && <span className="font-mono">session {sessionKey}</span>}
            {source && <span>{source}</span>}
            {artifact.checksum && <span className="font-mono">sha {artifact.checksum.slice(0, 10)}</span>}
          </div>
        </div>
        <Badge variant="outline">{formatLabel(artifact.type)}</Badge>
      </div>
      {preview && (
        <pre className="mt-3 max-h-36 overflow-auto rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
          {preview}
        </pre>
      )}
      {artifact.uri && (
        <a
          href={artifact.uri}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-xs text-primary hover:underline"
        >
          Open artifact
        </a>
      )}
    </div>
  )
}

function buildArtifactPreview(artifact: AgentOpsArtifact): string | null {
  const content = artifact.content
  if (!content || Object.keys(content).length === 0) return null
  const preview = {
    ...pickKnownArtifactFields(content),
    ...(artifact.type === 'console_log' || artifact.type === 'network_log'
      ? { records: Array.isArray(content.records) ? content.records.slice(0, 3) : undefined }
      : {}),
  }
  const compactPreview = Object.fromEntries(
    Object.entries(preview).filter(([, value]) =>
      value !== undefined && value !== null && (typeof value !== 'string' || value !== ''),
    ),
  )
  if (Object.keys(compactPreview).length === 0) return JSON.stringify(content, null, 2).slice(0, 1_200)
  return JSON.stringify(compactPreview, null, 2)
}

function pickKnownArtifactFields(content: Record<string, unknown>): Record<string, unknown> {
  return {
    url: content.url ?? content.target_url ?? content.targetUrl,
    status: content.status,
    provider: content.provider,
    session_key: content.session_key ?? content.sessionKey,
    console_errors: content.console_errors ?? content.consoleErrorCount,
    page_errors: content.page_errors ?? content.pageErrorCount,
    request_count: content.request_count ?? content.requestCount,
    duration_ms: content.duration_ms ?? content.durationMs,
    screenshot_uri: content.screenshot_uri ?? content.screenshotUri,
    trace_uri: content.trace_uri ?? content.traceUri,
  }
}

function isBrowserQaEvidenceArtifact(artifact: AgentOpsArtifact): boolean {
  if (['screenshot', 'console_log', 'network_log', 'perf_metric', 'trace'].includes(artifact.type)) return true
  return Boolean(
    readString(artifact.content.session_key)
    || readString(artifact.content.sessionKey)
    || readString(artifact.content.browser_qa_session_key)
    || readString(artifact.content.browserQaSessionKey),
  )
}

function artifactBelongsToBrowserSession(
  artifact: AgentOpsArtifact,
  session: AgentOpsBrowserQaSession,
): boolean {
  if (session.lastArtifactId && artifact.id === session.lastArtifactId) return true
  const content = artifact.content
  const sessionKey =
    readString(content.session_key)
    ?? readString(content.sessionKey)
    ?? readString(content.browser_qa_session_key)
    ?? readString(content.browserQaSessionKey)
  if (sessionKey && sessionKey === session.sessionKey) return true
  const targetUrl = readString(content.target_url) ?? readString(content.targetUrl) ?? readString(content.url)
  return Boolean(targetUrl && targetUrl === session.targetUrl)
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}
