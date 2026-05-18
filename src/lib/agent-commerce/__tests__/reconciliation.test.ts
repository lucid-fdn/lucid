import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAgentCommerceReconciliation } from '../reconciliation'
import {
  appendAgentCommerceEvent,
  listAgentCommerceOpenOrgIds,
  listAgentCommerceProviderEventMismatches,
  reconcileAgentCommerceOrg,
} from '@/lib/db/agent-commerce'

vi.mock('server-only', () => ({}))
vi.mock('../feature-gates', () => ({
  assertAgentCommerceEnabled: vi.fn(),
}))
vi.mock('@/lib/db/agent-commerce', () => ({
  appendAgentCommerceEvent: vi.fn(),
  listAgentCommerceOpenOrgIds: vi.fn(),
  listAgentCommerceProviderEventMismatches: vi.fn(),
  reconcileAgentCommerceOrg: vi.fn(),
}))

const mockedReconcileOrg = vi.mocked(reconcileAgentCommerceOrg)
const mockedMismatches = vi.mocked(listAgentCommerceProviderEventMismatches)
const mockedOpenOrgIds = vi.mocked(listAgentCommerceOpenOrgIds)
const mockedAppendEvent = vi.mocked(appendAgentCommerceEvent)

describe('Agent Commerce reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedReconcileOrg.mockResolvedValue([])
    mockedMismatches.mockResolvedValue([])
    mockedOpenOrgIds.mockResolvedValue([])
    mockedAppendEvent.mockResolvedValue({
      org_id: '00000000-0000-4000-8000-000000000001',
      entity_type: 'provider_health',
      entity_id: '00000000-0000-4000-8000-000000000099',
      event_type: 'reconciliation.completed',
      actor_type: 'system',
      payload: {},
    })
  })

  it('reconciles a specific org and audits updates', async () => {
    mockedReconcileOrg.mockResolvedValue([
      { entity_type: 'spend_request', action: 'expired', updated_count: 2 },
    ])

    const result = await runAgentCommerceReconciliation({
      orgId: '00000000-0000-4000-8000-000000000001',
      now: '2026-05-01T00:00:00.000Z',
    })

    expect(mockedReconcileOrg).toHaveBeenCalledWith({
      orgId: '00000000-0000-4000-8000-000000000001',
      now: '2026-05-01T00:00:00.000Z',
      stuckAfter: undefined,
    })
    expect(mockedAppendEvent).toHaveBeenCalledTimes(1)
    expect(mockedAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'reconciliation.completed',
      payload: expect.objectContaining({ updated: 2 }),
    }))
    expect(result.totals.updated).toBe(2)
  })

  it('discovers open orgs for scheduled reconciliation', async () => {
    mockedOpenOrgIds.mockResolvedValue([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ])

    const result = await runAgentCommerceReconciliation({
      now: '2026-05-01T00:00:00.000Z',
    })

    expect(mockedReconcileOrg).toHaveBeenCalledTimes(2)
    expect(mockedAppendEvent).toHaveBeenCalledTimes(2)
    expect(mockedAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'reconciliation.completed',
      payload: expect.objectContaining({ updated: 0 }),
    }))
    expect(result.totals.orgs).toBe(2)
  })
})
