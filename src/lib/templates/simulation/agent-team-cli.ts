#!/usr/bin/env npx tsx
import 'dotenv/config'
import { config as loadEnvFile } from 'dotenv'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getPlatformTemplateSeeds } from '@/lib/templates/registry'
import {
  getAgentTeamTemplateSimulationScenario,
  getAgentTeamTemplateSimulationScenarios,
} from './agent-team-fixtures'
import {
  assertAgentTeamTemplateSimulationReady,
  formatAgentTeamTemplateSimulationOutput,
  runAgentTeamTemplateSimulation,
} from './agent-team-runner'
import { assertAgentTeamTemplateQualityReady, scoreAgentTeamTemplateOutcome, type AgentTeamTemplateQualityScorecard } from './agent-team-quality'
import {
  resolveLlmLiveSimulationConfigs,
  runAgentTeamLlmTemplateSimulation,
  type LlmLiveSimulationConfig,
} from './agent-team-llm'
import {
  buildLiveAgentTeamScenario,
  fetchLiveAgentTeamSourceSnapshot,
  type LiveAgentTeamSourceSnapshot,
} from './agent-team-live'

loadEnvFile({ path: '.env.local', override: false })

type Mode = 'simulate' | 'live-smoke' | 'live-stress' | 'llm-stress' | 'llm-live-stress'

interface CliOptions {
  mode: Mode
  iterations: number
  concurrency: number
  threshold: number
  timeoutMs: number
  templateSlug?: string
  allowFixtureFallback: boolean
  reportPath?: string
  includeAnswers: boolean
}

interface AgentTeamTemplateSimulationRunRecord {
  scorecard: AgentTeamTemplateQualityScorecard
  answerText: string
  providerLabel: string
  model: string
  templateName: string
  templateKind: string
  family: string
  liveEvidenceAnchors: string[]
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const templates = getPlatformTemplateSeeds().filter((template) => !options.templateSlug || template.slug === options.templateSlug)
  if (templates.length === 0) throw new Error(`No agent-team template found for ${options.templateSlug}`)
  const scenariosBySlug = new Map(getAgentTeamTemplateSimulationScenarios().map((scenario) => [scenario.templateSlug, scenario]))
  const liveSnapshot = usesLiveSources(options.mode)
    ? await fetchLiveAgentTeamSourceSnapshot({
        timeoutMs: options.timeoutMs,
        allowFixtureFallback: options.allowFixtureFallback,
      })
    : null
  if (liveSnapshot) printLiveSnapshotSummary(liveSnapshot)

  const llmConfigs = usesLlm(options.mode) ? resolveLlmLiveSimulationConfigs() : []
  if (usesLlm(options.mode) && llmConfigs.length === 0) {
    throw new Error('Missing LLM provider. Set TRUSTGATE_API_KEY or OPENAI_API_KEY, or set CAPABILITY_TEMPLATE_LLM_ENABLE_LUCID=true with a healthy LUCID_API_KEY.')
  }

  const jobs = Array.from({ length: options.iterations }).flatMap((_, iteration) => {
    return templates.map((template) => ({ template, iteration }))
  })
  const records = await runPool(jobs, options.concurrency, async ({ template, iteration }) => {
    const scenario = scenariosBySlug.get(template.slug) ?? getAgentTeamTemplateSimulationScenario(template.slug)
    const liveScenario = liveSnapshot
      ? buildLiveAgentTeamScenario({ scenario, snapshot: liveSnapshot })
      : scenario
    const record = usesLlm(options.mode)
      ? await runLlmJob({ template, scenario: liveScenario, configs: llmConfigs, threshold: options.threshold, timeoutMs: options.timeoutMs })
      : runDeterministicJob({ template, scenario: liveScenario, threshold: options.threshold })
    const scorecard = record.scorecard
    const marker = scorecard.passed ? '✓' : '✗'
    const latency = scorecard.latencyMs === undefined ? '' : ` latency=${scorecard.latencyMs}ms`
    const failures = scorecard.failures.length > 0 ? ` failures=${scorecard.failures.join(' | ')}` : ''
    console.log(`${marker} iteration=${iteration + 1} ${scorecard.templateSlug}/${scorecard.scenarioId} score=${scorecard.score}/${scorecard.threshold} quality=${scorecard.qualityPercent}% live_accuracy=${scorecard.liveEvidenceAccuracyPercent}%${latency}${failures}`)
    return record
  })

  const scorecards = records.map((record) => record.scorecard)
  for (const scorecard of scorecards) assertAgentTeamTemplateQualityReady(scorecard)
  printSummary(scorecards, options.mode)
  if (options.reportPath) {
    await writeReport({
      path: options.reportPath,
      records,
      mode: options.mode,
      liveSnapshot,
      includeAnswers: options.includeAnswers,
    })
    console.log(`Report written to ${options.reportPath}`)
  }
}

