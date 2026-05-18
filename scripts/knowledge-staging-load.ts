#!/usr/bin/env tsx
import { config as loadDotenv } from 'dotenv'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import {
  buildKnowledgeStagingLoadReport,
  type KnowledgeStagingLoadSample,
} from '../src/lib/knowledge/staging-load'
import type { KnowledgeLayer } from '../src/lib/knowledge/types'

type Target = 'local' | 'staging' | 'production'

interface CliOptions {
  target: Target
  orgId: string
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  scopedUserId?: string | null
  queries: string[]
  iterations: number
  concurrency: number
  warmupIterations: number
  maxP95Ms: number
  maxFailureRate: number
  allowEmptyPackets: boolean
  requiredLayers: KnowledgeLayer[]
  layers: KnowledgeLayer[]
  json: boolean
  dryRun: boolean
}

const DEFAULT_QUERIES = [
  'What are the current project facts and evidence?',
  'What organization policy should guide this workflow?',
  'What recent team operating context should the agent use?',
  'Which source-backed facts are relevant to this request?',
]

const require = createRequire(import.meta.url)

loadDotenv({ path: '.env.local', override: false })
loadDotenv({ override: false })

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    target: 'staging',
    orgId: process.env.KNOWLEDGE_LOAD_ORG_ID ?? '',
    projectId: process.env.KNOWLEDGE_LOAD_PROJECT_ID || null,
    teamId: process.env.KNOWLEDGE_LOAD_TEAM_ID || null,
    assistantId: process.env.KNOWLEDGE_LOAD_ASSISTANT_ID || null,
    scopedUserId: process.env.KNOWLEDGE_LOAD_SCOPED_USER_ID || null,
    queries: process.env.KNOWLEDGE_LOAD_QUERIES
      ? process.env.KNOWLEDGE_LOAD_QUERIES.split('|').map((query) => query.trim()).filter(Boolean)
      : DEFAULT_QUERIES,
    iterations: Number.parseInt(process.env.KNOWLEDGE_LOAD_ITERATIONS ?? '24', 10),
    concurrency: Number.parseInt(process.env.KNOWLEDGE_LOAD_CONCURRENCY ?? '4', 10),
    warmupIterations: Number.parseInt(process.env.KNOWLEDGE_LOAD_WARMUP_ITERATIONS ?? '0', 10),
    maxP95Ms: Number.parseInt(process.env.KNOWLEDGE_LOAD_MAX_P95_MS ?? '900', 10),
    maxFailureRate: Number.parseFloat(process.env.KNOWLEDGE_LOAD_MAX_FAILURE_RATE ?? '0.02'),
    allowEmptyPackets: false,
    requiredLayers: [],
    layers: process.env.KNOWLEDGE_LOAD_LAYERS ? parseLayers(process.env.KNOWLEDGE_LOAD_LAYERS) : [],
    json: false,
    dryRun: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--target') {
      const next = argv[++index]
      if (!isTarget(next)) throw new Error('Invalid --target. Expected local, staging, or production.')
      options.target = next
    } else if (arg === '--org-id') {
      options.orgId = requireValue(argv, ++index, '--org-id')
    } else if (arg === '--project-id') {
      options.projectId = requireValue(argv, ++index, '--project-id')
    } else if (arg === '--team-id') {
      options.teamId = requireValue(argv, ++index, '--team-id')
    } else if (arg === '--assistant-id') {
      options.assistantId = requireValue(argv, ++index, '--assistant-id')
    } else if (arg === '--scoped-user-id') {
      options.scopedUserId = requireValue(argv, ++index, '--scoped-user-id')
    } else if (arg === '--query') {
      options.queries.push(requireValue(argv, ++index, '--query'))
    } else if (arg === '--queries') {
      options.queries = requireValue(argv, ++index, '--queries').split('|').map((query) => query.trim()).filter(Boolean)
    } else if (arg === '--iterations') {
      options.iterations = parsePositiveInt(requireValue(argv, ++index, '--iterations'), '--iterations')
    } else if (arg === '--concurrency') {
      options.concurrency = parsePositiveInt(requireValue(argv, ++index, '--concurrency'), '--concurrency')
    } else if (arg === '--warmup-iterations') {
      options.warmupIterations = parseNonNegativeInt(requireValue(argv, ++index, '--warmup-iterations'), '--warmup-iterations')
    } else if (arg === '--max-p95-ms') {
      options.maxP95Ms = parsePositiveInt(requireValue(argv, ++index, '--max-p95-ms'), '--max-p95-ms')
    } else if (arg === '--max-failure-rate') {
      options.maxFailureRate = Number.parseFloat(requireValue(argv, ++index, '--max-failure-rate'))
    } else if (arg === '--required-layers') {
      options.requiredLayers = parseLayers(requireValue(argv, ++index, '--required-layers'))
    } else if (arg === '--layers') {
      options.layers = parseLayers(requireValue(argv, ++index, '--layers'))
    } else if (arg === '--allow-empty') {
      options.allowEmptyPackets = true
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  options.queries = Array.from(new Set(options.queries.map((query) => query.trim()).filter(Boolean)))
  if (!options.orgId) throw new Error('--org-id or KNOWLEDGE_LOAD_ORG_ID is required.')
  if (!Number.isFinite(options.maxFailureRate) || options.maxFailureRate < 0 || options.maxFailureRate > 1) {
    throw new Error('--max-failure-rate must be between 0 and 1.')
  }
  if (!Number.isFinite(options.warmupIterations) || options.warmupIterations < 0) {
    options.warmupIterations = 0
  }
  if (options.warmupIterations === 0) {
    options.warmupIterations = Math.min(options.concurrency, options.iterations)
  }
  return options
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2))

  if (options.dryRun) {
    printPlan(options)
    return 0
  }

  const startedAt = Date.now()
  const warmupSamples = options.warmupIterations > 0 ? await runLoad({ ...options, iterations: options.warmupIterations }) : []
  const samples = await runLoad(options)
  const report = buildKnowledgeStagingLoadReport(samples, {
    maxP95Ms: options.maxP95Ms,
    maxFailureRate: options.maxFailureRate,
    allowEmptyPackets: options.allowEmptyPackets,
    requiredLayers: options.requiredLayers,
  })
  const payload = {
    target: options.target,
    orgId: options.orgId,
    projectId: options.projectId ?? null,
    teamId: options.teamId ?? null,
    assistantId: options.assistantId ?? null,
    scopedUserId: options.scopedUserId ?? null,
    wallTimeMs: Date.now() - startedAt,
    warmupIterations: warmupSamples.length,
    warmupMaxMs: warmupSamples.length ? Math.max(...warmupSamples.map((sample) => sample.durationMs)) : 0,
    report,
    samples: samples.slice(0, 10),
  }

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2))
  } else {
    printReport(payload)
  }

  return report.status === 'pass' ? 0 : 1
}

