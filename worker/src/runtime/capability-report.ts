import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import type { HeartbeatPayload } from './data-sink.js'

type Capability = NonNullable<HeartbeatPayload['nativeCapabilities']>[number] & {
  id: string
  kind: string
  label: string
}
type RuntimeService = NonNullable<HeartbeatPayload['runtimeServices']>[number]

const PROBE_TTL_MS = 5 * 60_000
const DISCOVERY_TIMEOUT_MS = 2_000
const MAX_DISCOVERY_BYTES = 256_000

let cachedReport:
  | { key: string; expiresAt: number; payload: Partial<HeartbeatPayload> }
  | null = null

export function clearRuntimeCapabilityReportCache(): void {
  cachedReport = null
}

function getEngine(): 'openclaw' | 'hermes' {
  return process.env.LUCID_ENGINE === 'hermes' ? 'hermes' : 'openclaw'
}

function getRuntimeFlavor(): 'shared' | 'c1_managed' | 'c2a_autonomous' {
  const raw = process.env.LUCID_RUNTIME_FLAVOR
  if (raw === 'shared' || raw === 'c1_managed' || raw === 'c2a_autonomous') return raw
  return process.env.LUCID_RUNTIME_ID ? 'c1_managed' : 'shared'
}

function getExecutionTarget(): 'shared_worker' | 'dedicated_worker' | 'byo_bridge' {
  if (process.env.LUCID_RUNTIME_TIER === 'byo') return 'byo_bridge'
  return process.env.LUCID_RUNTIME_ID ? 'dedicated_worker' : 'shared_worker'
}

function getVersion(): string {
  return process.env.npm_package_version || '1.0.0'
}

function hasExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function findExecutable(command: string): string | null {
  if (!command) return null
  const executable = command.split(/\s+/)[0]
  if (executable.includes(path.sep)) {
    return hasExecutable(executable) ? executable : null
  }
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  for (const dir of pathEntries) {
    const candidate = path.join(dir, executable)
    if (hasExecutable(candidate)) return candidate
  }
  return null
}

function parseCapabilityDiscoveryJson(raw: string | undefined): Capability[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    const values = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { capabilities?: unknown }).capabilities)
        ? (parsed as { capabilities: unknown[] }).capabilities
        : []
    return values.filter((entry): entry is Capability => Boolean(entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string'))
  } catch {
    return []
  }
}

function readCapabilityDiscoveryFile(filePath: string | undefined): Capability[] {
  if (!filePath?.trim()) return []
  try {
    const content = fs.readFileSync(filePath.trim(), 'utf8')
    return parseCapabilityDiscoveryJson(content)
  } catch {
    return []
  }
}

function runCapabilityDiscoveryCommand(command: string | undefined): Capability[] {
  if (!command?.trim()) return []
  const executable = findExecutable(command)
  if (!executable) return []
  const args = command.trim().split(/\s+/).slice(1)
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: DISCOVERY_TIMEOUT_MS,
    maxBuffer: MAX_DISCOVERY_BYTES,
    env: process.env,
  })
  if (result.status !== 0 || !result.stdout) return []
  return parseCapabilityDiscoveryJson(result.stdout)
}

function mergeDiscoveredCapabilities(base: Capability[], discovered: Capability[]): Capability[] {
  const byId = new Map<string, Capability>()
  for (const capability of base) byId.set(capability.id, capability)
  for (const capability of discovered) {
    const previous = byId.get(capability.id)
    byId.set(capability.id, previous ? { ...previous, ...capability } : capability)
  }
  return [...byId.values()]
}

function discoverRuntimeCapabilities(engine: 'openclaw' | 'hermes'): Capability[] {
  const enginePrefix = engine === 'hermes' ? 'HERMES' : 'OPENCLAW'
  return [
    ...parseCapabilityDiscoveryJson(process.env.LUCID_RUNTIME_CAPABILITIES_JSON),
    ...parseCapabilityDiscoveryJson(process.env[`${enginePrefix}_CAPABILITIES_JSON`]),
    ...readCapabilityDiscoveryFile(process.env.LUCID_RUNTIME_CAPABILITIES_FILE),
    ...readCapabilityDiscoveryFile(process.env[`${enginePrefix}_CAPABILITIES_FILE`]),
    ...runCapabilityDiscoveryCommand(process.env.LUCID_RUNTIME_CAPABILITIES_COMMAND),
    ...runCapabilityDiscoveryCommand(process.env[`${enginePrefix}_CAPABILITIES_COMMAND`]),
  ]
}