function runDeterministicJob(input: {
  template: ReturnType<typeof getPlatformTemplateSeeds>[number]
  scenario: ReturnType<typeof getAgentTeamTemplateSimulationScenario>
  threshold: number
}): AgentTeamTemplateSimulationRunRecord {
  const startedAt = Date.now()
  const result = runAgentTeamTemplateSimulation(input)
  assertAgentTeamTemplateSimulationReady(result)
  const answerText = formatAgentTeamTemplateSimulationOutput(result.output)
  const scorecard = scoreAgentTeamTemplateOutcome({
    template: input.template,
    scenario: input.scenario,
    output: result.output,
    answerText,
    latencyMs: Date.now() - startedAt,
    threshold: input.threshold,
  })
  return {
    scorecard,
    answerText,
    providerLabel: 'deterministic',
    model: 'fixture',
    templateName: input.template.name,
    templateKind: input.template.kind,
    family: input.scenario.family,
    liveEvidenceAnchors: input.scenario.liveEvidenceAnchors ?? [],
  }
}

async function runLlmJob(input: {
  template: ReturnType<typeof getPlatformTemplateSeeds>[number]
  scenario: ReturnType<typeof getAgentTeamTemplateSimulationScenario>
  configs: LlmLiveSimulationConfig[]
  threshold: number
  timeoutMs: number
}): Promise<AgentTeamTemplateSimulationRunRecord> {
  const providerFailures: string[] = []
  let result: Awaited<ReturnType<typeof runAgentTeamLlmTemplateSimulation>> | null = null
  for (const config of input.configs) {
    try {
      result = await runAgentTeamLlmTemplateSimulation({
        template: input.template,
        scenario: input.scenario,
        config,
        timeoutMs: input.timeoutMs,
      })
      if (providerFailures.length > 0) console.log(`provider fallback: ${providerFailures.join(' | ')} -> ${result.providerLabel}`)
      break
    } catch (error) {
      providerFailures.push(`${config.providerLabel}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (!result) throw new Error(`All LLM providers failed: ${providerFailures.join(' | ')}`)
  const scorecard = scoreAgentTeamTemplateOutcome({
    template: input.template,
    scenario: input.scenario,
    answerText: result.answerText,
    latencyMs: result.latencyMs,
    threshold: input.threshold,
  })
  const failures = [
    ...scorecard.failures,
    ...(result.latencyMs > 30_000 ? [`latency: ${result.latencyMs}ms exceeds 30000ms`] : []),
  ]
  return {
    scorecard: {
      ...scorecard,
      failures,
      passed: scorecard.passed && failures.length === 0,
    },
    answerText: result.answerText,
    providerLabel: result.providerLabel,
    model: result.model,
    templateName: input.template.name,
    templateKind: input.template.kind,
    family: input.scenario.family,
    liveEvidenceAnchors: input.scenario.liveEvidenceAnchors ?? [],
  }
}

async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex
      nextIndex += 1
      results[current] = await worker(items[current] as T)
    }
  }))
  return results
}

function printSummary(scorecards: AgentTeamTemplateQualityScorecard[], mode: Mode): void {
  const latencies = scorecards
    .map((scorecard) => scorecard.latencyMs)
    .filter((value): value is number => typeof value === 'number')
    .sort((left, right) => left - right)
  const avgScore = scorecards.reduce((sum, scorecard) => sum + scorecard.score, 0) / scorecards.length
  console.log(`\n${scorecards.length} agent-team template ${mode} simulation(s) passed.`)
  console.log(`Average quality score: ${avgScore.toFixed(1)}/10`)
  if (latencies.length > 0) {
    console.log(`Latency p50=${percentile(latencies, 0.5)}ms p95=${percentile(latencies, 0.95)}ms max=${latencies.at(-1)}ms`)
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: 'simulate',
    iterations: 1,
    concurrency: 4,
    threshold: 8,
    timeoutMs: 45_000,
    allowFixtureFallback: false,
    includeAnswers: true,
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]
    if (arg === '--mode' && next) {
      options.mode = parseMode(next)
      index += 1
    } else if (arg === '--iterations' && next) {
      options.iterations = positiveInteger(next, '--iterations')
      index += 1
    } else if (arg === '--concurrency' && next) {
      options.concurrency = positiveInteger(next, '--concurrency')
      index += 1
    } else if (arg === '--threshold' && next) {
      options.threshold = Number.parseFloat(next)
      index += 1
    } else if (arg === '--timeout-ms' && next) {
      options.timeoutMs = positiveInteger(next, '--timeout-ms')
      index += 1
    } else if (arg === '--template' && next) {
      options.templateSlug = next
      index += 1
    } else if (arg === '--allow-fixture-fallback') {
      options.allowFixtureFallback = true
    } else if (arg === '--report' && next) {
      options.reportPath = next
      index += 1
    } else if (arg === '--no-answers') {
      options.includeAnswers = false
    }
  }
  return options
}

function parseMode(value: string): Mode {
  if (
    value === 'simulate'
    || value === 'live-smoke'
    || value === 'live-stress'
    || value === 'llm-stress'
    || value === 'llm-live-stress'
  ) return value
  throw new Error(`Unknown mode "${value}". Expected simulate, live-smoke, live-stress, llm-stress, or llm-live-stress.`)
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`)
  return parsed
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))
  return values[index] ?? 0
}

