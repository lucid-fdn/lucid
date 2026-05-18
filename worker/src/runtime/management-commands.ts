import fs from 'fs'
import os from 'os'
import path from 'path'
import type { DataSink, RuntimeManagementCommand } from './data-sink.js'
import { bootstrapRuntimeConfig } from '../config-bootstrap.js'
import { refreshConfigFromEnv } from '../config.js'
import {
  buildRuntimeCapabilityHeartbeatFields,
  clearRuntimeCapabilityReportCache,
} from './capability-report.js'
import {
  getRuntimeAdapterServices,
  testRuntimeAdapterEnvironment,
  testRuntimeAdapterTranscriptParser,
} from './adapter-diagnostics.js'
import {
  createEngineHomeArchive,
  diffEngineHomeSnapshots,
  hydrateEngineHomeArchive,
  snapshotEngineHome,
} from './engine-home-lite.js'

type CommandFinalStatus = 'rejected' | 'needs_user_action' | 'applied' | 'failed'

interface CommandResult {
  status: CommandFinalStatus
  response?: Record<string, unknown> | null
  error?: string | null
}

const MAX_HOME_FILE_BYTES = 2 * 1024 * 1024
const MAX_RESPONSE_ENTRIES = 25
const MAX_INLINE_ARCHIVE_BYTES = 512 * 1024
const MAX_NATIVE_SCHEDULES = 50
const runningCommands = new Set<string>()

function runtimeEngine(): 'openclaw' | 'hermes' {
  return process.env.LUCID_ENGINE === 'hermes' ? 'hermes' : 'openclaw'
}

function runtimeFlavor(): 'shared' | 'c1_managed' | 'c2a_autonomous' {
  const raw = process.env.LUCID_RUNTIME_FLAVOR
  if (raw === 'shared' || raw === 'c1_managed' || raw === 'c2a_autonomous') return raw
  return process.env.LUCID_RUNTIME_ID ? 'c1_managed' : 'shared'
}

function executionTargetKind(): 'shared_worker' | 'dedicated_worker' | 'byo_bridge' {
  if (process.env.LUCID_RUNTIME_TIER === 'byo') return 'byo_bridge'
  return process.env.LUCID_RUNTIME_ID ? 'dedicated_worker' : 'shared_worker'
}

function runtimeHomeRoot(): string | null {
  const engine = runtimeEngine()
  const explicit = engine === 'hermes'
    ? process.env.HERMES_HOME
    : process.env.OPENCLAW_HOME
  if (explicit?.trim()) return explicit.trim()

  const home = os.homedir()
  if (!home) return null
  return engine === 'hermes'
    ? path.join(home, '.hermes')
    : path.join(home, '.openclaw')
}

function currentExecutionTarget() {
  const kind = executionTargetKind()
  const runtimeId = process.env.LUCID_RUNTIME_ID || '00000000-0000-0000-0000-000000000000'
  const root = runtimeHomeRoot()
  if (kind === 'shared_worker') {
    return {
      kind,
      targetId: process.env.LUCID_RUNTIME_ID || 'shared-worker',
      runtimeHomeRoot: root,
      metadata: { engine: runtimeEngine(), runtimeFlavor: runtimeFlavor() },
    }
  }
  if (kind === 'byo_bridge') {
    const bridgeMode = process.env.LUCID_BRIDGE_MODE === 'observe' ? 'observe' as const : 'full' as const
    return {
      kind,
      runtimeId,
      bridgeMode,
      runtimeHomeRoot: root,
      metadata: {
        engine: runtimeEngine(),
        runtimeFlavor: runtimeFlavor(),
        hermesCliReady: process.env.LUCID_ENGINE === 'hermes' ? Boolean(process.env.HERMES_BINARY || process.env.HERMES_BIN_PATH || process.env.HERMES_COMMAND) : undefined,
      },
    }
  }
  return {
    kind,
    runtimeId,
    generation: Number.parseInt(process.env.LUCID_RUNTIME_GENERATION || '1', 10),
    runtimeHomeRoot: root,
    metadata: { engine: runtimeEngine(), runtimeFlavor: runtimeFlavor() },
  }
}

