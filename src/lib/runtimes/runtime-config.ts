import 'server-only'

import type {
  AgentEngine,
  ChannelOwnership,
  RuntimeFlavor,
  RuntimeProtocol,
} from '@/lib/engines/types'
import type { DedicatedRuntime } from '@/lib/mission-control/types'
import type { RuntimeBootstrapConfig } from '@/lib/runtimes/bootstrap'
import type { RuntimeMigrationConfig } from '@/lib/runtimes/migration'
import type { DedicatedTransportMode } from '@lucid/runtime-compat'
import {
  enforceDedicatedTransportMode,
  resolveDedicatedTransportMode,
} from '@/lib/runtimes/dedicated-transport'

interface RuntimeConfigSource {
  channelMode?: DedicatedRuntime['channelMode'] | null
  channelOwnership?: ChannelOwnership | null
  dedicatedTransportMode?: DedicatedTransportMode | null
  engine?: AgentEngine | null
  runtimeFlavor?: RuntimeFlavor | null
  runtimeProtocol?: RuntimeProtocol | null
  engineMetadata?: Record<string, unknown> | null
  runtimeBootstrapConfig?: RuntimeBootstrapConfig | null
}

export interface ResolvedDedicatedRuntimeConfig {
  channelMode: DedicatedRuntime['channelMode'] | null
  channelOwnership: ChannelOwnership
  dedicatedTransportMode: DedicatedTransportMode
  engine: AgentEngine
  runtimeFlavor: Exclude<RuntimeFlavor, 'shared'>
  runtimeProtocol: RuntimeProtocol
  runtimeBootstrapConfig: RuntimeBootstrapConfig | null
}

function resolveRuntimeBootstrapConfig(source: RuntimeConfigSource): RuntimeBootstrapConfig | null {
  return (
    source.runtimeBootstrapConfig ??
    ((source.engineMetadata?.migration
      ? { migration: source.engineMetadata.migration as RuntimeMigrationConfig }
      : null) as RuntimeBootstrapConfig | null) ??
    null
  )
}

export function resolveDedicatedRuntimeConfig(params: {
  stored?: RuntimeConfigSource | null
  fallback?: RuntimeConfigSource | null
  orgId?: string
}): ResolvedDedicatedRuntimeConfig {
  const stored = params.stored ?? null
  const fallback = params.fallback ?? null

  const channelMode =
    stored?.channelMode === 'relay' || stored?.channelMode === 'native'
      ? stored.channelMode
      : fallback?.channelMode === 'relay' || fallback?.channelMode === 'native'
        ? fallback.channelMode
        : null

  const channelOwnership =
    stored?.channelOwnership === 'lucid_relay' || stored?.channelOwnership === 'runtime_native'
      ? stored.channelOwnership
      : fallback?.channelOwnership === 'lucid_relay' || fallback?.channelOwnership === 'runtime_native'
        ? fallback.channelOwnership
        : channelMode === 'native'
          ? 'runtime_native'
          : 'lucid_relay'

  const resolvedTransportMode = resolveDedicatedTransportMode({
    dedicatedTransportMode:
      stored?.dedicatedTransportMode ?? fallback?.dedicatedTransportMode ?? null,
    channelMode,
    channelOwnership,
  })

  const dedicatedTransportMode = params.orgId
    ? enforceDedicatedTransportMode(resolvedTransportMode, params.orgId)
    : resolvedTransportMode

  const runtimeFlavor =
    stored?.runtimeFlavor === 'c1_managed' || stored?.runtimeFlavor === 'c2a_autonomous'
      ? stored.runtimeFlavor
      : fallback?.runtimeFlavor === 'c1_managed' || fallback?.runtimeFlavor === 'c2a_autonomous'
        ? fallback.runtimeFlavor
        : channelOwnership === 'runtime_native'
          ? 'c2a_autonomous'
          : 'c1_managed'

  const runtimeProtocol =
    stored?.runtimeProtocol === 'lucid-runtime-v1' || stored?.runtimeProtocol === 'lucid-runtime-v2'
      ? stored.runtimeProtocol
      : fallback?.runtimeProtocol === 'lucid-runtime-v1' || fallback?.runtimeProtocol === 'lucid-runtime-v2'
        ? fallback.runtimeProtocol
        : 'lucid-runtime-v2'

  const engine =
    stored?.engine === 'openclaw' || stored?.engine === 'hermes'
      ? stored.engine
      : fallback?.engine === 'openclaw' || fallback?.engine === 'hermes'
        ? fallback.engine
        : 'openclaw'

  return {
    channelMode,
    channelOwnership,
    dedicatedTransportMode,
    engine,
    runtimeFlavor,
    runtimeProtocol,
    runtimeBootstrapConfig:
      resolveRuntimeBootstrapConfig(stored ?? {}) ??
      resolveRuntimeBootstrapConfig(fallback ?? {}) ??
      null,
  }
}
