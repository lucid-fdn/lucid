import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  buildRuntimeCapabilityHeartbeatFields,
  clearRuntimeCapabilityReportCache,
} from '../worker/src/runtime/capability-report.js'
import {
  createEngineHomeArchive,
  diffEngineHomeSnapshots,
  hydrateEngineHomeArchive,
  snapshotEngineHome,
} from '../worker/src/runtime/engine-home-lite.js'

type Engine = 'hermes' | 'openclaw'
type MatrixFlavor = 'shared' | 'dedicated' | 'byo'

const REQUIRED_CAPABILITIES = [
  'scheduled.ack',
  'scheduled.reconcile',
  'scheduled.idempotency',
  'scheduled.native_scheduler.observe',
  'scheduled.native_scheduler.import',
  'scheduled.native_scheduler.delegate',
]

const strictLive = process.env.LUCID_RUNTIME_LIVE_REQUIRED === '1'
const results: string[] = []
const warnings: string[] = []

function ok(message: string) {
  results.push(`ok ${message}`)
}

function warn(message: string) {
  warnings.push(`warn ${message}`)
}

function fail(message: string): never {
  throw new Error(message)
}

function commandExists(command: string): boolean {
  const result = spawnSync('zsh', ['-lc', `command -v ${command}`], { encoding: 'utf8' })
  return result.status === 0 && result.stdout.trim().length > 0
}

function runVersion(command: string): boolean {
  const result = spawnSync('zsh', ['-lc', `${command} --version || ${command} version || ${command} --help`], {
    encoding: 'utf8',
    timeout: 5_000,
    maxBuffer: 128_000,
  })
  return result.status === 0
}

function withRuntimeEnv<T>(engine: Engine, flavor: MatrixFlavor, fn: () => T): T {
  const previous = {
    LUCID_ENGINE: process.env.LUCID_ENGINE,
    LUCID_RUNTIME_FLAVOR: process.env.LUCID_RUNTIME_FLAVOR,
    LUCID_RUNTIME_TIER: process.env.LUCID_RUNTIME_TIER,
    LUCID_RUNTIME_ID: process.env.LUCID_RUNTIME_ID,
  }
  process.env.LUCID_ENGINE = engine
  process.env.LUCID_RUNTIME_FLAVOR = flavor === 'shared'
    ? 'shared'
    : flavor === 'dedicated'
      ? 'c1_managed'
      : 'c2a_autonomous'
  if (flavor === 'byo') process.env.LUCID_RUNTIME_TIER = 'byo'
  else delete process.env.LUCID_RUNTIME_TIER
  if (flavor === 'shared') delete process.env.LUCID_RUNTIME_ID
  else process.env.LUCID_RUNTIME_ID = engine === 'hermes'
    ? '00000000-0000-4000-8000-000000000001'
    : '00000000-0000-4000-8000-000000000002'

  try {
    clearRuntimeCapabilityReportCache()
    return fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    clearRuntimeCapabilityReportCache()
  }
}

function assertCapabilityMatrix(engine: Engine, flavor: MatrixFlavor) {
  withRuntimeEnv(engine, flavor, () => {
    const heartbeat = buildRuntimeCapabilityHeartbeatFields()
    const capabilities = heartbeat.nativeCapabilities ?? []
    const ids = new Set(capabilities.map((capability) => capability.id))
    for (const capability of REQUIRED_CAPABILITIES) {
      if (!ids.has(capability)) fail(`${engine}/${flavor} missing ${capability}`)
    }
    if (!ids.has(`${engine}.routines`)) fail(`${engine}/${flavor} missing engine routines capability`)
    if (!heartbeat.engineHomePolicy?.snapshotSupport) fail(`${engine}/${flavor} missing EHV snapshot support`)
    if (!heartbeat.engineHomePolicy?.diffSupport) fail(`${engine}/${flavor} missing EHV diff support`)
    if (!heartbeat.engineHomePolicy?.rollbackSupport) fail(`${engine}/${flavor} missing EHV rollback support`)
    if (!heartbeat.adapterIdentity?.executionTargets?.length) fail(`${engine}/${flavor} missing execution target identity`)
    ok(`${engine}/${flavor} heartbeat capabilities`)
  })
}

