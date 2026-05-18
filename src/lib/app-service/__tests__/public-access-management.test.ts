import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { normalizeAppAllowedOrigin } from '../public-access-management'

describe('public access management', () => {
  it('normalizes allowed origins and rejects non-origin URLs', () => {
    expect(normalizeAppAllowedOrigin('https://Example.com:443')).toBe('https://example.com')
    expect(() => normalizeAppAllowedOrigin('https://example.com/path')).toThrow(/Allowed origin/)
    expect(() => normalizeAppAllowedOrigin('javascript:alert(1)')).toThrow(/Allowed origin/)
  })
})
