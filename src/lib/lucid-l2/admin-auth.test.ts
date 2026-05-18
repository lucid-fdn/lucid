import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { getL2AdminApiKey, getL2AdminAuthHeaders } from './admin-auth'

describe('L2 admin auth env resolution', () => {
  beforeEach(() => {
    delete process.env.LUCID_L2_ADMIN_KEY
    delete process.env.LUCID_L2_API_KEY
    delete process.env.LUCID_API_KEY
  })

  it('uses the canonical L2 admin key name', () => {
    process.env.LUCID_L2_ADMIN_KEY = 'admin-key'
    process.env.LUCID_L2_API_KEY = 'legacy-key'

    expect(getL2AdminApiKey()).toBe('admin-key')
    expect(getL2AdminAuthHeaders()).toEqual({ Authorization: 'Bearer admin-key' })
  })

  it('does not accept legacy admin aliases', () => {
    process.env.LUCID_API_KEY = 'legacy-platform-key'
    process.env.LUCID_L2_API_KEY = 'legacy-l2-key'

    expect(getL2AdminApiKey()).toBeNull()
    expect(getL2AdminAuthHeaders()).toEqual({})
  })

  it('omits auth headers when no admin key is configured', () => {
    expect(getL2AdminApiKey()).toBeNull()
    expect(getL2AdminAuthHeaders()).toEqual({})
  })
})
