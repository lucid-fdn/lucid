import { describe, it, expect, beforeEach, vi } from 'vitest'
import { teamsNativeAdapter } from '../TeamsNativeAdapter.js'
import {
  registerNativeChannelAdapter,
  getNativeChannelAdapter,
  __resetNativeChannelAdapters,
} from '../../native/adapter-registry.js'

describe('Teams adapter registration', () => {
  beforeEach(() => {
    __resetNativeChannelAdapters()
  })

  it('registers with channelType "msteams"', () => {
    registerNativeChannelAdapter(teamsNativeAdapter)
    const adapter = getNativeChannelAdapter('msteams')
    expect(adapter).toBeDefined()
    expect(adapter!.channelType).toBe('msteams')
  })

  it('implements NativeChannelAdapter contract', () => {
    expect(teamsNativeAdapter.channelType).toBe('msteams')
    expect(typeof teamsNativeAdapter.start).toBe('function')
  })
})
