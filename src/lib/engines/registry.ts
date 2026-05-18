import type {
  AgentEngine,
  ChannelOwnership,
  EngineSupportLevel,
  RuntimeFlavor,
  RuntimeProtocol,
} from './types'
import {
  ENGINE_RUNTIME_COMPAT,
  supportsChannelOwnership as sharedSupportsChannelOwnership,
  supportsRuntimeConfiguration as sharedSupportsRuntimeConfiguration,
  supportsRuntimeFlavor as sharedSupportsRuntimeFlavor,
} from '@lucid/runtime-compat'

export interface EngineSupportMatrix {
  shared: EngineSupportLevel
  c1Managed: EngineSupportLevel
  c2aAutonomous: EngineSupportLevel
  relayChannels: EngineSupportLevel
  nativeChannels: EngineSupportLevel
  toolRuntime: EngineSupportLevel
  approvals: EngineSupportLevel
  usageAccounting: EngineSupportLevel
}

export interface EngineCapabilities {
  supportsShared: boolean
  supportsC1: boolean
  supportsC2a: boolean
  supportsRelayChannels: boolean
  supportsNativeChannels: boolean
  supportsDeployIntent: boolean
  supportsSharedRunner: boolean
  supportMatrix: EngineSupportMatrix
  notes?: string[]
}

export interface EngineDefinition {
  key: AgentEngine
  label: string
  available: boolean
  runtimeProtocol: RuntimeProtocol
  supportedFlavors: RuntimeFlavor[]
  supportedChannelOwnership: ChannelOwnership[]
  supportedChannelOwnershipByFlavor?: Partial<Record<RuntimeFlavor, ChannelOwnership[]>>
  defaultImages: Partial<Record<RuntimeFlavor, string>>
  capabilities: EngineCapabilities
}

function unsupportedMatrix(): EngineSupportMatrix {
  return {
    shared: 'unsupported',
    c1Managed: 'unsupported',
    c2aAutonomous: 'unsupported',
    relayChannels: 'unsupported',
    nativeChannels: 'unsupported',
    toolRuntime: 'unsupported',
    approvals: 'unsupported',
    usageAccounting: 'unsupported',
  }
}

