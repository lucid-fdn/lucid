export const AGENT_OPS_COMPLETION_MATRIX_VERSION = '2026-05-03.agent-ops-gstack-fit-gap.v1'

export type AgentOpsCompletionStatus = 'implemented' | 'verified'
export type AgentOpsCompletionLayer =
  | 'agent_ops'
  | 'browser_operator'
  | 'mission_control'
  | 'team_ops'
  | 'eval_center'
  | 'channel_native'
  | 'external_hosts'

export interface AgentOpsCompletionArea {
  id: string
  label: string
  layer: AgentOpsCompletionLayer
  status: AgentOpsCompletionStatus
  sourceRefs: readonly string[]
  testRefs: readonly string[]
  docRefs: readonly string[]
  qualityGateEvidence: readonly string[]
  tenantScoped: boolean
  runtimeAgnostic: boolean
  engineAgnostic: boolean
  channelAgnostic: boolean
  notes: string
}

export interface AgentOpsCompletionMatrixSummary {
  version: typeof AGENT_OPS_COMPLETION_MATRIX_VERSION
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

export const AGENT_OPS_COMPLETION_AREAS = Object.freeze([
  {
    id: 'browser-procedure-registry',
    label: 'Browser Procedure Registry And Promotion',
    layer: 'browser_operator',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/browser-procedures.ts',
      'src/lib/agent-ops/browser-procedure-promotion.ts',
      'src/lib/db/agent-ops-browser-procedures.ts',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/browser-procedures.test.ts',
      'src/lib/agent-ops/__tests__/browser-procedure-promotion.test.ts',
      'src/lib/db/__tests__/agent-ops-browser-procedures.test.ts',
    ],
    docRefs: ['docs/plans/2026-05-02-gstack-complete-fit-gap-implementation-plan.md'],
    qualityGateEvidence: ['browser_procedure_registry', 'procedure_promotion_tests'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'Successful Browser Operator runs can become reusable tenant-scoped procedures without becoming templates or engine-specific scripts.',
  },
  {
    id: 'browser-procedure-runtime-reuse',
    label: 'Procedure Execution And Generic Browser Fallback',
    layer: 'browser_operator',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/dag-orchestration-adapter.ts',
      'src/lib/agent-ops/browser-qa.ts',
      'src/lib/agent-ops/workflow-to-dag.ts',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/dag-orchestration-adapter.test.ts',
      'src/lib/agent-ops/__tests__/e2e-readiness.test.ts',
      'src/lib/agent-ops/__tests__/production-gates.test.ts',
    ],
    docRefs: ['README.md', 'CLAUDE.md'],
    qualityGateEvidence: ['procedure_matching', 'browser_operator_worker_tests'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'DAG payloads can attach matched active procedures while keeping generic Browser Operator execution available through provider ports.',
  },
  {
    id: 'host-playbooks',
    label: 'Host Playbooks',
    layer: 'browser_operator',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/browser-host-playbooks.ts',
      'src/lib/db/agent-ops-browser-host-playbooks.ts',
      'src/app/api/agent-ops/browser-host-playbooks/route.ts',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/browser-host-playbooks.test.ts',
      'src/app/api/agent-ops/browser-host-playbooks/__tests__/route.test.ts',
    ],
    docRefs: ['docs/plans/2026-05-02-gstack-complete-fit-gap-implementation-plan.md'],
    qualityGateEvidence: ['host_playbook_registry', 'host_playbook_api_tests'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'Domain knowledge is stored as tenant-scoped playbooks with trust state, not local JSONL files.',
  },
  {
    id: 'browser-trust-shield',
    label: 'Browser Trust Shield',
    layer: 'browser_operator',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/browser-trust-shield.ts',
      'src/lib/db/agent-ops-browser-security-events.ts',
      'src/lib/agent-ops/step-output.ts',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/browser-trust-shield.test.ts',
      'src/lib/agent-ops/__tests__/step-output.test.ts',
    ],
    docRefs: ['README.md', 'CLAUDE.md'],
    qualityGateEvidence: ['trust_shield_events', 'browser_gateway_safety_tests'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'Prompt-injection, canary, private-network, and browser safety signals are recorded as evidence instead of hidden runtime behavior.',
  },
  {
    id: 'live-browser-handoff',
    label: 'Live Browser Sessions And Handoff',
    layer: 'browser_operator',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/browser-live-sessions.ts',
      'src/lib/db/agent-ops-browser-session-events.ts',
      'src/app/(app)/[workspace-slug]/mission-control/agent-ops/agent-ops-client.tsx',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/browser-live-sessions.test.ts',
      'src/lib/agent-ops/__tests__/step-output.test.ts',
      'src/app/api/agent-ops/overview/__tests__/route.test.ts',
    ],
    docRefs: ['docs/plans/2026-05-02-gstack-complete-fit-gap-implementation-plan.md'],
    qualityGateEvidence: ['browser_session_events', 'handoff_state_projection'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'Human login/CAPTCHA/MFA handoff is visible in Mission Control and stored as session events rather than a provider-specific escape path.',
  },
  {
    id: 'pair-agent-browser-sharing',
    label: 'Pair-Agent Browser Sharing',
    layer: 'browser_operator',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/browser-session-sharing.ts',
      'src/lib/db/agent-ops-browser-session-shares.ts',
      'src/app/api/agent-ops/browser-sessions/[sessionKey]/share/route.ts',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/browser-session-sharing.test.ts',
      'src/lib/agent-ops/__tests__/step-output.test.ts',
    ],
    docRefs: ['docs/plans/2026-05-02-gstack-complete-fit-gap-implementation-plan.md'],
    qualityGateEvidence: ['browser_share_tokens', 'shared_action_audit'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'Shared browser access uses scoped, revocable session-share records and action audit events.',
  },
  {
    id: 'design-ops-taste',
    label: 'Design Ops And Taste Profiles',
    layer: 'agent_ops',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/design-ops.ts',
      'src/lib/db/agent-ops-operator-profiles.ts',
      'src/app/api/agent-ops/operator-profiles/route.ts',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/design-ops.test.ts',
      'src/lib/agent-ops/__tests__/workflow-registry.test.ts',
      'src/app/api/agent-ops/overview/__tests__/route.test.ts',
    ],
    docRefs: ['README.md', 'CLAUDE.md'],
    qualityGateEvidence: ['design_workflows', 'operator_profile_projection'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'Design workflows and taste profiles live in Agent Ops ledgers and operator-visible profiles, not hidden prompt memory.',
  },
  {
    id: 'decision-pacing',
    label: 'Decision Pacing',
    layer: 'agent_ops',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/decision-pacing.ts',
      'src/lib/db/agent-ops-decision-events.ts',
      'src/app/api/agent-ops/decision-events/route.ts',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/decision-pacing.test.ts',
      'src/app/api/agent-ops/decision-events/__tests__/route.test.ts',
    ],
    docRefs: ['CLAUDE.md', 'docs/plans/2026-05-02-gstack-complete-fit-gap-implementation-plan.md'],
    qualityGateEvidence: ['decision_registry', 'one_way_door_policy'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'Low-risk decisions can be paced, but one-way-door and security-sensitive decisions stay explicit and auditable.',
  },
  {
    id: 'release-doc-quality',
    label: 'Release, Docs, And Product Quality Gates',
    layer: 'agent_ops',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/release-quality-gates.ts',
      'src/lib/agent-ops/workflow-registry.ts',
      'src/lib/agent-ops/team-policy.ts',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/release-quality-gates.test.ts',
      'src/lib/agent-ops/__tests__/operating-loop.test.ts',
      'src/lib/agent-ops/__tests__/team-policy.test.ts',
    ],
    docRefs: ['README.md', 'CLAUDE.md'],
    qualityGateEvidence: ['release_quality_registry', 'team_policy_gate'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'Ship/deploy/promotion quality gates are workflows and policies, not a separate CI-only product.',
  },
  {
    id: 'eval-benchmark-center',
    label: 'Eval And Benchmark Center Expansion',
    layer: 'eval_center',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/evals.ts',
      'src/app/api/agent-ops/evals/route.ts',
      'src/lib/db/agent-ops.ts',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/evals.test.ts',
      'src/app/api/agent-ops/evals/__tests__/route.test.ts',
      'src/lib/db/__tests__/agent-ops.test.ts',
    ],
    docRefs: ['README.md', 'docs/generated/agent-ops-capability-matrix.md'],
    qualityGateEvidence: ['model_benchmark_matrix', 'procedure_quality_lift'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'Benchmark observations compare model, runtime, channel, memory mode, and Browser Procedure lift through existing eval ledgers.',
  },
  {
    id: 'channel-native-agent-ops',
    label: 'Channel-Native Agent Ops',
    layer: 'channel_native',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/channel-native.ts',
      'src/lib/db/agent-ops-channel-launch.ts',
      'src/app/api/internal/agent-ops/channel-launch/route.ts',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/channel-native.test.ts',
      'src/lib/agent-ops/__tests__/production-gates.test.ts',
    ],
    docRefs: ['README.md', 'CLAUDE.md'],
    qualityGateEvidence: ['channel_command_parser', 'team_ops_channel_report'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'Channel commands launch the same Agent Ops run contract and report the same Team Ops projection back to the surface.',
  },
  {
    id: 'external-host-packs',
    label: 'External Host Packs And Installer',
    layer: 'external_hosts',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/external-host-packs.ts',
      'src/lib/agent-ops/external-host-pack-installer.ts',
      'scripts/install-agent-ops-host-pack.ts',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/external-host-packs.test.ts',
      'src/lib/agent-ops/__tests__/external-host-pack-installer.test.ts',
    ],
    docRefs: [
      'docs/generated/agent-ops-external-host-packs.md',
      'docs/generated/agent-ops-external-host-installer-manifest.json',
    ],
    qualityGateEvidence: ['host_pack_registry', 'host_pack_installer_hashes'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'Host packs distribute Lucid methodology to external agent hosts while Lucid Cloud remains the source of truth.',
  },
  {
    id: 'mission-control-quality-gates',
    label: 'Mission Control Quality Gates',
    layer: 'mission_control',
    status: 'verified',
    sourceRefs: [
      'src/lib/agent-ops/quality-gate-pack.ts',
      'src/app/api/agent-ops/quality-gates/route.ts',
      'src/app/api/agent-ops/overview/route.ts',
    ],
    testRefs: [
      'src/lib/agent-ops/__tests__/quality-gate-pack.test.ts',
      'src/app/api/agent-ops/quality-gates/__tests__/route.test.ts',
      'src/app/api/agent-ops/overview/__tests__/route.test.ts',
    ],
    docRefs: ['README.md', 'CLAUDE.md'],
    qualityGateEvidence: ['quality_gate_pack', 'mission_control_projection'],
    tenantScoped: true,
    runtimeAgnostic: true,
    engineAgnostic: true,
    channelAgnostic: true,
    notes: 'CI, API, docs, and Mission Control consume the same read-only quality-gate pack contract.',
  },
]) satisfies readonly AgentOpsCompletionArea[]

export function listAgentOpsCompletionAreas(): readonly AgentOpsCompletionArea[] {
  return AGENT_OPS_COMPLETION_AREAS
}

export function summarizeAgentOpsCompletionMatrix(
  areas: readonly AgentOpsCompletionArea[] = AGENT_OPS_COMPLETION_AREAS,
): AgentOpsCompletionMatrixSummary {
  return {
    version: AGENT_OPS_COMPLETION_MATRIX_VERSION,
    total: areas.length,
    implemented: areas.filter((area) => area.status === 'implemented' || area.status === 'verified').length,
    verified: areas.filter((area) => area.status === 'verified').length,
    tenantScoped: areas.filter((area) => area.tenantScoped).length,
    runtimeAgnostic: areas.filter((area) => area.runtimeAgnostic).length,
    engineAgnostic: areas.filter((area) => area.engineAgnostic).length,
    channelAgnostic: areas.filter((area) => area.channelAgnostic).length,
    missingEvidence: findAgentOpsCompletionMatrixGaps(areas),
  }
}

export function getAgentOpsCompletionMatrixEvidence(
  areas: readonly AgentOpsCompletionArea[] = AGENT_OPS_COMPLETION_AREAS,
): readonly string[] {
  return areas.flatMap((area) => [
    `completion:${area.id}`,
    ...area.qualityGateEvidence.map((item) => `completion:${area.id}:${item}`),
  ])
}

export function assertAgentOpsCompletionMatrixReady(
  areas: readonly AgentOpsCompletionArea[] = AGENT_OPS_COMPLETION_AREAS,
): void {
  const summary = summarizeAgentOpsCompletionMatrix(areas)
  if (summary.missingEvidence.length > 0) {
    throw new Error(`Agent Ops completion matrix has missing evidence: ${JSON.stringify(summary.missingEvidence)}`)
  }
  if (
    summary.verified !== summary.total
    || summary.tenantScoped !== summary.total
    || summary.runtimeAgnostic !== summary.total
    || summary.engineAgnostic !== summary.total
    || summary.channelAgnostic !== summary.total
  ) {
    throw new Error(`Agent Ops completion matrix is not fully verified or architecture-neutral: ${JSON.stringify(summary)}`)
  }
}

function findAgentOpsCompletionMatrixGaps(
  areas: readonly AgentOpsCompletionArea[],
): AgentOpsCompletionMatrixSummary['missingEvidence'] {
  return areas
    .map((area) => {
      const missing = [
        area.sourceRefs.length === 0 ? 'sourceRefs' : null,
        area.testRefs.length === 0 ? 'testRefs' : null,
        area.docRefs.length === 0 ? 'docRefs' : null,
        area.qualityGateEvidence.length === 0 ? 'qualityGateEvidence' : null,
      ].filter((item): item is string => Boolean(item))

      return missing.length > 0 ? { id: area.id, missing } : null
    })
    .filter((item): item is { id: string; missing: string[] } => Boolean(item))
}