function commandPayload(command: RuntimeManagementCommand): Record<string, unknown> {
  return command.payload && typeof command.payload === 'object' ? command.payload : {}
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function scheduleEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  for (const key of ['native_schedules', 'nativeSchedules', 'schedules', 'jobs']) {
    const list = record[key]
    if (Array.isArray(list)) return list
  }
  return []
}

function normalizeScheduleEntry(entry: unknown, index: number): Record<string, unknown> | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const record = entry as Record<string, unknown>
  const cronExpression = readString(record, 'cron_expression')
    ?? readString(record, 'cronExpression')
    ?? readString(record, 'cron')
    ?? readString(record, 'schedule')
  if (!cronExpression) return null
  return {
    nativeId: readString(record, 'id') ?? readString(record, 'native_id') ?? readString(record, 'nativeId') ?? `native-${index}`,
    label: readString(record, 'name') ?? readString(record, 'label') ?? readString(record, 'description') ?? `Native schedule ${index + 1}`,
    cronExpression,
    timezone: readString(record, 'timezone') ?? readString(record, 'tz') ?? 'UTC',
    enabled: record.enabled !== false,
    source: readString(record, 'source') ?? 'native_scheduler',
  }
}

function readNativeScheduleFile(rootDir: string, payload: Record<string, unknown>): Record<string, unknown>[] {
  const requested = readString(payload, 'nativeScheduleFile') ?? readString(payload, 'native_schedule_file')
  const candidates = requested
    ? [path.isAbsolute(requested) ? requested : path.join(rootDir, requested)]
    : ['native-schedules.json', 'schedules.json', 'cron.json', 'routines.json'].map((name) => path.join(rootDir, name))

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    const root = path.resolve(rootDir)
    if (!resolved.startsWith(root)) continue
    try {
      const stat = fs.statSync(resolved)
      if (!stat.isFile() || stat.size > MAX_HOME_FILE_BYTES) continue
      const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown
      return scheduleEntries(parsed)
        .map((entry, index) => normalizeScheduleEntry(entry, index))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .slice(0, MAX_NATIVE_SCHEDULES)
    } catch {
      // Keep runtime-owned host details out of command responses.
    }
  }
  return []
}

function serializeSnapshotSummary(snapshot: Record<string, unknown>): Record<string, unknown> {
  const entries = Array.isArray(snapshot.entries) ? snapshot.entries : []
  return {
    version: snapshot.version,
    engine: snapshot.engine,
    runtimeFlavor: snapshot.runtimeFlavor,
    homeId: snapshot.homeId,
    createdAt: snapshot.createdAt,
    rootDigest: snapshot.rootDigest,
    entryCount: entries.length,
    entries: entries.slice(0, MAX_RESPONSE_ENTRIES),
    truncated: entries.length > MAX_RESPONSE_ENTRIES,
    metadata: snapshot.metadata,
  }
}

function serializeDiffSummary(diff: Record<string, unknown>): Record<string, unknown> {
  const added = Array.isArray(diff.added) ? diff.added : []
  const removed = Array.isArray(diff.removed) ? diff.removed : []
  const modified = Array.isArray(diff.modified) ? diff.modified : []
  const unchanged = Array.isArray(diff.unchanged) ? diff.unchanged : []
  return {
    beforeDigest: diff.beforeDigest ?? null,
    afterDigest: diff.afterDigest ?? null,
    summary: diff.summary ?? {
      added: added.length,
      removed: removed.length,
      modified: modified.length,
      unchanged: unchanged.length,
    },
    added: added.slice(0, MAX_RESPONSE_ENTRIES),
    removed: removed.slice(0, MAX_RESPONSE_ENTRIES),
    modified: modified.slice(0, MAX_RESPONSE_ENTRIES),
    unchangedSample: unchanged.slice(0, Math.min(5, MAX_RESPONSE_ENTRIES)),
    truncated: {
      added: added.length > MAX_RESPONSE_ENTRIES,
      removed: removed.length > MAX_RESPONSE_ENTRIES,
      modified: modified.length > MAX_RESPONSE_ENTRIES,
      unchanged: unchanged.length > 5,
    },
  }
}

