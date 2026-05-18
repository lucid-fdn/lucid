export const AGENT_ENGINES = [
  'openclaw',
  'hermes',
  'langchain',
  'crewai',
  'autogen',
  'smolagents',
  'lucid',
] as const

export type AgentEngine = (typeof AGENT_ENGINES)[number]

/**
 * Migration-only fallback for legacy rows created before `engine` was stored.
 * New runtime/agent creation paths must write an explicit engine.
 */
export const LEGACY_AGENT_ENGINE = 'openclaw' satisfies AgentEngine

export function isAgentEngine(value: unknown): value is AgentEngine {
  return typeof value === 'string' && (AGENT_ENGINES as readonly string[]).includes(value)
}

export const RUNTIME_FLAVORS = ['shared', 'c1_managed', 'c2a_autonomous'] as const
export type RuntimeFlavor = (typeof RUNTIME_FLAVORS)[number]

export const CHANNEL_OWNERSHIPS = ['lucid_relay', 'runtime_native'] as const
export type ChannelOwnership = (typeof CHANNEL_OWNERSHIPS)[number]

export const RUNTIME_PROTOCOLS = ['lucid-runtime-v1', 'lucid-runtime-v2'] as const
export type RuntimeProtocol = (typeof RUNTIME_PROTOCOLS)[number]

export const DEDICATED_TRANSPORT_MODES = ['relay', 'native_pulse'] as const
export type DedicatedTransportMode = (typeof DEDICATED_TRANSPORT_MODES)[number]

export const RUNTIME_BRIDGE_MODES = ['none', 'observe', 'full'] as const
export type RuntimeBridgeMode = (typeof RUNTIME_BRIDGE_MODES)[number]

export const SUPPORT_LEVELS = ['stable', 'experimental', 'planned', 'unsupported'] as const
export type SupportLevel = (typeof SUPPORT_LEVELS)[number]

export const EXECUTION_ORIGINS = [
  'web_stream',
  'relay',
  'runtime_native_channel',
  'scheduled',
  'dag',
  'test',
] as const
export type ExecutionOrigin = (typeof EXECUTION_ORIGINS)[number]

export type EngineHomeKind = 'hermes_hhv' | 'openclaw_ohv' | 'generic_ehv'
export type EngineHomeAuthority = 'local_authoritative' | 'lucid_authoritative' | 'evaluation_only'
export type EngineHomeResourceType =
  | 'memory'
  | 'user_profile'
  | 'local_skill'
  | 'config'
  | 'session'
  | 'cache'
  | 'migration'
  | 'unknown'

export interface EngineCapabilityProfile {
  engine: AgentEngine
  runtimeProtocol: RuntimeProtocol
  runtimeFlavors: Partial<Record<RuntimeFlavor, SupportLevel>>
  channelOwnership: Partial<Record<ChannelOwnership, SupportLevel>>
  channelOwnershipByFlavor?: Partial<Record<RuntimeFlavor, Partial<Record<ChannelOwnership, SupportLevel>>>>
  dedicatedTransportModesByFlavor?: Partial<Record<RuntimeFlavor, Partial<Record<DedicatedTransportMode, SupportLevel>>>>
  bridgeModes: Partial<Record<RuntimeBridgeMode, SupportLevel>>
  toolRuntime: SupportLevel
  approvals: SupportLevel
  usageAccounting: SupportLevel
  nativeMutations: Partial<Record<RuntimeFlavor, SupportLevel>>
  engineHome: Partial<Record<RuntimeFlavor, SupportLevel>>
  migrationSources: string[]
  notes?: string[]
}

export interface EngineRuntimeCompatibility {
  supportedFlavors: RuntimeFlavor[]
  supportedChannelOwnership: ChannelOwnership[]
  supportedChannelOwnershipByFlavor?: Partial<Record<RuntimeFlavor, ChannelOwnership[]>>
  supportedDedicatedTransportModesByFlavor?: Partial<Record<RuntimeFlavor, DedicatedTransportMode[]>>
  runtimeProtocol: RuntimeProtocol
  bridgeModes: RuntimeBridgeMode[]
  capabilityProfile: EngineCapabilityProfile
}

export interface RuntimeExecutionContext {
  engine: AgentEngine
  runtimeFlavor: RuntimeFlavor
  channelOwnership: ChannelOwnership
  runtimeProtocol: RuntimeProtocol
  dedicatedTransportMode: DedicatedTransportMode | null
  bridgeMode: RuntimeBridgeMode
  runtimeId: string | null
  runtimeGeneration: number | null
  executionOrigin: ExecutionOrigin
}

