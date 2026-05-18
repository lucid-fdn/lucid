import { describe, expect, it } from 'vitest'
import {
  CHANNEL_METADATA,
  CHANNEL_TYPES,
  CONNECTABLE_CHANNEL_TYPES,
  DEFERRED_CHANNEL_TYPES,
  getRequiredFields,
  isDeferredChannelType,
  isUserVisibleChannelType,
} from '../types'

describe('imessage channel registration', () => {
  it('exposes imessage as a supported Lucid BYOB channel', () => {
    expect(CHANNEL_TYPES).toContain('imessage')
    expect(CONNECTABLE_CHANNEL_TYPES).toContain('imessage')
    expect(isUserVisibleChannelType('imessage')).toBe(true)
  })

  it('marks imessage as non-deferred and hosted-capable', () => {
    expect(DEFERRED_CHANNEL_TYPES).not.toContain('imessage')
    expect(isDeferredChannelType('imessage')).toBe(false)
    expect(CHANNEL_METADATA.imessage.name).toBe('iMessage')
    expect(CHANNEL_METADATA.imessage.supportsHosted).toBe(true)
    expect(getRequiredFields('imessage', 'byob')).toEqual([])
  })
})
