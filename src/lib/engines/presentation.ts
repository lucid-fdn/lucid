import { getEngineLabel } from '@/components/icons/engine-icon'
import type { AgentEngine, ChannelOwnership, RuntimeFlavor } from '@/lib/engines/types'
import { PROVIDER_LABELS } from '@/lib/mission-control/constants'
import { RUNTIME_FLAVOR_LABELS } from '@/lib/runtimes/runtime-flavors'
import { supportsRuntimeConfiguration, supportsRuntimeFlavor } from '@lucid/runtime-compat'

export interface RuntimeModePresentation {
  key: 'shared' | 'managed' | 'byo'
  title: string
  description: string
  operator: string
  channelPath: string
  providerLabel: string | null
}

export interface RuntimePackagingSummary {
  primaryModeKey: RuntimeModePresentation['key'] | null
  primaryTitle: string | null
  primaryDescription: string | null
  primaryOperator: string | null
  operatorLabel: string | null
  alignmentLabel: string
  guidance: string
  uniqueModeCount: number
  totalAssigned: number
  sharedCount: number
  managedCount: number
  byoCount: number
}

export function getRuntimeModePresentation(params: {
  runtimeFlavor: RuntimeFlavor | null | undefined
  runtimeTier?: 'dedicated' | 'byo' | null
  channelOwnership?: ChannelOwnership | null
  runtimeProvider?: string | null
}): RuntimeModePresentation {
  const { runtimeFlavor, runtimeTier, channelOwnership, runtimeProvider } = params

  const providerLabel =
    runtimeProvider && runtimeProvider in PROVIDER_LABELS
      ? PROVIDER_LABELS[runtimeProvider]
      : runtimeProvider ?? null

  if (runtimeTier === 'byo' || runtimeFlavor === 'c2a_autonomous') {
    return {
      key: 'byo',
      title: 'Bring your own runtime',
      description:
        'You run the runtime on your own infrastructure while Lucid stays the control plane.',
      operator: 'Operated by you',
      channelPath:
        channelOwnership === 'runtime_native'
          ? 'Channels terminate on your runtime'
          : 'Lucid relay stays in front of channels',
      providerLabel,
    }
  }

  if (runtimeTier === 'dedicated' || runtimeFlavor === 'c1_managed') {
    return {
      key: 'managed',
      title: 'Lucid-managed runtime',
      description:
        'A dedicated runtime operated by Lucid for stronger isolation and steadier production traffic.',
      operator: 'Operated by Lucid',
      channelPath:
        channelOwnership === 'runtime_native'
          ? 'Runtime handles channels directly'
          : 'Lucid relay stays in front of channels',
      providerLabel,
    }
  }

  return {
    key: 'shared',
    title: 'Shared runtime',
    description: 'Fastest setup. Lucid runs this agent on shared infrastructure.',
    operator: 'Operated by Lucid',
    channelPath: 'Lucid relay handles channels for this runtime path',
    providerLabel,
  }
}

