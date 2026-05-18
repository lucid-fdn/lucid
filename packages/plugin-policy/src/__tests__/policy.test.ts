import { describe, it, expect } from 'vitest'
import { resolvePolicy } from '../policy.js'

describe('resolvePolicy', () => {
  it('blocks plugins on the admin blocklist', () => {
    const result = resolvePolicy(
      { slug: 'bad-plugin', trustLevel: 'internal', executionMode: 'in_process' },
      { blockedPlugins: ['bad-plugin'] },
    )
    expect(result.decision).toBe('block')
    expect(result.reason).toContain('blocklist')
  })

  it('forces gateway when forceGateway is set', () => {
    const result = resolvePolicy(
      { slug: 'lucid-seo', trustLevel: 'internal', executionMode: 'in_process' },
      { forceGateway: true },
    )
    expect(result.decision).toBe('allow_gateway')
    expect(result.effectiveMode).toBe('gateway')
  })

  it('allows internal plugins in-process', () => {
    const result = resolvePolicy({
      slug: 'lucid-seo',
      trustLevel: 'internal',
      executionMode: 'in_process',
    })
    expect(result.decision).toBe('allow_in_process')
    expect(result.effectiveMode).toBe('in_process')
  })

  it('allows verified plugins in-process', () => {
    const result = resolvePolicy({
      slug: 'partner-plugin',
      trustLevel: 'verified',
      executionMode: 'in_process',
    })
    expect(result.decision).toBe('allow_in_process')
    expect(result.effectiveMode).toBe('in_process')
  })

  it('forces community plugins to gateway even if in_process requested', () => {
    const result = resolvePolicy({
      slug: 'community-plugin',
      trustLevel: 'community',
      executionMode: 'in_process',
    })
    expect(result.decision).toBe('allow_gateway')
    expect(result.effectiveMode).toBe('gateway')
    expect(result.reason).toContain('gateway-only')
  })

  it('allows community plugins in gateway mode', () => {
    const result = resolvePolicy({
      slug: 'community-plugin',
      trustLevel: 'community',
      executionMode: 'gateway',
    })
    expect(result.decision).toBe('allow_gateway')
    expect(result.effectiveMode).toBe('gateway')
  })

  it('allows internal plugins in gateway mode when requested', () => {
    const result = resolvePolicy({
      slug: 'lucid-seo',
      trustLevel: 'internal',
      executionMode: 'gateway',
    })
    expect(result.decision).toBe('allow_gateway')
    expect(result.effectiveMode).toBe('gateway')
  })

  it('defaults undefined trustLevel to community (safe default)', () => {
    const result = resolvePolicy({
      slug: 'old-plugin',
      trustLevel: undefined as unknown as 'community',
      executionMode: undefined as unknown as 'gateway',
    })
    expect(result.decision).toBe('allow_gateway')
    expect(result.effectiveMode).toBe('gateway')
    expect(result.reason).toContain('gateway-only')
  })
})
