import type { RuntimeBlueprint } from '@contracts/project-blueprint'

import { agentEngineSchema, runtimeFlavorSchema } from '@/lib/mission-control/schemas'
import {
  getEngineDefinition,
  isEngineAvailable,
  supportsRuntimeConfiguration,
  supportsRuntimeFlavor,
} from '@/lib/engines/registry'
import type { AgentEngine, ChannelOwnership, RuntimeFlavor } from '@/lib/engines/types'

export interface ResolvedBlueprintRuntime {
  runtimeId?: string
  engine?: AgentEngine
  runtimeFlavor?: RuntimeFlavor
}

export function resolveBlueprintRuntime(
  runtime: RuntimeBlueprint | undefined,
  fallbackRuntimeId?: string,
): ResolvedBlueprintRuntime {
  const runtimeFlavor = resolveRuntimeFlavor(runtime, fallbackRuntimeId)
  const engine = resolveEngine(runtime?.engine, runtimeFlavor)
  const channelOwnership = resolveChannelOwnership(runtime?.channel_ownership)
  const runtimeId = runtime?.runtime_id ?? fallbackRuntimeId

  if (engine && runtimeFlavor && !supportsRuntimeConfiguration(engine, runtimeFlavor, channelOwnership)) {
    const definition = getEngineDefinition(engine)
    throw new Error(`${definition.label} does not support ${channelOwnership} for ${runtimeFlavor}`)
  }

  return {
    ...(runtimeId && runtimeFlavor !== 'shared' ? { runtimeId } : {}),
    ...(engine ? { engine } : {}),
    ...(runtimeFlavor ? { runtimeFlavor } : {}),
  }
}

function resolveChannelOwnership(value: string | undefined): ChannelOwnership {
  return value === 'runtime_native' ? 'runtime_native' : 'lucid_relay'
}

function resolveRuntimeFlavor(
  runtime: RuntimeBlueprint | undefined,
  fallbackRuntimeId?: string,
): RuntimeFlavor | undefined {
  if (!runtime) return fallbackRuntimeId ? 'c1_managed' : undefined

  const effectiveMode = fallbackRuntimeId && runtime.mode !== 'byo'
    ? 'dedicated'
    : runtime.mode

  const mapped = effectiveMode === 'shared'
    ? 'shared'
    : effectiveMode === 'byo'
      ? 'c2a_autonomous'
      : 'c1_managed'

  return runtimeFlavorSchema.parse(mapped)
}

function resolveEngine(
  rawEngine: string | undefined,
  runtimeFlavor: RuntimeFlavor | undefined,
): AgentEngine | undefined {
  if (!rawEngine?.trim()) return undefined

  const engine = agentEngineSchema.parse(rawEngine.trim()) as AgentEngine
  if (!isEngineAvailable(engine)) {
    const definition = getEngineDefinition(engine)
    throw new Error(`${definition.label} is not available yet`)
  }

  if (runtimeFlavor && !supportsRuntimeFlavor(engine, runtimeFlavor)) {
    const definition = getEngineDefinition(engine)
    throw new Error(`${definition.label} does not support ${runtimeFlavor} runtime`)
  }

  return engine
}
