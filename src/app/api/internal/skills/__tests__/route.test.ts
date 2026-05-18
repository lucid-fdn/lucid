import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getSkillCatalogAdmin: vi.fn(),
  approveSkill: vi.fn(),
  rejectSkill: vi.fn(),
  publishPrivateSkillToCatalog: vi.fn(),
}))

vi.mock('@/lib/auth/internal', () => ({
  isInternalOrg: vi.fn(() => true),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true })),
  getRequestIdentifier: vi.fn(() => 'req-1'),
  RateLimitPresets: { STANDARD: 'standard' },
}))

vi.mock('@/lib/skills/reconcile', () => ({
  reconcileSkillCatalog: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [{ organization_id: 'org-internal' }], error: null })),
      })),
    })),
  },
}))

import { GET, PATCH } from '../route'
import { getUserId } from '@/lib/auth/server-utils'
import { getSkillCatalogAdmin, publishPrivateSkillToCatalog } from '@/lib/db'

const mockGetUserId = vi.mocked(getUserId)
const mockGetSkillCatalogAdmin = vi.mocked(getSkillCatalogAdmin)
const mockPublishPrivateSkillToCatalog = vi.mocked(publishPrivateSkillToCatalog)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUserId.mockResolvedValue('user-1')
})

describe('internal skills route', () => {
  it('passes visibility filter through on GET', async () => {
    mockGetSkillCatalogAdmin.mockResolvedValue([])
    const req = new NextRequest('http://localhost/api/internal/skills?visibility=org_private')
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(mockGetSkillCatalogAdmin).toHaveBeenCalledWith(undefined, 'org_private')
  })

  it('publishes org-private skills into the global catalog draft queue', async () => {
    mockPublishPrivateSkillToCatalog.mockResolvedValue({ id: 'skill-global-1' })
    const req = new NextRequest('http://localhost/api/internal/skills', {
      method: 'PATCH',
      body: JSON.stringify({
        skillId: 'skill-private-1',
        action: 'publish_private_to_catalog',
        slug: 'trade-alpha',
      }),
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      action: 'publish_private_to_catalog',
      publishedSkillId: 'skill-global-1',
    })
  })
})