function baseCapability(
  id: string,
  kind: string,
  label: string,
  options: Partial<Capability> = {},
): Capability {
  const engine = getEngine()
  return {
    id,
    kind,
    label,
    engine,
    runtimeFlavors: [getRuntimeFlavor()],
    supportLevel: 'stable',
    authority: 'lucid',
    availability: 'available',
    health: 'healthy',
    manageMode: 'lucid_managed',
    source: 'adapter',
    readOnly: false,
    requiresUserAction: false,
    supportsDiff: false,
    supportsImport: false,
    supportsExport: false,
    supportsRollback: false,
    notes: [],
    metadata: {},
    ...options,
  }
}

function openClawCapabilities(): Capability[] {
  return [
    baseCapability('openclaw.relay_channels', 'relay_channels', 'Lucid relay channels'),
    baseCapability('openclaw.native_channels', 'native_channels', 'Native channels', {
      supportLevel: 'stable',
      authority: 'adapter',
      manageMode: 'request_review',
      availability: process.env.LUCID_CHANNEL_MODE === 'native' ? 'available' : 'limited',
    }),
    baseCapability('openclaw.skills', 'skills', 'Shared skills', {
      supportsImport: true,
      supportsExport: true,
    }),
    baseCapability('openclaw.plugins', 'plugins', 'Shared plugins', {
      supportsImport: true,
      supportsExport: true,
    }),
    baseCapability('openclaw.memory', 'memory', 'Lucid memory bridge', {
      supportsDiff: true,
      supportsExport: true,
    }),
    baseCapability('openclaw.sessions', 'sessions', 'OpenClaw sessions', {
      supportLevel: 'stable',
      authority: 'adapter',
      manageMode: 'apply_via_bridge',
      source: 'adapter',
      supportsExport: true,
    }),
    baseCapability('openclaw.native_tools', 'native_tools', 'OpenClaw native tools', {
      supportLevel: 'stable',
      authority: 'adapter',
      manageMode: 'request_review',
      source: 'engine',
      notes: ['Tool availability is still governed by Lucid policy and runtime flavor.'],
    }),
    baseCapability('openclaw.browser', 'browser', 'Browser automation', {
      supportLevel: 'stable',
      authority: 'adapter',
      manageMode: 'request_review',
      source: 'engine',
      availability: process.env.LUCID_RUNTIME_FLAVOR === 'shared' ? 'limited' : 'available',
    }),
    baseCapability('openclaw.nodes', 'nodes', 'OpenClaw paired nodes', {
      supportLevel: 'experimental',
      authority: 'engine',
      manageMode: 'runtime_native_ui',
      source: 'engine',
      availability: process.env.LUCID_RUNTIME_TIER === 'byo' ? 'available' : 'limited',
      notes: ['Pairing remains runtime/operator-authoritative; Lucid observes and routes by advertised capability.'],
    }),
    baseCapability('openclaw.media_understanding', 'media_understanding', 'Media understanding', {
      supportLevel: 'stable',
      authority: 'adapter',
      manageMode: 'apply_via_bridge',
      source: 'engine',
    }),
    baseCapability('openclaw.mutations', 'mutations', 'Mutation review', {
      supportLevel: 'stable',
      authority: 'lucid',
      manageMode: 'request_review',
      supportsDiff: true,
      supportsRollback: true,
    }),
    baseCapability('openclaw.routines', 'routines', 'Lucid Routines', {
      supportLevel: 'stable',
      authority: 'lucid',
      source: 'lucid',
      manageMode: 'lucid_managed',
      notes: ['Lucid remains the scheduler source of truth; OpenClaw can execute eligible routine runs through the shared runtime contract.'],
    }),
    baseCapability('scheduled.native_scheduler.observe', 'scheduled.native_scheduler.observe', 'Native schedule observation', {
      supportLevel: 'experimental',
      authority: 'engine',
      source: 'engine',
      manageMode: 'read_only',
      readOnly: true,
      notes: ['Lucid can observe/import native schedules as facets without delegating execution by default.'],
    }),
    baseCapability('scheduled.native_scheduler.import', 'scheduled.native_scheduler.import', 'Native schedule import', {
      supportLevel: 'experimental',
      authority: 'lucid',
      source: 'adapter',
      manageMode: 'request_review',
      supportsImport: true,
      notes: ['Imported native schedules become Lucid Routine definitions before managed execution.'],
    }),
    baseCapability('scheduled.native_scheduler.delegate', 'scheduled.native_scheduler.delegate', 'Native schedule delegation', {
      supportLevel: 'experimental',
      authority: 'engine',
      source: 'engine',
      availability: 'unavailable',
      manageMode: 'read_only',
      readOnly: true,
      notes: ['Execution delegation stays disabled until the runtime proves writable scheduler ACK, reconcile, and idempotency semantics.'],
    }),
    baseCapability('scheduled.ack', 'scheduled.ack', 'Routine run ACK', {
      supportLevel: 'stable',
      authority: 'adapter',
      source: 'adapter',
      manageMode: 'apply_via_bridge',
    }),
    baseCapability('scheduled.reconcile', 'scheduled.reconcile', 'Routine run reconcile', {
      supportLevel: 'stable',
      authority: 'lucid',
      source: 'adapter',
      manageMode: 'lucid_managed',
    }),
    baseCapability('scheduled.idempotency', 'scheduled.idempotency', 'Routine idempotency', {
      supportLevel: 'stable',
      authority: 'lucid',
      source: 'adapter',
      manageMode: 'lucid_managed',
    }),
    baseCapability('openclaw.native_scheduler', 'native_scheduler', 'OpenClaw native scheduler observation', {
      supportLevel: 'experimental',
      authority: 'engine',
      source: 'engine',
      availability: 'limited',
      manageMode: 'read_only',
      readOnly: true,
      notes: ['Native scheduler delegation requires ACK/reconcile/idempotency contract proof before Lucid-managed routines can delegate execution.'],
    }),
    baseCapability('openclaw.control_commands', 'control_commands', 'Runtime management commands', {
      authority: 'adapter',
      manageMode: 'apply_via_bridge',
    }),
  ]
}

