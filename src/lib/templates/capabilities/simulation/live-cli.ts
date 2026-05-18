#!/usr/bin/env npx tsx
import 'dotenv/config'
import { config as loadEnvFile } from 'dotenv'

import { WEB3_CAPABILITY_TEMPLATES } from '@/lib/templates/capabilities/catalog'
import {
  buildLiveWeb3Scenario,
  fetchLiveWeb3MarketSnapshot,
  type LiveWeb3MarketSnapshot,
} from './live-market'
import {
  resolveLlmLiveSimulationConfigs,
  runLlmLiveWeb3TemplateSimulation,
  type LlmLiveSimulationConfig,
} from './llm-live'
import { formatWeb3SimulationOutput, runWeb3TemplateSimulation } from './runner'
import {
  assertWeb3TemplateQualityReady,
  formatWeb3TemplateQualityScorecard,
  scoreWeb3TemplateOutcome,
  type Web3TemplateQualityScorecard,
} from './quality'
import { getWeb3SimulationScenario } from './web3-fixtures'

loadEnvFile({ path: '.env.local', override: false })

type Mode = 'smoke' | 'stress' | 'llm-stress'

interface CliOptions {
  mode: Mode
  iterations: number
  concurrency: number
  templateKey?: string
  threshold: number
  timeoutMs: number
  allowFixtureFallback: boolean
}

interface SimulationJob {
  manifestIndex: number
  iteration: number
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const manifests = WEB3_CAPABILITY_TEMPLATES.filter((manifest) => {
    return !options.templateKey || manifest.key === options.templateKey
  })
  if (manifests.length === 0) throw new Error(`No Web3 capability template found for ${options.templateKey}`)

  const snapshot = await fetchLiveWeb3MarketSnapshot({
    allowFixtureFallback: options.allowFixtureFallback,
    timeoutMs: options.timeoutMs,
  })
  printSnapshotSummary(snapshot)

  const llmConfigs = options.mode === 'llm-stress' ? resolveLlmLiveSimulationConfigs() : []
  if (options.mode === 'llm-stress' && llmConfigs.length === 0) {
    throw new Error(
      'Missing LLM provider for capability-templates:stress:llm-live. Set TRUSTGATE_API_KEY or OPENAI_API_KEY, or set CAPABILITY_TEMPLATE_LLM_ENABLE_LUCID=true with a healthy LUCID_API_KEY.',
    )
  }

  const jobs: SimulationJob[] = []
  const iterations = options.mode === 'smoke' ? 1 : options.iterations
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let manifestIndex = 0; manifestIndex < manifests.length; manifestIndex += 1) {
      jobs.push({ manifestIndex, iteration })
    }
  }

  const scorecards = await runPool(jobs, options.concurrency, async (job) => {
    const manifest = manifests[job.manifestIndex]
    const baseScenario = getWeb3SimulationScenario(manifest.key)
    const scenario = buildLiveWeb3Scenario({
      scenario: baseScenario,
      snapshot,
    })
    const scorecard = options.mode === 'llm-stress'
      ? await runLlmJob({
          configs: llmConfigs,
          manifest,
          scenario,
          snapshot,
          threshold: options.threshold,
          timeoutMs: options.timeoutMs,
        })
      : runDeterministicJob({
          manifest,
          scenario,
          snapshot,
          threshold: options.threshold,
        })

    const marker = scorecard.passed ? '✓' : '✗'
    console.log(`${marker} iteration=${job.iteration + 1} ${formatWeb3TemplateQualityScorecard(scorecard)}`)
    return scorecard
  })

  for (const scorecard of scorecards) assertWeb3TemplateQualityReady(scorecard)
  printScoreSummary(scorecards, options.mode)
}

function runDeterministicJob(input: {
  manifest: (typeof WEB3_CAPABILITY_TEMPLATES)[number]
  scenario: ReturnType<typeof buildLiveWeb3Scenario>
  snapshot: LiveWeb3MarketSnapshot
  threshold: number
}): Web3TemplateQualityScorecard {
  const startedAt = Date.now()
  const result = runWeb3TemplateSimulation({
    manifest: input.manifest,
    scenario: input.scenario,
  })
  return scoreWeb3TemplateOutcome({
    manifest: input.manifest,
    scenario: input.scenario,
    output: result.output,
    answerText: formatWeb3SimulationOutput(result.output),
    liveSnapshot: input.snapshot,
    latencyMs: Date.now() - startedAt,
    threshold: input.threshold,
  })
}

