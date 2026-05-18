import { describe, it, expect } from 'vitest'

vi.mock('server-only', () => ({}))

import { classifyTeamsError, PermanentChannelError } from '../errors'

describe('classifyTeamsError', () => {
  it('maps 401 to auth_revoked', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    const result = classifyTeamsError(err)
    expect(result).toBeInstanceOf(PermanentChannelError)
    expect(result!.kind).toBe('auth_revoked')
    expect(result!.httpStatus).toBe(401)
  })

  it('maps 403 to auth_revoked', () => {
    const err = Object.assign(new Error('Forbidden'), { statusCode: 403 })
    const result = classifyTeamsError(err)
    expect(result).toBeInstanceOf(PermanentChannelError)
    expect(result!.kind).toBe('auth_revoked')
  })

  it('maps 404 to channel_gone', () => {
    const err = Object.assign(new Error('Conversation not found'), { status: 404 })
    const result = classifyTeamsError(err)
    expect(result).toBeInstanceOf(PermanentChannelError)
    expect(result!.kind).toBe('channel_gone')
  })

  it('maps BotNotInConversationRoster message to missing_permissions', () => {
    const err = new Error('BotNotInConversationRoster: The bot is not part of the conversation roster.')
    const result = classifyTeamsError(err)
    expect(result).toBeInstanceOf(PermanentChannelError)
    expect(result!.kind).toBe('missing_permissions')
  })

  it('maps BotNotInConversationRoster body code to missing_permissions', () => {
    const err = Object.assign(new Error('Error'), {
      body: { error: { code: 'BotNotInConversationRoster' } },
    })
    const result = classifyTeamsError(err)
    expect(result).toBeInstanceOf(PermanentChannelError)
    expect(result!.kind).toBe('missing_permissions')
  })

  it('maps proxy revocation TypeError to auth_revoked', () => {
    const err = new TypeError('revoked credentials for app')
    const result = classifyTeamsError(err)
    expect(result).toBeInstanceOf(PermanentChannelError)
    expect(result!.kind).toBe('auth_revoked')
  })

  it('maps message-string "401" fallback to auth_revoked', () => {
    const err = new Error('HTTP 401 from Bot Framework')
    const result = classifyTeamsError(err)
    expect(result).toBeInstanceOf(PermanentChannelError)
    expect(result!.kind).toBe('auth_revoked')
  })

  it('returns null for 429 (transient)', () => {
    const err = Object.assign(new Error('Too Many Requests'), { status: 429 })
    expect(classifyTeamsError(err)).toBeNull()
  })

  it('returns null for 500 (transient)', () => {
    const err = Object.assign(new Error('Internal Server Error'), { status: 500 })
    expect(classifyTeamsError(err)).toBeNull()
  })

  it('returns null for generic network error', () => {
    const err = new Error('ECONNRESET')
    expect(classifyTeamsError(err)).toBeNull()
  })
})