function hermesCapabilities(): Capability[] {
  return [
    baseCapability('hermes.engine_home', 'engine_home', 'Hermes home', {
      authority: 'engine',
      manageMode: 'request_review',
      source: 'engine',
      supportsDiff: true,
      supportsImport: true,
      supportsExport: true,
      supportsRollback: true,
    }),
    baseCapability('hermes.skills', 'skills', 'Shared skills with Hermes projection', {
      authority: 'lucid',
      source: 'projection',
      supportsDiff: true,
      supportsImport: true,
      supportsExport: true,
      supportsRollback: true,
    }),
    baseCapability('hermes.memory', 'memory', 'Hermes memory projection', {
      authority: 'lucid',
      source: 'projection',
      supportsDiff: true,
      supportsImport: true,
      supportsExport: true,
      supportsRollback: true,
    }),
    baseCapability('hermes.kanban', 'kanban', 'Hermes native Kanban projection', {
      supportLevel: 'experimental',
      authority: 'engine',
      availability: 'limited',
      manageMode: 'request_review',
      source: 'projection',
      supportsDiff: true,
      notes: ['Lucid board remains canonical; Hermes-native Kanban is synchronized as a projection when available.'],
    }),
    baseCapability('hermes.checkpoints', 'checkpoints', 'Hermes checkpoints', {
      supportLevel: 'experimental',
      authority: 'engine',
      source: 'engine',
      supportsExport: true,
      supportsRollback: true,
    }),
    baseCapability('hermes.model_discovery', 'model_discovery', 'Hermes model discovery', {
      supportLevel: 'experimental',
      authority: 'engine',
      source: 'engine',
      readOnly: true,
    }),
    baseCapability('hermes.model_profiles', 'model_profiles', 'Hermes model profiles', {
      supportLevel: 'experimental',
      authority: 'engine',
      source: 'engine',
      manageMode: 'request_review',
      supportsDiff: true,
    }),
    baseCapability('hermes.quota_windows', 'quota_windows', 'Hermes quota windows', {
      supportLevel: 'experimental',
      authority: 'engine',
      source: 'engine',
      readOnly: true,
    }),
    baseCapability('hermes.local_first_controls', 'local_files', 'Hermes local-first controls', {
      supportLevel: 'stable',
      authority: 'engine',
      source: 'engine',
      manageMode: process.env.LUCID_RUNTIME_TIER === 'byo' ? 'runtime_native_ui' : 'request_review',
      supportsDiff: true,
      supportsExport: true,
      notes: ['Lucid requests or reviews local-first changes; BYO policy remains runtime-authoritative.'],
    }),
    baseCapability('hermes.transcript_parser', 'transcript_parser', 'Hermes transcript parser', {
      supportLevel: 'experimental',
      authority: 'adapter',
      source: 'adapter',
      readOnly: true,
    }),
    baseCapability('hermes.dreaming', 'dreaming', 'Hermes dreaming loop', {
      supportLevel: 'planned',
      authority: 'engine',
      availability: 'unknown',
      health: 'unknown',
      manageMode: 'read_only',
      readOnly: true,
      notes: ['Discovery surface is reserved so Lucid can expose and manage the feature once the adapter can verify runtime support.'],
    }),
    baseCapability('hermes.routines', 'routines', 'Lucid Routines', {
      supportLevel: 'stable',
      authority: 'lucid',
      source: 'lucid',
      manageMode: 'lucid_managed',
      notes: ['Lucid remains the scheduler source of truth while Hermes local-first state is observed through EHV/HHV.'],
    }),
    baseCapability('scheduled.native_scheduler.observe', 'scheduled.native_scheduler.observe', 'Native schedule observation', {
      supportLevel: 'experimental',
      authority: 'engine',
      source: 'engine',
      manageMode: 'read_only',
      readOnly: true,
      notes: ['Lucid can observe/import native schedules as facets without taking over Hermes local-first ownership.'],
    }),
    baseCapability('scheduled.native_scheduler.import', 'scheduled.native_scheduler.import', 'Native schedule import', {
      supportLevel: 'experimental',
      authority: 'lucid',
      source: 'adapter',
      manageMode: 'request_review',
      supportsImport: true,
      notes: ['Imported native schedules become Lucid Routine definitions before managed execution.'],
    }),
    baseCapability('scheduled.native_scheduler.delegate', 'scheduled.native_scheduler.delegate', 'Native schedule delegation', {
      supportLevel: 'experimental',
      authority: 'engine',
      source: 'engine',
      availability: 'unavailable',
      manageMode: 'read_only',
      readOnly: true,
      notes: ['Execution delegation stays disabled until the runtime proves writable scheduler ACK, reconcile, and idempotency semantics.'],
    }),
    baseCapability('scheduled.ack', 'scheduled.ack', 'Routine run ACK', {
      supportLevel: 'stable',
      authority: 'adapter',
      source: 'adapter',
      manageMode: 'apply_via_bridge',
    }),
    baseCapability('scheduled.reconcile', 'scheduled.reconcile', 'Routine run reconcile', {
      supportLevel: 'stable',
      authority: 'lucid',
      source: 'adapter',
      manageMode: 'lucid_managed',
    }),
    baseCapability('scheduled.idempotency', 'scheduled.idempotency', 'Routine idempotency', {
      supportLevel: 'stable',
      authority: 'lucid',
      source: 'adapter',
      manageMode: 'lucid_managed',
    }),
    baseCapability('hermes.native_scheduler', 'native_scheduler', 'Hermes native scheduler observation', {
      supportLevel: 'experimental',
      authority: 'engine',
      source: 'engine',
      availability: 'limited',
      manageMode: 'read_only',
      readOnly: true,
      notes: ['Delegation is capability-gated until Hermes reports durable ACK/reconcile semantics for scheduled execution.'],
    }),
    baseCapability('hermes.control_commands', 'control_commands', 'Runtime management commands', {
      supportLevel: 'experimental',
      authority: 'adapter',
      manageMode: 'apply_via_bridge',
    }),
  ]
}

