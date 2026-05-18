import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockFrom = vi.fn()
const mockCaptureException = vi.fn()

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  ErrorService: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  },
}))

describe('knowledge operation event helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records bounded operation audit events with stable input hashes', async () => {
    const { hashOperationInput, recordKnowledgeOperationEvent } = await import('../knowledge-operation-events')
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ insert })

    await recordKnowledgeOperationEvent({
      orgId: '22222222-2222-4222-8222-222222222222',
      actorUserId: '11111111-1111-4111-8111-111111111111',
      operationId: 'knowledge.retrieve_context',
      surface: 'worker_tool',
      success: true,
      durationMs: 12.4,
      input: { b: 2, a: 1 },
      outputSummary: 'ok',
    })

    expect(mockFrom).toHaveBeenCalledWith('knowledge_operation_events')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      operation_id: 'knowledge.retrieve_context',
      surface: 'worker_tool',
      success: true,
      duration_ms: 12,
      input_hash: hashOperationInput({ a: 1, b: 2 }),
    }))
    expect(hashOperationInput({ a: 1, b: 2 })).toBe(hashOperationInput({ b: 2, a: 1 }))
  })

  it('falls back to an unlinked actor marker when e2e/runtime actor ids are not auth users', async () => {
    const { recordKnowledgeOperationEvent } = await import('../knowledge-operation-events')
    const firstInsert = vi.fn().mockResolvedValue({
      error: {
        code: '23503',
        message: 'insert or update on table "knowledge_operation_events" violates foreign key constraint "knowledge_operation_events_actor_user_id_fkey"',
      },
    })
    const retryInsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom
      .mockReturnValueOnce({ insert: firstInsert })
      .mockReturnValueOnce({ insert: retryInsert })

    await recordKnowledgeOperationEvent({
      orgId: '22222222-2222-4222-8222-222222222222',
      actorUserId: '11111111-1111-4111-8111-111111111111',
      operationId: 'brain.query',
      success: true,
      durationMs: 1,
      metadata: { source: 'e2e' },
    })

    expect(retryInsert).toHaveBeenCalledWith(expect.objectContaining({
      actor_user_id: null,
      metadata: expect.objectContaining({
        source: 'e2e',
        actor_user_id_unlinked: true,
      }),
    }))
    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('drops best-effort audit events when a short-lived org is already gone', async () => {
    const { recordKnowledgeOperationEvent } = await import('../knowledge-operation-events')
    const insert = vi.fn().mockResolvedValue({
      error: {
        code: '23503',
        message: 'insert or update on table "knowledge_operation_events" violates foreign key constraint "knowledge_operation_events_org_id_fkey"',
      },
    })
    mockFrom.mockReturnValue({ insert })

    await recordKnowledgeOperationEvent({
      orgId: '22222222-2222-4222-8222-222222222222',
      actorUserId: null,
      operationId: 'brain.query',
      success: true,
      durationMs: 1,
      metadata: { source: 'e2e-cleanup-race' },
    })

    expect(insert).toHaveBeenCalledTimes(1)
    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('records commerce evidence with provenance fields for Knowledge retrieval', async () => {
    const { recordCommerceKnowledgeEvidence } = await import('../knowledge-operation-events')
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ insert })

    await recordCommerceKnowledgeEvidence({
      orgId: '22222222-2222-4222-8222-222222222222',
      commerceEventId: '33333333-3333-4333-8333-333333333333',
      entityType: 'spend_request',
      entityId: '44444444-4444-4444-8444-444444444444',
      eventType: 'spend_request.completed',
      provider: 'stripe_link_agents',
      actorType: 'agent',
      actorId: 'assistant-1',
      projectId: '55555555-5555-4555-8555-555555555555',
      assistantId: '66666666-6666-4666-8666-666666666666',
      budgetReservationId: '77777777-7777-4777-8777-777777777777',
      ledgerId: 'ledger-1',
      idempotencyKey: 'idem-1',
      runId: 'run-1',
      requestId: 'req-1',
      providerEventId: 'evt-1',
      outcome: 'succeeded',
      status: 'completed',
      amount: 4200,
      currency: 'usd',
      metadata: {
        rail: 'card',
      },
    })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      operation_id: 'knowledge.write_project',
      surface: 'agent_ops',
      success: true,
      output_summary: 'Commerce evidence: spend_request.completed · succeeded · completed · stripe_link_agents.',
      metadata: expect.objectContaining({
        evidence_kind: 'commerce_event',
        commerce_event_id: '33333333-3333-4333-8333-333333333333',
        entity_type: 'spend_request',
        project_id: '55555555-5555-4555-8555-555555555555',
        assistant_id: '66666666-6666-4666-8666-666666666666',
        budget_reservation_id: '77777777-7777-4777-8777-777777777777',
        ledger_id: 'ledger-1',
        idempotency_key: 'idem-1',
        run_id: 'run-1',
        request_id: 'req-1',
        provider_event_id: 'evt-1',
        outcome: 'succeeded',
        status: 'completed',
        amount: 4200,
        currency: 'usd',
        rail: 'card',
      }),
    }))
  })

  it('lists mirrored commerce Knowledge evidence by commerce event id', async () => {
    const { listCommerceKnowledgeEvidenceEvents } = await import('../knowledge-operation-events')
    const rows = [{
      id: '99999999-9999-4999-8999-999999999999',
      org_id: '22222222-2222-4222-8222-222222222222',
      operation_id: 'knowledge.write_project',
      surface: 'agent_ops',
      success: true,
      output_summary: 'Commerce evidence recorded.',
      metadata: {
        evidence_kind: 'commerce_event',
        commerce_event_id: '33333333-3333-4333-8333-333333333333',
        status: 'completed',
      },
      created_at: '2026-05-07T12:00:00.000Z',
    }]
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: rows, error: null }),
    }
    mockFrom.mockReturnValue(query)

    await expect(listCommerceKnowledgeEvidenceEvents({
      orgId: '22222222-2222-4222-8222-222222222222',
      commerceEventIds: ['33333333-3333-4333-8333-333333333333'],
    })).resolves.toEqual([{
      id: '99999999-9999-4999-8999-999999999999',
      org_id: '22222222-2222-4222-8222-222222222222',
      commerce_event_id: '33333333-3333-4333-8333-333333333333',
      operation_id: 'knowledge.write_project',
      surface: 'agent_ops',
      success: true,
      output_summary: 'Commerce evidence recorded.',
      metadata: rows[0].metadata,
      created_at: '2026-05-07T12:00:00.000Z',
    }])

    expect(mockFrom).toHaveBeenCalledWith('knowledge_operation_events')
    expect(query.eq).toHaveBeenCalledWith('metadata->>evidence_kind', 'commerce_event')
    expect(query.in).toHaveBeenCalledWith('metadata->>commerce_event_id', ['33333333-3333-4333-8333-333333333333'])
  })
})
