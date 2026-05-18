import { describe, expect, it } from 'vitest'
import {
  summarizeAgentCommerceStagingReconciliationEvidence,
} from '../staging-reconciliation-evidence'

function reconciliationEvent(day: number, payload: Record<string, unknown> = {}) {
  const createdAt = `2026-05-${String(day).padStart(2, '0')}T12:00:00.000Z`
  return {
    event_type: 'reconciliation.completed',
    created_at: createdAt,
    payload: {
      ran_at: createdAt,
      actions: [
        { entity_type: 'spend_request', action: 'expired', updated_count: 0 },
        { entity_type: 'spend_request', action: 'credential_issuing_stuck', updated_count: 0 },
        { entity_type: 'budget_reservation', action: 'expired', updated_count: 0 },
      ],
      provider_event_mismatches: 0,
      ...payload,
    },
  }
}

describe('Agent Commerce staging reconciliation evidence', () => {
  it('proves a clean seven-day reconciliation beta window from durable events', () => {
    const summary = summarizeAgentCommerceStagingReconciliationEvidence({
      events: [1, 2, 3, 4, 5, 6, 7].map((day) => reconciliationEvent(day)),
      now: '2026-05-07T23:59:59.000Z',
      untriagedP0P1IncidentCount: 0,
    })

    expect(summary.ready).toBe(true)
    expect(summary.observed_run_days).toHaveLength(7)
    expect(summary.total_runs).toBe(7)
    expect(summary.evidence).toEqual([
      'seven_day_reconciliation_job_history',
      'stale_approval_reconciliation_log',
      'stuck_credential_reconciliation_log',
      'provider_mismatch_triage_log',
      'zero_untriaged_p0_p1_commerce_incidents',
    ])
  })

  it('keeps the gate open when run history, checks, or incident disposition are missing', () => {
    const summary = summarizeAgentCommerceStagingReconciliationEvidence({
      events: [
        reconciliationEvent(5, {
          actions: [
            { entity_type: 'spend_request', action: 'expired', updated_count: 1 },
          ],
        }),
      ],
      now: '2026-05-07T23:59:59.000Z',
      untriagedP0P1IncidentCount: 1,
    })

    expect(summary.ready).toBe(false)
    expect(summary.missingEvidence).toEqual(expect.arrayContaining([
      'seven_day_reconciliation_job_history',
      'stuck_credential_reconciliation_log',
      'zero_untriaged_p0_p1_commerce_incidents',
    ]))
  })
})