function runtimeServices(engine: 'openclaw' | 'hermes'): RuntimeService[] {
  if (engine === 'hermes') {
    return [
      {
        serviceName: 'hermes_bridge',
        label: 'Hermes bridge',
        status: 'unknown',
        lifecycle: 'runtime_owned',
        healthStatus: 'unknown',
        externallyVisible: false,
        metadata: {},
      },
      {
        serviceName: 'home_projector',
        label: 'Home projector',
        status: 'unknown',
        lifecycle: 'ephemeral',
        healthStatus: 'unknown',
        externallyVisible: false,
        metadata: {},
      },
    ]
  }
  return [
    {
      serviceName: 'runtime_bridge',
      label: 'Runtime bridge',
      status: 'running',
      lifecycle: 'shared',
      healthStatus: 'healthy',
      externallyVisible: false,
      metadata: {},
    },
  ]
}

function commandSpec(engine: 'openclaw' | 'hermes'): HeartbeatPayload['commandSpec'] {
  if (engine === 'hermes') {
    const command = process.env.HERMES_COMMAND || process.env.HERMES_BINARY || process.env.HERMES_BIN_PATH || 'hermes'
    return {
      command,
      detectCommand: 'hermes --version',
      installCommand: 'npm install -g lucid-runtime',
      workingDirectoryPolicy: 'runtime_owned',
      displayName: 'Hermes CLI',
      parserSupport: 'adapter',
      notes: [
        'Secrets are supplied by Lucid TrustGate or runtime-owned local configuration, never embedded in this command spec.',
        'Runtime commands: adapter.probe, capability.refresh, runtime.services.inspect, transcript.parser.test, runtime.config.refresh, engine_home.snapshot, engine_home.diff, engine_home.export, engine_home.rollback, native_scheduler.observe, native_scheduler.import.',
      ],
    }
  }
  return {
    command: process.env.OPENCLAW_RUNTIME_COMMAND || 'lucid-runtime run --engine openclaw',
    detectCommand: 'lucid-runtime doctor --engine openclaw',
    installCommand: 'npm install -g lucid-runtime',
    workingDirectoryPolicy: 'adapter_default',
    displayName: 'OpenClaw runtime',
    parserSupport: 'lucid_fallback',
    notes: [
      'Runtime commands: adapter.probe, capability.refresh, runtime.services.inspect, transcript.parser.test, runtime.config.refresh, engine_home.snapshot, engine_home.diff, engine_home.export, engine_home.rollback, native_scheduler.observe, native_scheduler.import.',
    ],
  }
}

