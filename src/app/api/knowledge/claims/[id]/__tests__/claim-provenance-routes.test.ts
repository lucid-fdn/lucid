import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  checkRateLimit: vi.fn(),
  resolveKnowledgeManagerAccess: vi.fn(),
  getKnowledgeClaim: vi.fn(),
  listKnowledgeClaimEvidence: vi.fn(),
  explainKnowledgeClaim: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: mocks.getUserId,
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getRequestIdentifier: vi.fn(() => 'test-request'),
  RateLimitPresets: {
    RELAXED: { name: 'relaxed' },
  },
}))

vi.mock('@/features/knowledge-manager/server-auth', () => ({
  resolveKnowledgeManagerAccess: mocks.resolveKnowledgeManagerAccess,
}))

vi.mock('@/lib/db', () => ({
  getKnowledgeClaim: mocks.getKnowledgeClaim,
  listKnowledgeClaimEvidence: mocks.listKnowledgeClaimEvidence,
  explainKnowledgeClaim: mocks.explainKnowledgeClaim,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { GET as GET_EVIDENCE } from '../evidence/route'
import { GET as GET_EXPLAIN } from '../explain/route'

const orgId = '22222222-2222-4222-8222-222222222222'
const claimId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'

const claim = {
  id: claimId,
  orgId,
  subject: 'Pricing risk',
  claim: 'Pricing risk needs finance evidence.',
  status: 'active',
}

describe('/api/knowledge/claims/[id] provenance routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.resolveKnowledgeManagerAccess.mockResolvedValue({ ok: true })
    mocks.getKnowledgeClaim.mockResolvedValue(claim)
    mocks.listKnowledgeClaimEvidence.mockResolvedValue([
      { id: 'evidence-1', claimId, evidenceKind: 'channel_event', label: 'Slack message' },
    ])
    mocks.explainKnowledgeClaim.mockResolvedValue({
      claim,
      evidenceRows: [],
      events: [],
      summary: 'Claim is active with one evidence link.',
      provenance: {
        evidenceCount: 1,
        eventCount: 1,
        hasReplacement: false,
        hasExpiry: false,
        status: 'active',
      },
    })
  })

  it('returns evidence rows for authorized org members', async () => {
    const response = await GET_EVIDENCE(
      new NextRequest(`http://localhost:3000/api/knowledge/claims/${claimId}/evidence?org_id=${orgId}`),
      { params: Promise.resolve({ id: claimId }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.claim).toMatchObject({ id: claimId })
    expect(body.evidence).toHaveLength(1)
    expect(mocks.listKnowledgeClaimEvidence).toHaveBeenCalledWith({
      orgId,
      claimId,
      limit: undefined,
    })
  })

  it('returns an explain packet with provenance for authorized org members', async () => {
    const response = await GET_EXPLAIN(
      new NextRequest(`http://localhost:3000/api/knowledge/claims/${claimId}/explain?org_id=${orgId}`),
      { params: Promise.resolve({ id: claimId }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.explanation.summary).toContain('Claim is active')
    expect(mocks.explainKnowledgeClaim).toHaveBeenCalledWith({ orgId, claimId })
  })

  it('blocks unauthorized users before loading claim provenance', async () => {
    mocks.resolveKnowledgeManagerAccess.mockResolvedValueOnce({ ok: false, status: 403, error: 'Forbidden' })

    const response = await GET_EXPLAIN(
      new NextRequest(`http://localhost:3000/api/knowledge/claims/${claimId}/explain?org_id=${orgId}`),
      { params: Promise.resolve({ id: claimId }) },
    )

    expect(response.status).toBe(403)
    expect(mocks.explainKnowledgeClaim).not.toHaveBeenCalled()
  })
})
