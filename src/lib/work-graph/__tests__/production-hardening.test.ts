import { describe, expect, it } from 'vitest'

import {
  WORK_GRAPH_PRODUCTION_RUNBOOKS,
  WORK_GRAPH_REQUIRED_FEATURE_FLAGS,
  WORK_GRAPH_REQUIRED_PRODUCTION_MIGRATIONS,
  buildWorkGraphDriftGateCheck,
  buildWorkGraphFeatureRolloutCheck,
  buildWorkGraphLoadBudgetCheck,
  buildWorkGraphMigrationRlsCheck,
  buildWorkGraphPmFederationSafetyCheck,
  buildWorkGraphProductionHardeningReport,
  buildWorkGraphRollbackCheck,
  buildWorkGraphRunbookCheck,
  buildWorkGraphRuntimeMatrixCheck,
} from '../production-hardening'

describe('Work Graph production hardening gates', () => {
  it('requires centralized rollout flags and migration/RLS verification', () => {
    expect(buildWorkGraphFeatureRolloutCheck(WORK_GRAPH_REQUIRED_FEATURE_FLAGS).status).toBe('pass')

    const migrationCheck = buildWorkGraphMigrationRlsCheck(WORK_GRAPH_REQUIRED_PRODUCTION_MIGRATIONS.slice(0, -1))
    const report = buildWorkGraphProductionHardeningReport([
      buildWorkGraphFeatureRolloutCheck(WORK_GRAPH_REQUIRED_FEATURE_FLAGS),
      migrationCheck,
    ])

    expect(migrationCheck.status).toBe('manual_required')
    expect(migrationCheck.evidence.join(' ')).toContain('RLS')
    expect(report.status).toBe('manual_required')
    expect(report.blockingChecks.map((check) => check.slug)).toContain('work-graph-migration-rls-readiness')
  })

  it('keeps architecture drift checks explicit and blocking', () => {
    const passing = buildWorkGraphDriftGateCheck({
      centralizedDbAccess: true,
      noEngineSpecificBoardPaths: true,
      noDirectProviderWrites: true,
      noCompletionBypass: true,
    })
    expect(passing.status).toBe('pass')

    const failing = buildWorkGraphDriftGateCheck({
      centralizedDbAccess: true,
      noEngineSpecificBoardPaths: false,
      noDirectProviderWrites: true,
      noCompletionBypass: false,
    })

    expect(failing.status).toBe('fail')
    expect(failing.evidence.join(' ')).toContain('engine_specific_board_paths')
    expect(failing.evidence.join(' ')).toContain('completion_bypass')
  })

  it('warns on load pressure without blocking small bounded read models', () => {
    expect(buildWorkGraphLoadBudgetCheck({
      goals: 30,
      workItems: 300,
      boardItems: 300,
      relationEdges: 900,
      durationMs: 85,
      maxDurationMs: 200,
    }).status).toBe('pass')

    const warning = buildWorkGraphLoadBudgetCheck({
      goals: 700,
      workItems: 6_000,
      boardItems: 6_000,
      relationEdges: 25_000,
      durationMs: 420,
      maxDurationMs: 200,
    })
    expect(warning.status).toBe('warn')
    expect(warning.nextAction).toContain('paginated')
  })

  it('separates live matrix requirements from deterministic local gates', () => {
    const matrix = buildWorkGraphRuntimeMatrixCheck({
      hermesShared: true,
      hermesDedicated: true,
      hermesByo: false,
      openclawShared: true,
      openclawDedicated: false,
      openclawByo: false,
    })

    expect(matrix.status).toBe('manual_required')
    expect(matrix.evidence.join(' ')).toContain('hermesByo')
    expect(matrix.evidence.join(' ')).toContain('openclawDedicated')
  })

  it('requires rollback and external PM safety before production', () => {
    expect(buildWorkGraphRollbackCheck({
      killSwitchVerified: true,
      apiWritesBlocked: true,
      existingHumanQueueReadable: true,
      pmSyncCanPause: true,
    }).status).toBe('pass')

    const pmSafety = buildWorkGraphPmFederationSafetyCheck({
      providerConfigsCentralized: true,
      fieldAuthorityEnforced: false,
      conflictsReviewable: true,
      providerWebhooksIdempotent: false,
    })

    expect(pmSafety.status).toBe('fail')
    expect(pmSafety.evidence.join(' ')).toContain('field_authority_not_enforced')
  })

  it('documents the runbook surface as a release requirement', () => {
    expect(buildWorkGraphRunbookCheck(WORK_GRAPH_PRODUCTION_RUNBOOKS).status).toBe('pass')
    expect(buildWorkGraphRunbookCheck(WORK_GRAPH_PRODUCTION_RUNBOOKS.slice(0, -1)).status).toBe('fail')
  })
})
