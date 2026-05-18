import type { FeatureFlag } from '@/lib/features'

export type WorkGraphProductionArea =
  | 'feature_rollout'
  | 'migration_rls'
  | 'drift_gate'
  | 'load_budget'
  | 'runtime_matrix'
  | 'rollback'
  | 'pm_federation'
  | 'runbook'

export type WorkGraphProductionStatus = 'pass' | 'warn' | 'fail' | 'manual_required'

export interface WorkGraphProductionCheck {
  slug: string
  area: WorkGraphProductionArea
  status: WorkGraphProductionStatus
  summary: string
  evidence: string[]
  nextAction?: string
}

export interface WorkGraphProductionHardeningReport {
  status: WorkGraphProductionStatus
  checks: WorkGraphProductionCheck[]
  blockingChecks: WorkGraphProductionCheck[]
}

export interface WorkGraphLoadBudgetInput {
  goals: number
  workItems: number
  boardItems: number
  relationEdges: number
  durationMs: number
  maxDurationMs: number
}

export interface WorkGraphRuntimeMatrixInput {
  hermesShared: boolean
  hermesDedicated: boolean
  hermesByo: boolean
  openclawShared: boolean
  openclawDedicated: boolean
  openclawByo: boolean
}

export interface WorkGraphRollbackInput {
  killSwitchVerified: boolean
  apiWritesBlocked: boolean
  existingHumanQueueReadable: boolean
  pmSyncCanPause: boolean
}

export interface WorkGraphPmFederationSafetyInput {
  providerConfigsCentralized: boolean
  fieldAuthorityEnforced: boolean
  conflictsReviewable: boolean
  providerWebhooksIdempotent: boolean
}

export const WORK_GRAPH_REQUIRED_FEATURE_FLAGS: FeatureFlag[] = [
  'workGraph',
  'workGraphBoards',
  'workGraphGoals',
  'workGraphAiPlanning',
  'workGraphExternalPmFederation',
  'workGraphEngineFacets',
]

export const WORK_GRAPH_REQUIRED_PRODUCTION_MIGRATIONS = [
  '20260408200000_human_work_items.sql',
  '20260508200000_lucid_work_graph.sql',
] as const

export const WORK_GRAPH_PRODUCTION_RUNBOOKS = [
  'work-graph-rollback',
  'work-graph-pm-federation-conflicts',
  'work-graph-agent-ops-checkout-recovery',
  'work-graph-board-status-drift',
] as const

export function buildWorkGraphFeatureRolloutCheck(availableFlags: string[]): WorkGraphProductionCheck {
  const available = new Set(availableFlags)
  const missing = WORK_GRAPH_REQUIRED_FEATURE_FLAGS.filter((flag) => !available.has(flag))

  return {
    slug: 'work-graph-feature-rollout-controls',
    area: 'feature_rollout',
    status: missing.length ? 'fail' : 'pass',
    summary: missing.length
      ? 'Work Graph rollout controls are incomplete.'
      : 'Work Graph has centralized feature flags plus a server-side kill switch for rollback.',
    evidence: [
      `requiredFlags=${WORK_GRAPH_REQUIRED_FEATURE_FLAGS.join(',')}`,
      `missingFlags=${missing.join(',') || 'none'}`,
      'killSwitch=WORK_GRAPH_KILL_SWITCH',
    ],
    nextAction: missing.length ? 'Add the missing flags before production promotion.' : undefined,
  }
}

export function buildWorkGraphMigrationRlsCheck(appliedMigrations: string[]): WorkGraphProductionCheck {
  const applied = new Set(appliedMigrations)
  const missing = WORK_GRAPH_REQUIRED_PRODUCTION_MIGRATIONS.filter((migration) => !applied.has(migration))

  return {
    slug: 'work-graph-migration-rls-readiness',
    area: 'migration_rls',
    status: missing.length ? 'manual_required' : 'pass',
    summary: missing.length
      ? 'Work Graph migrations/RLS must be verified in the target environment.'
      : 'Required Work Graph migrations are present in the checked environment.',
    evidence: [
      `required=${WORK_GRAPH_REQUIRED_PRODUCTION_MIGRATIONS.length}`,
      `missing=${missing.join(',') || 'none'}`,
      'RLS requires member read, project editor write, service-role webhook/agent-ops paths, and denied cross-org access.',
    ],
    nextAction: missing.length ? 'Apply missing migrations and run the staging RLS checklist.' : undefined,
  }
}

export function buildWorkGraphDriftGateCheck(input: {
  centralizedDbAccess: boolean
  noEngineSpecificBoardPaths: boolean
  noDirectProviderWrites: boolean
  noCompletionBypass: boolean
}): WorkGraphProductionCheck {
  const failures = [
    input.centralizedDbAccess ? null : 'db_access_not_centralized',
    input.noEngineSpecificBoardPaths ? null : 'engine_specific_board_paths',
    input.noDirectProviderWrites ? null : 'direct_provider_writes',
    input.noCompletionBypass ? null : 'completion_bypass',
  ].filter((failure): failure is string => Boolean(failure))

  return {
    slug: 'work-graph-static-drift-gate',
    area: 'drift_gate',
    status: failures.length ? 'fail' : 'pass',
    summary: failures.length
      ? 'Static drift checks found Work Graph architecture bypasses.'
      : 'Static drift checks keep Work Graph centralized, engine-agnostic, and completion-safe.',
    evidence: [`failures=${failures.join(',') || 'none'}`],
    nextAction: failures.length ? 'Route new code through src/lib/work-graph and existing human work item completion APIs.' : undefined,
  }
}

