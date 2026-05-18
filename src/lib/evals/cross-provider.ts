import crypto from 'node:crypto'

import type { CreateEvalReceiptInput, EvalReceipt } from '@contracts/eval-receipts'

type EvalJudgeResult = EvalReceipt['judges'][number]

export interface CrossProviderEvalJudgeInput {
  orgId: string
  projectId?: string | null
  runId?: string | null
  sourceType: EvalReceipt['sourceType']
  sourceId: string
  task: string
  output: unknown
  dimensions: string[]
  metadata: Record<string, unknown>
}

export interface CrossProviderEvalJudgeOutput {
  scores?: Record<string, number>
  summary?: string
  metadata?: Record<string, unknown>
}

export interface CrossProviderEvalJudgeProvider {
  providerClass: string
  model: string
  estimateCostUsd?: (input: CrossProviderEvalJudgeInput) => number
  judge: (
    input: CrossProviderEvalJudgeInput & { signal: AbortSignal },
  ) => Promise<CrossProviderEvalJudgeOutput>
}

export interface RunCrossProviderEvalInput {
  orgId: string
  projectId?: string | null
  runId?: string | null
  sourceType: EvalReceipt['sourceType']
  sourceId: string
  task: string
  output: unknown
  dimensions?: string[]
  providers: CrossProviderEvalJudgeProvider[]
  minSuccessfulJudges?: number
  passThreshold?: number
  costCapUsd?: number
  timeoutMs?: number
  metadata?: Record<string, unknown>
}

export interface CrossProviderEvalResult {
  receiptInput: CreateEvalReceiptInput
  successfulJudgeCount: number
  failedJudgeCount: number
  skippedJudgeCount: number
  estimatedCostUsd: number
}

const DEFAULT_DIMENSIONS = ['correctness', 'completeness', 'evidence']
const DEFAULT_MIN_SUCCESSFUL_JUDGES = 2
const DEFAULT_PASS_THRESHOLD = 7
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_COST_CAP_USD = 0.25
const MAX_DIMENSIONS = 16
const MAX_TASK_CHARS = 4_000
const MAX_ERROR_CHARS = 1_000

