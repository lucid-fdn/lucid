export type RuntimeEventSource = 'shared' | 'relay' | 'native'

export function deriveRuntimeEventSource(input: {
  runtimeFlavor?: string | null
  channelOwnership?: string | null
}): RuntimeEventSource {
  if (input.channelOwnership === 'runtime_native' || input.runtimeFlavor === 'c2a_autonomous') {
    return 'native'
  }
  if (input.runtimeFlavor === 'c1_managed') {
    return 'relay'
  }
  return 'shared'
}
