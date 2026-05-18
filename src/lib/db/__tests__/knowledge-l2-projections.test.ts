import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockFrom = vi.fn()

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

describe('knowledge L2 projection DB helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enqueues commitment-only projections with redacted payloads', async () => {
    const { enqueueKnowledgeL2Projection } = await import('../knowledge-l2-projections')
    const chain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: outboxRow(), error: null }),
    }
    mockFrom.mockReturnValue(chain)

    const row = await enqueueKnowledgeL2Projection({
      orgId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      pageId: 'page-1',
      eventId: 'event-1',
      localResourceType: 'project_brain',
      localResourceId: 'page-1',
      projectionPolicy: 'commitment_only',
      namespace: 'org:222:project:333:project_brain',
      contentHash: 'hash-1',
      payloadRedacted: { subject: 'Pricing', contentHash: 'hash-1' },
      metadata: { bridge: 'test' },
    })

    expect(mockFrom).toHaveBeenCalledWith('knowledge_l2_projection_outbox')
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({
      local_resource_type: 'project_brain',
      projection_policy: 'commitment_only',
      payload_redacted: { subject: 'Pricing', contentHash: 'hash-1' },
      encrypted_payload: null,
    }), { onConflict: 'org_id,local_resource_type,local_resource_id,content_hash' })
    expect(row?.status).toBe('pending')
  })

  it('lists L2 receipts for Mission Control proof UI', async () => {
    const { listKnowledgeL2Receipts } = await import('../knowledge-l2-projections')
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [receiptRow()], error: null }),
    }
    mockFrom.mockReturnValue(chain)

    const receipts = await listKnowledgeL2Receipts({
      orgId: '22222222-2222-4222-8222-222222222222',
      localResourceType: 'project_brain',
      limit: 5,
    })

    expect(chain.eq).toHaveBeenCalledWith('org_id', '22222222-2222-4222-8222-222222222222')
    expect(chain.eq).toHaveBeenCalledWith('local_resource_type', 'project_brain')
    expect(receipts[0]?.receiptHash).toBe('receipt-1')
    expect(receipts[0]?.anchorStatus).toBe('verified')
  })
})

function outboxRow() {
  return {
    id: 'outbox-1',
    org_id: '22222222-2222-4222-8222-222222222222',
    project_id: '33333333-3333-4333-8333-333333333333',
    team_id: null,
    assistant_id: null,
    source_id: null,
    page_id: 'page-1',
    event_id: 'event-1',
    local_resource_type: 'project_brain',
    local_resource_id: 'page-1',
    projection_policy: 'commitment_only',
    namespace: 'org:222:project:333:project_brain',
    scoped_user_id: null,
    agent_passport_id: null,
    channel_type: null,
    channel_id: null,
    conversation_id: null,
    content_hash: 'hash-1',
    payload_redacted: { subject: 'Pricing', contentHash: 'hash-1' },
    encrypted_payload: null,
    status: 'pending',
    attempts: 0,
    next_attempt_at: '2026-05-06T00:00:00.000Z',
    last_error: null,
    metadata: {},
    created_at: '2026-05-06T00:00:00.000Z',
    updated_at: '2026-05-06T00:00:00.000Z',
    projected_at: null,
  }
}

function receiptRow() {
  return {
    id: 'receipt-row-1',
    org_id: '22222222-2222-4222-8222-222222222222',
    outbox_id: 'outbox-1',
    local_resource_type: 'project_brain',
    local_resource_id: 'page-1',
    agent_passport_id: null,
    namespace: 'org:222:project:333:project_brain',
    l2_memory_id: 'l2-memory-1',
    content_hash: 'hash-1',
    receipt_hash: 'receipt-1',
    snapshot_cid: 'bafy-snapshot',
    anchor_epoch_id: 'epoch-1',
    anchor_tx_hash: '0xabc',
    anchor_status: 'verified',
    verification_status: 'verified',
    verification_payload: { checked: true },
    created_at: '2026-05-06T00:00:00.000Z',
    updated_at: '2026-05-06T00:00:00.000Z',
  }
}
