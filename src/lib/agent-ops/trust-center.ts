import type { AgentOpsRun, AgentOpsWorkflowId } from './workflow-types'

export type AgentOpsAutonomyState = 'ready' | 'needs_review' | 'blocked'
export type AgentOpsSignalState = 'clear' | 'watch' | 'blocked'
export type AgentOpsTrustSignalId =
  | 'readiness'
  | 'quality'
  | 'reliability'
  | 'change_safety'
  | 'policy'

export interface AgentOpsTrustAction {
  id: string
  signal: AgentOpsTrustSignalId
  severity: 'info' | 'warning' | 'critical'
  title: string
  reason: string
  impact: string
  ctaLabel: string
  workflowId?: AgentOpsWorkflowId
  runId?: string
  href?: string
}

export interface AgentOpsTrustSignal {
  id: AgentOpsTrustSignalId
  label: string
  state: AgentOpsSignalState
  count: number
  summary: string
  actions: AgentOpsTrustAction[]
}

export interface AgentOpsTrustCenterModel {
  state: AgentOpsAutonomyState
  title: string
  summary: string
  confidence: 'high' | 'medium' | 'low'
  autonomyLevel: 'observe' | 'assist' | 'autopilot' | 'restricted'
  confidenceStack: Array<{
    label: string
    state: 'present' | 'missing' | 'warning'
  }>
  recommendedAction: AgentOpsTrustAction
  signals: AgentOpsTrustSignal[]
}

interface AgentOpsTrustOverview {
  summary?: {
    teamSetupRequiredMissingCount?: number
    openSecurityAttemptCount?: number
    blockingBrowserSecurityEventCount?: number
    latestEvalScore?: number | null
    latestEvalReceiptVerdict?: 'pass' | 'fail' | 'inconclusive' | string | null
    askedDecisionCount?: number
    silentDecisionCount?: number
    completionMatrixGapCount?: number
    performanceHealth?: 'healthy' | 'watch' | 'breach' | 'insufficient_data'
    safetyMode?: string | null
  }
  projectPolicy?: {
    safetyMode?: string | null
  } | null
  performanceHealth?: {
    status?: 'healthy' | 'watch' | 'breach' | 'insufficient_data'
  } | null
}

interface AgentOpsWorkflowSummaryLike {
  id: AgentOpsWorkflowId
  name?: string
}

const ACTION_PRIORITY = {
  critical: 0,
  warning: 1,
  info: 2,
} satisfies Record<AgentOpsTrustAction['severity'], number>

function findWorkflow(
  workflows: AgentOpsWorkflowSummaryLike[],
  preferred: AgentOpsWorkflowId[],
): AgentOpsWorkflowId | undefined {
  return preferred.find((id) => workflows.some((workflow) => workflow.id === id))
}

function rankActions(actions: AgentOpsTrustAction[]): AgentOpsTrustAction[] {
  return [...actions].sort((a, b) => {
    const severityDelta = ACTION_PRIORITY[a.severity] - ACTION_PRIORITY[b.severity]
    if (severityDelta !== 0) return severityDelta
    return a.title.localeCompare(b.title)
  })
}

function signalState(actions: AgentOpsTrustAction[]): AgentOpsSignalState {
  if (actions.some((action) => action.severity === 'critical')) return 'blocked'
  if (actions.some((action) => action.severity === 'warning')) return 'watch'
  return 'clear'
}

