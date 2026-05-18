import { describe, expect, it, vi } from 'vitest'
import {
  extractWebhookOrgId,
  normalizeAgentCommerceWebhookEntity,
} from '../webhooks'

vi.mock('server-only', () => ({}))

describe('Agent Commerce webhook normalization', () => {
  it('extracts org id from Stripe-style object metadata', () => {
    expect(extractWebhookOrgId({
      data: {
        object: {
          metadata: {
            org_id: '00000000-0000-4000-8000-000000000001',
          },
        },
      },
    })).toBe('00000000-0000-4000-8000-000000000001')
  })

  it('extracts org id from expanded Stripe payment intent metadata for reversal events', () => {
    expect(extractWebhookOrgId({
      data: {
        object: {
          payment_intent: {
            metadata: {
              org_id: '00000000-0000-4000-8000-000000000001',
            },
          },
        },
      },
    })).toBe('00000000-0000-4000-8000-000000000001')
  })

  it('extracts org id from Stripe Issuing card metadata', () => {
    expect(extractWebhookOrgId({
      data: {
        object: {
          card: {
            metadata: {
              org_id: '00000000-0000-4000-8000-000000000002',
            },
          },
        },
      },
    })).toBe('00000000-0000-4000-8000-000000000002')
  })

  it('matches spend request ids from provider metadata', () => {
    const normalized = normalizeAgentCommerceWebhookEntity({
      data: {
        object: {
          metadata: {
            agent_spend_request_id: '00000000-0000-4000-8000-000000000010',
          },
        },
      },
    })

    expect(normalized).toMatchObject({
      entity_type: 'spend_request',
      entity_id: '00000000-0000-4000-8000-000000000010',
      matched: true,
    })
  })

  it('matches spend request ids from Stripe Issuing card metadata', () => {
    const normalized = normalizeAgentCommerceWebhookEntity({
      type: 'issuing_authorization.request',
      data: {
        object: {
          card: {
            metadata: {
              agent_spend_request_id: '00000000-0000-4000-8000-000000000011',
            },
          },
        },
      },
    })

    expect(normalized).toMatchObject({
      entity_type: 'spend_request',
      entity_id: '00000000-0000-4000-8000-000000000011',
      matched: true,
    })
  })

  it('falls back to provider health for unmatched provider events', () => {
    const normalized = normalizeAgentCommerceWebhookEntity({
      id: 'evt_123',
      type: 'payment.updated',
    })

    expect(normalized.entity_type).toBe('provider_health')
    expect(normalized.entity_id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(normalized.matched).toBe(false)
  })
})
