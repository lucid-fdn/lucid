import { describe, it, expect, vi } from 'vitest'
import { CompositeAdapter } from '../composite-adapter.js'
import type { CredentialAdapter, TokenResult } from '../types.js'

function mockAdapter(name: string, result: TokenResult | null, available = true): CredentialAdapter {
  return {
    name,
    isAvailable: () => available,
    resolve: vi.fn().mockResolvedValue(result),
  }
}

const token: TokenResult = { accessToken: 'test-token', tokenType: 'bearer' }

describe('CompositeAdapter', () => {
  it('returns first non-null result', async () => {
    const composite = CompositeAdapter.fromAdapters([
      mockAdapter('nango', null),
      mockAdapter('database', token),
      mockAdapter('env-var', { accessToken: 'env-token', tokenType: 'api-key' }),
    ])

    const result = await composite.resolve('slack', 'conn-1')
    expect(result).toEqual(token)
  })

  it('skips unavailable adapters', async () => {
    const unavailable = mockAdapter('nango', token, false)
    const fallback = mockAdapter('env-var', { accessToken: 'env', tokenType: 'api-key' })
    const composite = CompositeAdapter.fromAdapters([unavailable, fallback])

    const result = await composite.resolve('slack', 'conn-1')
    expect(result?.accessToken).toBe('env')
    expect(unavailable.resolve).not.toHaveBeenCalled()
  })

  it('returns null when all adapters return null', async () => {
    const composite = CompositeAdapter.fromAdapters([
      mockAdapter('nango', null),
      mockAdapter('database', null),
      mockAdapter('env-var', null),
    ])

    const result = await composite.resolve('slack', 'conn-1')
    expect(result).toBeNull()
  })

  it('continues on adapter error (graceful degradation)', async () => {
    const failing: CredentialAdapter = {
      name: 'failing',
      isAvailable: () => true,
      resolve: vi.fn().mockRejectedValue(new Error('boom')),
    }
    const fallback = mockAdapter('env-var', token)
    const composite = CompositeAdapter.fromAdapters([failing, fallback])

    const result = await composite.resolve('slack', 'conn-1')
    expect(result).toEqual(token)
  })

  it('reports adapter names for diagnostics', () => {
    const composite = CompositeAdapter.fromAdapters([
      mockAdapter('nango', null, true),
      mockAdapter('database', null, false),
    ])
    expect(composite.getAdapterNames()).toEqual(['nango', 'database (unavailable)'])
  })

  it('isAvailable when at least one adapter is available', () => {
    const composite = CompositeAdapter.fromAdapters([
      mockAdapter('nango', null, false),
      mockAdapter('env-var', null, true),
    ])
    expect(composite.isAvailable()).toBe(true)
  })
})