export interface RuntimeExecutionContextSource {
  assistantEngine?: AgentEngine | null
  assistantRuntimeFlavor?: RuntimeFlavor | null
  runtimeId?: string | null
  runtimeEngine?: AgentEngine | null
  runtimeFlavor?: RuntimeFlavor | null
  channelOwnership?: ChannelOwnership | null
  runtimeProtocol?: RuntimeProtocol | null
  dedicatedTransportMode?: DedicatedTransportMode | null
  bridgeMode?: RuntimeBridgeMode | null
  runtimeGeneration?: number | null
  executionOrigin: ExecutionOrigin
}

function supportRecord<T extends readonly string[]>(
  keys: T,
  supported: readonly T[number][],
  planned: readonly T[number][] = [],
): Partial<Record<T[number], SupportLevel>> {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      supported.includes(key) ? 'stable' : planned.includes(key) ? 'planned' : 'unsupported',
    ]),
  ) as Partial<Record<T[number], SupportLevel>>
}

function emptyCapabilityProfile(engine: AgentEngine, runtimeProtocol: RuntimeProtocol): EngineCapabilityProfile {
  return {
    engine,
    runtimeProtocol,
    runtimeFlavors: supportRecord(RUNTIME_FLAVORS, []),
    channelOwnership: supportRecord(CHANNEL_OWNERSHIPS, []),
    bridgeModes: supportRecord(RUNTIME_BRIDGE_MODES, []),
    toolRuntime: 'unsupported',
    approvals: 'unsupported',
    usageAccounting: 'unsupported',
    nativeMutations: supportRecord(RUNTIME_FLAVORS, []),
    engineHome: supportRecord(RUNTIME_FLAVORS, []),
    migrationSources: [],
  }
}

