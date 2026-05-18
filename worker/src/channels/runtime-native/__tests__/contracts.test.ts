import { describe, expect, it } from 'vitest'
import {
  UnsupportedRuntimeNativeTransportError,
  assertRuntimeNativeTransportSupport,
  getRuntimeNativeTransportSupport,
  supportsRuntimeNativeTransport,
} from '../contracts.js'

describe('runtime-native transport contracts', () => {
  it('reports openclaw as supporting runtime-native channels', () => {
    expect(getRuntimeNativeTransportSupport('openclaw')).toBe('stable')
    expect(supportsRuntimeNativeTransport('openclaw')).toBe(true)
  })

  it('reports hermes as experimental for runtime-native channels', () => {
    expect(getRuntimeNativeTransportSupport('hermes')).toBe('experimental')
    expect(supportsRuntimeNativeTransport('hermes')).toBe(true)
  })

  it('accepts runtime-native transport assertion for engines with declared support', () => {
    expect(() => assertRuntimeNativeTransportSupport('hermes')).not.toThrow(UnsupportedRuntimeNativeTransportError)
  })
})
