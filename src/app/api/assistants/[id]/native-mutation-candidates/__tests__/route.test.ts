import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getAssistant: vi.fn(),
  isUserOrgMember: vi.fn(),
}))

vi.mock('@/lib/db/mission-control', () => ({
  getAssistantNativeMutationCandidates: vi.fn(),
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
import { getAssistant, isUserOrgMember } from '@/lib/db'
import {
  getAssistantNativeMutationCandidates,
  reviewNativeMutationCandidate,
} from '@/lib/db/mission-control'

const mockGetUserId = vi.mocked(getUserId)
const mockGetAssistant = vi.mocked(getAssistant)
const mockIsUserOrgMember = vi.mocked(isUserOrgMember)
const mockGetAssistantNativeMutationCandidates = vi.mocked(getAssistantNativeMutationCandidates)
const mockReviewNativeMutationCandidate = vi.mocked(reviewNativeMutationCandidate)

function makeCtx() {
  return { params: Promise.resolve({ id: 'assistant-1' }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUserId.mockResolvedValue('user-1')
  mockGetAssistant.mockResolvedValue({ id: 'assistant-1', org_id: 'org-1' } as any)
  mockIsUserOrgMember.mockResolvedValue(true)
})

describe('assistant native mutation candidates route', () => {
  it('returns assistant candidates on GET', async () => {
    mockGetAssistantNativeMutationCandidates.mockResolvedValue([
      {
        id: 'cand-1',
        agent_id: 'assistant-1',
        org_id: 'org-1',
        runtime_id: null,
        run_id: 'run-1',
        source: 'shared',
        engine: 'hermes',
        runtime_flavor: 'shared',
        mutation_kind: 'memory_write',
        tool_name: 'memory',
        tool_args: { content: 'remember' },
        reason: 'candidate',
        status: 'pending',
        promotion_scope: null,
        review_notes: null,
        reviewed_by: null,
        reviewed_at: null,
        review_attempts: 0,
        last_error: null,
        last_error_at: null,
        applied_record_id: null,
        applied_at: null,
        created_at: '2026-04-11T22:00:00Z',
      },
    ])

    const req = new NextRequest('http://localhost/api/assistants/assistant-1/native-mutation-candidates?limit=25')
    const res = await GET(req as any, makeCtx())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      candidates: expect.arrayContaining([
        expect.objectContaining({ id: 'cand-1' }),
      ]),
    })
  })

  it('validates GET limit', async () => {
    const req = new NextRequest('http://localhost/api/assistants/assistant-1/native-mutation-candidates?limit=500')
    const res = await GET(req as any, makeCtx())
    expect(res.status).toBe(400)
  })

  it('validates promotion scope on PATCH', async () => {
    const req = new Request('http://localhost/api/assistants/assistant-1/native-mutation-candidates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId: 'bf5c3e8c-b9b8-4e8a-bb5a-a333d61fa7f0',
        action: 'promote',
      }),
    })

    const res = await PATCH(req as any, makeCtx() as any)
    expect(res.status).toBe(400)
  })

  it('reviews a candidate on PATCH', async () => {
    mockReviewNativeMutationCandidate.mockResolvedValue({
      id: 'cand-1',
      status: 'approved',
    } as any)

    const req = new Request('http://localhost/api/assistants/assistant-1/native-mutation-candidates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId: 'bf5c3e8c-b9b8-4e8a-bb5a-a333d61fa7f0',
        action: 'approve',
        reviewNotes: 'Looks good',
      }),
    })

    const res = await PATCH(req as any, makeCtx() as any)
    expect(res.status).toBe(200)
    expect(mockReviewNativeMutationCandidate).toHaveBeenCalledWith(
      'assistant-1',
      'org-1',
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
    mockReviewNativeMutationCandidate.mockResolvedValue({
      id: 'cand-1',
      status: 'promoted',
    } as any)

    const req = new Request('http://localhost/api/assistants/assistant-1/native-mutation-candidates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId: 'bf5c3e8c-b9b8-4e8a-bb5a-a333d61fa7f0',
        action: 'approve',
      }),
    })

    const res = await PATCH(req as any, makeCtx() as any)
    expect(res.status).toBe(409)
  })
})
