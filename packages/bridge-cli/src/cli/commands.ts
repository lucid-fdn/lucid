/**
 * CLI Commands — I/O layer for bridge CLI.
 *
 * Handles interactive prompts, spinners, JSON output, env file writing.
 * Business logic lives in api.ts; this file handles CLI I/O only.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { LucidBridge, type RuntimeManagementCommand, type RuntimeManagementCommandAck } from '@lucid/agent-bridge'
import { resolveCliAuth } from './auth.js'
import {
  resolveAuthContext,
  createRuntime,
  getRuntimeCapabilities,
  listRuntimes,
  listRuntimeManagementCommands,
  queueRuntimeManagementCommand,
  getRuntime,
  pollUntilConnected,
  buildEnvFileContent,
  isErr,
  isOk,
  type CliError,
  type RuntimeInfo,
  type AuthContext,
  type HermesMigrationOptions,
} from './api.js'

// ---------------------------------------------------------------------------
// Output Helpers
// ---------------------------------------------------------------------------

function fail(err: CliError): never {
  console.error(`\u2717 ${err.error}`)
  if (err.hint) console.error(`  ${err.hint}`)
  process.exit(1)
}

function maskKey(key: string): string {
  if (key.length <= 16) return key.slice(0, 4) + '...'
  return key.slice(0, 8) + '...' + key.slice(-4)
}

function formatAge(isoDate: string): string {
  const seconds = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Shared Auth Gate
// ---------------------------------------------------------------------------

interface AuthGateOptions {
  token?: string
  url?: string
}

async function requireAuth(opts?: AuthGateOptions): Promise<AuthContext> {
  const auth = resolveCliAuth({ token: opts?.token, url: opts?.url })
  if (!auth) {
    console.error('\u2717 Not logged in')
    console.error('  Run: lucid login, set LUCID_TOKEN, or pass --token')
    process.exit(1)
  }

  const ctx = await resolveAuthContext(auth.token, auth.controlPlaneUrl)
  if (isErr(ctx)) fail(ctx)
  return ctx
}

// ---------------------------------------------------------------------------
// lucid-runtime init
// ---------------------------------------------------------------------------

export interface InitOptions {
  name?: string
  engine?: 'openclaw' | 'hermes'
  mode?: 'full' | 'observe'
  channelMode?: 'relay' | 'native'
  hermesMigration?: HermesMigrationOptions
  migrateOpenClaw?: boolean
  migratePreset?: 'full' | 'user-data'
  migrateDryRun?: boolean
  migrateOverwrite?: boolean
  migrateSource?: string
  migrateWorkspaceTarget?: string
  migrateSkillConflict?: 'skip' | 'overwrite' | 'rename'
  output?: string
  wait?: boolean
  json?: boolean
  token?: string
  url?: string
}

export async function initCommand(opts: InitOptions): Promise<void> {
  const ctx = await requireAuth(opts)
  const isTTY = process.stdin.isTTY === true
  const outputFile = opts.output || '.env.lucid'
  const engine = opts.engine || 'openclaw'
  const mode = opts.mode || (engine === 'hermes' ? 'observe' : 'full')
  const channelMode = opts.channelMode || 'relay'
  const hermesMigration: HermesMigrationOptions | undefined =
    engine === 'hermes' && opts.migrateOpenClaw
      ? {
          enabled: true,
          preset: opts.migratePreset,
          dryRun: opts.migrateDryRun,
          overwrite: opts.migrateOverwrite,
          sourcePath: opts.migrateSource,
          workspaceTarget: opts.migrateWorkspaceTarget,
          skillConflict: opts.migrateSkillConflict,
        }
      : undefined

  if (engine === 'hermes' && channelMode === 'native') {
    console.error('\u2717 Hermes native channel ownership is not supported yet')
    console.error('  Use --channel-mode relay')
    process.exit(1)
  }

  // Collect runtime name
  let displayName = opts.name
  if (!displayName && isTTY) {
    const p = await import('@clack/prompts')
    const color = (await import('picocolors')).default

    p.intro(color.bgCyan(color.black(' Lucid Bridge ')))

    const nameResult = await p.text({
      message: 'Runtime name',
      placeholder: 'my-agent-runtime',
      validate: (v) => {
        if (!v?.trim()) return 'Name is required'
        if (v.length > 100) return 'Max 100 characters'
      },
    })
    if (p.isCancel(nameResult)) {
      p.cancel('Cancelled')
      process.exit(0)
    }
    displayName = nameResult as string
  }

  if (!displayName) {
    console.error('\u2717 --name is required in non-interactive mode')
    process.exit(1)
  }

  // Create runtime
  if (isTTY && !opts.json) {
    const p = await import('@clack/prompts')
    const spinner = p.spinner()
    spinner.start('Creating runtime...')

    const result = await createRuntime({
      controlPlaneUrl: ctx.controlPlaneUrl,
      token: ctx.token,
      orgId: ctx.orgId,
      displayName,
      engine,
      channelMode,
      hermesMigration,
    })

    if (isErr(result)) {
      spinner.stop('\u2717 Failed')
      fail(result)
    }

    spinner.stop('\u2713 Runtime created')
    await writeEnvAndDisplay(result, displayName, outputFile, {
      ...opts,
      engine,
      mode,
      channelMode,
      hermesMigration,
    })
    await maybeWaitForConnection(ctx, result.runtimeId, opts)
    p.outro('Ready \u2014 start your agent to connect to Mission Control')
  } else {
    // Non-interactive / JSON mode
    const result = await createRuntime({
      controlPlaneUrl: ctx.controlPlaneUrl,
      token: ctx.token,
      orgId: ctx.orgId,
      displayName,
      engine,
      channelMode,
      hermesMigration,
    })

    if (isErr(result)) fail(result)

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            runtimeId: result.runtimeId,
            apiKey: result.apiKey,
            controlPlaneUrl: result.controlPlaneUrl,
            envFile: outputFile,
          },
          null,
          2,
        ),
      )
    }

    writeEnvFile(
      result.runtimeId,
      result.apiKey,
      result.controlPlaneUrl,
      displayName,
      outputFile,
      { engine, mode, hermesMigration },
    )

    if (!opts.json) {
      console.log(`\u2713 Runtime created: ${result.runtimeId}`)
      console.log(`\u2713 Env written to ${outputFile}`)
    }
  }
}

// ---------------------------------------------------------------------------
// lucid-runtime status
// ---------------------------------------------------------------------------

export interface StatusOptions {
  json?: boolean
  token?: string
  url?: string
}

export async function statusCommand(runtimeId: string, opts?: StatusOptions): Promise<void> {
  const ctx = await requireAuth(opts)

  const result = await getRuntime({
    controlPlaneUrl: ctx.controlPlaneUrl,
    token: ctx.token,
    orgId: ctx.orgId,
    runtimeId,
  })

  if (isErr(result)) fail(result)

  const r = result.runtime

  if (opts?.json) {
    console.log(JSON.stringify(r, null, 2))
    return
  }

  const STATUS_ICON: Record<string, string> = {
    connected: '\u25cf',
    pending: '\u25cb',
    stale: '\u25cb',
    offline: '\u25cb',
    failed: '\u2717',
    revoked: '\u2014',
  }

  console.log(`${STATUS_ICON[r.status] || ' '} ${r.display_name || r.id}`)
  console.log(`  ID:          ${r.id}`)
  console.log(`  Status:      ${r.status}`)
  console.log(`  Provider:    ${r.provider}`)
  if (r.engine) console.log(`  Engine:      ${r.engine}`)
  if (r.runtime_protocol) console.log(`  Protocol:    ${r.runtime_protocol}`)
  console.log(`  Tier:        ${r.runtime_tier || 'byo'}`)
  if (r.channel_mode)
    console.log(`  Channels:    ${r.channel_mode === 'native' ? 'C2a self-sovereign' : 'C1 relay'}`)
  if (r.last_seen_at) console.log(`  Last seen:   ${formatAge(r.last_seen_at)}`)
  if (r.agent_count != null) console.log(`  Agents:      ${r.agent_count}`)
  if (r.cpu_percent != null) console.log(`  CPU:         ${r.cpu_percent}%`)
  if (r.ram_percent != null) console.log(`  RAM:         ${r.ram_percent}%`)
  if (r.uptime_seconds) console.log(`  Uptime:      ${formatUptime(r.uptime_seconds)}`)
  const version = r.runtime_version || r.engine_version || r.openclaw_version
  if (version) console.log(`  Version:     ${version}`)
}

// ---------------------------------------------------------------------------
// lucid-runtime list
// ---------------------------------------------------------------------------

export interface ListOptions {
  all?: boolean
  json?: boolean
  token?: string
  url?: string
}

export async function listCommand(opts?: ListOptions): Promise<void> {
  const ctx = await requireAuth(opts)

  const result = await listRuntimes({
    controlPlaneUrl: ctx.controlPlaneUrl,
    token: ctx.token,
    orgId: ctx.orgId,
  })

  if (isErr(result)) fail(result)

  // Filter to BYO unless --all
  const runtimes = opts?.all
    ? result.runtimes
    : result.runtimes.filter((r) => r.runtime_tier === 'byo' || r.provider === 'manual')

  if (opts?.json) {
    console.log(JSON.stringify(runtimes, null, 2))
    return
  }

  if (runtimes.length === 0) {
    console.log('No BYO runtimes found. Create one with: lucid-runtime init')
    return
  }

  const nameWidth = Math.max(20, ...runtimes.map((r) => (r.display_name || r.id).length))

  for (const r of runtimes) {
    const name = (r.display_name || r.id).padEnd(nameWidth)
    const status = r.status.padEnd(12)
    const lastSeen = r.last_seen_at ? formatAge(r.last_seen_at) : 'never'
    console.log(`  ${name}  ${status}  ${lastSeen}`)
  }
}

// ---------------------------------------------------------------------------
// lucid-runtime env
// ---------------------------------------------------------------------------

export interface EnvOptions {
  token?: string
  url?: string
}

export async function envCommand(envFile?: string): Promise<void> {
  const filePath = path.resolve(envFile || '.env.lucid')

  if (!fs.existsSync(filePath)) {
    console.error(`\u2717 ${filePath} not found`)
    console.error('  Create one with: lucid-runtime init')
    process.exit(1)
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const vars: Record<string, string> = {}

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq > 0) vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }

  if (vars.LUCID_RUNTIME_ID) {
    console.log(`LUCID_RUNTIME_ID=${vars.LUCID_RUNTIME_ID}`)
    console.log(`LUCID_RUNTIME_KEY=${maskKey(vars.LUCID_RUNTIME_KEY || '')}`)
    console.log(`LUCID_CONTROL_PLANE_URL=${vars.LUCID_CONTROL_PLANE_URL || ''}`)
  } else {
    console.error(`\u2717 No LUCID_RUNTIME_ID found in ${filePath}`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// lucid-runtime run
// ---------------------------------------------------------------------------

type RuntimeEngine = 'openclaw' | 'hermes'
type BridgeMode = 'full' | 'observe'

export interface RunOptions {
  envFile?: string
  engine?: RuntimeEngine
  mode?: BridgeMode
  agentId?: string
  prompt?: string
  oneshot?: string
  command?: string
  args?: string
  smoke?: boolean
  durationMs?: string
  json?: boolean
}

export async function runCommand(opts: RunOptions): Promise<void> {
  const env = loadRuntimeEnv(opts.envFile || '.env.lucid')
  const engine = normalizeEngine(opts.engine || env.LUCID_ENGINE || 'openclaw')
  const mode = normalizeMode(opts.mode || env.LUCID_BRIDGE_MODE || (engine === 'hermes' ? 'observe' : 'full'))
  const runtimeId = requiredRuntimeEnv(env, 'LUCID_RUNTIME_ID')
  const runtimeKey = requiredRuntimeEnv(env, 'LUCID_RUNTIME_KEY')
  const controlPlaneUrl = requiredRuntimeEnv(env, 'LUCID_CONTROL_PLANE_URL')
  const prompt = opts.oneshot || opts.prompt
  const command = resolveEngineCommand(engine, opts.command || env[`${engine.toUpperCase()}_COMMAND`] || env.LUCID_ENGINE_COMMAND || env.HERMES_COMMAND || env.OPENCLAW_RUNTIME_COMMAND || env.OPENCLAW_COMMAND)
  const args = opts.args ? parseArgsJson(opts.args) : parseArgsJson(env[`${engine.toUpperCase()}_ARGS_JSON`] || env.LUCID_ENGINE_ARGS_JSON || '')
  const durationMs = opts.durationMs ? Number(opts.durationMs) : prompt || opts.smoke ? 1_000 : undefined

  const bridge = new LucidBridge({
    runtimeId,
    runtimeKey,
    controlPlaneUrl,
    mode,
    engine,
    runtimeProtocol: 'lucid-runtime-v2',
    runtimeVersion: 'bridge-cli/0.1.0',
    engineVersion: command ? `${engine}:${path.basename(command)}` : `${engine}:unconfigured`,
    heartbeatIntervalMs: Number(env.LUCID_HEARTBEAT_INTERVAL_MS || 30_000),
    adapterIdentity: {
      adapterType: 'lucid-runtime-cli',
      label: 'Lucid Runtime CLI',
      version: '0.1.0',
      adapterVersion: '0.1.0',
      source: 'byo_bridge',
      executionTargets: ['byo_bridge', 'local'],
      managedBy: 'adapter',
      protocolVersion: 'runtime-capability-v1',
      engine,
    },
    nativeCapabilities: buildCliCapabilities(engine, Boolean(command), Boolean(opts.smoke)),
    runtimeServices: [
      {
        serviceName: 'lucid-runtime-bridge',
        label: 'Lucid Runtime Bridge',
        status: 'running',
        lifecycle: prompt || opts.smoke ? 'ephemeral' : 'runtime_owned',
        healthStatus: 'healthy',
      },
      {
        serviceName: `${engine}-adapter`,
        label: `${engine === 'hermes' ? 'Hermes' : 'OpenClaw'} adapter`,
        status: command || opts.smoke ? 'running' : 'unknown',
        lifecycle: 'runtime_owned',
        healthStatus: command || opts.smoke ? 'healthy' : 'unknown',
      },
    ],
    adapterProbe: {
      adapterType: 'lucid-runtime-cli',
      status: command || opts.smoke ? 'pass' : 'warn',
      target: {
        kind: 'byo_bridge',
        status: command || opts.smoke ? 'available' : 'degraded',
        displayName: 'Local BYO runtime bridge',
      },
      checks: [
        {
          code: command || opts.smoke ? 'engine_command_available' : 'engine_command_needs_setup',
          level: command || opts.smoke ? 'info' : 'warn',
          message: command || opts.smoke
            ? `${engine === 'hermes' ? 'Hermes' : 'OpenClaw'} command path is configured for this bridge.`
            : `${engine === 'hermes' ? 'Hermes' : 'OpenClaw'} command path needs setup before live turns can run.`,
          targetKind: 'byo_bridge',
        },
      ],
      testedAt: new Date().toISOString(),
      cached: true,
      source: 'heartbeat',
    },
    transcriptParser: {
      supported: true,
      parserId: `${engine}-lucid-runtime-cli-parser`,
      version: '0.1.0',
      mode: 'adapter',
      status: 'ready',
      sampleTestStatus: 'unknown',
      notes: ['The BYO bridge uses adapter parsing and can fall back to Lucid transcript normalization.'],
    },
    commandSpec: {
      command: 'lucid-runtime run',
      detectCommand: `${engine === 'hermes' ? 'hermes' : 'openclaw'} --help`,
      workingDirectoryPolicy: 'runtime_owned',
      displayName: 'Lucid Runtime CLI management commands',
      parserSupport: 'adapter',
      notes: [
        'adapter.probe',
        'runtime.services.inspect',
        'transcript.parser.test',
        'engine_home.snapshot',
        'engine_home.diff',
        'engine_home.export',
        'engine_home.rollback',
        'native_scheduler.observe',
        'native_scheduler.import',
      ],
    },
    engineHomePolicy: {
      mode: 'runtime_owned',
      authority: 'operator',
      writePolicy: 'review_required',
      snapshotSupport: true,
      diffSupport: true,
      rollbackSupport: false,
      importExportSupport: true,
      durableInShared: false,
      notes: ['BYO/local home state remains runtime-owned; Lucid observes and requests reviewed changes through the bridge.'],
      homeRoot: env.LUCID_ENGINE_HOME || env.HERMES_HOME || env.OPENCLAW_STATE_DIR || null,
    },
  })

  bridge.onManagementCommand((commands) => executeCliManagementCommands(commands, {
    engine,
    command,
    homeRoot: env.LUCID_ENGINE_HOME || env.HERMES_HOME || env.OPENCLAW_STATE_DIR,
  }))

  if (mode === 'full') {
    bridge.onMessage(async (packet) => {
      const message = packet.userMessage?.text || ''
      if (opts.smoke) return { responseText: `lucid-runtime smoke ok (${engine})` }
      if (!command) {
        return {
          responseText: `${engine} runtime command is not configured. Set ${engine === 'hermes' ? 'HERMES_COMMAND' : 'OPENCLAW_RUNTIME_COMMAND'} or pass --command.`,
        }
      }
      return { responseText: await runEngineTurn(engine, command, args, message) }
    })
  }

  await bridge.start()

  let result: unknown = null
  try {
    if (prompt || opts.smoke) {
      const runOnce = async () => {
        if (opts.smoke) return { responseText: `lucid-runtime smoke ok (${engine})` }
        if (!command) {
          throw new Error(`${engine} runtime command is not configured`)
        }
        const responseText = await runEngineTurn(engine, command, args, prompt || '')
        return { responseText }
      }
      result = opts.agentId
        ? await bridge.trackRun({ agentId: opts.agentId }, runOnce)
        : await runOnce()
    }

    if (durationMs && Number.isFinite(durationMs) && durationMs > 0) {
      await sleep(durationMs)
    } else if (!prompt && !opts.smoke) {
      if (!opts.json) {
        console.log(`\u2713 Lucid runtime bridge connected (${engine}, ${mode})`)
        console.log('  Press Ctrl+C to stop.')
      }
      await new Promise<void>(() => {})
    }
  } finally {
    if (prompt || opts.smoke || durationMs) {
      await bridge.stop()
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, runtimeId, engine, mode, result }, null, 2))
    return
  }

  if (result && typeof result === 'object' && 'responseText' in result) {
    console.log(String((result as { responseText: string }).responseText))
  } else if (prompt || opts.smoke) {
    console.log(`\u2713 Lucid runtime run completed (${engine})`)
  }
}

// ---------------------------------------------------------------------------
// lucid-runtime capabilities / services / probe / commands
// ---------------------------------------------------------------------------

export interface RuntimeCapabilityOptions {
  json?: boolean
  token?: string
  url?: string
}

export async function capabilitiesCommand(runtimeId: string, opts?: RuntimeCapabilityOptions): Promise<void> {
  const ctx = await requireAuth(opts)
  const result = await getRuntimeCapabilities({
    controlPlaneUrl: ctx.controlPlaneUrl,
    token: ctx.token,
    orgId: ctx.orgId,
    runtimeId,
  })
  if (isErr(result)) fail(result)

  if (opts?.json) {
    console.log(JSON.stringify(result.capabilities, null, 2))
    return
  }

  const caps = result.capabilities.nativeCapabilities ?? []
  console.log(`${result.capabilities.engine || 'runtime'} capabilities (${caps.length})`)
  for (const cap of caps) {
    const status = `${cap.availability || 'unknown'}/${cap.health || 'unknown'}`
    console.log(`  ${cap.label.padEnd(32)} ${status.padEnd(24)} ${cap.manageMode || 'read_only'}`)
  }
}

export async function servicesCommand(runtimeId: string, opts?: RuntimeCapabilityOptions): Promise<void> {
  const ctx = await requireAuth(opts)
  const result = await getRuntimeCapabilities({
    controlPlaneUrl: ctx.controlPlaneUrl,
    token: ctx.token,
    orgId: ctx.orgId,
    runtimeId,
  })
  if (isErr(result)) fail(result)

  if (opts?.json) {
    console.log(JSON.stringify(result.capabilities.runtimeServices ?? [], null, 2))
    return
  }

  const services = result.capabilities.runtimeServices ?? []
  if (services.length === 0) {
    console.log('No runtime services reported yet')
    return
  }
  for (const service of services) {
    console.log(`  ${(service.label || service.serviceName).padEnd(28)} ${(service.status || 'unknown').padEnd(12)} ${service.healthStatus || 'unknown'}`)
  }
}

export async function probeCommand(runtimeId: string, opts?: RuntimeCapabilityOptions): Promise<void> {
  const ctx = await requireAuth(opts)
  const result = await queueRuntimeManagementCommand({
    controlPlaneUrl: ctx.controlPlaneUrl,
    token: ctx.token,
    orgId: ctx.orgId,
    runtimeId,
    commandType: 'adapter.probe',
    payload: { source: 'lucid_bridge_cli' },
  })
  if (isErr(result)) fail(result)

  if (opts?.json) {
    console.log(JSON.stringify(result.command, null, 2))
    return
  }

  console.log(`\u2713 Probe command queued: ${result.command.id}`)
  console.log('  It will be delivered on the next runtime heartbeat.')
}

export interface QueueRuntimeCommandOptions extends RuntimeCapabilityOptions {
  payload?: string
  targetCapabilityId?: string
}

export async function queueCommandCommand(
  runtimeId: string,
  commandType: string,
  opts?: QueueRuntimeCommandOptions,
): Promise<void> {
  const ctx = await requireAuth(opts)
  let payload: Record<string, unknown> = { source: 'lucid_bridge_cli' }
  if (opts?.payload?.trim()) {
    try {
      const parsed = JSON.parse(opts.payload) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Payload must be a JSON object')
      }
      payload = { ...payload, ...parsed as Record<string, unknown> }
    } catch (error) {
      console.error('\u2717 Invalid --payload JSON')
      console.error(`  ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }

  const result = await queueRuntimeManagementCommand({
    controlPlaneUrl: ctx.controlPlaneUrl,
    token: ctx.token,
    orgId: ctx.orgId,
    runtimeId,
    commandType,
    targetCapabilityId: opts?.targetCapabilityId,
    payload,
  })
  if (isErr(result)) fail(result)

  if (opts?.json) {
    console.log(JSON.stringify(result.command, null, 2))
    return
  }

  console.log(`\u2713 ${commandType} command queued: ${result.command.id}`)
  console.log('  It will be delivered on the next runtime heartbeat.')
}

export async function runtimeCommandsCommand(runtimeId: string, opts?: RuntimeCapabilityOptions): Promise<void> {
  const ctx = await requireAuth(opts)
  const result = await listRuntimeManagementCommands({
    controlPlaneUrl: ctx.controlPlaneUrl,
    token: ctx.token,
    orgId: ctx.orgId,
    runtimeId,
  })
  if (isErr(result)) fail(result)

  if (opts?.json) {
    console.log(JSON.stringify(result.commands, null, 2))
    return
  }

  if (result.commands.length === 0) {
    console.log('No management commands found')
    return
  }
  for (const command of result.commands) {
    console.log(`  ${command.commandType.padEnd(24)} ${command.status.padEnd(18)} ${formatAge(command.requestedAt)}`)
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function loadRuntimeEnv(envFile: string): Record<string, string> {
  const filePath = path.resolve(envFile)
  if (!fs.existsSync(filePath)) {
    console.error(`\u2717 ${filePath} not found`)
    console.error('  Create one with: lucid-runtime init')
    process.exit(1)
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const env: Record<string, string> = { ...process.env } as Record<string, string>
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function requiredRuntimeEnv(env: Record<string, string>, key: string): string {
  const value = env[key]?.trim()
  if (!value) {
    console.error(`\u2717 ${key} is missing`)
    console.error('  Create or refresh your env file with: lucid-runtime init')
    process.exit(1)
  }
  return value
}

function normalizeEngine(value: string): RuntimeEngine {
  if (value === 'openclaw' || value === 'hermes') return value
  console.error('\u2717 --engine must be openclaw or hermes')
  process.exit(1)
}

function normalizeMode(value: string): BridgeMode {
  if (value === 'full' || value === 'observe') return value
  console.error('\u2717 --mode must be full or observe')
  process.exit(1)
}

function parseArgsJson(value: string): string[] {
  if (!value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new Error('Expected a JSON string array')
    }
    return parsed
  } catch (error) {
    console.error('\u2717 Invalid args JSON')
    console.error(`  ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

function resolveEngineCommand(engine: RuntimeEngine, configured?: string): string | undefined {
  if (configured?.trim()) return configured.trim()
  if (engine === 'hermes') return 'hermes'
  const localOpenClaw = path.resolve(process.cwd(), 'packages/openclaw-core/openclaw.mjs')
  if (fs.existsSync(localOpenClaw)) return localOpenClaw
  return 'openclaw'
}

function buildCliCapabilities(engine: RuntimeEngine, hasCommand: boolean, smoke: boolean): Array<Record<string, unknown>> {
  const availability = hasCommand || smoke ? 'available' : 'needs_setup'
  const health = hasCommand || smoke ? 'healthy' : 'degraded'
  return [
    {
      id: 'assistant.run',
      kind: 'orchestration',
      label: 'Local assistant run',
      engine,
      runtimeFlavors: ['c2a_autonomous'],
      supportLevel: hasCommand || smoke ? 'experimental' : 'planned',
      availability,
      health,
      manageMode: 'apply_via_bridge',
      authority: 'adapter',
      source: 'adapter',
    },
    {
      id: 'runtime.management_commands',
      kind: 'control_commands',
      label: 'Runtime management commands',
      engine,
      runtimeFlavors: ['c2a_autonomous'],
      supportLevel: 'experimental',
      availability: 'available',
      health: 'healthy',
      manageMode: 'apply_via_bridge',
      authority: 'lucid',
      source: 'adapter',
    },
    {
      id: 'native_scheduler.observe',
      kind: 'native_scheduler',
      label: `${engine === 'hermes' ? 'Hermes' : 'OpenClaw'} native schedules`,
      engine,
      runtimeFlavors: ['c2a_autonomous'],
      supportLevel: 'experimental',
      availability,
      health,
      manageMode: 'read_only',
      authority: 'engine',
      source: 'adapter',
      supportsImport: true,
    },
  ]
}

async function executeCliManagementCommands(
  commands: RuntimeManagementCommand[],
  ctx: { engine: RuntimeEngine; command?: string; homeRoot?: string },
): Promise<RuntimeManagementCommandAck[]> {
  const acks: RuntimeManagementCommandAck[] = []
  for (const command of commands) {
    try {
      acks.push(await executeCliManagementCommand(command, ctx))
    } catch (error) {
      acks.push({
        commandId: command.id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return acks
}

async function executeCliManagementCommand(
  command: RuntimeManagementCommand,
  ctx: { engine: RuntimeEngine; command?: string; homeRoot?: string },
): Promise<RuntimeManagementCommandAck> {
  switch (command.commandType) {
    case 'adapter.probe':
      return {
        commandId: command.id,
        status: 'applied',
        response: {
          engine: ctx.engine,
          command: ctx.command ? path.basename(ctx.command) : null,
          commandAvailable: ctx.command ? await commandLooksAvailable(ctx.command) : false,
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          source: 'lucid-runtime-cli',
        },
      }
    case 'runtime.services.inspect':
      return {
        commandId: command.id,
        status: 'applied',
        response: {
          services: [
            { serviceName: 'lucid-runtime-bridge', status: 'running', healthStatus: 'healthy' },
            {
              serviceName: `${ctx.engine}-adapter`,
              status: ctx.command ? 'available' : 'needs_configuration',
              healthStatus: ctx.command ? 'healthy' : 'degraded',
            },
          ],
        },
      }
    case 'transcript.parser.test': {
      const fixture = typeof command.payload?.fixture === 'string' ? command.payload.fixture : ''
      const turns = fixture.split('\n').filter((line) => /^(user|assistant|system):/i.test(line.trim())).length
      return {
        commandId: command.id,
        status: 'applied',
        response: { parser: 'lucid-runtime-basic-transcript-parser', turns, fallback: true },
      }
    }
    case 'engine_home.snapshot':
    case 'engine_home.diff':
    case 'engine_home.export':
      return {
        commandId: command.id,
        status: 'applied',
        response: inspectLocalEngineHome(ctx.homeRoot),
      }
    case 'engine_home.rollback':
      return {
        commandId: command.id,
        status: 'needs_user_action',
        response: {
          reason: 'BYO/local rollback needs explicit local operator confirmation',
          homeRoot: ctx.homeRoot || null,
        },
      }
    case 'native_scheduler.observe':
    case 'native_scheduler.import':
      return {
        commandId: command.id,
        status: 'applied',
        response: await inspectNativeSchedules(ctx.engine, ctx.command),
      }
    default:
      return {
        commandId: command.id,
        status: 'rejected',
        error: `Unsupported runtime management command: ${command.commandType}`,
      }
  }
}

async function commandLooksAvailable(command: string): Promise<boolean> {
  if (command.includes('/') && fs.existsSync(command)) return true
  const result = await runProcess(command, ['--version'], { timeoutMs: 5_000, allowFailure: true })
  return result.exitCode === 0
}

function inspectLocalEngineHome(homeRoot?: string): Record<string, unknown> {
  if (!homeRoot) {
    return { available: false, reason: 'No LUCID_ENGINE_HOME/HERMES_HOME/OPENCLAW_STATE_DIR configured' }
  }
  if (!fs.existsSync(homeRoot)) {
    return { available: false, homeRoot, reason: 'Configured home path does not exist' }
  }
  const entries = fs.readdirSync(homeRoot, { withFileTypes: true }).slice(0, 100)
  return {
    available: true,
    homeRoot,
    entryCountSample: entries.length,
    entries: entries.map((entry) => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' })),
    mode: 'byo_local_readonly',
  }
}

async function inspectNativeSchedules(engine: RuntimeEngine, command?: string): Promise<Record<string, unknown>> {
  if (!command) {
    return { available: false, schedules: [], reason: `${engine} command is not configured` }
  }
  const args = engine === 'hermes' ? ['cron', 'list', '--json'] : ['cron', 'list', '--json']
  const result = await runProcess(command, args, { timeoutMs: 10_000, allowFailure: true })
  return {
    available: result.exitCode === 0,
    command: path.basename(command),
    schedules: parseJsonArray(result.stdout),
    stderr: result.exitCode === 0 ? undefined : sanitizeProcessText(result.stderr || result.stdout),
  }
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { schedules?: unknown[] }).schedules)) {
      return (parsed as { schedules: unknown[] }).schedules
    }
  } catch {
    // Fall through to empty.
  }
  return []
}

async function runEngineTurn(
  engine: RuntimeEngine,
  command: string,
  configuredArgs: string[],
  prompt: string,
): Promise<string> {
  const args = configuredArgs.length > 0
    ? configuredArgs.map((arg) => arg.replaceAll('{prompt}', prompt))
    : engine === 'hermes'
      ? ['-z', prompt]
      : ['agent', '--local', '--message', prompt, '--json', '--timeout', '60']
  const result = await runProcess(command, args, { timeoutMs: 120_000, allowFailure: false })
  return extractResponseText(result.stdout)
}

async function runProcess(
  command: string,
  args: string[],
  opts: { timeoutMs: number; allowFailure: boolean },
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${path.basename(command)} timed out after ${opts.timeoutMs}ms`))
    }, opts.timeoutMs)

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      if (opts.allowFailure) {
        resolve({ stdout, stderr: error.message, exitCode: 127 })
        return
      }
      reject(error)
    })
    child.on('close', (exitCode) => {
      clearTimeout(timer)
      if (!opts.allowFailure && exitCode !== 0) {
        reject(new Error(`${path.basename(command)} exited ${exitCode}: ${sanitizeProcessText(stderr || stdout)}`))
        return
      }
      resolve({ stdout, stderr, exitCode })
    })
  })
}

function extractResponseText(stdout: string): string {
  const trimmed = stdout.trim()
  if (!trimmed) return ''
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      for (const key of ['responseText', 'response', 'reply', 'text', 'message', 'output']) {
        if (typeof obj[key] === 'string') return obj[key] as string
      }
    }
  } catch {
    // Not JSON; return plain stdout.
  }
  return trimmed
}

function sanitizeProcessText(value: string): string {
  return value
    .replace(/[A-Za-z0-9_]*KEY[A-Za-z0-9_]*=[^\s]+/g, '[redacted]')
    .replace(/[A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*=[^\s]+/g, '[redacted]')
    .slice(0, 1_000)
}

function writeEnvFile(
  runtimeId: string,
  apiKey: string,
  controlPlaneUrl: string,
  displayName: string,
  outputFile: string,
  opts?: {
    engine?: 'openclaw' | 'hermes'
    mode?: 'full' | 'observe'
    hermesMigration?: HermesMigrationOptions
  },
): void {
  const content = buildEnvFileContent({
    runtimeId,
    apiKey,
    controlPlaneUrl,
    displayName,
    engine: opts?.engine,
    mode: opts?.mode,
    hermesMigration: opts?.hermesMigration,
  })
  const outputPath = path.resolve(outputFile)
  fs.writeFileSync(outputPath, content, { mode: 0o600 })
}

async function writeEnvAndDisplay(
  result: { runtimeId: string; apiKey: string; controlPlaneUrl: string },
  displayName: string,
  outputFile: string,
  opts: InitOptions,
): Promise<void> {
  const p = await import('@clack/prompts')
  const color = (await import('picocolors')).default
  const hermesMigration =
    opts.engine === 'hermes' && opts.migrateOpenClaw
      ? {
          enabled: true,
          preset: opts.migratePreset,
          dryRun: opts.migrateDryRun,
          overwrite: opts.migrateOverwrite,
          sourcePath: opts.migrateSource,
          workspaceTarget: opts.migrateWorkspaceTarget,
          skillConflict: opts.migrateSkillConflict,
        }
      : undefined

  writeEnvFile(
    result.runtimeId,
    result.apiKey,
    result.controlPlaneUrl,
    displayName,
    outputFile,
    { engine: opts.engine, mode: opts.mode, hermesMigration },
  )

  p.note(
    [
      `${color.dim('LUCID_RUNTIME_ID')}=${color.cyan(result.runtimeId)}`,
      `${color.dim('LUCID_RUNTIME_KEY')}=${color.cyan(maskKey(result.apiKey))}`,
      `${color.dim('LUCID_CONTROL_PLANE_URL')}=${color.cyan(result.controlPlaneUrl)}`,
      ...(hermesMigration?.enabled ? ['', `${color.dim('Migration')}=${color.cyan(`OpenClaw (${hermesMigration.preset || 'user-data'})`)}`] : []),
      '',
      `Saved to ${color.green(outputFile)} (permissions: 0600)`,
    ].join('\n'),
    'Environment',
  )

  const mode = opts.mode || 'full'
  const engine = opts.engine || 'openclaw'
  const snippet =
    engine === 'hermes'
      ? [
          `# Hermes C2a runtime`,
          `# Generated env defaults to observe mode + Lucid relay ownership.`,
          `# Run with the Lucid Hermes wrapper or your own Hermes container.`,
          ``,
          `LUCID_ENGINE=hermes`,
          `LUCID_BRIDGE_MODE=observe`,
          `HERMES_COMMAND=hermes-agent`,
          `HERMES_ARGS_JSON=["chat"]`,
          ...(hermesMigration?.enabled
            ? [
                '',
                `# Optional: preview/import your OpenClaw profile before first run`,
                `hermes claw migrate --preset ${hermesMigration.preset || 'user-data'}${hermesMigration.dryRun ? ' --dry-run' : ''}${hermesMigration.overwrite ? ' --overwrite' : ''}${hermesMigration.sourcePath ? ` --source "${hermesMigration.sourcePath}"` : ''}${hermesMigration.workspaceTarget ? ` --workspace-target "${hermesMigration.workspaceTarget}"` : ''}${hermesMigration.skillConflict ? ` --skill-conflict ${hermesMigration.skillConflict}` : ''}`,
              ]
            : []),
        ]
      : mode === 'observe'
      ? [
          `import { LucidBridge } from '@lucid/agent-bridge'`,
          ``,
          `const bridge = new LucidBridge({`,
          `  runtimeId: process.env.LUCID_RUNTIME_ID,`,
          `  runtimeKey: process.env.LUCID_RUNTIME_KEY,`,
          `  controlPlaneUrl: process.env.LUCID_CONTROL_PLANE_URL,`,
          `  mode: 'observe',`,
          `})`,
          `await bridge.start()`,
          ``,
          `const result = await bridge.trackRun({ agentId: 'my-agent' }, async () => {`,
          `  return { responseText: await myAgent.run(input) }`,
          `})`,
        ]
      : [
          `import { LucidBridge } from '@lucid/agent-bridge'`,
          ``,
          `const bridge = new LucidBridge({`,
          `  runtimeId: process.env.LUCID_RUNTIME_ID,`,
          `  runtimeKey: process.env.LUCID_RUNTIME_KEY,`,
          `  controlPlaneUrl: process.env.LUCID_CONTROL_PLANE_URL,`,
          `})`,
          ``,
          `bridge.onMessage(async (packet, ctx) => {`,
          `  return { responseText: await myAgent.run(packet.userMessage.text) }`,
          `})`,
          ``,
          `await bridge.start()`,
        ]

  p.note(snippet.join('\n'), `Quick Start (${mode} mode)`)
}

async function maybeWaitForConnection(
  ctx: AuthContext,
  runtimeId: string,
  opts: InitOptions,
): Promise<void> {
  if (opts.wait === false) return
  if (!process.stdin.isTTY) return

  const p = await import('@clack/prompts')
  const color = (await import('picocolors')).default
  const spinner = p.spinner()
  spinner.start('Waiting for your agent to connect...')

  const result = await pollUntilConnected({
    controlPlaneUrl: ctx.controlPlaneUrl,
    token: ctx.token,
    orgId: ctx.orgId,
    runtimeId,
    onPoll: (elapsed) => {
      const seconds = Math.round(elapsed / 1000)
      spinner.message(`Waiting for heartbeat... (${seconds}s)`)
    },
  })

  if (isOk(result)) {
    spinner.stop(color.green('\u2713 Agent connected \u2014 first heartbeat received'))
  } else {
    spinner.stop(color.yellow(result.error))
    if (result.hint) console.log(`  ${result.hint}`)
  }
}
