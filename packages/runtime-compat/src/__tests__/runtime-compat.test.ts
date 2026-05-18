import { describe, expect, it } from 'vitest'
import {
  ENGINE_RUNTIME_COMPAT,
  getEngineRuntimeCompatibility,
  supportsChannelOwnership,
  supportsDedicatedTransportMode,
  supportsRuntimeConfiguration,
  supportsRuntimeFlavor,
} from '../index.js'

describe('runtime-compat contract', () => {
  it('keeps Hermes native ownership available on managed and BYO runtimes only', () => {
    expect(ENGINE_RUNTIME_COMPAT.hermes.supportedFlavors).toEqual([
      'shared',
      'c1_managed',
      'c2a_autonomous',
    ])
    expect(supportsRuntimeConfiguration('hermes', 'shared', 'lucid_relay')).toBe(true)
    expect(supportsRuntimeConfiguration('hermes', 'shared', 'runtime_native')).toBe(false)
    expect(supportsRuntimeConfiguration('hermes', 'c1_managed', 'lucid_relay')).toBe(true)
    expect(supportsRuntimeConfiguration('hermes', 'c1_managed', 'runtime_native')).toBe(true)
    expect(supportsRuntimeConfiguration('hermes', 'c2a_autonomous', 'lucid_relay')).toBe(true)
    expect(supportsRuntimeConfiguration('hermes', 'c2a_autonomous', 'runtime_native')).toBe(true)
  })

  it('keeps OpenClaw compatible with both relay and native ownership', () => {
    expect(supportsRuntimeFlavor('openclaw', 'shared')).toBe(true)
    expect(supportsRuntimeFlavor('openclaw', 'c1_managed')).toBe(true)
    expect(supportsRuntimeFlavor('openclaw', 'c2a_autonomous')).toBe(true)
    expect(supportsChannelOwnership('openclaw', 'lucid_relay')).toBe(true)
    expect(supportsChannelOwnership('openclaw', 'runtime_native')).toBe(true)
    expect(supportsDedicatedTransportMode('openclaw', 'c1_managed', 'lucid_relay', 'relay')).toBe(true)
    expect(supportsDedicatedTransportMode('openclaw', 'c1_managed', 'lucid_relay', 'native_pulse')).toBe(true)
    expect(supportsDedicatedTransportMode('openclaw', 'c2a_autonomous', 'runtime_native', 'native_pulse')).toBe(true)
  })

  it('keeps Hermes native Pulse available on dedicated relay and native ownership', () => {
    expect(supportsDedicatedTransportMode('hermes', 'c1_managed', 'lucid_relay', 'relay')).toBe(true)
    expect(supportsDedicatedTransportMode('hermes', 'c1_managed', 'lucid_relay', 'native_pulse')).toBe(true)
    expect(supportsDedicatedTransportMode('hermes', 'c2a_autonomous', 'lucid_relay', 'native_pulse')).toBe(true)
    expect(supportsDedicatedTransportMode('hermes', 'c2a_autonomous', 'runtime_native', 'native_pulse')).toBe(true)
  })

  it('keeps Lucid constrained to shared relay execution', () => {
    expect(supportsRuntimeConfiguration('lucid', 'shared', 'lucid_relay')).toBe(true)
    expect(supportsRuntimeConfiguration('lucid', 'shared', 'runtime_native')).toBe(false)
    expect(supportsRuntimeFlavor('lucid', 'c1_managed')).toBe(false)
    expect(supportsRuntimeFlavor('lucid', 'c2a_autonomous')).toBe(false)
  })

  it('returns empty compatibility for unsupported engines', () => {
    const compat = getEngineRuntimeCompatibility('langchain')
    expect(compat.supportedFlavors).toEqual([])
    expect(compat.supportedChannelOwnership).toEqual([])
    expect(supportsRuntimeConfiguration('langchain', 'shared', 'lucid_relay')).toBe(false)
  })
})
