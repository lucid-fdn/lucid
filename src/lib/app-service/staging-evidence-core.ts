export type AppServiceStagingEvidenceGateId =
  | 'staging_migration_dry_run'
  | 'staging_db_backup_verified'
  | 'staging_seeded_smoke_app'
  | 'staging_live_public_runtime_smoke'
  | 'staging_authenticated_cockpit_smoke'
  | 'staging_rollback_drill'
  | 'staging_kill_switch_drill'
  | 'seven_day_beta_metrics'
  | 'external_runbook_reviewer'

export interface AppServiceStagingEvidenceGate {
  id: AppServiceStagingEvidenceGateId
  label: string
  requiredEvidence: readonly string[]
  requiredCommands: readonly string[]
}

export interface AppServiceStagingEvidenceInput {
  evidence?: Partial<Record<AppServiceStagingEvidenceGateId, readonly string[]>>
  commandResults?: Partial<Record<AppServiceStagingEvidenceGateId, readonly string[]>>
}

export interface AppServiceStagingEvidenceResult {
  id: AppServiceStagingEvidenceGateId
  ready: boolean
  missingEvidence: string[]
  missingCommands: string[]
}

export interface AppServiceStagingEvidenceReport {
  ready: boolean
  results: AppServiceStagingEvidenceResult[]
}

export const APP_SERVICE_STAGING_EVIDENCE_GATES = [
  {
    id: 'staging_migration_dry_run',
    label: 'App Foundry foundation migration was dry-run against staging.',
    requiredEvidence: ['migration_plan_output', 'schema_diff_clean', 'rls_policy_check'],
    requiredCommands: ['npm run app-service:migration'],
  },
  {
    id: 'staging_db_backup_verified',
    label: 'Staging database backup was created and restore-verified before migration.',
    requiredEvidence: ['backup_snapshot_id', 'restore_verification_log', 'backup_owner_signoff'],
    requiredCommands: [],
  },
  {
    id: 'staging_seeded_smoke_app',
    label: 'Deterministic App Foundry smoke fixture was seeded in staging.',
    requiredEvidence: ['smoke_app_id', 'smoke_app_slug', 'smoke_org_id', 'smoke_project_id'],
    requiredCommands: ['npm run app-service:seed-smoke'],
  },
  {
    id: 'staging_live_public_runtime_smoke',
    label: 'Live staging public app/runtime smoke passed.',
    requiredEvidence: ['public_shell_200', 'public_config_cors_204', 'public_config_200', 'public_lead_202'],
    requiredCommands: ['npm run test:app-runtime-public-smoke', 'npm run test:app-foundry-beta-smoke'],
  },
  {
    id: 'staging_authenticated_cockpit_smoke',
    label: 'Authenticated staging cockpit smoke passed.',
    requiredEvidence: ['operator_usage_200', 'operator_cockpit_200', 'launch_readiness_visible'],
    requiredCommands: ['npm run test:app-foundry-public-playwright'],
  },
  {
    id: 'staging_rollback_drill',
    label: 'Rollback drill restored a known-good manifest or source artifact.',
    requiredEvidence: ['rollback_artifact_id', 'rollback_event_id', 'post_rollback_public_shell_200'],
    requiredCommands: [],
  },
  {
    id: 'staging_kill_switch_drill',
    label: 'Kill-switch drill proved App Foundry surfaces fail closed and recover.',
    requiredEvidence: ['kill_switch_enabled_404s', 'kill_switch_recovered_200s', 'operator_signoff'],
    requiredCommands: ['npm run test:app-foundry-feature-off-smoke'],
  },
  {
    id: 'seven_day_beta_metrics',
    label: 'Seven-day beta metrics meet production launch thresholds.',
    requiredEvidence: [
      'lucidHostedDeploySuccessRate7d',
      'platformBlueprintGenerationSuccessRate',
      'criticalSecurityIssuesOpen',
      'p0p1LaunchBlockersOpen',
    ],
    requiredCommands: ['npm run app-service:production-launch'],
  },
  {
    id: 'external_runbook_reviewer',
    label: 'Runbooks were tested by someone who did not write the feature.',
    requiredEvidence: ['reviewer_identity', 'reviewer_notes', 'review_date'],
    requiredCommands: ['npm run app-service:ops'],
  },
] as const satisfies readonly AppServiceStagingEvidenceGate[]

function missingItems(required: readonly string[], actual: readonly string[] | undefined): string[] {
  const values = new Set(actual ?? [])
  return required.filter((item) => !values.has(item))
}

export function evaluateAppServiceStagingEvidence(
  input: AppServiceStagingEvidenceInput,
): AppServiceStagingEvidenceReport {
  const results = APP_SERVICE_STAGING_EVIDENCE_GATES.map((gate) => {
    const missingEvidence = missingItems(gate.requiredEvidence, input.evidence?.[gate.id])
    const missingCommands = missingItems(gate.requiredCommands, input.commandResults?.[gate.id])
    return {
      id: gate.id,
      ready: missingEvidence.length === 0 && missingCommands.length === 0,
      missingEvidence,
      missingCommands,
    }
  })

  return {
    ready: results.every((result) => result.ready),
    results,
  }
}

export function summarizeAppServiceStagingEvidenceGates() {
  return {
    gateCount: APP_SERVICE_STAGING_EVIDENCE_GATES.length,
    gateIds: APP_SERVICE_STAGING_EVIDENCE_GATES.map((gate) => gate.id),
    requiredCommandCount: APP_SERVICE_STAGING_EVIDENCE_GATES.reduce(
      (count, gate) => count + gate.requiredCommands.length,
      0,
    ),
  }
}