export const ENGINE_REGISTRY: Record<AgentEngine, EngineDefinition> = {
  openclaw: {
    key: 'openclaw',
    label: 'OpenClaw',
    available: true,
    runtimeProtocol: 'lucid-runtime-v1',
    supportedFlavors: ENGINE_RUNTIME_COMPAT.openclaw.supportedFlavors,
    supportedChannelOwnership: ENGINE_RUNTIME_COMPAT.openclaw.supportedChannelOwnership,
    defaultImages: {},
    capabilities: {
      supportsShared: true,
      supportsC1: true,
      supportsC2a: true,
      supportsRelayChannels: true,
      supportsNativeChannels: true,
      supportsDeployIntent: true,
      supportsSharedRunner: true,
      supportMatrix: {
        shared: 'stable',
        c1Managed: 'stable',
        c2aAutonomous: 'stable',
        relayChannels: 'stable',
        nativeChannels: 'stable',
        toolRuntime: 'stable',
        approvals: 'stable',
        usageAccounting: 'stable',
      },
    },
  },
  hermes: {
    key: 'hermes',
    label: 'Hermes',
    available: true,
    runtimeProtocol: 'lucid-runtime-v2',
    supportedFlavors: ENGINE_RUNTIME_COMPAT.hermes.supportedFlavors,
    supportedChannelOwnership: ENGINE_RUNTIME_COMPAT.hermes.supportedChannelOwnership,
    supportedChannelOwnershipByFlavor: ENGINE_RUNTIME_COMPAT.hermes.supportedChannelOwnershipByFlavor,
    defaultImages: {},
    capabilities: {
      supportsShared: true,
      supportsC1: true,
      supportsC2a: true,
      supportsRelayChannels: true,
      supportsNativeChannels: false,
      supportsDeployIntent: true,
      supportsSharedRunner: true,
      supportMatrix: {
        shared: 'experimental',
        c1Managed: 'experimental',
        c2aAutonomous: 'experimental',
        relayChannels: 'experimental',
        nativeChannels: 'unsupported',
        toolRuntime: 'experimental',
        approvals: 'experimental',
        usageAccounting: 'experimental',
      },
      notes: [
        'Hermes shared and C1 use first-pass adapters with reduced parity vs OpenClaw.',
        'Hermes runtime_native channels are disabled until a dedicated native transport implementation exists.',
        'Hermes usage accounting is estimated from prompt/response text until authoritative provider token usage is available.',
      ],
    },
  },
  langchain: {
    key: 'langchain',
    label: 'LangChain',
    available: false,
    runtimeProtocol: 'lucid-runtime-v2',
    supportedFlavors: ENGINE_RUNTIME_COMPAT.langchain.supportedFlavors,
    supportedChannelOwnership: ENGINE_RUNTIME_COMPAT.langchain.supportedChannelOwnership,
    defaultImages: {},
    capabilities: {
      supportsShared: false,
      supportsC1: false,
      supportsC2a: false,
      supportsRelayChannels: false,
      supportsNativeChannels: false,
      supportsDeployIntent: false,
      supportsSharedRunner: false,
      supportMatrix: unsupportedMatrix(),
    },
  },
  crewai: {
    key: 'crewai',
    label: 'CrewAI',
    available: false,
    runtimeProtocol: 'lucid-runtime-v2',
    supportedFlavors: ENGINE_RUNTIME_COMPAT.crewai.supportedFlavors,
    supportedChannelOwnership: ENGINE_RUNTIME_COMPAT.crewai.supportedChannelOwnership,
    defaultImages: {},
    capabilities: {
      supportsShared: false,
      supportsC1: false,
      supportsC2a: false,
      supportsRelayChannels: false,
      supportsNativeChannels: false,
      supportsDeployIntent: false,
      supportsSharedRunner: false,
      supportMatrix: unsupportedMatrix(),
    },
  },
  autogen: {
    key: 'autogen',
    label: 'AutoGen',
    available: false,
    runtimeProtocol: 'lucid-runtime-v2',
    supportedFlavors: ENGINE_RUNTIME_COMPAT.autogen.supportedFlavors,
    supportedChannelOwnership: ENGINE_RUNTIME_COMPAT.autogen.supportedChannelOwnership,
    defaultImages: {},
    capabilities: {
      supportsShared: false,
      supportsC1: false,
      supportsC2a: false,
      supportsRelayChannels: false,
      supportsNativeChannels: false,
      supportsDeployIntent: false,
      supportsSharedRunner: false,
      supportMatrix: unsupportedMatrix(),
    },
  },
  smolagents: {
    key: 'smolagents',
    label: 'Smolagents',
    available: false,
    runtimeProtocol: 'lucid-runtime-v2',
    supportedFlavors: ENGINE_RUNTIME_COMPAT.smolagents.supportedFlavors,
    supportedChannelOwnership: ENGINE_RUNTIME_COMPAT.smolagents.supportedChannelOwnership,
    defaultImages: {},
    capabilities: {
      supportsShared: false,
      supportsC1: false,
      supportsC2a: false,
      supportsRelayChannels: false,
      supportsNativeChannels: false,
      supportsDeployIntent: false,
      supportsSharedRunner: false,
      supportMatrix: unsupportedMatrix(),
    },
  },
  lucid: {
    key: 'lucid',
    label: 'Lucid',
    available: true,
    runtimeProtocol: 'lucid-runtime-v2',
    supportedFlavors: ENGINE_RUNTIME_COMPAT.lucid.supportedFlavors,
    supportedChannelOwnership: ENGINE_RUNTIME_COMPAT.lucid.supportedChannelOwnership,
    defaultImages: {},
    capabilities: {
      supportsShared: true,
      supportsC1: false,
      supportsC2a: false,
      supportsRelayChannels: true,
      supportsNativeChannels: false,
      supportsDeployIntent: false,
      supportsSharedRunner: false,
      supportMatrix: {
        shared: 'stable',
        c1Managed: 'unsupported',
        c2aAutonomous: 'unsupported',
        relayChannels: 'stable',
        nativeChannels: 'unsupported',
        toolRuntime: 'stable',
        approvals: 'stable',
        usageAccounting: 'stable',
      },
    },
  },
}

export const ENGINE_OPTIONS = Object.values(ENGINE_REGISTRY)

export function getEngineDefinition(engine: AgentEngine): EngineDefinition {
  return ENGINE_REGISTRY[engine]
}

export function isEngineAvailable(engine: AgentEngine): boolean {
  return getEngineDefinition(engine).available
}

export function supportsRuntimeFlavor(
  engine: AgentEngine,
  runtimeFlavor: RuntimeFlavor,
): boolean {
  return sharedSupportsRuntimeFlavor(engine, runtimeFlavor)
}

export function supportsChannelOwnership(
  engine: AgentEngine,
  channelOwnership: ChannelOwnership,
): boolean {
  return sharedSupportsChannelOwnership(engine, channelOwnership)
}

export function supportsRuntimeConfiguration(
  engine: AgentEngine,
  runtimeFlavor: RuntimeFlavor,
  channelOwnership: ChannelOwnership,
): boolean {
  return sharedSupportsRuntimeConfiguration(engine, runtimeFlavor, channelOwnership)
}
