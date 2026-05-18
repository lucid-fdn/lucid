import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

vi.mock('../client', () => ({
  isTransientSupabaseError: vi.fn(() => false),
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

import {
  mapNativeApprovalRow,
  mapNativeRunEventRow,
  mapNativeRunRow,
  recordNativeActionReceiptRow,
} from '../native-control-plane'

describe('native control-plane persistence helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps approval rows to public native approval contracts', () => {
    const approval = mapNativeApprovalRow({
      id: '00000000-0000-4000-8000-000000000001',
      user_id: '00000000-0000-4000-8000-000000000002',
      workspace_id: null,
      project_id: '00000000-0000-4000-8000-000000000003',
      run_id: 'run-1',
      title: 'Approve deploy',
      summary: 'Agent needs approval to continue.',
      agent_name: 'Release Agent',
      risk: 'confirmation-required',
      status: 'pending',
      expires_at: '2026-05-18T10:00:00.000Z',
      deep_link: 'lucid://workspace/default/approvals/00000000-0000-4000-8000-000000000001',
      metadata: { hidden: 'internal' },
      created_at: '2026-05-18T09:00:00.000Z',
      updated_at: '2026-05-18T09:00:00.000Z',
    })

    expect(approval).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Approve deploy',
      summary: 'Agent needs approval to continue.',
      agentName: 'Release Agent',
      projectId: '00000000-0000-4000-8000-000000000003',
      runId: 'run-1',
      risk: 'confirmation-required',
      status: 'pending',
      expiresAt: '2026-05-18T10:00:00.000Z',
      createdAt: '2026-05-18T09:00:00.000Z',
      deepLink: 'lucid://workspace/default/approvals/00000000-0000-4000-8000-000000000001',
    })
  })

  it('maps run rows and timeline rows without leaking metadata', () => {
    const run = mapNativeRunRow({
      id: '00000000-0000-4000-8000-000000000011',
      user_id: '00000000-0000-4000-8000-000000000002',
      workspace_id: '00000000-0000-4000-8000-000000000004',
      project_id: null,
      title: 'Checkout QA',
      agent_name: 'Browser QA',
      status: 'running',
      progress: 72,
      needs_approval: true,
      deep_link: null,
      metadata: { providerRunId: 'internal' },
      created_at: '2026-05-18T09:00:00.000Z',
      updated_at: '2026-05-18T09:15:00.000Z',
    })

    const event = mapNativeRunEventRow({
      id: '00000000-0000-4000-8000-000000000012',
      run_id: run.id,
      user_id: '00000000-0000-4000-8000-000000000002',
      at: '2026-05-18T09:15:00.000Z',
      title: 'Needs approval',
      body: 'Waiting on user.',
      actor: 'Approval Wallet',
      level: 'warning',
      metadata: { policy: 'internal' },
    })

    expect(run).toMatchObject({
      id: '00000000-0000-4000-8000-000000000011',
      title: 'Checkout QA',
      agentName: 'Browser QA',
      status: 'running',
      progress: 72,
      needsApproval: true,
      updatedAt: '2026-05-18T09:15:00.000Z',
    })
    expect(JSON.stringify(run)).not.toContain('providerRunId')
    expect(event).toEqual({
      id: '00000000-0000-4000-8000-000000000012',
      at: '2026-05-18T09:15:00.000Z',
      title: 'Needs approval',
      body: 'Waiting on user.',
      actor: 'Approval Wallet',
      level: 'warning',
    })
  })

  it('upserts action receipts by user idempotency key', async () => {
    const receiptsQuery = createSupabaseChain({
      data: {
        id: '00000000-0000-4000-8000-000000000099',
        action_id: 'approve:approval-1',
        status: 'queued',
        created_at: '2026-05-18T09:00:00.000Z',
      },
      error: null,
    })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'native_action_receipts') return receiptsQuery
      throw new Error(`Unexpected table: ${table}`)
    })

    const receipt = await recordNativeActionReceiptRow('00000000-0000-4000-8000-000000000002', {
      featureId: 'approvalWallet',
      actionId: 'approve:approval-1',
      idempotencyKey: 'approval-1:approve',
      payload: { reason: 'ok' },
      confirmation: {
        confirmedAt: '2026-05-18T09:00:00.000Z',
        method: 'biometric',
        receipt: 'face-id-ok',
      },
    })

    expect(receiptsQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: '00000000-0000-4000-8000-000000000002',
      feature_id: 'approvalWallet',
      action_id: 'approve:approval-1',
      idempotency_key: 'approval-1:approve',
      status: 'queued',
      confirmation_method: 'biometric',
      confirmation_receipt: 'face-id-ok',
    }), { onConflict: 'user_id,idempotency_key' })
    expect(receipt).toEqual({
      actionId: 'approve:approval-1',
      status: 'queued',
      receiptId: '00000000-0000-4000-8000-000000000099',
      message: 'Native action accepted with confirmation receipt.',
    })
  })
})

function createSupabaseChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }

  return chain
}
