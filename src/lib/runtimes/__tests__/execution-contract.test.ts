import { describe, expect, it } from 'vitest'

import {
  deriveDedicatedRuntimeExecutionContract,
  shouldUsePulseClaimProxy,
} from '@/lib/runtimes/execution-contract'

describe('deriveDedicatedRuntimeExecutionContract', () => {
  it('derives relay execution flags from the canonical mode', () => {
    const contract = deriveDedicatedRuntimeExecutionContract({
      dedicatedTransportMode: 'relay',
      channelMode: 'relay',
      channelOwnership: 'lucid_relay',
    })

    expect(contract).toEqual({
      transportMode: 'relay',
      featurePulse: false,
      featureRestMessageRelay: true,
      featureNativeChannels: false,
      workerMode: 'worker',
    })
    expect(shouldUsePulseClaimProxy(contract.transportMode)).toBe(false)
  })

  it('derives native pulse execution flags from the canonical mode', () => {
    const contract = deriveDedicatedRuntimeExecutionContract({
      dedicatedTransportMode: 'native_pulse',
      channelMode: 'native',
      channelOwnership: 'runtime_native',
    })

    expect(contract).toEqual({
      transportMode: 'native_pulse',
      featurePulse: true,
      featureRestMessageRelay: false,
      featureNativeChannels: true,
      workerMode: 'worker',
    })
    expect(shouldUsePulseClaimProxy(contract.transportMode)).toBe(true)
  })
})
