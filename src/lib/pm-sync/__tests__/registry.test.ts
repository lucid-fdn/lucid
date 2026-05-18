/**
 * Registry — Unit tests for register/get/list/reset lifecycle.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  registerAdapter,
  getAdapter,
  listRegisteredProviders,
  __resetRegistryForTests,
} = await import('../registry')
const { createFakeAdapter } = await import('./fake-adapter')

beforeEach(() => {
  __resetRegistryForTests()
})

describe('registry', () => {
  it('returns null before any adapter is registered', () => {
    expect(getAdapter('linear')).toBeNull()
    expect(listRegisteredProviders()).toEqual([])
  })

  it('stores and returns an adapter by provider', () => {
    const adapter = createFakeAdapter({ provider: 'linear' })
    registerAdapter(adapter)
    expect(getAdapter('linear')).toBe(adapter)
    expect(listRegisteredProviders()).toEqual(['linear'])
  })

  it('last registration wins (replace semantics)', () => {
    const first = createFakeAdapter({ provider: 'linear' })
    const second = createFakeAdapter({ provider: 'linear' })
    registerAdapter(first)
    registerAdapter(second)
    expect(getAdapter('linear')).toBe(second)
  })

  it('listRegisteredProviders returns sorted array', () => {
    registerAdapter(createFakeAdapter({ provider: 'trello' }))
    registerAdapter(createFakeAdapter({ provider: 'asana' }))
    registerAdapter(createFakeAdapter({ provider: 'linear' }))
    expect(listRegisteredProviders()).toEqual(['asana', 'linear', 'trello'])
  })

  it('__resetRegistryForTests clears every adapter', () => {
    registerAdapter(createFakeAdapter({ provider: 'linear' }))
    __resetRegistryForTests()
    expect(getAdapter('linear')).toBeNull()
    expect(listRegisteredProviders()).toEqual([])
  })
})
