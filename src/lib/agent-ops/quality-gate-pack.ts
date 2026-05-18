import {
  buildAgentOpsProductionPreflightPlan,
  type AgentOpsProductionPreflightOptions,
  type AgentOpsProductionPreflightStep,
  type AgentOpsProductionPreflightTarget,
} from './production-preflight'
import { listBuiltInEvalScenarios } from './evals'
import { listReleaseQualityChecks } from './release-quality-gates'
import { getAgentOpsCompletionMatrixEvidence } from './completion-matrix'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

export const AGENT_OPS_QUALITY_GATE_PHASES = [
  'source_hygiene',
  'generated_contracts',
  'release_quality',
  'evals',
  'channel_readiness',
  'runtime_readiness',
  'stress_latency',
  'live_readiness',
] as const

export type AgentOpsQualityGatePhase = (typeof AGENT_OPS_QUALITY_GATE_PHASES)[number]

export interface AgentOpsQualityGateCommand {
  command: string
  args: string[]
}

export interface AgentOpsQualityGate {
  id: string
  label: string
  phase: AgentOpsQualityGatePhase
  required: boolean
  destructive: boolean
  live: boolean
  command: AgentOpsQualityGateCommand
  evidence: readonly string[]
  source: 'production_preflight' | 'release_quality_registry' | 'eval_registry' | 'quality_pack'
  description: string
}

export interface AgentOpsQualityGatePackOptions extends AgentOpsProductionPreflightOptions {
  includeDiffHygiene?: boolean
  includeRegistrySmoke?: boolean
}

export interface AgentOpsQualityGatePack {
  schemaVersion: 1
  target: AgentOpsProductionPreflightTarget
  gates: AgentOpsQualityGate[]
  requiredGateIds: string[]
  liveGateIds: string[]
  destructiveGateIds: string[]
  evidenceContract: Record<string, readonly string[]>
  notes: string[]
}

export interface AgentOpsQualityGatePhaseSummary {
  phase: AgentOpsQualityGatePhase
  total: number
  required: number
  live: number
  destructive: number
}

export interface AgentOpsQualityGatePackSummary {
  total: number
  required: number
  live: number
  destructive: number
  byPhase: AgentOpsQualityGatePhaseSummary[]
}

export interface AgentOpsQualityGatePackReport {
  schemaVersion: 1
  target: AgentOpsProductionPreflightTarget
  summary: AgentOpsQualityGatePackSummary
  gates: AgentOpsQualityGate[]
  evidenceContract: Record<string, readonly string[]>
  notes: string[]
}

const PREFLIGHT_PHASE_BY_STEP_ID: Record<string, AgentOpsQualityGatePhase> = {
  typecheck: 'source_hygiene',
  'lint-agent-ops': 'source_hygiene',
  'capability-docs': 'generated_contracts',
  'host-pack-matrix-dry-run': 'generated_contracts',
  'agent-ops-tests': 'release_quality',
  'channel-native-smoke': 'channel_readiness',
  'agent-ops-stress': 'stress_latency',
  'web-app-smoke': 'channel_readiness',
  'worker-runtime-packages-build': 'runtime_readiness',
  'worker-build': 'runtime_readiness',
  'worker-agent-ops-tests': 'runtime_readiness',
  'worker-channel-smoke': 'channel_readiness',
  'supabase-migration-list': 'live_readiness',
  'supabase-db-lint': 'live_readiness',
  'agent-ops-prod-schema-smoke': 'live_readiness',
}

export function buildAgentOpsQualityGatePackReport(
  options: AgentOpsQualityGatePackOptions = {},
): AgentOpsQualityGatePackReport {
  const pack = buildAgentOpsQualityGatePack(options)
  return {
    schemaVersion: 1,
    target: pack.target,
    summary: summarizeAgentOpsQualityGatePack(pack),
    gates: pack.gates,
    evidenceContract: pack.evidenceContract,
    notes: pack.notes,
  }
}

export function summarizeAgentOpsQualityGatePack(
  pack: AgentOpsQualityGatePack,
): AgentOpsQualityGatePackSummary {
  return {
    total: pack.gates.length,
    required: pack.requiredGateIds.length,
    live: pack.liveGateIds.length,
    destructive: pack.destructiveGateIds.length,
    byPhase: AGENT_OPS_QUALITY_GATE_PHASES.map((phase) => {
      const gates = pack.gates.filter((gate) => gate.phase === phase)
      return {
        phase,
        total: gates.length,
        required: gates.filter((gate) => gate.required).length,
        live: gates.filter((gate) => gate.live).length,
        destructive: gates.filter((gate) => gate.destructive).length,
      }
    }).filter((summary) => summary.total > 0),
  }
}