export const ENGINE_RUNTIME_COMPAT: Record<AgentEngine, EngineRuntimeCompatibility> = {
  openclaw: {
    supportedFlavors: ['shared', 'c1_managed', 'c2a_autonomous'],
    supportedChannelOwnership: ['lucid_relay', 'runtime_native'],
    supportedChannelOwnershipByFlavor: {
      shared: ['lucid_relay'],
      c1_managed: ['lucid_relay', 'runtime_native'],
      c2a_autonomous: ['lucid_relay', 'runtime_native'],
    },
    supportedDedicatedTransportModesByFlavor: {
      c1_managed: ['relay', 'native_pulse'],
      c2a_autonomous: ['relay', 'native_pulse'],
    },
    runtimeProtocol: 'lucid-runtime-v1',
    bridgeModes: ['none', 'observe', 'full'],
    capabilityProfile: {
      engine: 'openclaw',
      runtimeProtocol: 'lucid-runtime-v1',
      runtimeFlavors: {
        shared: 'stable',
        c1_managed: 'stable',
        c2a_autonomous: 'stable',
      },
      channelOwnership: {
        lucid_relay: 'stable',
        runtime_native: 'stable',
      },
      channelOwnershipByFlavor: {
        shared: { lucid_relay: 'stable', runtime_native: 'unsupported' },
        c1_managed: { lucid_relay: 'stable', runtime_native: 'stable' },
        c2a_autonomous: { lucid_relay: 'stable', runtime_native: 'stable' },
      },
      dedicatedTransportModesByFlavor: {
        c1_managed: { relay: 'stable', native_pulse: 'stable' },
        c2a_autonomous: { relay: 'stable', native_pulse: 'stable' },
      },
      bridgeModes: {
        none: 'stable',
        observe: 'stable',
        full: 'stable',
      },
      toolRuntime: 'stable',
      approvals: 'stable',
      usageAccounting: 'stable',
      nativeMutations: {
        shared: 'unsupported',
        c1_managed: 'experimental',
        c2a_autonomous: 'experimental',
      },
      engineHome: {
        shared: 'planned',
        c1_managed: 'experimental',
        c2a_autonomous: 'experimental',
      },
      migrationSources: [],
    },
  },
  hermes: {
    supportedFlavors: ['shared', 'c1_managed', 'c2a_autonomous'],
    supportedChannelOwnership: ['lucid_relay', 'runtime_native'],
    supportedChannelOwnershipByFlavor: {
      shared: ['lucid_relay'],
      c1_managed: ['lucid_relay', 'runtime_native'],
      c2a_autonomous: ['lucid_relay', 'runtime_native'],
    },
    supportedDedicatedTransportModesByFlavor: {
      c1_managed: ['relay', 'native_pulse'],
      c2a_autonomous: ['relay', 'native_pulse'],
    },
    runtimeProtocol: 'lucid-runtime-v2',
    bridgeModes: ['observe', 'full'],
    capabilityProfile: {
      engine: 'hermes',
      runtimeProtocol: 'lucid-runtime-v2',
      runtimeFlavors: {
        shared: 'experimental',
        c1_managed: 'experimental',
        c2a_autonomous: 'experimental',
      },
      channelOwnership: {
        lucid_relay: 'experimental',
        runtime_native: 'experimental',
      },
      channelOwnershipByFlavor: {
        shared: { lucid_relay: 'experimental', runtime_native: 'unsupported' },
        c1_managed: { lucid_relay: 'experimental', runtime_native: 'experimental' },
        c2a_autonomous: { lucid_relay: 'experimental', runtime_native: 'experimental' },
      },
      dedicatedTransportModesByFlavor: {
        c1_managed: { relay: 'experimental', native_pulse: 'experimental' },
        c2a_autonomous: { relay: 'experimental', native_pulse: 'experimental' },
      },
      bridgeModes: {
        none: 'unsupported',
        observe: 'experimental',
        full: 'experimental',
      },
      toolRuntime: 'experimental',
      approvals: 'experimental',
      usageAccounting: 'experimental',
      nativeMutations: {
        shared: 'experimental',
        c1_managed: 'experimental',
        c2a_autonomous: 'experimental',
      },
      engineHome: {
        shared: 'experimental',
        c1_managed: 'experimental',
        c2a_autonomous: 'experimental',
      },
      migrationSources: ['openclaw'],
      notes: [
        'Hermes runtime_native channels are experimental on dedicated/BYO runtimes through Lucid native channel adapters.',
        'Hermes usage accounting is estimated until authoritative provider token usage is available.',
      ],
    },
  },
  langchain: {
    supportedFlavors: [],
    supportedChannelOwnership: [],
    runtimeProtocol: 'lucid-runtime-v2',
    bridgeModes: [],
    capabilityProfile: emptyCapabilityProfile('langchain', 'lucid-runtime-v2'),
  },
  crewai: {
    supportedFlavors: [],
    supportedChannelOwnership: [],
    runtimeProtocol: 'lucid-runtime-v2',
    bridgeModes: [],
    capabilityProfile: emptyCapabilityProfile('crewai', 'lucid-runtime-v2'),
  },
  autogen: {
    supportedFlavors: [],
    supportedChannelOwnership: [],
    runtimeProtocol: 'lucid-runtime-v2',
    bridgeModes: [],
    capabilityProfile: emptyCapabilityProfile('autogen', 'lucid-runtime-v2'),
  },
  smolagents: {
    supportedFlavors: [],
    supportedChannelOwnership: [],
    runtimeProtocol: 'lucid-runtime-v2',
    bridgeModes: [],
    capabilityProfile: emptyCapabilityProfile('smolagents', 'lucid-runtime-v2'),
  },
  lucid: {
    supportedFlavors: ['shared'],
    supportedChannelOwnership: ['lucid_relay'],
    supportedChannelOwnershipByFlavor: {
      shared: ['lucid_relay'],
    },
    runtimeProtocol: 'lucid-runtime-v2',
    bridgeModes: ['none'],
    capabilityProfile: {
      engine: 'lucid',
      runtimeProtocol: 'lucid-runtime-v2',
      runtimeFlavors: {
        shared: 'stable',
        c1_managed: 'unsupported',
        c2a_autonomous: 'unsupported',
      },
      channelOwnership: {
        lucid_relay: 'stable',
        runtime_native: 'unsupported',
      },
      channelOwnershipByFlavor: {
        shared: { lucid_relay: 'stable', runtime_native: 'unsupported' },
      },
      bridgeModes: {
        none: 'stable',
        observe: 'unsupported',
        full: 'unsupported',
      },
      toolRuntime: 'stable',
      approvals: 'stable',
      usageAccounting: 'stable',
      nativeMutations: {
        shared: 'unsupported',
      },
      engineHome: {
        shared: 'unsupported',
      },
      migrationSources: [],
    },
  },
}

