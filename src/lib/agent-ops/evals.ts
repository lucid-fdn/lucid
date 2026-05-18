import { z } from 'zod'

export const AGENT_OPS_EVAL_TARGET_KINDS = [
  'workflow',
  'template',
  'model',
  'channel',
  'runtime',
  'memory',
  'release',
] as const

export const AGENT_OPS_EVAL_RESULT_STATUSES = ['passed', 'failed', 'warning', 'skipped'] as const
export const AGENT_OPS_EVAL_PACK_KINDS = ['workflow', 'model_benchmark', 'channel_ux', 'memory_recall'] as const
export const AGENT_OPS_BENCHMARK_MEMORY_MODES = ['off', 'recent', 'semantic', 'project'] as const
export const AGENT_OPS_BENCHMARK_BROWSER_MODES = ['generic_browser_operator', 'browser_procedure'] as const

export type AgentOpsEvalTargetKind = (typeof AGENT_OPS_EVAL_TARGET_KINDS)[number]
export type AgentOpsEvalPackKind = (typeof AGENT_OPS_EVAL_PACK_KINDS)[number]
export type AgentOpsBenchmarkMemoryMode = (typeof AGENT_OPS_BENCHMARK_MEMORY_MODES)[number]
export type AgentOpsBenchmarkBrowserMode = (typeof AGENT_OPS_BENCHMARK_BROWSER_MODES)[number]

export const agentOpsEvalMetricSchema = z.object({
  name: z.string().min(1).max(120),
  score: z.number().min(0).max(100),
  weight: z.number().min(0).max(1).default(1),
})

export type AgentOpsEvalMetric = z.infer<typeof agentOpsEvalMetricSchema>