export function renderAgentOpsQualityGatePackMarkdown(
  packOrReport: AgentOpsQualityGatePack | AgentOpsQualityGatePackReport,
): string {
  const report = 'summary' in packOrReport
    ? packOrReport
    : {
        schemaVersion: 1 as const,
        target: packOrReport.target,
        summary: summarizeAgentOpsQualityGatePack(packOrReport),
        gates: packOrReport.gates,
        evidenceContract: packOrReport.evidenceContract,
        notes: packOrReport.notes,
      }

  return [
    '# Agent Ops Quality Gate Pack',
    '',
    `Target: \`${report.target}\``,
    '',
    '## Summary',
    '',
    table(
      ['Total gates', 'Required', 'Live', 'Destructive'],
      [[
        String(report.summary.total),
        String(report.summary.required),
        String(report.summary.live),
        String(report.summary.destructive),
      ]],
    ),
    '',
    '## Phases',
    '',
    table(
      ['Phase', 'Total', 'Required', 'Live', 'Destructive'],
      report.summary.byPhase.map((phase) => [
        phase.phase,
        String(phase.total),
        String(phase.required),
        String(phase.live),
        String(phase.destructive),
      ]),
    ),
    '',
    '## Gates',
    '',
    table(
      ['Gate', 'Phase', 'Required', 'Live', 'Command'],
      report.gates.map((gate) => [
        gate.id,
        gate.phase,
        gate.required ? 'yes' : 'no',
        gate.live ? 'yes' : 'no',
        code([gate.command.command, ...gate.command.args].join(' ')),
      ]),
    ),
    '',
    '## Notes',
    '',
    ...report.notes.map((note) => `- ${note}`),
    '',
  ].join('\n')
}

export function buildAgentOpsQualityGatePack(
  options: AgentOpsQualityGatePackOptions = {},
): AgentOpsQualityGatePack {
  const preflight = buildAgentOpsProductionPreflightPlan(options)
  const gates = [
    ...(options.includeDiffHygiene ?? true ? [buildDiffHygieneGate()] : []),
    ...(options.includeRegistrySmoke ?? true ? buildRegistrySmokeGates() : []),
    ...preflight.steps.map(buildGateFromPreflightStep),
  ]

  return {
    schemaVersion: 1,
    target: preflight.target,
    gates,
    requiredGateIds: gates.filter((gate) => gate.required).map((gate) => gate.id),
    liveGateIds: gates.filter((gate) => gate.live).map((gate) => gate.id),
    destructiveGateIds: gates.filter((gate) => gate.destructive).map((gate) => gate.id),
    evidenceContract: buildQualityGateEvidenceContract(),
    notes: [
      'This pack is a CI/installable gate manifest, not a new workflow engine.',
      'Production preflight remains the authoritative promotion sequence; this pack adds CI-friendly grouping and evidence expectations.',
      'All gates are runtime-, engine-, channel-, and tenant-agnostic. Concrete execution belongs to scripts, workers, or injected ports.',
      'Live gates are read-only and should only run after confirming the target environment is linked intentionally.',
    ],
  }
}

function buildGateFromPreflightStep(step: AgentOpsProductionPreflightStep): AgentOpsQualityGate {
  return {
    id: step.id,
    label: step.label,
    phase: PREFLIGHT_PHASE_BY_STEP_ID[step.id] ?? 'source_hygiene',
    required: step.required,
    destructive: step.destructive,
    live: step.live,
    command: {
      command: step.command,
      args: step.args,
    },
    evidence: evidenceForPreflightStep(step.id),
    source: 'production_preflight',
    description: step.description,
  }
}

function buildDiffHygieneGate(): AgentOpsQualityGate {
  return {
    id: 'diff-hygiene',
    label: 'Diff hygiene',
    phase: 'source_hygiene',
    required: true,
    destructive: false,
    live: false,
    command: {
      command: 'git',
      args: ['diff', '--check'],
    },
    evidence: ['diff_check_output'],
    source: 'quality_pack',
    description: 'Rejects whitespace errors before CI, review, or production promotion.',
  }
}