function maybeInlineArchive(archive: Record<string, unknown>): Record<string, unknown> | undefined {
  const bytes = Buffer.byteLength(JSON.stringify(archive), 'utf8')
  return bytes <= MAX_INLINE_ARCHIVE_BYTES ? archive : undefined
}

async function executeEngineHomeCommand(command: RuntimeManagementCommand): Promise<CommandResult> {
  const rootDir = runtimeHomeRoot()
  if (!rootDir) {
    return {
      status: 'needs_user_action',
      error: 'Runtime home root is not available on this host.',
      response: { rootAvailable: false, engine: runtimeEngine() },
    }
  }

  try {
    fs.mkdirSync(rootDir, { recursive: true })
  } catch (error) {
    return {
      status: 'needs_user_action',
      error: `Runtime home root could not be prepared: ${error instanceof Error ? error.message : String(error)}`,
      response: { rootAvailable: false, engine: runtimeEngine(), runtimeHomeRoot: rootDir },
    }
  }

  const payload = commandPayload(command)
  const homeId = typeof payload.homeId === 'string' && payload.homeId.trim()
    ? payload.homeId.trim()
    : `${runtimeEngine()}:${process.env.LUCID_RUNTIME_ID || executionTargetKind()}`

  if (command.commandType === 'engine_home.rollback') {
    if (payload.confirm !== true) {
      return {
        status: 'needs_user_action',
        error: 'Rollback requires payload.confirm=true and an engine-home archive.',
      }
    }
    if (!payload.archive || typeof payload.archive !== 'object') {
      return {
        status: 'needs_user_action',
        error: 'Rollback requires payload.archive.',
      }
    }
    const snapshot = await hydrateEngineHomeArchive(rootDir, payload.archive as Record<string, unknown>, {
      clean: payload.clean === true,
    })
    return {
      status: 'applied',
      response: {
        action: 'engine_home.rollback',
        snapshot: serializeSnapshotSummary(snapshot),
      },
    }
  }

  if (command.commandType === 'engine_home.export') {
    const archive = await createEngineHomeArchive({
      engine: runtimeEngine(),
      runtimeFlavor: runtimeFlavor(),
      rootDir,
      homeId,
      maxFileBytes: MAX_HOME_FILE_BYTES,
      labels: { source: 'runtime_management_command' },
      metadata: { commandId: command.id, target: executionTargetKind() },
    })
    return {
      status: 'applied',
      response: {
        action: 'engine_home.export',
        manifest: archive.manifest,
        fileCount: archive.files.length,
        archive: payload.includeContents === true ? maybeInlineArchive(archive as unknown as Record<string, unknown>) : undefined,
        archiveOmitted: payload.includeContents === true && !maybeInlineArchive(archive as unknown as Record<string, unknown>)
          ? { reason: 'response_too_large', maxInlineBytes: MAX_INLINE_ARCHIVE_BYTES }
          : undefined,
      },
    }
  }

  const snapshot = await snapshotEngineHome({
    engine: runtimeEngine(),
    runtimeFlavor: runtimeFlavor(),
    rootDir,
    homeId,
    maxFileBytes: MAX_HOME_FILE_BYTES,
    metadata: { commandId: command.id, target: executionTargetKind() },
  })

  if (command.commandType === 'engine_home.diff') {
    const before = payload.beforeSnapshot && typeof payload.beforeSnapshot === 'object'
      ? payload.beforeSnapshot as Record<string, unknown>
      : null
    const diff = diffEngineHomeSnapshots(before, snapshot)
    return {
      status: 'applied',
      response: {
        action: 'engine_home.diff',
        after: serializeSnapshotSummary(snapshot),
        diff: serializeDiffSummary(diff),
      },
    }
  }

  return {
    status: 'applied',
    response: {
      action: 'engine_home.snapshot',
      snapshot: serializeSnapshotSummary(snapshot),
    },
  }
}