async function assertEngineHomeFlow(engine: Engine, flavor: MatrixFlavor) {
  const root = await mkdtemp(path.join(os.tmpdir(), `lucid-${engine}-${flavor}-home-`))
  const restored = await mkdtemp(path.join(os.tmpdir(), `lucid-${engine}-${flavor}-restored-`))
  try {
    await writeFile(path.join(root, 'SOUL.md'), `${engine} ${flavor} identity\n`)
    await writeFile(path.join(root, 'memory.md'), 'first memory\n')
    const before = await snapshotEngineHome({
      engine,
      runtimeFlavor: flavor === 'shared' ? 'shared' : flavor === 'dedicated' ? 'c1_managed' : 'c2a_autonomous',
      rootDir: root,
      homeId: `${engine}-${flavor}`,
    })
    await writeFile(path.join(root, 'memory.md'), 'updated memory\n')
    await writeFile(path.join(root, 'HEARTBEAT.md'), 'routine heartbeat\n')
    const after = await snapshotEngineHome({
      engine,
      runtimeFlavor: flavor === 'shared' ? 'shared' : flavor === 'dedicated' ? 'c1_managed' : 'c2a_autonomous',
      rootDir: root,
      homeId: `${engine}-${flavor}`,
    })
    const diff = diffEngineHomeSnapshots(before, after) as { summary?: { added?: number; modified?: number } }
    if ((diff.summary?.added ?? 0) < 1) fail(`${engine}/${flavor} EHV diff did not detect added file`)
    if ((diff.summary?.modified ?? 0) < 1) fail(`${engine}/${flavor} EHV diff did not detect modified file`)
    const archive = await createEngineHomeArchive({
      engine,
      runtimeFlavor: flavor === 'shared' ? 'shared' : flavor === 'dedicated' ? 'c1_managed' : 'c2a_autonomous',
      rootDir: root,
      homeId: `${engine}-${flavor}`,
    })
    await hydrateEngineHomeArchive(restored, archive, { clean: true })
    const restoredMemory = await readFile(path.join(restored, 'memory.md'), 'utf8')
    if (!restoredMemory.includes('updated memory')) fail(`${engine}/${flavor} EHV restore content mismatch`)
    ok(`${engine}/${flavor} EHV snapshot/diff/export/rollback`)
  } finally {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(restored, { recursive: true, force: true }),
    ])
  }
}

async function assertSupabaseRoutineTables() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    warn('Supabase service credentials not present; skipped live DB migration verification')
    return
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const tables = [
    'agent_scheduled_tasks',
    'agent_scheduled_task_runs',
    'agent_scheduled_task_versions',
    'engine_home_snapshots',
    'engine_home_diff_candidates',
  ]
  for (const table of tables) {
    const { error } = await supabase.from(table).select('id', { head: true, count: 'exact' }).limit(1)
    if (error) fail(`Live Supabase table ${table} is not queryable: ${error.message}`)
    ok(`live Supabase table ${table} queryable`)
  }
}

function assertRuntimeBinaries() {
  const hermesAvailable = commandExists('hermes') && runVersion('hermes')
  if (hermesAvailable) ok('Hermes CLI available')
  else if (strictLive) fail('Hermes CLI is required but unavailable')
  else warn('Hermes CLI unavailable; heartbeat adapter path was still verified')

  const openClawCliAvailable = commandExists('openclaw') && runVersion('openclaw')
  const openClawRuntimePackage = existsSync(path.join(process.cwd(), 'packages/openclaw-runtime/package.json'))
  if (openClawCliAvailable) ok('OpenClaw CLI available')
  else if (openClawRuntimePackage) ok('OpenClaw packaged runtime adapter available')
  else if (strictLive) fail('OpenClaw runtime is required but unavailable')
  else warn('OpenClaw CLI unavailable; packaged adapter path not found')
}

async function main() {
  assertRuntimeBinaries()
  for (const engine of ['hermes', 'openclaw'] as const) {
    for (const flavor of ['shared', 'dedicated', 'byo'] as const) {
      assertCapabilityMatrix(engine, flavor)
      await assertEngineHomeFlow(engine, flavor)
    }
  }
  await assertSupabaseRoutineTables()
  console.log([...results, ...warnings].join('\n'))
  if (warnings.length > 0) process.exitCode = strictLive ? 1 : 0
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