async function runLlmJob(input: {
  configs: LlmLiveSimulationConfig[]
  manifest: (typeof WEB3_CAPABILITY_TEMPLATES)[number]
  scenario: ReturnType<typeof buildLiveWeb3Scenario>
  snapshot: LiveWeb3MarketSnapshot
  threshold: number
  timeoutMs: number
}): Promise<Web3TemplateQualityScorecard> {
  const providerFailures: string[] = []
  let result: Awaited<ReturnType<typeof runLlmLiveWeb3TemplateSimulation>> | null = null
  for (const config of input.configs) {
    try {
      result = await runLlmLiveWeb3TemplateSimulation({
        manifest: input.manifest,
        scenario: input.scenario,
        liveSnapshot: input.snapshot,
        config,
        timeoutMs: input.timeoutMs,
      })
      if (providerFailures.length > 0) {
        console.log(`provider fallback: ${providerFailures.join(' | ')} -> ${result.providerLabel}`)
      }
      break
    } catch (error: unknown) {
      providerFailures.push(`${config.providerLabel}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (!result) throw new Error(`All LLM providers failed: ${providerFailures.join(' | ')}`)
  const scorecard = scoreWeb3TemplateOutcome({
    manifest: input.manifest,
    scenario: input.scenario,
    answerText: result.answerText,
    liveSnapshot: input.snapshot,
    latencyMs: result.latencyMs,
    threshold: input.threshold,
  })
  const failures = [
    ...scorecard.failures,
    ...(result.latencyMs > 30_000 ? [`latency: ${result.latencyMs}ms exceeds 30000ms`] : []),
  ]
  return {
    ...scorecard,
    failures,
    passed: scorecard.passed && failures.length === 0,
  }
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
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

function printSnapshotSummary(snapshot: LiveWeb3MarketSnapshot): void {
  const liveSources = Object.entries(snapshot.sourceStatuses)
    .filter(([, status]) => status === 'live')
    .map(([source]) => source)
  const failedSources = Object.entries(snapshot.sourceStatuses)
    .filter(([, status]) => status !== 'live')
    .map(([source, status]) => `${source}:${status}`)
  console.log(`Live Web3 snapshot fetched at ${snapshot.fetchedAt}`)
  console.log(`Live sources: ${liveSources.join(', ') || 'none'}`)
  if (failedSources.length > 0) console.log(`Warnings: ${failedSources.join(', ')}`)
  if (snapshot.warnings.length > 0) {
    for (const warning of snapshot.warnings) console.log(`warning: ${warning}`)
  }
}

function printScoreSummary(scorecards: Web3TemplateQualityScorecard[], mode: Mode): void {
  const latencies = scorecards
    .map((scorecard) => scorecard.latencyMs)
    .filter((value): value is number => typeof value === 'number')
    .sort((left, right) => left - right)
  const avgScore = scorecards.reduce((sum, scorecard) => sum + scorecard.score, 0) / scorecards.length
  console.log(`\n${scorecards.length} Web3 ${mode} simulation(s) passed.`)
  console.log(`Average quality score: ${avgScore.toFixed(1)}/10`)
  if (latencies.length > 0) {
    console.log(`Latency p50=${percentile(latencies, 0.5)}ms p95=${percentile(latencies, 0.95)}ms max=${latencies.at(-1)}ms`)
  }
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))
  return values[index] ?? 0
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: 'smoke',
    iterations: 3,
    concurrency: 3,
    threshold: 8,
    timeoutMs: 45_000,
    allowFixtureFallback: false,
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
    } else if (arg === '--template' && next) {
      options.templateKey = next
      index += 1
    } else if (arg === '--threshold' && next) {
      options.threshold = Number.parseFloat(next)
      index += 1
    } else if (arg === '--timeout-ms' && next) {
      options.timeoutMs = positiveInteger(next, '--timeout-ms')
      index += 1
    } else if (arg === '--allow-fixture-fallback') {
      options.allowFixtureFallback = true
    } else if (arg === '--help') {
      printHelp()
      process.exit(0)
    }
  }
  return options
}

function parseMode(value: string): Mode {
  if (value === 'smoke' || value === 'stress' || value === 'llm-stress') return value
  throw new Error(`Unknown mode "${value}". Expected smoke, stress, or llm-stress.`)
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`)
  return parsed
}

function printHelp(): void {
  console.log([
    'Usage: npm run capability-templates:simulate:live -- [options]',
    '',
    'Options:',
    '  --mode smoke|stress|llm-stress',
    '  --iterations <n>              Stress iterations per template',
    '  --concurrency <n>             Concurrent simulations',
    '  --template <template-key>      Limit to one template',
    '  --threshold <score>            Minimum quality score, default 8',
    '  --timeout-ms <n>               Live source and LLM timeout',
    '  --allow-fixture-fallback       Do not fail if every live market source is unavailable',
  ].join('\n'))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