export const agentOpsEvalResultInputSchema = z.object({
  scenarioSlug: z.string().min(1).max(160),
  status: z.enum(AGENT_OPS_EVAL_RESULT_STATUSES),
  score: z.number().min(0).max(100).nullable().optional(),
  summary: z.string().min(1).max(1000),
  evidence: z.record(z.string(), z.unknown()).default({}),
  metrics: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type AgentOpsEvalResultInput = z.infer<typeof agentOpsEvalResultInputSchema>

export interface AgentOpsEvalScenarioDefinition {
  slug: string
  label: string
  targetKind: AgentOpsEvalTargetKind
  packKind: AgentOpsEvalPackKind
  assertion: string
  requiredEvidence: readonly string[]
  weight: number
}

export interface AgentOpsBenchmarkCandidate {
  id: string
  model: string
  runtimeProfile: string
  channel: string
  memoryMode: AgentOpsBenchmarkMemoryMode
  browserMode: AgentOpsBenchmarkBrowserMode
  browserProcedureId: string | null
}

export interface AgentOpsBenchmarkMatrix {
  workflowId: string
  scenario: string
  candidates: readonly AgentOpsBenchmarkCandidate[]
  axes: {
    models: readonly string[]
    runtimeProfiles: readonly string[]
    channels: readonly string[]
    memoryModes: readonly AgentOpsBenchmarkMemoryMode[]
    browserModes: readonly AgentOpsBenchmarkBrowserMode[]
  }
}

export interface AgentOpsBenchmarkObservation {
  candidateId: string
  judgeScore: number | null
  latencyMs: number | null
  costUsd: number | null
  tokenCount: number | null
  evidenceCompleteness: number | null
  failureType: string | null
  passed: boolean
  metadata?: Record<string, unknown>
}

export interface AgentOpsBenchmarkSummary {
  candidateCount: number
  bestCandidateId: string | null
  procedureLiftPct: number | null
  avgJudgeScore: number | null
  avgLatencyMs: number | null
  avgCostUsd: number | null
  avgTokenCount: number | null
  avgEvidenceCompleteness: number | null
  failureTypes: Record<string, number>
}

export const MODEL_BENCHMARK_SCENARIOS = Object.freeze([
  {
    slug: 'instruction-following',
    label: 'Instruction following',
    targetKind: 'model',
    packKind: 'model_benchmark',
    assertion: 'Model follows the requested workflow contract without inventing unsupported tools or skipping required output sections.',
    requiredEvidence: ['transcript'],
    weight: 0.3,
  },
  {
    slug: 'structured-output',
    label: 'Structured output',
    targetKind: 'model',
    packKind: 'model_benchmark',
    assertion: 'Model returns Summary, Findings, Evidence, Risks, and Next actions in a machine-readable shape.',
    requiredEvidence: ['transcript'],
    weight: 0.25,
  },
  {
    slug: 'tool-discipline',
    label: 'Tool discipline',
    targetKind: 'model',
    packKind: 'model_benchmark',
    assertion: 'Model uses available tools only when they materially improve evidence quality and avoids unsafe write actions.',
    requiredEvidence: ['trace', 'transcript'],
    weight: 0.25,
  },
  {
    slug: 'latency-cost-fit',
    label: 'Latency/cost fit',
    targetKind: 'model',
    packKind: 'model_benchmark',
    assertion: 'Model quality is balanced against latency, token use, and cost for the workflow tier.',
    requiredEvidence: ['perf_metric'],
    weight: 0.2,
  },
  {
    slug: 'evidence-completeness',
    label: 'Evidence completeness',
    targetKind: 'model',
    packKind: 'model_benchmark',
    assertion: 'Model output includes enough evidence to audit correctness, safety, latency, and cost.',
    requiredEvidence: ['transcript', 'perf_metric'],
    weight: 0.15,
  },
  {
    slug: 'failure-classification',
    label: 'Failure classification',
    targetKind: 'model',
    packKind: 'model_benchmark',
    assertion: 'Failures are classified by cause so teams can distinguish model, runtime, channel, memory, browser, and product issues.',
    requiredEvidence: ['review_finding', 'trace'],
    weight: 0.15,
  },
] satisfies readonly AgentOpsEvalScenarioDefinition[])

export const RUNTIME_BENCHMARK_SCENARIOS = Object.freeze([
  {
    slug: 'runtime-compatibility',
    label: 'Runtime compatibility',
    targetKind: 'runtime',
    packKind: 'model_benchmark',
    assertion: 'Runtime profile supports the workflow capabilities without hidden engine-specific assumptions.',
    requiredEvidence: ['trace', 'test_result'],
    weight: 0.25,
  },
  {
    slug: 'runtime-latency',
    label: 'Runtime latency',
    targetKind: 'runtime',
    packKind: 'model_benchmark',
    assertion: 'Runtime latency fits the dispatch tier and keeps channel reports responsive.',
    requiredEvidence: ['perf_metric'],
    weight: 0.25,
  },
  {
    slug: 'runtime-cost',
    label: 'Runtime cost',
    targetKind: 'runtime',
    packKind: 'model_benchmark',
    assertion: 'Runtime execution cost is visible and proportionate to the workflow value.',
    requiredEvidence: ['perf_metric'],
    weight: 0.2,
  },
  {
    slug: 'runtime-recovery',
    label: 'Runtime recovery',
    targetKind: 'runtime',
    packKind: 'model_benchmark',
    assertion: 'Runtime errors are classified and recoverable without duplicate runs or lost evidence.',
    requiredEvidence: ['trace', 'log_excerpt'],
    weight: 0.3,
  },
] satisfies readonly AgentOpsEvalScenarioDefinition[])

export const BROWSER_OPERATOR_BENCHMARK_SCENARIOS = Object.freeze([
  {
    slug: 'procedure-speed-lift',
    label: 'Procedure speed lift',
    targetKind: 'workflow',
    packKind: 'model_benchmark',
    assertion: 'Browser Procedure execution is faster than generic Browser Operator execution for repeatable host tasks.',
    requiredEvidence: ['perf_metric', 'test_result'],
    weight: 0.25,
  },
  {
    slug: 'procedure-quality-lift',
    label: 'Procedure quality lift',
    targetKind: 'workflow',
    packKind: 'model_benchmark',
    assertion: 'Browser Procedures improve evidence completeness and task success versus generic Browser Operator exploration.',
    requiredEvidence: ['screenshot', 'test_result', 'review_finding'],
    weight: 0.35,
  },
  {
    slug: 'procedure-safety',
    label: 'Procedure safety',
    targetKind: 'workflow',
    packKind: 'model_benchmark',
    assertion: 'Browser Procedure runs preserve trust-shield, approval, fixture, and host-playbook constraints.',
    requiredEvidence: ['trace', 'review_finding'],
    weight: 0.25,
  },
  {
    slug: 'procedure-fallback',
    label: 'Procedure fallback',
    targetKind: 'workflow',
    packKind: 'model_benchmark',
    assertion: 'Generic Browser Operator fallback is explicit when no active procedure is available or safe.',
    requiredEvidence: ['transcript', 'test_result'],
    weight: 0.15,
  },
] satisfies readonly AgentOpsEvalScenarioDefinition[])

export const CHANNEL_UX_EVAL_SCENARIOS = Object.freeze([
  {
    slug: 'streaming-visible',
    label: 'Streaming visible',
    targetKind: 'channel',
    packKind: 'channel_ux',
    assertion: 'Channel shows immediate progress and meaningful partial delivery where the transport supports it.',
    requiredEvidence: ['transcript', 'perf_metric'],
    weight: 0.25,
  },
  {
    slug: 'media-ingestion',
    label: 'Media ingestion',
    targetKind: 'channel',
    packKind: 'channel_ux',
    assertion: 'Images, audio, voice notes, and attachments route into the same agent flow without channel-specific prompts leaking.',
    requiredEvidence: ['transcript', 'test_result'],
    weight: 0.25,
  },
  {
    slug: 'agent-switching',
    label: 'Agent switching',
    targetKind: 'channel',
    packKind: 'channel_ux',
    assertion: 'Users can see and switch the active/default agent through native channel controls.',
    requiredEvidence: ['transcript', 'test_result'],
    weight: 0.25,
  },
  {
    slug: 'error-recovery',
    label: 'Error recovery',
    targetKind: 'channel',
    packKind: 'channel_ux',
    assertion: 'Transport errors are retried or explained without duplicate replies, empty messages, or lost context.',
    requiredEvidence: ['log_excerpt', 'test_result'],
    weight: 0.25,
  },
] satisfies readonly AgentOpsEvalScenarioDefinition[])

export const MEMORY_RECALL_EVAL_SCENARIOS = Object.freeze([
  {
    slug: 'assistant-memory-recall',
    label: 'Assistant memory recall',
    targetKind: 'memory',
    packKind: 'memory_recall',
    assertion: 'Assistant recalls relevant durable memory only when it is useful for the current task.',
    requiredEvidence: ['memory_hit', 'transcript'],
    weight: 0.35,
  },
  {
    slug: 'project-learning-recall',
    label: 'Project learning recall',
    targetKind: 'memory',
    packKind: 'memory_recall',
    assertion: 'Project learnings influence implementation choices without overriding explicit user instructions.',
    requiredEvidence: ['memory_hit', 'transcript'],
    weight: 0.3,
  },
  {
    slug: 'cross-channel-continuity',
    label: 'Cross-channel continuity',
    targetKind: 'memory',
    packKind: 'memory_recall',
    assertion: 'Relevant memory follows the assistant/project across supported channels while preserving tenant boundaries.',
    requiredEvidence: ['memory_hit', 'test_result'],
    weight: 0.2,
  },
  {
    slug: 'unsafe-memory-rejection',
    label: 'Unsafe memory rejection',
    targetKind: 'memory',
    packKind: 'memory_recall',
    assertion: 'Instruction-like or poisoned memory candidates are rejected, downgraded, or wrapped as untrusted data.',
    requiredEvidence: ['review_finding', 'log_excerpt'],
    weight: 0.15,
  },
] satisfies readonly AgentOpsEvalScenarioDefinition[])

export function listBuiltInEvalScenarios(packKind?: AgentOpsEvalPackKind): readonly AgentOpsEvalScenarioDefinition[] {
  const scenarios = [
    ...MODEL_BENCHMARK_SCENARIOS,
    ...RUNTIME_BENCHMARK_SCENARIOS,
    ...BROWSER_OPERATOR_BENCHMARK_SCENARIOS,
    ...CHANNEL_UX_EVAL_SCENARIOS,
    ...MEMORY_RECALL_EVAL_SCENARIOS,
  ]
  return packKind ? scenarios.filter((scenario) => scenario.packKind === packKind) : scenarios
}

export function buildAgentOpsBenchmarkMatrix(input: {
  workflowId: string
  scenario: string
  models?: readonly string[]
  runtimeProfiles?: readonly string[]
  channels?: readonly string[]
  memoryModes?: readonly AgentOpsBenchmarkMemoryMode[]
  browserModes?: readonly AgentOpsBenchmarkBrowserMode[]
  browserProcedureId?: string | null
}): AgentOpsBenchmarkMatrix {
  const models = normalizeAxis(input.models, ['default'])
  const runtimeProfiles = normalizeAxis(input.runtimeProfiles, ['shared'])
  const channels = normalizeAxis(input.channels, ['web'])
  const memoryModes = normalizeEnumAxis(input.memoryModes, ['project'] as const)
  const browserModes = normalizeEnumAxis(input.browserModes, ['generic_browser_operator'] as const)
  const candidates: AgentOpsBenchmarkCandidate[] = []

  for (const model of models) {
    for (const runtimeProfile of runtimeProfiles) {
      for (const channel of channels) {
        for (const memoryMode of memoryModes) {
          for (const browserMode of browserModes) {
            const id = [
              normalize(input.workflowId),
              normalize(input.scenario),
              normalize(model),
              normalize(runtimeProfile),
              normalize(channel),
              memoryMode,
              browserMode,
              browserMode === 'browser_procedure' ? normalize(input.browserProcedureId ?? 'procedure') : 'generic',
            ].join(':')
            candidates.push({
              id,
              model,
              runtimeProfile,
              channel,
              memoryMode,
              browserMode,
              browserProcedureId: browserMode === 'browser_procedure' ? input.browserProcedureId ?? null : null,
            })
          }
        }
      }
    }
  }

  return {
    workflowId: input.workflowId,
    scenario: input.scenario,
    candidates,
    axes: {
      models,
      runtimeProfiles,
      channels,
      memoryModes,
      browserModes,
    },
  }
}

export function summarizeBenchmarkObservations(
  observations: readonly AgentOpsBenchmarkObservation[],
): AgentOpsBenchmarkSummary {
  const scored = observations.filter((item) => typeof item.judgeScore === 'number')
  const best = scored.length > 0
    ? [...scored].sort((a, b) => (b.judgeScore ?? -1) - (a.judgeScore ?? -1))[0]
    : null
  const generic = observations.filter((item) => item.metadata?.browser_mode === 'generic_browser_operator')
  const procedure = observations.filter((item) => item.metadata?.browser_mode === 'browser_procedure')
  const genericAvg = average(generic.map((item) => item.judgeScore))
  const procedureAvg = average(procedure.map((item) => item.judgeScore))

  return {
    candidateCount: observations.length,
    bestCandidateId: best?.candidateId ?? null,
    procedureLiftPct: genericAvg && procedureAvg !== null
      ? roundScore(((procedureAvg - genericAvg) / genericAvg) * 100)
      : null,
    avgJudgeScore: average(observations.map((item) => item.judgeScore)),
    avgLatencyMs: average(observations.map((item) => item.latencyMs)),
    avgCostUsd: average(observations.map((item) => item.costUsd)),
    avgTokenCount: average(observations.map((item) => item.tokenCount)),
    avgEvidenceCompleteness: average(observations.map((item) => item.evidenceCompleteness)),
    failureTypes: observations.reduce<Record<string, number>>((acc, item) => {
      const key = item.failureType ?? 'none'
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {}),
  }
}

export function buildBenchmarkEvalResults(input: {
  matrix: AgentOpsBenchmarkMatrix
  observations: readonly AgentOpsBenchmarkObservation[]
}): AgentOpsEvalResultInput[] {
  const byCandidate = new Map(input.observations.map((observation) => [observation.candidateId, observation]))
  return input.matrix.candidates.map((candidate) => {
    const observation = byCandidate.get(candidate.id)
    return {
      scenarioSlug: `benchmark:${candidate.id}`.slice(0, 160),
      status: observation ? observation.passed ? 'passed' : 'failed' : 'skipped',
      score: observation?.judgeScore ?? null,
      summary: observation
        ? `${candidate.model} on ${candidate.runtimeProfile}/${candidate.channel} scored ${observation.judgeScore ?? 'unscored'}.`
        : `${candidate.model} on ${candidate.runtimeProfile}/${candidate.channel} was not run.`,
      evidence: {
        candidate,
        latency_ms: observation?.latencyMs ?? null,
        cost_usd: observation?.costUsd ?? null,
        token_count: observation?.tokenCount ?? null,
        evidence_completeness: observation?.evidenceCompleteness ?? null,
        failure_type: observation?.failureType ?? null,
      },
      metrics: {
        judge_score: observation?.judgeScore ?? null,
        latency_ms: observation?.latencyMs ?? null,
        cost_usd: observation?.costUsd ?? null,
        token_count: observation?.tokenCount ?? null,
        evidence_completeness: observation?.evidenceCompleteness ?? null,
      },
      metadata: {
        benchmark: true,
        workflow_id: input.matrix.workflowId,
        scenario: input.matrix.scenario,
        model: candidate.model,
        runtime_profile: candidate.runtimeProfile,
        channel: candidate.channel,
        memory_mode: candidate.memoryMode,
        browser_mode: candidate.browserMode,
        browser_procedure_id: candidate.browserProcedureId,
      },
    }
  })
}

export function buildEvalScenarioResults(input: {
  packKind: AgentOpsEvalPackKind
  status?: (typeof AGENT_OPS_EVAL_RESULT_STATUSES)[number]
  defaultScore?: number
  evidence?: Record<string, unknown>
}): AgentOpsEvalResultInput[] {
  const scenarios = listBuiltInEvalScenarios(input.packKind)
  return scenarios.map((scenario) => ({
    scenarioSlug: scenario.slug,
    status: input.status ?? 'skipped',
    score: input.defaultScore ?? null,
    summary: scenario.assertion,
    evidence: input.evidence ?? {},
    metrics: {
      weight: scenario.weight,
      required_evidence: scenario.requiredEvidence,
    },
    metadata: {
      label: scenario.label,
      target_kind: scenario.targetKind,
      pack_kind: scenario.packKind,
    },
  }))
}

export function calculateWeightedEvalScore(metrics: AgentOpsEvalMetric[]): number | null {
  if (metrics.length === 0) return null
  let totalWeight = 0
  let weighted = 0

  for (const metric of metrics.map((item) => agentOpsEvalMetricSchema.parse(item))) {
    if (metric.weight === 0) continue
    totalWeight += metric.weight
    weighted += metric.score * metric.weight
  }

  if (totalWeight === 0) return null
  return roundScore(weighted / totalWeight)
}

export function summarizeEvalResults(results: AgentOpsEvalResultInput[]) {
  const parsed = results.map((result) => agentOpsEvalResultInputSchema.parse(result))
  const counted = parsed.filter((result) => result.status !== 'skipped')
  const passed = counted.filter((result) => result.status === 'passed').length
  const passRate = counted.length > 0 ? roundScore((passed / counted.length) * 100) : null
  const scored = parsed
    .map((result) => result.score)
    .filter((score): score is number => typeof score === 'number')
  const score = scored.length > 0
    ? roundScore(scored.reduce((sum, value) => sum + value, 0) / scored.length)
    : passRate

  return {
    score,
    passRate,
    resultCount: parsed.length,
    failedCount: parsed.filter((result) => result.status === 'failed').length,
    warningCount: parsed.filter((result) => result.status === 'warning').length,
    skippedCount: parsed.filter((result) => result.status === 'skipped').length,
  }
}

export function buildModelBenchmarkKey(input: {
  provider?: string | null
  model: string
  scenario: string
}): string {
  return [
    normalize(input.provider ?? 'default'),
    normalize(input.model),
    normalize(input.scenario),
  ].join(':')
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

function normalizeAxis(values: readonly string[] | undefined, fallback: readonly string[]): string[] {
  const normalized = [...new Set((values && values.length > 0 ? values : fallback)
    .map((value) => value.trim())
    .filter(Boolean))]
  return normalized.length > 0 ? normalized : [...fallback]
}

function normalizeEnumAxis<const T extends string>(
  values: readonly T[] | undefined,
  fallback: readonly T[],
): T[] {
  const allowed = new Set<string>([...AGENT_OPS_BENCHMARK_MEMORY_MODES, ...AGENT_OPS_BENCHMARK_BROWSER_MODES])
  const normalized = [...new Set((values && values.length > 0 ? values : fallback)
    .filter((value) => allowed.has(value)))]
  return normalized.length > 0 ? normalized : [...fallback]
}

function average(values: readonly (number | null)[]): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number')
  if (numeric.length === 0) return null
  return roundScore(numeric.reduce((sum, value) => sum + value, 0) / numeric.length)
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100
}
