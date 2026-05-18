import { describe, expect, it } from 'vitest'
import { getRuntimeModePresentation, summarizeRuntimePackaging } from './presentation'

describe('getRuntimeModePresentation', () => {
  it('packages shared runtime for operators', () => {
    expect(
      getRuntimeModePresentation({
        runtimeFlavor: 'shared',
        channelOwnership: 'lucid_relay',
      }),
    ).toMatchObject({
      title: 'Shared runtime',
      operator: 'Operated by Lucid',
      channelPath: 'Lucid relay handles channels for this runtime path',
    })
  })

  it('packages Lucid-managed runtimes clearly', () => {
    expect(
      getRuntimeModePresentation({
        runtimeFlavor: 'c1_managed',
        runtimeTier: 'dedicated',
        channelOwnership: 'lucid_relay',
        runtimeProvider: 'railway',
      }),
    ).toMatchObject({
      title: 'Lucid-managed runtime',
      operator: 'Operated by Lucid',
      providerLabel: 'Railway',
      channelPath: 'Lucid relay stays in front of channels',
    })
  })

  it('packages BYO runtimes clearly', () => {
    expect(
      getRuntimeModePresentation({
        runtimeFlavor: 'c2a_autonomous',
        runtimeTier: 'byo',
        channelOwnership: 'runtime_native',
        runtimeProvider: 'docker',
      }),
    ).toMatchObject({
      title: 'Bring your own runtime',
      operator: 'Operated by you',
      providerLabel: 'Docker',
      channelPath: 'Channels terminate on your runtime',
    })
  })
})

describe('summarizeRuntimePackaging', () => {
  it('builds a stable packaging summary across mixed runtime paths', () => {
    const summary = summarizeRuntimePackaging([
      getRuntimeModePresentation({ runtimeFlavor: 'shared' }),
      getRuntimeModePresentation({ runtimeFlavor: 'shared' }),
      getRuntimeModePresentation({ runtimeFlavor: 'c1_managed', runtimeTier: 'dedicated' }),
    ])

    expect(summary.primaryModeKey).toBe('shared')
    expect(summary.primaryTitle).toBe('Shared runtime')
    expect(summary.operatorLabel).toBe('Operated by Lucid')
    expect(summary.uniqueModeCount).toBe(2)
    expect(summary.sharedCount).toBe(2)
    expect(summary.managedCount).toBe(1)
    expect(summary.alignmentLabel).toBe('2 runtime paths in play')
  })
})
