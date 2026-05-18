import { describe, expect, it } from 'vitest'
import {
  APP_SERVICE_STAGING_EVIDENCE_GATES,
  evaluateAppServiceStagingEvidence,
  summarizeAppServiceStagingEvidenceGates,
} from '../staging-evidence-core'

describe('staging-evidence-core', () => {
  it('defines the Step 2 staging evidence gates', () => {
    expect(summarizeAppServiceStagingEvidenceGates()).toMatchObject({
      gateCount: 9,
      requiredCommandCount: 8,
    })
    expect(APP_SERVICE_STAGING_EVIDENCE_GATES.map((gate) => gate.id)).toEqual([
      'staging_migration_dry_run',
      'staging_db_backup_verified',
      'staging_seeded_smoke_app',
      'staging_live_public_runtime_smoke',
      'staging_authenticated_cockpit_smoke',
      'staging_rollback_drill',
      'staging_kill_switch_drill',
      'seven_day_beta_metrics',
      'external_runbook_reviewer',
    ])
  })

  it('reports missing staging evidence and command proofs', () => {
    const report = evaluateAppServiceStagingEvidence({
      evidence: {
        staging_migration_dry_run: ['migration_plan_output'],
      },
      commandResults: {},
    })

    expect(report.ready).toBe(false)
    expect(report.results.find((result) => result.id === 'staging_migration_dry_run')).toMatchObject({
      ready: false,
      missingEvidence: ['schema_diff_clean', 'rls_policy_check'],
      missingCommands: ['npm run app-service:migration'],
    })
  })

  it('passes when every gate has required evidence and commands', () => {
    const evidence = Object.fromEntries(
      APP_SERVICE_STAGING_EVIDENCE_GATES.map((gate) => [gate.id, gate.requiredEvidence]),
    )
    const commandResults = Object.fromEntries(
      APP_SERVICE_STAGING_EVIDENCE_GATES.map((gate) => [gate.id, gate.requiredCommands]),
    )

    expect(evaluateAppServiceStagingEvidence({ evidence, commandResults }).ready).toBe(true)
  })
})
