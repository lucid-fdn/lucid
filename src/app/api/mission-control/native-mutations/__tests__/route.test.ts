import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  isUserOrgMember: vi.fn(),
}))

vi.mock('@/lib/db/mission-control', () => ({
  getNativeMutationOpsSummary: vi.fn(),
  getOrgNativeMutationCandidates: vi.fn(),
  reviewNativeMutationCandidate: vi.fn(),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
  },
}))

vi.mock('@/lib/auth/csrf', () => ({
  withCSRF: (handler: unknown) => handler,
}))

import { GET, PATCH } from '../route'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import {
  getNativeMutationOpsSummary,
  getOrgNativeMutationCandidates,
  reviewNativeMutationCandidate,
} from '@/lib/db/mission-control'

const mockGetUserId = vi.mocked(getUserId)
const mockIsUserOrgMember = vi.mocked(isUserOrgMember)
const mockGetNativeMutationOpsSummary = vi.mocked(getNativeMutationOpsSummary)
const mockGetOrgNativeMutationCandidates = vi.mocked(getOrgNativeMutationCandidates)
const mockReviewNativeMutationCandidate = vi.mocked(reviewNativeMutationCandidate)
const ORG_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUserId.mockResolvedValue('user-1')
  mockIsUserOrgMember.mockResolvedValue(true)
})

describe('mission control native mutations route', () => {
  it('returns queue summary and candidates on GET', async () => {
    mockGetNativeMutationOpsSummary.mockResolvedValue({
      pendingCount: 2,
      promotedLast24h: 1,
      reviewedLast24h: 3,
      failedLast24h: 0,
      oldestPendingCreatedAt: null,
      pendingByEngine: { hermes: 2 },
      pendingByKind: {
        memory_write: 1,
        skill_create: 1,
        skill_update: 0,
        skill_delete: 0,
      },
      recentFailures: [],
    })
    mockGetOrgNativeMutationCandidates.mockResolvedValue([{ id: 'cand-1' } as any])

    const req = new NextRequest(`http://localhost/api/mission-control/native-mutations?org_id=${ORG_ID}&status=pending`)
    const res = await GET(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      summary: expect.objectContaining({ pendingCount: 2 }),
      candidates: expect.arrayContaining([expect.objectContaining({ id: 'cand-1' })]),
    })
    expect(mockGetOrgNativeMutationCandidates).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({
      status: 'pending',
    }))
  })

  it('rejects invalid GET filters', async () => {
    const req = new NextRequest(`http://localhost/api/mission-control/native-mutations?org_id=${ORG_ID}&status=bogus`)
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('validates promotion scope on PATCH', async () => {
    const req = new NextRequest(`http://localhost/api/mission-control/native-mutations?org_id=${ORG_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId: 'bf5c3e8c-b9b8-4e8a-bb5a-a333d61fa7f0',
        assistantId: '2bfca828-b548-42c0-b13d-c7c7465353b7',
        action: 'promote',
      }),
    })

    const res = await PATCH(req as any)
    expect(res.status).toBe(400)
  })

  it('reviews a candidate on PATCH', async () => {
    mockReviewNativeMutationCandidate.mockResolvedValue({ id: 'cand-1', status: 'approved' } as any)

    const req = new NextRequest(`http://localhost/api/mission-control/native-mutations?org_id=${ORG_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId: 'bf5c3e8c-b9b8-4e8a-bb5a-a333d61fa7f0',
        assistantId: '2bfca828-b548-42c0-b13d-c7c7465353b7',
        action: 'approve',
        reviewNotes: 'Looks good',
      }),
    })

    const res = await PATCH(req as any)
    expect(res.status).toBe(200)
    expect(mockReviewNativeMutationCandidate).toHaveBeenCalledWith(
      '2bfca828-b548-42c0-b13d-c7c7465353b7',
      ORG_ID,
      'bf5c3e8c-b9b8-4e8a-bb5a-a333d61fa7f0',
      {
        action: 'approve',
        reviewerId: 'user-1',
        reviewNotes: 'Looks good',
        promotionScope: null,
      },
    )
  })

  it('returns 409 when the candidate is already no longer pending', async () => {
    mockReviewNativeMutationCandidate.mockResolvedValue({ id: 'cand-1', status: 'rejected' } as any)

    const req = new NextRequest(`http://localhost/api/mission-control/native-mutations?org_id=${ORG_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId: 'bf5c3e8c-b9b8-4e8a-bb5a-a333d61fa7f0',
        assistantId: '2bfca828-b548-42c0-b13d-c7c7465353b7',
        action: 'approve',
      }),
    })

    const res = await PATCH(req as any)
    expect(res.status).toBe(409)
  })
})
