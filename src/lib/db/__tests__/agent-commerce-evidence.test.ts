import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockFrom = vi.fn()
const mockRecordCommerceKnowledgeEvidence = vi.fn()

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: vi.fn(),
  },
}))

vi.mock('../knowledge-operation-events', () => ({
  recordCommerceKnowledgeEvidence: (...args: unknown[]) => mockRecordCommerceKnowledgeEvidence(...args),
}))

describe('agent commerce Knowledge evidence wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enriches commerce events with spend request provenance before recording Knowledge evidence', async () => {
    const event = {
      id: '11111111-1111-4111-8111-111111111111',
      contract_version: '2026-05-01',
      schema_version: 1,
      stack_id: 'commerce',
      org_id: '22222222-2222-4222-8222-222222222222',
      entity_type: 'spend_request',
      entity_id: '33333333-3333-4333-8333-333333333333',
      event_type: 'spend_request.completed',
      provider: 'stripe_link_agents',
      provider_event_id: 'evt-1',
      actor_type: 'agent',
      actor_id: 'assistant-runtime-id',
      request_id: 'req-1',
      run_id: 'run-1',
      payload: {
        stackId: 'commerce',
        budget_reservation_id: '44444444-4444-4444-8444-444444444444',
        ledger_id: 'ledger-1',
      },
      created_at: '2026-05-07T12:00:00.000Z',
    }

    const eventSingle = vi.fn().mockResolvedValue({ data: event, error: null })
    const eventSelect = vi.fn().mockReturnValue({ single: eventSingle })
    const eventInsert = vi.fn().mockReturnValue({ select: eventSelect })

    const entityMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: event.entity_id,
        org_id: event.org_id,
        project_id: '55555555-5555-4555-8555-555555555555',
        assistant_id: '66666666-6666-4666-8666-666666666666',
        run_id: 'run-1',
        tool_call_id: 'tool-1',
        idempotency_key: 'idem-1',
        provider: 'stripe_link_agents',
        rail: 'card',
        status: 'completed',
        merchant: { name: 'Example Merchant' },
        amount_cents: 4200,
        currency: 'usd',
        provider_request_id: 'provider-req-1',
        provider_credential_id: 'credential-1',
        metadata: {},
      },
      error: null,
    })
    const entityEqOrg = vi.fn().mockReturnValue({ maybeSingle: entityMaybeSingle })
    const entityEqId = vi.fn().mockReturnValue({ eq: entityEqOrg })
    const entitySelect = vi.fn().mockReturnValue({ eq: entityEqId })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'agent_commerce_events') {
        return { insert: eventInsert }
      }
      if (table === 'agent_spend_requests') {
        return { select: entitySelect }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const { appendAgentCommerceEvent } = await import('../agent-commerce')
    await appendAgentCommerceEvent({
      org_id: event.org_id,
      entity_type: 'spend_request',
      entity_id: event.entity_id,
      event_type: event.event_type,
      provider: 'stripe_link_agents',
      provider_event_id: 'evt-1',
      actor_type: 'agent',
      actor_id: 'assistant-runtime-id',
      request_id: 'req-1',
      run_id: 'run-1',
      payload: event.payload,
    })

    expect(mockRecordCommerceKnowledgeEvidence).toHaveBeenCalledWith(expect.objectContaining({
      orgId: event.org_id,
      commerceEventId: event.id,
      entityType: 'spend_request',
      projectId: '55555555-5555-4555-8555-555555555555',
      assistantId: '66666666-6666-4666-8666-666666666666',
      budgetReservationId: '44444444-4444-4444-8444-444444444444',
      ledgerId: 'ledger-1',
      idempotencyKey: 'idem-1',
      runId: 'run-1',
      requestId: 'req-1',
      providerEventId: 'evt-1',
      outcome: 'succeeded',
      status: 'completed',
      amount: 4200,
      currency: 'usd',
      metadata: expect.objectContaining({
        rail: 'card',
        provider_request_id: 'provider-req-1',
        credential_id: 'credential-1',
        tool_call_id: 'tool-1',
        merchant: { name: 'Example Merchant' },
      }),
    }))
  })
})