function adapterProbe(engine: 'openclaw' | 'hermes'): HeartbeatPayload['adapterProbe'] {
  const testedAt = new Date().toISOString()
  if (engine === 'hermes') {
    const command = process.env.HERMES_BINARY || process.env.HERMES_BIN_PATH || process.env.HERMES_COMMAND || 'hermes'
    const executable = findExecutable(command)
    return {
      adapterType: 'hermes',
      status: executable ? 'pass' : 'warn',
      target: null,
      checks: [
        executable
          ? {
              code: 'hermes_cli_available',
              level: 'info',
              message: 'Hermes CLI executable is available.',
              targetKind: getExecutionTarget(),
            }
          : {
              code: 'hermes_cli_not_verified',
              level: 'warn',
              message: 'Hermes CLI executable was not found from this runtime environment.',
              hint: 'Install Hermes locally for BYO or use a Lucid-managed image that includes the Hermes runtime.',
              targetKind: getExecutionTarget(),
            },
      ],
      testedAt,
      expiresAt: new Date(Date.now() + PROBE_TTL_MS).toISOString(),
      cached: true,
      source: 'heartbeat',
    }
  }
  return {
    adapterType: 'openclaw',
    status: 'pass',
    target: null,
    checks: [
      {
        code: 'openclaw_adapter_available',
        level: 'info',
        message: 'OpenClaw adapter is available in the Lucid runtime.',
        targetKind: getExecutionTarget(),
      },
    ],
    testedAt,
    expiresAt: new Date(Date.now() + PROBE_TTL_MS).toISOString(),
    cached: true,
    source: 'heartbeat',
  }
}

