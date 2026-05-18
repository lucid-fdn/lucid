import { describe, expect, it } from 'vitest'

import { resolveDiscordPresence } from '../presence.js'

describe('resolveDiscordPresence', () => {
  it('builds a custom-status presence by default', () => {
    const result = resolveDiscordPresence({
      status: 'online',
      activity: 'Lucid agents',
    })

    expect(result.status).toBe('online')
    expect(result.activity).toEqual({
      name: 'Custom Status',
      type: 4,
      state: 'Lucid agents',
    })
    expect(result.updatedAt).toMatch(/T/)
  })

  it('keeps streaming urls for streaming activities', () => {
    const result = resolveDiscordPresence({
      status: 'idle',
      activity: 'Live coding',
      activityType: 1,
      activityUrl: 'https://twitch.tv/openclaw',
    })

    expect(result.status).toBe('idle')
    expect(result.activity).toEqual({
      name: 'Live coding',
      type: 1,
      url: 'https://twitch.tv/openclaw',
    })
  })
})
