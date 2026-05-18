import { describe, expect, it, vi } from 'vitest'

describe('dedicated transport helpers', () => {
  it('defaults relay-owned runtimes to relay transport', async () => {
    const { resolveDedicatedTransportMode } = await import('../dedicated-transport')
    expect(resolveDedicatedTransportMode({ channelMode: 'relay', channelOwnership: 'lucid_relay' })).toBe('relay')
  })

  it('derives native_pulse from native channel mode', async () => {
    const { resolveDedicatedTransportMode } = await import('../dedicated-transport')
    expect(resolveDedicatedTransportMode({ channelMode: 'native' })).toBe('native_pulse')
  })

  it('enforces allowlist for native_pulse', async () => {
    vi.stubEnv('FEATURE_DEDICATED_NATIVE_PULSE', 'true')
    vi.stubEnv('DEDICATED_NATIVE_PULSE_ALLOWLIST', 'org-allowed')
    vi.resetModules()
    const { enforceDedicatedTransportMode } = await import('../dedicated-transport')
    expect(enforceDedicatedTransportMode('native_pulse', 'org-denied')).toBe('relay')
    expect(enforceDedicatedTransportMode('native_pulse', 'org-allowed')).toBe('native_pulse')
    vi.unstubAllEnvs()
  })
})
