import type { ChannelOwnership } from '@/lib/engines/types'
import type { DedicatedRuntime } from '@/lib/mission-control/types'
import type { DedicatedTransportMode } from '@lucid/runtime-compat'
import { resolveDedicatedTransportMode } from '@/lib/runtimes/dedicated-transport'

export interface DedicatedRuntimeExecutionContract {
  transportMode: DedicatedTransportMode
  featurePulse: boolean
  featureRestMessageRelay: boolean
  featureNativeChannels: boolean
  workerMode: 'worker'
}

export function deriveDedicatedRuntimeExecutionContract(params: {
  dedicatedTransportMode?: DedicatedTransportMode | null
  channelMode?: DedicatedRuntime['channelMode'] | null
  channelOwnership?: ChannelOwnership | null
}): DedicatedRuntimeExecutionContract {
  const transportMode = resolveDedicatedTransportMode({
    dedicatedTransportMode: params.dedicatedTransportMode ?? null,
    channelMode: params.channelMode ?? null,
    channelOwnership: params.channelOwnership ?? null,
  })

  return {
    transportMode,
    featurePulse: transportMode === 'native_pulse',
    featureRestMessageRelay: transportMode === 'relay',
    featureNativeChannels:
      params.channelMode === 'native' || params.channelOwnership === 'runtime_native',
    workerMode: 'worker',
  }
}

export function shouldUsePulseClaimProxy(
  dedicatedTransportMode: DedicatedTransportMode | null | undefined,
): boolean {
  return dedicatedTransportMode === 'native_pulse'
}
