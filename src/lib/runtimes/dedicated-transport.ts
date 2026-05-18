import type { ChannelOwnership } from '@/lib/engines/types'
import type { DedicatedRuntime } from '@/lib/mission-control/types'
import type { DedicatedTransportMode } from '@lucid/runtime-compat'

function getNativePulseFeatureEnabled(): boolean {
  return process.env.FEATURE_DEDICATED_NATIVE_PULSE === 'true'
}

function getNativePulseAllowlist(): string[] {
  return (process.env.DEDICATED_NATIVE_PULSE_ALLOWLIST || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function resolveDedicatedTransportMode(params: {
  dedicatedTransportMode?: DedicatedTransportMode | null
  channelMode?: DedicatedRuntime['channelMode'] | null
  channelOwnership?: ChannelOwnership | null
}): DedicatedTransportMode {
  if (params.dedicatedTransportMode === 'relay' || params.dedicatedTransportMode === 'native_pulse') {
    return params.dedicatedTransportMode
  }
  if (params.channelMode === 'native' || params.channelOwnership === 'runtime_native') {
    return 'native_pulse'
  }
  return 'relay'
}

export function isDedicatedNativePulseAllowed(orgId: string): boolean {
  if (!getNativePulseFeatureEnabled()) return false
  const allowlist = getNativePulseAllowlist()
  if (allowlist.includes('*')) return true
  return allowlist.includes(orgId)
}

export function enforceDedicatedTransportMode(
  mode: DedicatedTransportMode,
  orgId: string,
): DedicatedTransportMode {
  if (mode !== 'native_pulse') return mode
  return isDedicatedNativePulseAllowed(orgId) ? 'native_pulse' : 'relay'
}