function usesLiveSources(mode: Mode): boolean {
  return mode === 'live-smoke' || mode === 'live-stress' || mode === 'llm-live-stress'
}

function usesLlm(mode: Mode): boolean {
  return mode === 'llm-stress' || mode === 'llm-live-stress'
}

function printLiveSnapshotSummary(snapshot: LiveAgentTeamSourceSnapshot): void {
  const liveSources = Object.entries(snapshot.sourceStatuses)
    .filter(([, status]) => status === 'live')
    .map(([source]) => source)
  const failedSources = Object.entries(snapshot.sourceStatuses)
    .filter(([, status]) => status !== 'live')
    .map(([source, status]) => `${source}:${status}`)
  console.log(`Live agent/team snapshot fetched at ${snapshot.fetchedAt}`)
  console.log(`Live sources: ${liveSources.join(', ') || 'none'}`)
  if (failedSources.length > 0) console.log(`Warnings: ${failedSources.join(', ')}`)
  for (const warning of snapshot.warnings) console.log(`warning: ${warning}`)
}

async function writeReport(input: {
  path: string
  records: AgentTeamTemplateSimulationRunRecord[]
  mode: Mode
  liveSnapshot: LiveAgentTeamSourceSnapshot | null
  includeAnswers: boolean
}): Promise<void> {
  const absolutePath = path.resolve(input.path)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  const scorecards = input.records.map((record) => record.scorecard)
  const avgScore = scorecards.reduce((sum, scorecard) => sum + scorecard.score, 0) / scorecards.length
  const avgLiveAccuracy = scorecards.reduce((sum, scorecard) => sum + scorecard.liveEvidenceAccuracyPercent, 0) / scorecards.length
  const latencies = scorecards
    .map((scorecard) => scorecard.latencyMs)
    .filter((value): value is number => typeof value === 'number')
    .sort((left, right) => left - right)
  const sourceSummary = input.liveSnapshot
    ? Object.entries(input.liveSnapshot.sourceStatuses).map(([source, status]) => `${source}:${status}`).join(', ')
    : 'not used'
  const body = [
    '# Agent/Team Template Live Quality Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Mode: ${input.mode}`,
    `Templates: ${input.records.length}`,
    `Average quality: ${Math.round(avgScore * 10)}%`,
    `Average live-anchor accuracy: ${Math.round(avgLiveAccuracy)}%`,
    latencies.length > 0 ? `Latency: p50=${percentile(latencies, 0.5)}ms p95=${percentile(latencies, 0.95)}ms max=${latencies.at(-1)}ms` : null,
    `Live sources: ${sourceSummary}`,
    '',
    '## Results',
    '',
    ...input.records.flatMap((record) => formatReportRecord(record, input.includeAnswers)),
  ].filter((line): line is string => line !== null).join('\n')
  await writeFile(absolutePath, `${body}\n`, 'utf8')
}

function formatReportRecord(record: AgentTeamTemplateSimulationRunRecord, includeAnswer: boolean): string[] {
  const scorecard = record.scorecard
  return [
    `### ${record.templateName} (${scorecard.templateSlug})`,
    '',
    `- Type: ${record.templateKind}`,
    `- Family: ${record.family}`,
    `- Provider/model: ${record.providerLabel}/${record.model}`,
    `- Quality: ${scorecard.qualityPercent}% (${scorecard.score}/${scorecard.threshold})`,
    `- Live-anchor accuracy: ${scorecard.liveEvidenceAccuracyPercent}%`,
    `- Latency: ${scorecard.latencyMs ?? 'n/a'}ms`,
    `- Matched live anchors: ${scorecard.matchedLiveEvidenceAnchors.join(', ') || 'none'}`,
    `- Missing live anchors: ${scorecard.missingLiveEvidenceAnchors.join(', ') || 'none'}`,
    `- Failures: ${scorecard.failures.join(' | ') || 'none'}`,
    `- Check scores: sections=${scorecard.checks.sections}, terms=${scorecard.checks.expectedTerms}, live=${scorecard.checks.liveEvidenceAnchors}, evidence=${scorecard.checks.evidenceGrounding}, safety=${scorecard.checks.safety}, actions=${scorecard.checks.actionability}, provenance=${scorecard.checks.provenance}`,
    ...(includeAnswer
      ? [
          '',
          '<details>',
          '<summary>Full answer</summary>',
          '',
          '```md',
          normalizeMarkdownForReport(record.answerText),
          '```',
          '',
          '</details>',
        ]
      : []),
    '',
  ]
}

function normalizeMarkdownForReport(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
