import { describe, it, expect } from 'vitest'
import {
  issueDiscordOAuthState,
  verifyDiscordOAuthState,
} from '../oauth-state'

const SECRET = 'a'.repeat(32)
const UUID_A = '11111111-2222-3333-4444-555555555555'
const UUID_O = '22222222-3333-4444-5555-666666666666'
const UUID_U = '33333333-4444-5555-6666-777777777777'

describe('oauth-state', () => {
  it('round-trips a fresh state token', () => {
    const now = 1_700_000_000_000
    const token = issueDiscordOAuthState({
      assistantId: UUID_A,
      orgId: UUID_O,
      userId: UUID_U,
      secret: SECRET,
      now,
    })
    const payload = verifyDiscordOAuthState(token, { secret: SECRET, now })
    expect(payload).not.toBeNull()
    expect(payload!.assistantId).toBe(UUID_A)
    expect(payload!.orgId).toBe(UUID_O)
    expect(payload!.userId).toBe(UUID_U)
    expect(payload!.expiresAt).toBeGreaterThan(Math.floor(now / 1000))
  })

  it('rejects an expired token', () => {
    const now = 1_700_000_000_000
    const token = issueDiscordOAuthState({
      assistantId: UUID_A,
      orgId: UUID_O,
      userId: UUID_U,
      secret: SECRET,
      now,
    })
    // 11 minutes later — past the 10-minute TTL
    const later = now + 11 * 60 * 1000
    expect(
      verifyDiscordOAuthState(token, { secret: SECRET, now: later }),
    ).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const now = 1_700_000_000_000
    const token = issueDiscordOAuthState({
      assistantId: UUID_A,
      orgId: UUID_O,
      userId: UUID_U,
      secret: SECRET,
      now,
    })
    // Flip one char in payload segment
    const [payload, sig] = token.split('.')
    const flipped =
      payload!.slice(0, -1) + (payload!.endsWith('A') ? 'B' : 'A') + '.' + sig
    expect(verifyDiscordOAuthState(flipped, { secret: SECRET, now })).toBeNull()
  })

  it('rejects a signature forged with a different secret', () => {
    const now = 1_700_000_000_000
    const token = issueDiscordOAuthState({
      assistantId: UUID_A,
      orgId: UUID_O,
      userId: UUID_U,
      secret: SECRET,
      now,
    })
    expect(
      verifyDiscordOAuthState(token, { secret: 'b'.repeat(32), now }),
    ).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(verifyDiscordOAuthState('', { secret: SECRET })).toBeNull()
    expect(verifyDiscordOAuthState('nodot', { secret: SECRET })).toBeNull()
    expect(verifyDiscordOAuthState('.nopayload', { secret: SECRET })).toBeNull()
    expect(verifyDiscordOAuthState('payload.', { secret: SECRET })).toBeNull()
  })

  it('throws on short secret when issuing', () => {
    expect(() =>
      issueDiscordOAuthState({
        assistantId: UUID_A,
        orgId: UUID_O,
        userId: UUID_U,
        secret: 'short',
      }),
    ).toThrow()
  })

  it('verify returns null on short secret (never throws)', () => {
    const token = issueDiscordOAuthState({
      assistantId: UUID_A,
      orgId: UUID_O,
      userId: UUID_U,
      secret: SECRET,
    })
    expect(verifyDiscordOAuthState(token, { secret: 'short' })).toBeNull()
  })
})