export function getEngineRuntimeCompatibility(engine: AgentEngine): EngineRuntimeCompatibility {
  return ENGINE_RUNTIME_COMPAT[engine]
}

export function getEngineCapabilityProfile(engine: AgentEngine): EngineCapabilityProfile {
  return getEngineRuntimeCompatibility(engine).capabilityProfile
}

export function getRuntimeProtocol(engine: AgentEngine): RuntimeProtocol {
  return getEngineRuntimeCompatibility(engine).runtimeProtocol
}

export function supportsRuntimeFlavor(
  engine: AgentEngine,
  runtimeFlavor: RuntimeFlavor,
): boolean {
  return getEngineRuntimeCompatibility(engine).supportedFlavors.includes(runtimeFlavor)
}

export function supportsChannelOwnership(
  engine: AgentEngine,
  channelOwnership: ChannelOwnership,
): boolean {
  return getEngineRuntimeCompatibility(engine).supportedChannelOwnership.includes(channelOwnership)
}

export function supportsRuntimeConfiguration(
  engine: AgentEngine,
  runtimeFlavor: RuntimeFlavor,
  channelOwnership: ChannelOwnership,
): boolean {
  const compatibility = getEngineRuntimeCompatibility(engine)
  if (!compatibility.supportedFlavors.includes(runtimeFlavor)) return false
  const byFlavor = compatibility.supportedChannelOwnershipByFlavor?.[runtimeFlavor]
  if (byFlavor) return byFlavor.includes(channelOwnership)
  return compatibility.supportedChannelOwnership.includes(channelOwnership)
}

export function supportsDedicatedTransportMode(
  engine: AgentEngine,
  runtimeFlavor: RuntimeFlavor,
  channelOwnership: ChannelOwnership,
  dedicatedTransportMode: DedicatedTransportMode,
): boolean {
  if (runtimeFlavor === 'shared') return false
  if (!supportsRuntimeConfiguration(engine, runtimeFlavor, channelOwnership)) return false
  const byFlavor = getEngineRuntimeCompatibility(engine).supportedDedicatedTransportModesByFlavor?.[runtimeFlavor]
  if (!byFlavor) return dedicatedTransportMode === 'relay' && channelOwnership === 'lucid_relay'
  return byFlavor.includes(dedicatedTransportMode)
}

export function supportsBridgeMode(engine: AgentEngine, bridgeMode: RuntimeBridgeMode): boolean {
  return getEngineRuntimeCompatibility(engine).bridgeModes.includes(bridgeMode)
}

export function supportsRuntimeBridgeMode(
  engine: AgentEngine,
  runtimeFlavor: RuntimeFlavor,
  channelOwnership: ChannelOwnership,
  bridgeMode: RuntimeBridgeMode,
): boolean {
  if (!supportsBridgeMode(engine, bridgeMode)) return false
  if (!supportsRuntimeConfiguration(engine, runtimeFlavor, channelOwnership)) return false
  if (engine === 'openclaw') {
    if (bridgeMode === 'none') return true
    return bridgeMode === 'observe' || (bridgeMode === 'full' && channelOwnership === 'lucid_relay' && runtimeFlavor !== 'shared')
  }
  if (engine !== 'hermes') return bridgeMode === 'none'
  if (bridgeMode === 'observe') return true
  return bridgeMode === 'full' && runtimeFlavor !== 'shared' && channelOwnership === 'lucid_relay'
}

export function resolveDefaultBridgeMode(
  engine: AgentEngine,
  runtimeFlavor: RuntimeFlavor,
  channelOwnership: ChannelOwnership,
): RuntimeBridgeMode {
  if (engine === 'openclaw') {
    if (runtimeFlavor !== 'shared' && channelOwnership === 'lucid_relay') return 'full'
    return 'none'
  }
  if (engine !== 'hermes') return 'none'
  if (runtimeFlavor !== 'shared' && channelOwnership === 'lucid_relay') return 'full'
  return 'observe'
}