function transcriptParser(engine: 'openclaw' | 'hermes'): HeartbeatPayload['transcriptParser'] {
  if (engine === 'hermes') {
    return {
      supported: true,
      parserId: 'hermes-transcript-adapter',
      version: getVersion(),
      mode: 'adapter',
      status: 'ready',
      sampleTestStatus: 'unknown',
      notes: ['Parser is adapter-owned so Hermes transcript changes can be handled without changing Lucid core.'],
    }
  }
  return {
    supported: true,
    parserId: 'openclaw-lucid-parser',
    version: getVersion(),
    mode: 'lucid_fallback',
    status: 'ready',
    sampleTestStatus: 'pass',
    notes: [],
  }
}

function engineHomePolicy(engine: 'openclaw' | 'hermes'): HeartbeatPayload['engineHomePolicy'] {
  const shared = getRuntimeFlavor() === 'shared'
  if (engine === 'hermes') {
    return {
      mode: shared ? 'ehv_projected' : 'hybrid',
      authority: 'engine',
      writePolicy: shared ? 'review_required' : 'runtime_native',
      snapshotSupport: true,
      diffSupport: true,
      rollbackSupport: true,
      importExportSupport: true,
      durableInShared: true,
      notes: shared
        ? ['Shared Hermes uses EHV projection so local-first home semantics remain durable without global HERMES_HOME writes.']
        : ['Dedicated and BYO Hermes may keep runtime-owned home state while Lucid observes, diffs, and requests changes.'],
      metadata: {},
    }
  }
  return {
    mode: shared ? 'lucid_managed' : 'hybrid',
    authority: 'lucid',
    writePolicy: shared ? 'lucid_committed' : 'review_required',
    snapshotSupport: true,
    diffSupport: true,
    rollbackSupport: true,
    importExportSupport: true,
    durableInShared: true,
    notes: ['OpenClaw uses Lucid-managed memory, skills, channels, and mutation review as canonical control-plane state.'],
    metadata: {},
  }
}

export function buildRuntimeCapabilityHeartbeatFields(): Partial<HeartbeatPayload> {
  const engine = getEngine()
  const key = [
    engine,
    getRuntimeFlavor(),
    getExecutionTarget(),
    process.env.HERMES_BINARY || '',
    process.env.HERMES_BIN_PATH || '',
    process.env.HERMES_COMMAND || '',
    process.env.LUCID_RUNTIME_CAPABILITIES_JSON || '',
    process.env.LUCID_RUNTIME_CAPABILITIES_FILE || '',
    process.env.LUCID_RUNTIME_CAPABILITIES_COMMAND || '',
    process.env[`${engine === 'hermes' ? 'HERMES' : 'OPENCLAW'}_CAPABILITIES_JSON`] || '',
    process.env[`${engine === 'hermes' ? 'HERMES' : 'OPENCLAW'}_CAPABILITIES_FILE`] || '',
    process.env[`${engine === 'hermes' ? 'HERMES' : 'OPENCLAW'}_CAPABILITIES_COMMAND`] || '',
  ].join('|')

  if (cachedReport && cachedReport.key === key && cachedReport.expiresAt > Date.now()) {
    return cachedReport.payload
  }

  const payload: Partial<HeartbeatPayload> = {
    adapterIdentity: {
      adapterType: engine,
      label: engine === 'hermes' ? 'Hermes adapter' : 'OpenClaw adapter',
      version: getVersion(),
      source: 'builtin',
      executionTargets: [getExecutionTarget()],
      managedBy: engine === 'hermes' ? 'adapter' : 'lucid',
      protocolVersion: 'runtime-capability-v1',
      metadata: {},
    },
    nativeCapabilities: mergeDiscoveredCapabilities(
      engine === 'hermes' ? hermesCapabilities() : openClawCapabilities(),
      discoverRuntimeCapabilities(engine),
    ),
    runtimeServices: runtimeServices(engine),
    adapterProbe: adapterProbe(engine),
    transcriptParser: transcriptParser(engine),
    commandSpec: commandSpec(engine),
    engineHomePolicy: engineHomePolicy(engine),
  }

  cachedReport = {
    key,
    expiresAt: Date.now() + PROBE_TTL_MS,
    payload,
  }
  return payload
}