function buildRegistrySmokeGates(): AgentOpsQualityGate[] {
  return [
    {
      id: 'completion-matrix-smoke',
      label: 'Completion matrix smoke',
      phase: 'generated_contracts',
      required: true,
      destructive: false,
      live: false,
      command: {
        command: npmCommand,
        args: ['test', '--', 'src/lib/agent-ops/__tests__/completion-matrix.test.ts'],
      },
      evidence: getAgentOpsCompletionMatrixEvidence(),
      source: 'quality_pack',
      description: 'Verifies every shipped Agent Ops fit-gap capability maps to Lucid-native source, tests, docs, and architecture-neutral evidence.',
    },
    {
      id: 'release-quality-registry-smoke',
      label: 'Release quality registry smoke',
      phase: 'release_quality',
      required: true,
      destructive: false,
      live: false,
      command: {
        command: npmCommand,
        args: ['test', '--', 'src/lib/agent-ops/__tests__/release-quality-gates.test.ts'],
      },
      evidence: listReleaseQualityChecks().map((check) => `release_quality:${check.id}`),
      source: 'release_quality_registry',
      description: 'Verifies release/docs/product-quality gates are centralized and workflow-scoped.',
    },
    {
      id: 'eval-registry-smoke',
      label: 'Eval registry smoke',
      phase: 'evals',
      required: true,
      destructive: false,
      live: false,
      command: {
        command: npmCommand,
        args: ['test', '--', 'src/lib/agent-ops/__tests__/evals.test.ts', 'src/app/api/agent-ops/evals/__tests__/route.test.ts'],
      },
      evidence: [
        ...listBuiltInEvalScenarios('model_benchmark').map((scenario) => `model_benchmark:${scenario.slug}`),
        ...listBuiltInEvalScenarios('channel_ux').map((scenario) => `channel_ux:${scenario.slug}`),
        ...listBuiltInEvalScenarios('memory_recall').map((scenario) => `memory_recall:${scenario.slug}`),
      ],
      source: 'eval_registry',
      description: 'Verifies built-in model/runtime/channel/memory/browser benchmark packs stay usable.',
    },
  ]
}

function evidenceForPreflightStep(stepId: string): readonly string[] {
  switch (stepId) {
    case 'typecheck':
      return ['typescript_output']
    case 'lint-agent-ops':
      return ['eslint_output']
    case 'capability-docs':
      return ['generated_docs_freshness']
    case 'host-pack-matrix-dry-run':
      return ['host_pack_manifest', 'host_pack_hashes', 'dry_run_output']
    case 'agent-ops-tests':
      return ['unit_test_output', 'api_test_output']
    case 'channel-native-smoke':
      return ['app_channel_smoke_output', 'agent_ops_channel_command_output']
    case 'agent-ops-stress':
      return ['stress_test_output', 'latency_budget_output']
    case 'web-app-smoke':
      return ['local_web_smoke_output', 'project_shell_smoke_output']
    case 'worker-runtime-packages-build':
      return ['runtime_package_build_output']
    case 'worker-build':
      return ['worker_build_output']
    case 'worker-agent-ops-tests':
      return ['worker_test_output', 'browser_operator_smoke_output']
    case 'worker-channel-smoke':
      return ['worker_channel_smoke_output', 'relay_bridge_smoke_output']
    case 'supabase-migration-list':
      return ['migration_status_output']
    case 'supabase-db-lint':
      return ['supabase_advisor_output']
    default:
      return ['command_output']
  }
}

function buildQualityGateEvidenceContract(): Record<string, readonly string[]> {
  return {
    source_hygiene: ['typescript_output', 'eslint_output', 'diff_check_output'],
    generated_contracts: ['generated_docs_freshness', 'host_pack_manifest', 'host_pack_hashes', 'completion_matrix_evidence'],
    release_quality: ['release_quality_registry', 'unit_test_output', 'api_test_output'],
    evals: ['model_benchmark_pack', 'channel_ux_pack', 'memory_recall_pack'],
    channel_readiness: ['app_channel_smoke_output', 'worker_channel_smoke_output', 'local_web_smoke_output'],
    runtime_readiness: ['runtime_package_build_output', 'worker_build_output', 'worker_test_output', 'browser_operator_smoke_output'],
    stress_latency: ['stress_test_output', 'latency_budget_output'],
    live_readiness: ['migration_status_output', 'supabase_advisor_output'],
  }
}

function table(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeMarkdownTableCell).join(' | ')} |`),
  ].join('\n')
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}

function code(value: string): string {
  return `\`${value.replace(/`/g, '\\`')}\``
}