export function resolveRuntimeExecutionContext(
  source: RuntimeExecutionContextSource,
): RuntimeExecutionContext {
  const engine = source.runtimeEngine ?? source.assistantEngine ?? LEGACY_AGENT_ENGINE
  const runtimeFlavor =
    source.runtimeFlavor
    ?? source.assistantRuntimeFlavor
    ?? (source.runtimeId ? 'c1_managed' : 'shared')
  const channelOwnership =
    source.channelOwnership
    ?? resolveDefaultChannelOwnership(engine, runtimeFlavor)
  const dedicatedTransportMode =
    runtimeFlavor === 'shared'
      ? null
      : source.dedicatedTransportMode ?? resolveDefaultDedicatedTransportMode(engine, runtimeFlavor, channelOwnership)

  return {
    engine,
    runtimeFlavor,
    channelOwnership,
    runtimeProtocol: source.runtimeProtocol ?? getRuntimeProtocol(engine),
    dedicatedTransportMode,
    bridgeMode: source.bridgeMode ?? resolveDefaultBridgeMode(engine, runtimeFlavor, channelOwnership),
    runtimeId: source.runtimeId ?? null,
    runtimeGeneration: source.runtimeGeneration ?? null,
    executionOrigin: source.executionOrigin,
  }
}

export function resolveDefaultChannelOwnership(
  engine: AgentEngine,
  runtimeFlavor: RuntimeFlavor,
): ChannelOwnership {
  if (runtimeFlavor === 'c2a_autonomous' && supportsRuntimeConfiguration(engine, runtimeFlavor, 'runtime_native')) {
    return 'runtime_native'
  }
  return 'lucid_relay'
}

export function resolveDefaultDedicatedTransportMode(
  engine: AgentEngine,
  runtimeFlavor: RuntimeFlavor,
  channelOwnership: ChannelOwnership,
): DedicatedTransportMode | null {
  if (runtimeFlavor === 'shared') return null
  if (channelOwnership === 'runtime_native' && supportsDedicatedTransportMode(engine, runtimeFlavor, channelOwnership, 'native_pulse')) {
    return 'native_pulse'
  }
  if (supportsDedicatedTransportMode(engine, runtimeFlavor, channelOwnership, 'relay')) {
    return 'relay'
  }
  if (supportsDedicatedTransportMode(engine, runtimeFlavor, channelOwnership, 'native_pulse')) {
    return 'native_pulse'
  }
  return channelOwnership === 'runtime_native' ? 'native_pulse' : 'relay'
}

export function assertSupportedRuntimeExecutionContext(
  context: RuntimeExecutionContext,
): void {
  if (!supportsRuntimeFlavor(context.engine, context.runtimeFlavor)) {
    throw new Error(`${context.engine} does not support ${context.runtimeFlavor}`)
  }
  if (!supportsRuntimeConfiguration(context.engine, context.runtimeFlavor, context.channelOwnership)) {
    throw new Error(`${context.engine} does not support ${context.channelOwnership} for ${context.runtimeFlavor}`)
  }
  if (
    context.dedicatedTransportMode
    && !supportsDedicatedTransportMode(
      context.engine,
      context.runtimeFlavor,
      context.channelOwnership,
      context.dedicatedTransportMode,
    )
  ) {
    throw new Error(
      `${context.engine} does not support ${context.dedicatedTransportMode} for ${context.runtimeFlavor}/${context.channelOwnership}`,
    )
  }
  if (!supportsBridgeMode(context.engine, context.bridgeMode)) {
    throw new Error(`${context.engine} does not support bridge mode ${context.bridgeMode}`)
  }
  if (
    !supportsRuntimeBridgeMode(
      context.engine,
      context.runtimeFlavor,
      context.channelOwnership,
      context.bridgeMode,
    )
  ) {
    throw new Error(
      `${context.engine} does not support bridge mode ${context.bridgeMode} for ${context.runtimeFlavor}/${context.channelOwnership}`,
    )
  }
}

export interface EngineHomeDescriptor {
  engine: AgentEngine
  kind: EngineHomeKind
  authority: EngineHomeAuthority
  runtimeFlavor: RuntimeFlavor
  channelOwnership: ChannelOwnership
  runtimeId?: string | null
  assistantId?: string | null
  homePath?: string | null
}

export interface EngineHomeResource {
  path: string
  content?: string | null
  contentHash?: string | null
  byteLength?: number | null
  modifiedAt?: string | null
  metadata?: Record<string, unknown>
}

export interface EngineHomeSnapshot {
  id: string
  orgId: string
  projectId?: string | null
  teamId?: string | null
  descriptor: EngineHomeDescriptor
  resources: EngineHomeResource[]
  createdAt: string
  diffId?: string | null
}