export function summarizeRuntimePackaging(modes: RuntimeModePresentation[]): RuntimePackagingSummary {
  const counts = new Map<RuntimeModePresentation['key'], number>([
    ['shared', 0],
    ['managed', 0],
    ['byo', 0],
  ])
  const operatorCounts = new Map<string, number>()

  for (const mode of modes) {
    counts.set(mode.key, (counts.get(mode.key) ?? 0) + 1)
    operatorCounts.set(mode.operator, (operatorCounts.get(mode.operator) ?? 0) + 1)
  }

  const sortedModes = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])

  const primaryModeKey = sortedModes[0]?.[0] ?? null
  const primaryMode = primaryModeKey
    ? modes.find((mode) => mode.key === primaryModeKey) ?? null
    : null
  const operatorLabel = [...operatorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const uniqueModeCount = sortedModes.length
  const totalAssigned = modes.length

  const alignmentLabel =
    totalAssigned === 0
      ? 'No runtime-ready members yet'
      : uniqueModeCount <= 1
        ? 'Aligned on one runtime path'
        : `${uniqueModeCount} runtime paths in play`

  const guidance =
    totalAssigned === 0
      ? 'Add runtime-ready agents before you make packaging or routing decisions here.'
      : uniqueModeCount <= 1
        ? 'This surface is operationally simple: runtime ownership and escalation paths stay consistent.'
        : 'Mixed runtime paths are valid, but they increase incident handling and coordination cost.'

  return {
    primaryModeKey,
    primaryTitle: primaryMode?.title ?? null,
    primaryDescription: primaryMode?.description ?? null,
    primaryOperator: primaryMode?.operator ?? null,
    operatorLabel,
    alignmentLabel,
    guidance,
    uniqueModeCount,
    totalAssigned,
    sharedCount: counts.get('shared') ?? 0,
    managedCount: counts.get('managed') ?? 0,
    byoCount: counts.get('byo') ?? 0,
  }
}

export function getEngineAvailabilityLabel(
  engine: AgentEngine,
  available: boolean,
  runtimeFlavor: RuntimeFlavor,
  channelOwnership: ChannelOwnership,
) {
  if (!available) return 'Soon'
  if (!supportsRuntimeFlavor(engine, runtimeFlavor)) {
    if (runtimeFlavor === 'shared') return 'No shared'
    if (runtimeFlavor === 'c1_managed') return 'No C1 yet'
    return 'No BYO yet'
  }
  if (!supportsRuntimeConfiguration(engine, runtimeFlavor, channelOwnership)) {
    return channelOwnership === 'runtime_native' ? 'Relay only' : 'Unsupported'
  }
  return null
}

export function getRuntimeCompatibilityNote(params: {
  engine: AgentEngine
  runtimeFlavor: RuntimeFlavor | null
  channelOwnership: ChannelOwnership | null
}) {
  const { engine, runtimeFlavor, channelOwnership } = params

  if (!runtimeFlavor || !channelOwnership) return null
  if (!supportsRuntimeFlavor(engine, runtimeFlavor)) {
    return `${getEngineLabel(engine)} is not available for ${RUNTIME_FLAVOR_LABELS[runtimeFlavor]}.`
  }
  if (!supportsRuntimeConfiguration(engine, runtimeFlavor, channelOwnership)) {
    if (channelOwnership === 'runtime_native') {
      return `${getEngineLabel(engine)} uses Lucid relay for this runtime flavor.`
    }
    return `${getEngineLabel(engine)} is not available for this runtime and channel combination.`
  }
  if (engine === 'hermes' && channelOwnership === 'lucid_relay') {
    return 'Hermes runs through Lucid relay on this runtime path.'
  }
  return null
}

export function mapRuntimeApiErrorToUiMessage(message: string | null | undefined) {
  if (!message) return null

  const lower = message.toLowerCase()

  if (lower.includes('does not support runtime_native') || lower.includes('uses lucid relay')) {
    return 'This engine uses Lucid relay for the selected runtime path.'
  }
  if (lower.includes('does not support c1_managed')) {
    return 'This engine is not available on dedicated Lucid-managed runtimes.'
  }
  if (lower.includes('does not support c2a_autonomous')) {
    return 'This engine is not available on BYO runtimes yet.'
  }
  if (lower.includes('does not support shared')) {
    return 'This engine is not available on shared runtime.'
  }
  if (lower.includes('does not support') || lower.includes('not available for')) {
    return 'This engine is not available for the selected runtime configuration.'
  }
  if (lower.includes('no hermes runtime image configured')) {
    return 'Hermes dedicated deployment is not configured yet in this environment.'
  }
  if (lower.includes('requested engine') && lower.includes('does not match agent engine')) {
    return 'The selected engine does not match the agent runtime configuration.'
  }

  return message
}
