import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  checkRateLimit: vi.fn(),
  isUserOrgMember: vi.fn(),
  runAndRecordEvalReceipt: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: mocks.getUserId,
}))

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  getRequestIdentifier: vi.fn(() => 'test-request'),
  RateLimitPresets: {
    STANDARD: { name: 'standard' },
  },
}))

vi.mock('@/lib/auth/csrf', () => ({
  withCSRF: (handler: unknown) => handler,
}))

vi.mock('@/lib/db', () => ({
  isUserOrgMember: mocks.isUserOrgMember,
}))

vi.mock('@/lib/evals/receipt-store', () => ({
  runAndRecordEvalReceipt: mocks.runAndRecordEvalReceipt,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { POST } from '../route'

const orgId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const runId = '44444444-4444-4444-8444-444444444444'
const userId = '55555555-5555-4555-8555-555555555555'

describe('/api/agent-ops/eval-receipts/judge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.checkRateLimit.mockResolvedValue({ success: true })
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.runAndRecordEvalReceipt.mockResolvedValue({
      receipt: {
        id: '66666666-6666-4666-8666-666666666666',
        orgId,
        projectId,
        runId,
        sourceType: 'agent_ops_run',
        sourceId: runId,
        task: 'Judge output quality',
        outputHash: 'hashhashhashhash',
        dimensions: ['correctness'],
        judges: [],
        verdict: 'pass',
        aggregate: {},
        metadata: {},
        createdAt: '2026-05-07T00:00:00.000Z',
      },
      evaluation: {
        successfulJudgeCount: 2,
        failedJudgeCount: 0,
        skippedJudgeCount: 0,
        estimatedCostUsd: 0,
      },
    })
  })

  it('runs and records a receipt for org members', async () => {
    const response = await POST(new NextRequest('http://localhost:3000/api/agent-ops/eval-receipts/judge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        project_id: projectId,
        run_id: runId,
        source_type: 'agent_ops_run',
        source_id: runId,
        task: 'Judge output quality',
        output: { summary: 'Looks good because evidence is present.' },
        dimensions: ['correctness'],
      }),
    }) as NextRequest)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.receipt.verdict).toBe('pass')
    expect(mocks.runAndRecordEvalReceipt).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      projectId,
      runId,
      sourceType: 'agent_ops_run',
      sourceId: runId,
      dimensions: ['correctness'],
      metadata: expect.objectContaining({
        requested_by_user_id: userId,
        route: '/api/agent-ops/eval-receipts/judge',
      }),
    }))
  })

  it('rejects non-members before judging output', async () => {
    mocks.isUserOrgMember.mockResolvedValue(false)

    const response = await POST(new NextRequest('http://localhost:3000/api/agent-ops/eval-receipts/judge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        source_type: 'manual',
        source_id: 'manual-1',
        task: 'Judge output quality',
        output: 'text',
      }),
    }) as NextRequest)

    expect(response.status).toBe(403)
    expect(mocks.runAndRecordEvalReceipt).not.toHaveBeenCalled()
  })

  it('requires an output payload to judge', async () => {
    const response = await POST(new NextRequest('http://localhost:3000/api/agent-ops/eval-receipts/judge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        source_type: 'manual',
        source_id: 'manual-1',
        task: 'Judge output quality',
      }),
    }) as NextRequest)

    expect(response.status).toBe(400)
    expect(mocks.runAndRecordEvalReceipt).not.toHaveBeenCalled()
  })
})