export async function runCrossProviderEval(input: RunCrossProviderEvalInput): Promise<CrossProviderEvalResult> {
  const dimensions = normalizeDimensions(input.dimensions)
  const metadata = input.metadata ?? {}
  const judgeInput: CrossProviderEvalJudgeInput = {
    orgId: input.orgId,
    projectId: input.projectId ?? null,
    runId: input.runId ?? null,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    task: input.task,
    output: input.output,
    dimensions,
    metadata,
  }
  const minSuccessfulJudges = Math.max(1, input.minSuccessfulJudges ?? DEFAULT_MIN_SUCCESSFUL_JUDGES)
  const passThreshold = clampScore(input.passThreshold ?? DEFAULT_PASS_THRESHOLD)
  const costCapUsd = Math.max(0, input.costCapUsd ?? DEFAULT_COST_CAP_USD)
  const timeoutMs = Math.max(250, input.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const planned = planProviderExecutions(input.providers, judgeInput, costCapUsd)
  const executed = await Promise.all(planned.runnable.map((provider) =>
    runJudgeProvider(provider, judgeInput, timeoutMs, dimensions),
  ))
  const judges = [...executed, ...planned.skipped]
  const scoredJudges = judges.filter((judge) => judge.ok && judge.scores && Object.keys(judge.scores).length > 0)
  const dimensionAverages = averageScores(scoredJudges, dimensions)
  const overallAverage = average(Object.values(dimensionAverages))
  const verdict = resolveVerdict({
    scoredJudgeCount: scoredJudges.length,
    minSuccessfulJudges,
    passThreshold,
    dimensionAverages,
    overallAverage,
  })
  const outputPayload = serializeEvalPayload(input.output)
  const outputHash = hashEvalPayload(outputPayload)
  const taskHash = hashEvalPayload(input.task)
  const failedJudgeCount = judges.filter((judge) => !judge.ok).length
  const skippedJudgeCount = planned.skipped.length

  return {
    receiptInput: {
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      runId: input.runId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      task: input.task.slice(0, MAX_TASK_CHARS),
      outputHash,
      dimensions,
      judges,
      verdict,
      aggregate: {
        schemaVersion: 1,
        minSuccessfulJudges,
        passThreshold,
        successfulJudgeCount: scoredJudges.length,
        failedJudgeCount,
        skippedJudgeCount,
        providerCount: input.providers.length,
        dimensionAverages,
        overallAverage,
        authoritative: verdict !== 'inconclusive',
        costCapUsd,
        estimatedCostUsd: planned.estimatedCostUsd,
        costCapExceeded: planned.costCapExceeded,
      },
      metadata: {
        ...metadata,
        eval_receipt_version: 1,
        task_hash: taskHash,
        output_length: outputPayload.length,
        output_kind: typeof input.output,
      },
    },
    successfulJudgeCount: scoredJudges.length,
    failedJudgeCount,
    skippedJudgeCount,
    estimatedCostUsd: planned.estimatedCostUsd,
  }
}

export function buildHeuristicEvalJudgeProvider(options: {
  providerClass: string
  model: string
  bias?: number
  estimatedCostUsd?: number
}): CrossProviderEvalJudgeProvider {
  return {
    providerClass: options.providerClass,
    model: options.model,
    estimateCostUsd: () => options.estimatedCostUsd ?? 0,
    async judge(input) {
      if (input.signal.aborted) throw new Error('judge_aborted')
      const text = serializeEvalPayload(input.output).toLowerCase()
      const task = input.task.toLowerCase()
      const base = heuristicBaseScore(text, task) + (options.bias ?? 0)
      const scores = Object.fromEntries(input.dimensions.map((dimension) => [
        dimension,
        clampScore(base + dimensionAdjustment(dimension, text)),
      ]))
      return {
        scores,
        summary: 'Deterministic local quality judge used for bounded smoke/eval receipt creation.',
        metadata: {
          deterministic: true,
          text_length: text.length,
        },
      }
    },
  }
}

export function defaultHeuristicEvalJudgeProviders(): CrossProviderEvalJudgeProvider[] {
  return [
    buildHeuristicEvalJudgeProvider({
      providerClass: 'lucid_quality',
      model: 'heuristic-quality-v1',
      bias: 0,
      estimatedCostUsd: 0,
    }),
    buildHeuristicEvalJudgeProvider({
      providerClass: 'lucid_safety',
      model: 'heuristic-safety-v1',
      bias: -0.15,
      estimatedCostUsd: 0,
    }),
    buildHeuristicEvalJudgeProvider({
      providerClass: 'lucid_evidence',
      model: 'heuristic-evidence-v1',
      bias: 0.1,
      estimatedCostUsd: 0,
    }),
  ]
}

function planProviderExecutions(
  providers: CrossProviderEvalJudgeProvider[],
  input: CrossProviderEvalJudgeInput,
  costCapUsd: number,
): {
  runnable: CrossProviderEvalJudgeProvider[]
  skipped: EvalJudgeResult[]
  estimatedCostUsd: number
  costCapExceeded: boolean
} {
  let estimatedCostUsd = 0
  let costCapExceeded = false
  const runnable: CrossProviderEvalJudgeProvider[] = []
  const skipped: EvalJudgeResult[] = []

  for (const provider of providers) {
    const estimate = Math.max(0, provider.estimateCostUsd?.(input) ?? 0)
    if (Number.isFinite(costCapUsd) && estimatedCostUsd + estimate > costCapUsd) {
      costCapExceeded = true
      skipped.push({
        providerClass: provider.providerClass,
        model: provider.model,
        ok: false,
        error: 'cost_cap_exceeded',
        durationMs: 0,
      })
      continue
    }
    estimatedCostUsd += estimate
    runnable.push(provider)
  }

  return { runnable, skipped, estimatedCostUsd, costCapExceeded }
}

async function runJudgeProvider(
  provider: CrossProviderEvalJudgeProvider,
  input: CrossProviderEvalJudgeInput,
  timeoutMs: number,
  dimensions: string[],
): Promise<EvalJudgeResult> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs) as ReturnType<typeof setTimeout> & {
    unref?: () => void
  }
  timeout.unref?.()

  try {
    const result = await provider.judge({ ...input, signal: controller.signal })
    const scores = normalizeScores(result.scores, dimensions)
    if (Object.keys(scores).length === 0) {
      return {
        providerClass: provider.providerClass,
        model: provider.model,
        ok: false,
        error: 'judge_returned_no_scores',
        durationMs: Date.now() - startedAt,
      }
    }

    return {
      providerClass: provider.providerClass,
      model: provider.model,
      ok: true,
      scores,
      durationMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      providerClass: provider.providerClass,
      model: provider.model,
      ok: false,
      error: normalizeError(error),
      durationMs: Date.now() - startedAt,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function resolveVerdict(input: {
  scoredJudgeCount: number
  minSuccessfulJudges: number
  passThreshold: number
  dimensionAverages: Record<string, number>
  overallAverage: number | null
}): EvalReceipt['verdict'] {
  if (input.scoredJudgeCount < input.minSuccessfulJudges || input.overallAverage === null) {
    return 'inconclusive'
  }
  const hasFailedDimension = Object.values(input.dimensionAverages).some((score) => score < input.passThreshold)
  if (hasFailedDimension || input.overallAverage < input.passThreshold) return 'fail'
  return 'pass'
}

function normalizeDimensions(dimensions?: string[]): string[] {
  const seen = new Set<string>()
  const normalized = (dimensions && dimensions.length > 0 ? dimensions : DEFAULT_DIMENSIONS)
    .map((dimension) => dimension.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter(Boolean)
    .filter((dimension) => {
      if (seen.has(dimension)) return false
      seen.add(dimension)
      return true
    })
    .slice(0, MAX_DIMENSIONS)
  return normalized.length > 0 ? normalized : DEFAULT_DIMENSIONS
}

function normalizeScores(scores: Record<string, number> | undefined, dimensions: string[]): Record<string, number> {
  if (!scores) return {}
  const normalizedSource = Object.fromEntries(
    Object.entries(scores).map(([key, value]) => [
      key.trim().toLowerCase().replace(/\s+/g, '_'),
      value,
    ]),
  )
  const fallback = typeof normalizedSource.overall === 'number' ? normalizedSource.overall : undefined
  const normalized: Record<string, number> = {}
  for (const dimension of dimensions) {
    const score = normalizedSource[dimension] ?? fallback
    if (typeof score === 'number' && Number.isFinite(score)) {
      normalized[dimension] = clampScore(score)
    }
  }
  return normalized
}

function averageScores(judges: EvalJudgeResult[], dimensions: string[]): Record<string, number> {
  const averages: Record<string, number> = {}
  for (const dimension of dimensions) {
    const values = judges
      .map((judge) => judge.scores?.[dimension])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    if (values.length > 0) averages[dimension] = roundScore(average(values) ?? 0)
  }
  return averages
}

function serializeEvalPayload(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return String(value)
  }
}

function hashEvalPayload(value: unknown): string {
  return crypto.createHash('sha256').update(serializeEvalPayload(value)).digest('hex')
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, MAX_ERROR_CHARS)
  return String(error).slice(0, MAX_ERROR_CHARS)
}

function heuristicBaseScore(text: string, task: string): number {
  let score = 7
  if (text.length < 80) score -= 2
  if (text.length > 300) score += 0.6
  if (text.includes('error') || text.includes('failed') || text.includes('unable')) score -= 1.5
  const taskTokens = task.split(/[^a-z0-9]+/).filter((token) => token.length > 4).slice(0, 12)
  const coveredTokens = taskTokens.filter((token) => text.includes(token)).length
  if (taskTokens.length > 0) score += Math.min(1.2, coveredTokens / taskTokens.length)
  return score
}

function dimensionAdjustment(dimension: string, text: string): number {
  if (dimension.includes('evidence')) {
    return text.includes('http') || text.includes('evidence') || text.includes('because') ? 0.6 : -0.4
  }
  if (dimension.includes('safety')) {
    return text.includes('api_key') || text.includes('password') || text.includes('secret') ? -2.5 : 0.3
  }
  if (dimension.includes('completeness')) {
    return text.length > 500 ? 0.4 : 0
  }
  return 0
}

function clampScore(value: number): number {
  return roundScore(Math.min(Math.max(value, 0), 10))
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