async function executeNativeSchedulerCommand(command: RuntimeManagementCommand): Promise<CommandResult> {
  const payload = commandPayload(command)
  const rootDir = runtimeHomeRoot()
  const inline = scheduleEntries(payload)
    .map((entry, index) => normalizeScheduleEntry(entry, index))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
  const schedules = inline.length > 0 || !rootDir
    ? inline
    : readNativeScheduleFile(rootDir, payload)

  const response = {
    action: command.commandType,
    engine: runtimeEngine(),
    runtimeFlavor: runtimeFlavor(),
    scheduleCount: schedules.length,
    schedules: schedules.slice(0, MAX_NATIVE_SCHEDULES),
    truncated: schedules.length > MAX_NATIVE_SCHEDULES,
    executionDelegated: false,
    delegationReason: 'Runtime-native schedules are observed/imported for review; Lucid-managed execution delegation requires ACK/reconcile/idempotency proof.',
  }

  if (command.commandType === 'native_scheduler.import') {
    return {
      status: 'needs_user_action',
      error: 'Import native schedules through a Routine Kernel engine-home import run so disabled Routine candidates are created with org audit.',
      response,
    }
  }

  return { status: schedules.length > 0 ? 'applied' : 'needs_user_action', response }
}

async function executeCommand(command: RuntimeManagementCommand): Promise<CommandResult> {
  const engine = runtimeEngine()
  switch (command.commandType) {
    case 'adapter.probe': {
      const probe = testRuntimeAdapterEnvironment({
        type: engine,
        target: currentExecutionTarget(),
      })
      clearRuntimeCapabilityReportCache()
      return { status: 'applied', response: { probe } }
    }
    case 'capability.refresh': {
      clearRuntimeCapabilityReportCache()
      return {
        status: 'applied',
        response: { capabilityReport: buildRuntimeCapabilityHeartbeatFields() },
      }
    }
    case 'runtime.services.inspect': {
      return {
        status: 'applied',
        response: {
          services: getRuntimeAdapterServices(engine),
          runtimeServices: buildRuntimeCapabilityHeartbeatFields().runtimeServices ?? [],
        },
      }
    }
    case 'transcript.parser.test': {
      const payload = commandPayload(command)
      const fixture = typeof payload.fixture === 'string' ? payload.fixture : undefined
      const forceFallback = payload.forceFallback === true
      const parser = testRuntimeAdapterTranscriptParser({
        type: engine,
        fixture,
        forceFallback,
      })
      return { status: 'applied', response: { parser } }
    }
    case 'runtime.config.refresh': {
      await bootstrapRuntimeConfig()
      refreshConfigFromEnv()
      return { status: 'applied', response: { refreshed: true } }
    }
    case 'engine_home.snapshot':
    case 'engine_home.diff':
    case 'engine_home.export':
    case 'engine_home.rollback':
      return await executeEngineHomeCommand(command)
    case 'native_scheduler.observe':
    case 'native_scheduler.import':
      return await executeNativeSchedulerCommand(command)
    case 'runtime.restart':
    case 'runtime.shutdown':
      return {
        status: 'needs_user_action',
        error: 'Runtime lifecycle commands must be handled by the provider/runtime supervisor, not the in-process adapter.',
      }
    default:
      return {
        status: 'rejected',
        error: `Unsupported runtime management command: ${command.commandType}`,
      }
  }
}

export async function processRuntimeManagementCommands(
  commands: RuntimeManagementCommand[],
  dataSink: DataSink,
): Promise<void> {
  if (commands.length === 0 || !dataSink.ackManagementCommand) return

  for (const command of commands) {
    if (runningCommands.has(command.id)) continue
    runningCommands.add(command.id)
    try {
      await dataSink.ackManagementCommand(command.id, 'accepted', {
        commandType: command.commandType,
        acceptedAt: new Date().toISOString(),
      })
      const result = await executeCommand(command)
      await dataSink.ackManagementCommand(
        command.id,
        result.status,
        result.response ?? null,
        result.error ?? null,
      )
    } catch (error) {
      await dataSink.ackManagementCommand(command.id, 'failed', null, error instanceof Error ? error.message : String(error))
    } finally {
      runningCommands.delete(command.id)
    }
  }
}
