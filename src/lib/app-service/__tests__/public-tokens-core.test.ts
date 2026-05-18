import { describe, expect, it } from 'vitest'
import {
  PUBLIC_APP_TOKEN_PREFIX,
  buildPublicTokenRotationUpdate,
  createPublicAppTokenSecret,
  hashPublicAppToken,
  isPublicAppTokenUsable,
  publicAppTokenAllowsKind,
  publicAppTokenHashMatches,
  publicAppTokenPreview,
} from '../public-tokens-core'

describe('public app token core', () => {
  it('creates high-entropy prefixed tokens and hashes them without storing plaintext', () => {
    const token = createPublicAppTokenSecret()
    const hash = hashPublicAppToken(token, 'pepper')

    expect(token.startsWith(PUBLIC_APP_TOKEN_PREFIX)).toBe(true)
    expect(token.length).toBeGreaterThan(40)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).not.toContain(token)
    expect(publicAppTokenHashMatches(token, hash, 'pepper')).toBe(true)
    expect(publicAppTokenHashMatches(`${token}x`, hash, 'pepper')).toBe(false)
  })

  it('builds safe previews without revealing the full token', () => {
    const token = `${PUBLIC_APP_TOKEN_PREFIX}abcdefghijklmnopqrstuvwxyz1234567890`
    const preview = publicAppTokenPreview(token)

    expect(preview).toMatch(/^lucid_pub_[a-z0-9]{6}\.\.\.[a-z0-9]{4}$/)
    expect(preview).not.toContain('abcdefghijklmnopqrstuvwxyz')
  })

  it('rejects revoked or expired token records', () => {
    const base = {
      app_deployment_id: 'app-1',
      token_hash: 'hash',
      capabilities: [],
    }
    const now = new Date('2026-04-29T12:00:00.000Z')

    expect(isPublicAppTokenUsable(base, now)).toBe(true)
    expect(isPublicAppTokenUsable({ ...base, expires_at: '2026-04-29T12:00:01.000Z' }, now)).toBe(true)
    expect(isPublicAppTokenUsable({ ...base, expires_at: '2026-04-29T11:59:59.000Z' }, now)).toBe(false)
    expect(isPublicAppTokenUsable({ ...base, revoked_at: '2026-04-29T11:00:00.000Z' }, now)).toBe(false)
  })

  it('maps token capabilities to public runtime request kinds', () => {
    expect(publicAppTokenAllowsKind([], 'chat')).toBe(true)
    expect(publicAppTokenAllowsKind(['status'], 'config')).toBe(true)
    expect(publicAppTokenAllowsKind(['status'], 'session')).toBe(true)
    expect(publicAppTokenAllowsKind(['chat'], 'chat')).toBe(true)
    expect(publicAppTokenAllowsKind(['chat'], 'lead')).toBe(false)
    expect(publicAppTokenAllowsKind(['public_actions'], 'action')).toBe(true)
    expect(publicAppTokenAllowsKind(['paid_actions'], 'action')).toBe(true)
    expect(publicAppTokenAllowsKind(['lead'], 'preflight')).toBe(true)
  })

  it('builds deterministic revoke updates for rotation', () => {
    expect(buildPublicTokenRotationUpdate(new Date('2026-04-29T12:00:00.000Z'))).toEqual({
      revoked_at: '2026-04-29T12:00:00.000Z',
    })
  })
})