export function buildWorkGraphLoadBudgetCheck(input: WorkGraphLoadBudgetInput): WorkGraphProductionCheck {
  const tooLarge =
    input.goals > 500 ||
    input.workItems > 5_000 ||
    input.boardItems > 5_000 ||
    input.relationEdges > 20_000
  const tooSlow = input.durationMs > input.maxDurationMs

  return {
    slug: 'work-graph-board-planning-load-budget',
    area: 'load_budget',
    status: tooLarge || tooSlow ? 'warn' : 'pass',
    summary: tooLarge || tooSlow
      ? 'Work Graph load is approaching limits and needs pagination, caching, or denormalized projections.'
      : 'Work Graph load stays inside the bounded read model budget.',
    evidence: [
      `goals=${input.goals}`,
      `workItems=${input.workItems}`,
      `boardItems=${input.boardItems}`,
      `relationEdges=${input.relationEdges}`,
      `durationMs=${input.durationMs}`,
      `maxDurationMs=${input.maxDurationMs}`,
    ],
    nextAction: tooLarge || tooSlow ? 'Keep list endpoints paginated and refresh board read models via projections.' : undefined,
  }
}

export function buildWorkGraphRuntimeMatrixCheck(input: WorkGraphRuntimeMatrixInput): WorkGraphProductionCheck {
  const missing = Object.entries(input)
    .filter(([, passed]) => !passed)
    .map(([key]) => key)

  return {
    slug: 'work-graph-runtime-engine-matrix',
    area: 'runtime_matrix',
    status: missing.length ? 'manual_required' : 'pass',
    summary: missing.length
      ? 'Live runtime matrix still needs environment-specific verification.'
      : 'Hermes/OpenClaw shared, dedicated, and BYO paths are verified for Work Graph flows.',
    evidence: [`missing=${missing.join(',') || 'none'}`],
    nextAction: missing.length ? 'Run shared/dedicated/BYO live smoke for Hermes and OpenClaw before promotion.' : undefined,
  }
}

export function buildWorkGraphRollbackCheck(input: WorkGraphRollbackInput): WorkGraphProductionCheck {
  const failures = [
    input.killSwitchVerified ? null : 'kill_switch',
    input.apiWritesBlocked ? null : 'api_write_block',
    input.existingHumanQueueReadable ? null : 'human_queue_readability',
    input.pmSyncCanPause ? null : 'pm_sync_pause',
  ].filter((failure): failure is string => Boolean(failure))

  return {
    slug: 'work-graph-rollback-safety',
    area: 'rollback',
    status: failures.length ? 'fail' : 'pass',
    summary: failures.length
      ? 'Work Graph rollback can still affect the existing human work queue.'
      : 'Work Graph can be disabled without losing the existing human work queue.',
    evidence: [`failures=${failures.join(',') || 'none'}`],
    nextAction: failures.length ? 'Verify the kill switch blocks Work Graph writes while project work queue reads continue.' : undefined,
  }
}

export function buildWorkGraphPmFederationSafetyCheck(input: WorkGraphPmFederationSafetyInput): WorkGraphProductionCheck {
  const failures = [
    input.providerConfigsCentralized ? null : 'provider_config_not_centralized',
    input.fieldAuthorityEnforced ? null : 'field_authority_not_enforced',
    input.conflictsReviewable ? null : 'conflicts_not_reviewable',
    input.providerWebhooksIdempotent ? null : 'webhook_idempotency',
  ].filter((failure): failure is string => Boolean(failure))

  return {
    slug: 'work-graph-pm-federation-safety',
    area: 'pm_federation',
    status: failures.length ? 'fail' : 'pass',
    summary: failures.length
      ? 'External PM federation is missing a safety boundary.'
      : 'External PM tools federate through centralized config, field authority, and reviewable conflicts.',
    evidence: [`failures=${failures.join(',') || 'none'}`],
    nextAction: failures.length ? 'Keep provider-specific behavior in PM sync/federation adapters, not Work Graph core.' : undefined,
  }
}

export function buildWorkGraphRunbookCheck(availableRunbooks: string[]): WorkGraphProductionCheck {
  const available = new Set(availableRunbooks)
  const missing = WORK_GRAPH_PRODUCTION_RUNBOOKS.filter((runbook) => !available.has(runbook))

  return {
    slug: 'work-graph-production-runbooks',
    area: 'runbook',
    status: missing.length ? 'fail' : 'pass',
    summary: missing.length
      ? 'Work Graph production runbooks are incomplete.'
      : 'Work Graph runbooks cover rollback, PM conflicts, checkout recovery, and board/status drift.',
    evidence: [`missing=${missing.join(',') || 'none'}`],
    nextAction: missing.length ? 'Add missing runbook sections before production rollout.' : undefined,
  }
}

export function buildWorkGraphProductionHardeningReport(
  checks: WorkGraphProductionCheck[],
): WorkGraphProductionHardeningReport {
  const blockingChecks = checks.filter((check) => check.status === 'fail' || check.status === 'manual_required')
  const hasFail = blockingChecks.some((check) => check.status === 'fail')
  const hasManual = blockingChecks.some((check) => check.status === 'manual_required')
  const hasWarn = checks.some((check) => check.status === 'warn')

  return {
    status: hasFail ? 'fail' : hasManual ? 'manual_required' : hasWarn ? 'warn' : 'pass',
    checks,
    blockingChecks,
  }
}