async function runLoad(options: CliOptions): Promise<KnowledgeStagingLoadSample[]> {
  const samples: KnowledgeStagingLoadSample[] = []
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < options.iterations) {
      const index = cursor++
      const query = options.queries[index % options.queries.length]!
      samples[index] = await runSample(options, query)
    }
  }

  await Promise.all(Array.from({ length: Math.min(options.concurrency, options.iterations) }, () => worker()))
  return samples
}

async function runSample(options: CliOptions, query: string): Promise<KnowledgeStagingLoadSample> {
  const startedAt = Date.now()
  try {
    allowServerOnlyImportsForCli()
    const { retrieveKnowledgeContext } = await import('../src/lib/knowledge/service')
    const packet = await retrieveKnowledgeContext({
      orgId: options.orgId,
      projectId: options.projectId,
      teamId: options.teamId,
      assistantId: options.assistantId,
      scopedUserId: options.scopedUserId,
      query,
      layers: options.layers.length ? options.layers : undefined,
      budget: {
        maxLatencyMs: options.maxP95Ms,
        maxPromptTokens: 1200,
        maxItemsPerLayer: 4,
      },
      evalCapture: {
        enabled: false,
        surface: 'mission_control',
      },
    })
    return {
      query,
      durationMs: packet.telemetry.durationMs || Date.now() - startedAt,
      itemCount: packet.items.length,
      timedOut: packet.telemetry.timedOut,
      fallbackUsed: packet.telemetry.fallbackUsed,
      retrievalCounts: packet.telemetry.retrievalCounts,
    }
  } catch (error) {
    return {
      query,
      durationMs: Date.now() - startedAt,
      itemCount: 0,
      timedOut: false,
      fallbackUsed: false,
      retrievalCounts: {},
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function allowServerOnlyImportsForCli(): void {
  const serverOnlyPath = require.resolve('server-only')
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  }
}

function printPlan(options: CliOptions): void {
  console.log(`Knowledge staging load plan (${options.target})`)
  console.log(`- org: ${options.orgId}`)
  console.log(`- project: ${options.projectId ?? 'none'}`)
  console.log(`- team: ${options.teamId ?? 'none'}`)
  console.log(`- iterations: ${options.iterations}`)
  console.log(`- concurrency: ${options.concurrency}`)
  console.log(`- warmup iterations: ${options.warmupIterations || 'auto'}`)
  console.log(`- max p95: ${options.maxP95Ms}ms`)
  console.log(`- max failure rate: ${options.maxFailureRate}`)
  console.log(`- allow empty packets: ${options.allowEmptyPackets}`)
  console.log(`- required layers: ${options.requiredLayers.join(',') || 'none'}`)
  console.log(`- retrieval layers: ${options.layers.join(',') || 'service default'}`)
  console.log('- queries:')
  for (const query of options.queries) console.log(`  - ${query}`)
}

function printReport(payload: {
  target: Target
  orgId: string
  projectId: string | null
  teamId: string | null
  assistantId: string | null
  scopedUserId: string | null
  wallTimeMs: number
  report: ReturnType<typeof buildKnowledgeStagingLoadReport>
  warmupIterations?: number
  warmupMaxMs?: number
}): void {
  const { report } = payload
  console.log(`Knowledge staging load (${payload.target}): ${report.status}`)
  console.log(`- samples: ${report.sampleCount}`)
  console.log(`- p50/p95/max: ${report.p50Ms}ms / ${report.p95Ms}ms / ${report.maxMs}ms`)
  console.log(`- failure rate: ${Math.round(report.failureRate * 10000) / 100}%`)
  console.log(`- empty/timeouts/fallbacks: ${report.emptyPackets} / ${report.timedOutPackets} / ${report.fallbackPackets}`)
  console.log(`- layers: ${Object.entries(report.layerCounts).map(([layer, count]) => `${layer}=${count}`).join(',') || 'none'}`)
  console.log(`- blocking: ${report.blockingReasons.join(', ') || 'none'}`)
  console.log(`- warmup: ${payload.warmupIterations ?? 0} samples, max ${payload.warmupMaxMs ?? 0}ms`)
  console.log(`- wall time: ${payload.wallTimeMs}ms`)
}

function printHelp(): void {
  console.log(`Knowledge staging load

Usage:
  npm run knowledge:staging-load -- --org-id <uuid> --target staging
  npm run knowledge:staging-load -- --org-id <uuid> --project-id <uuid> --iterations 50 --concurrency 5

Environment:
  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY should point at the target environment.
  Optional: OPENAI_API_KEY or your configured embedding provider for full semantic/RAG recall.

Options:
  --target local|staging|production
  --org-id uuid
  --project-id uuid
  --team-id uuid
  --assistant-id uuid
  --scoped-user-id value
  --queries "query one|query two"
  --query "additional query"
  --iterations number
  --concurrency number
  --warmup-iterations number
  --max-p95-ms number
  --max-failure-rate 0..1
  --required-layers assistant_memory,team_brain,project_brain,org_brain,rag
  --layers assistant_memory,team_brain,project_brain,org_brain,rag
  --allow-empty
  --json
  --dry-run
`)
}

function isTarget(value: unknown): value is Target {
  return value === 'local' || value === 'staging' || value === 'production'
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`)
  return value
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer.`)
  return parsed
}

function parseNonNegativeInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer.`)
  return parsed
}

function parseLayers(value: string): KnowledgeLayer[] {
  const allowed = new Set<KnowledgeLayer>(['session', 'assistant_memory', 'team_brain', 'project_brain', 'org_brain', 'rag', 'evidence', 'l2'])
  return value.split(',').map((layer) => layer.trim()).filter((layer): layer is KnowledgeLayer => allowed.has(layer as KnowledgeLayer))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((code) => {
    process.exitCode = code
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