export function buildAgentOpsTrustCenterModel(input: {
  overview: AgentOpsTrustOverview | null
  runs: AgentOpsRun[]
  workflows: AgentOpsWorkflowSummaryLike[]
}): AgentOpsTrustCenterModel {
  const { overview, runs, workflows } = input
  const summary = overview?.summary
  const safetyMode = summary?.safetyMode ?? overview?.projectPolicy?.safetyMode ?? 'normal'
  const performanceHealth = summary?.performanceHealth ?? overview?.performanceHealth?.status ?? 'insufficient_data'
  const latestEvalReceipt = summary?.latestEvalReceiptVerdict ?? null
  const failedRuns = runs.filter((run) => run.status === 'failed' || run.status === 'cancelled')
  const blockedRuns = runs.filter((run) => run.status === 'blocked')
  const hasEvalEvidence = Boolean(latestEvalReceipt || typeof summary?.latestEvalScore === 'number')

  const readinessActions: AgentOpsTrustAction[] = []
  const qualityActions: AgentOpsTrustAction[] = []
  const reliabilityActions: AgentOpsTrustAction[] = []
  const changeActions: AgentOpsTrustAction[] = []
  const policyActions: AgentOpsTrustAction[] = []

  const missingSetup = summary?.teamSetupRequiredMissingCount ?? 0
  if (missingSetup > 0) {
    readinessActions.push({
      id: 'readiness:missing-setup',
      signal: 'readiness',
      severity: 'critical',
      title: `${missingSetup} launch item${missingSetup === 1 ? '' : 's'} missing`,
      reason: 'One or more required setup items are missing.',
      impact: 'Finish setup before letting agents take more customer-facing action.',
      ctaLabel: 'Check setup',
      workflowId: findWorkflow(workflows, ['release-check', 'review', 'qa']),
    })
  }

  if (!hasEvalEvidence) {
    qualityActions.push({
      id: 'quality:no-eval',
      signal: 'quality',
      severity: 'warning',
      title: 'Quality has not been checked recently',
      reason: 'Lucid has no recent quality result for this scope.',
      impact: 'Run a quick check before increasing autonomy or shipping behavior changes.',
      ctaLabel: 'Check quality',
      workflowId: findWorkflow(workflows, ['qa', 'model-benchmark', 'review']),
    })
  } else if (latestEvalReceipt === 'fail') {
    qualityActions.push({
      id: 'quality:failed-eval',
      signal: 'quality',
      severity: 'critical',
      title: 'Latest quality check failed',
      reason: 'The latest quality result did not pass.',
      impact: 'Agent behavior should be reviewed before more customer-facing work runs.',
      ctaLabel: 'Review failure',
      workflowId: findWorkflow(workflows, ['qa', 'review']),
    })
  }

  if (failedRuns.length > 0) {
    const latest = failedRuns[0]
    reliabilityActions.push({
      id: 'reliability:failed-runs',
      signal: 'reliability',
      severity: 'warning',
      title: `${failedRuns.length} failed check${failedRuns.length === 1 ? '' : 's'}`,
      reason: 'One or more checks failed or were cancelled.',
      impact: 'Investigate the failed check before assuming agents are operating normally.',
      ctaLabel: 'Investigate failure',
      workflowId: findWorkflow(workflows, ['investigate', 'review']),
      runId: latest?.id,
    })
  }

  if (blockedRuns.length > 0) {
    reliabilityActions.push({
      id: 'reliability:blocked-runs',
      signal: 'reliability',
      severity: 'critical',
      title: `${blockedRuns.length} blocked check${blockedRuns.length === 1 ? '' : 's'}`,
      reason: 'A check is blocked and needs operator or policy review.',
      impact: 'Resolve blockers before agents continue sensitive work.',
      ctaLabel: 'Open blocker',
      runId: blockedRuns[0]?.id,
    })
  }

  const askedDecisions = summary?.askedDecisionCount ?? 0
  if (askedDecisions > 0) {
    changeActions.push({
      id: 'changes:pending-decisions',
      signal: 'change_safety',
      severity: 'warning',
      title: `${askedDecisions} decision${askedDecisions === 1 ? '' : 's'} waiting`,
      reason: 'An operator decision is required before a change can continue.',
      impact: 'Review decisions so reversible and one-way changes do not stall or drift.',
      ctaLabel: 'Review decisions',
      workflowId: findWorkflow(workflows, ['review', 'plan-ceo-review']),
    })
  }

  const completionGaps = summary?.completionMatrixGapCount ?? 0
  if (completionGaps > 0) {
    changeActions.push({
      id: 'changes:evidence-gaps',
      signal: 'change_safety',
      severity: 'info',
      title: `${completionGaps} evidence gap${completionGaps === 1 ? '' : 's'}`,
      reason: 'Some checks are missing source, test, doc, or quality-gate evidence.',
      impact: 'Use diagnostics before promoting these checks into stricter autonomy policies.',
      ctaLabel: 'Open diagnostics',
    })
  }

  const securityIssues = (summary?.openSecurityAttemptCount ?? 0) + (summary?.blockingBrowserSecurityEventCount ?? 0)
  if (securityIssues > 0) {
    policyActions.push({
      id: 'policy:security-events',
      signal: 'policy',
      severity: (summary?.blockingBrowserSecurityEventCount ?? 0) > 0 ? 'critical' : 'warning',
      title: `${securityIssues} safety signal${securityIssues === 1 ? '' : 's'}`,
      reason: 'Security attempts or browser policy events were recorded.',
      impact: 'Review policy events before expanding browser, money-moving, or external actions.',
      ctaLabel: 'Review safety',
      workflowId: findWorkflow(workflows, ['security-audit', 'cso']),
    })
  }

  if (safetyMode === 'freeze') {
    policyActions.push({
      id: 'policy:freeze',
      signal: 'policy',
      severity: 'critical',
      title: 'Autonomy is frozen',
      reason: 'The current safety mode is freeze.',
      impact: 'Agents should stay restricted until policy is changed by an operator.',
      ctaLabel: 'Open policy settings',
    })
  }

  if (performanceHealth === 'breach') {
    policyActions.push({
      id: 'policy:performance-breach',
      signal: 'policy',
      severity: 'critical',
      title: 'Performance budget breached',
      reason: 'Latency, cost, token, or failure budget is outside policy.',
      impact: 'Review performance before increasing check volume or autonomy.',
      ctaLabel: 'Review budget',
      workflowId: findWorkflow(workflows, ['canary', 'monitor-page', 'qa']),
    })
  } else if (performanceHealth === 'watch') {
    policyActions.push({
      id: 'policy:performance-watch',
      signal: 'policy',
      severity: 'warning',
      title: 'Performance needs watching',
      reason: 'One or more performance signals is close to policy limits.',
      impact: 'Run a check or tighten limits before scaling agent activity.',
      ctaLabel: 'Run canary check',
      workflowId: findWorkflow(workflows, ['canary', 'monitor-page']),
    })
  }

  const signals: AgentOpsTrustSignal[] = [
    {
      id: 'readiness',
      label: 'Readiness',
      actions: rankActions(readinessActions),
      state: signalState(readinessActions),
      count: readinessActions.length,
      summary: readinessActions[0]?.reason ?? 'Required setup checks are clear.',
    },
    {
      id: 'quality',
      label: 'Quality',
      actions: rankActions(qualityActions),
      state: signalState(qualityActions),
      count: qualityActions.length,
      summary: qualityActions[0]?.reason ?? 'Quality evidence is present.',
    },
    {
      id: 'reliability',
      label: 'Reliability',
      actions: rankActions(reliabilityActions),
      state: signalState(reliabilityActions),
      count: reliabilityActions.length,
      summary: reliabilityActions[0]?.reason ?? 'No failed or blocked checks need attention.',
    },
    {
      id: 'change_safety',
      label: 'Change safety',
      actions: rankActions(changeActions),
      state: signalState(changeActions),
      count: changeActions.length,
      summary: changeActions[0]?.reason ?? 'No decisions are blocking safe changes.',
    },
    {
      id: 'policy',
      label: 'Policy',
      actions: rankActions(policyActions),
      state: signalState(policyActions),
      count: policyActions.length,
      summary: policyActions[0]?.reason ?? 'Safety and performance policy signals are clear.',
    },
  ]

  const actions = rankActions(signals.flatMap((signal) => signal.actions))
  const criticalCount = actions.filter((action) => action.severity === 'critical').length
  const warningCount = actions.filter((action) => action.severity === 'warning').length
  const state: AgentOpsAutonomyState = criticalCount > 0
    ? 'blocked'
    : warningCount > 0
      ? 'needs_review'
      : 'ready'
  const confidence = state === 'blocked'
    ? 'low'
    : hasEvalEvidence && failedRuns.length === 0 && securityIssues === 0 && performanceHealth !== 'watch'
      ? 'high'
      : 'medium'
  const autonomyLevel = state === 'blocked'
    ? 'restricted'
    : state === 'needs_review'
      ? 'assist'
      : confidence === 'high'
        ? 'autopilot'
        : 'observe'

  const maintenanceAction: AgentOpsTrustAction = {
    id: 'maintenance:fresh-check',
    signal: 'quality',
    severity: 'info',
    title: 'Run a fresh quality check',
    reason: 'No urgent issues need review.',
    impact: 'A fresh check keeps autonomy evidence current for future decisions.',
    ctaLabel: 'Run fresh check',
    workflowId: findWorkflow(workflows, ['qa', 'review', 'release-check']),
  }

  return {
    state,
    title: state === 'blocked'
      ? 'Pause customer-facing autonomy.'
      : state === 'needs_review'
        ? 'Run one check before expanding autonomy.'
        : 'Agents can keep operating.',
    summary: state === 'ready'
      ? 'Recent signals look clear. Keep monitoring results as agents run.'
      : state === 'blocked'
        ? 'Lucid found a blocker. Review it before agents take more external action.'
        : 'Agents can keep assisting, but Lucid needs fresher evidence before more customer-facing work.',
    confidence,
    autonomyLevel,
    confidenceStack: [
      { label: 'Fresh eval', state: hasEvalEvidence ? 'present' : 'missing' },
      { label: 'No open blockers', state: criticalCount > 0 ? 'missing' : 'present' },
      { label: 'Policy clear', state: policyActions.some((action) => action.severity === 'critical') ? 'missing' : policyActions.length > 0 ? 'warning' : 'present' },
      { label: 'Runs healthy', state: failedRuns.length > 0 || blockedRuns.length > 0 ? 'warning' : 'present' },
      { label: 'Run history', state: runs.length > 0 ? 'present' : 'missing' },
    ],
    recommendedAction: actions[0] ?? maintenanceAction,
    signals,
  }
}
