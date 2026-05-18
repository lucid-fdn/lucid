import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MANAGED_RUNTIME_PROVIDER,
  MANUAL_RUNTIME_PROVIDER,
  resolveByoSetupMode,
  resolveRuntimeProviderForMode,
} from './runtime-provider-selection'

describe('runtime provider selection', () => {
  it('uses managed provider for dedicated runtimes', () => {
    expect(resolveRuntimeProviderForMode({ provider: 'manual' }, 'dedicated')).toBe(DEFAULT_MANAGED_RUNTIME_PROVIDER)
  })

  it('uses manual as the default BYO path', () => {
    expect(resolveRuntimeProviderForMode(null, 'byo')).toBe(MANUAL_RUNTIME_PROVIDER)
    expect(resolveByoSetupMode(MANUAL_RUNTIME_PROVIDER)).toBe('manual')
  })

  it('preserves provider-backed BYO targets', () => {
    expect(resolveRuntimeProviderForMode({ provider: 'railway' }, 'byo')).toBe('railway')
    expect(resolveByoSetupMode('railway')).toBe('provider')
  })

  it('falls back to manual for invalid BYO provider values', () => {
    expect(resolveRuntimeProviderForMode({ provider: 'unknown-provider' }, 'byo')).toBe(MANUAL_RUNTIME_PROVIDER)
  })
})
