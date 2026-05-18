/**
 * PM Webhook Route — Unit tests for POST /api/webhooks/pm/[provider]/[orgId].
 *
 * Tests the full route handler: provider validation, config lookup, dispatcher
 * delegation, work-item lifecycle (patch/complete/reopen), DAG broadcast on
 * node completion, and error recovery. Every external dependency is mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { PmWebhookEvent } from '@contracts/pm-adapter'
import type { InboundDispatchResult } from '@/lib/pm-sync/dispatcher'
import type { HumanWorkItem } from '@/lib/db/human-work-items'

// ─── Hoisted mocks ──────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}))

const mockGetOrgPmConfig = vi.fn()
vi.mock('@/lib/db/pm-config', () => ({
  getOrgPmConfig: (...args: unknown[]) => mockGetOrgPmConfig(...args),
}))

const mockHandleInboundEvent = vi.fn()
vi.mock('@/lib/pm-sync', () => ({
  handleInboundEvent: (...args: unknown[]) => mockHandleInboundEvent(...args),
}))

const mockCompleteWorkItem = vi.fn()
const mockPatchWorkItem = vi.fn()
const mockReopenWorkItem = vi.fn()
vi.mock('@/lib/db/human-work-items', () => ({
  completeWorkItem: (...args: unknown[]) => mockCompleteWorkItem(...args),
  patchWorkItem: (...args: unknown[]) => mockPatchWorkItem(...args),
  reopenWorkItem: (...args: unknown[]) => mockReopenWorkItem(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: vi.fn(),
    startSpan: vi.fn((_n: string, _o: string, cb: () => unknown) => cb()),
  },
}))

const mockChannelSend = vi.fn().mockResolvedValue('ok')
const mockRemoveChannel = vi.fn()
const mockChannel = {
  send: mockChannelSend,
}
vi.mock('@/lib/db/client', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

// ─── Import route under test ────────────────────────────────────────────────────

const { POST } = await import('../[provider]/[orgId]/route')

// ─── Helpers ────────────────────────────────────────────────────────────────────

const ORG_ID = '11111111-1111-1111-1111-111111111111'
const WORK_ITEM_ID = 'wi-001'
const SYSTEM_SYNC_USER_ID = '00000000-0000-0000-0000-000000000000'

function makeRequest(
  provider: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): [Request, { params: Promise<{ provider: string; orgId: string }> }] {
  const req = new Request(
    `http://localhost/api/webhooks/pm/${provider}/${ORG_ID}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
  )
  return [
    req,
    { params: Promise.resolve({ provider, orgId: ORG_ID }) },
  ]
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg-1',
    orgId: ORG_ID,
    provider: 'linear',
    enabled: true,
    isPrimary: true,
    nangoConnectionId: 'nango-1',
    config: {},
    webhookSecret: 'secret-123',
    createdAt: '2026-04-08T00:00:00Z',
    updatedAt: '2026-04-08T00:00:00Z',
    createdBy: null,
    ...overrides,
  }
}

function makeRef() {
  return {
    id: 'ref-1',
    work_item_id: WORK_ITEM_ID,
    org_id: ORG_ID,
    provider: 'linear',
    external_id: 'LIN-123',
    external_url: 'https://linear.app/foo/LIN-123',
    metadata: {},
    created_at: '2026-04-08T00:00:00Z',
    last_synced_at: '2026-04-08T00:00:00Z',
    last_sync_error: null,
    sync_attempts: 0,
  }
}

function makeWorkItem(overrides: Partial<HumanWorkItem> = {}): HumanWorkItem {
  return {
    id: WORK_ITEM_ID,
    org_id: ORG_ID,
    kind: 'pulse_standalone',
    pulse_job_run_id: null,
    dag_id: null,
    dag_node_id: null,
    agent_id: null,
    title: 'Test item',
    description: null,
    priority: 'normal',
    labels: [],
    assignee_user_id: null,
    assignee_role: null,
    status: 'done',
    resolution: 'completed',
    resolution_notes: null,
    due_at: null,
    sla_seconds: null,
    started_at: null,
    completed_at: '2026-04-08T12:00:00Z',
    external_mirror: null,
    created_by: null,
    created_at: '2026-04-08T00:00:00Z',
    updated_at: '2026-04-08T12:00:00Z',
    ...overrides,
  }
}

function makeApplyResult(
  event: PmWebhookEvent,
): Extract<InboundDispatchResult, { outcome: 'apply' }> {
  return {
    outcome: 'apply',
    provider: event.provider,
    event,
    ref: makeRef(),
  }
}

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetOrgPmConfig.mockResolvedValue(makeConfig())
})

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/webhooks/pm/[provider]/[orgId]', () => {
  // 1. Unknown provider → 404 response
  describe('provider validation', () => {
    it('returns 404 for an unknown provider', async () => {
      const [req, ctx] = makeRequest('jira', { data: {} })
      const res = await POST(req as any, ctx)
      expect(res.status).toBe(404)
      const json = await res.json()
      expect(json.error).toBe('unknown_provider')
      // Should NOT call getOrgPmConfig for an unknown provider
      expect(mockGetOrgPmConfig).not.toHaveBeenCalled()
    })

    it.each(['linear', 'asana', 'trello', 'monday'] as const)(
      'accepts valid provider %s',
      async (provider) => {
        mockGetOrgPmConfig.mockResolvedValue(makeConfig({ provider }))
        mockHandleInboundEvent.mockResolvedValue({
          outcome: 'ignored',
          reason: 'parse',
        })
        const [req, ctx] = makeRequest(provider, { data: {} })
        const res = await POST(req as any, ctx)
        expect(res.status).toBe(200)
      },
    )
  })

  // 9. Missing org_pm_config → 200 with outcome "ignored:disabled"
  describe('config lookup', () => {
    it('returns 200 ignored:disabled when config is null', async () => {
      mockGetOrgPmConfig.mockResolvedValue(null)
      const [req, ctx] = makeRequest('linear', { data: {} })
      const res = await POST(req as any, ctx)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.outcome).toBe('ignored')
      expect(json.reason).toBe('disabled')
    })

    it('returns 200 ignored:disabled when config.enabled is false', async () => {
      mockGetOrgPmConfig.mockResolvedValue(makeConfig({ enabled: false }))
      const [req, ctx] = makeRequest('linear', { data: {} })
      const res = await POST(req as any, ctx)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.outcome).toBe('ignored')
      expect(json.reason).toBe('disabled')
    })
  })

  // 4. Invalid signature → 200 with outcome "ignored:signature"
  describe('signature verification', () => {
    it('returns 200 ignored:signature when dispatcher rejects signature', async () => {
      mockHandleInboundEvent.mockResolvedValue({
        outcome: 'ignored',
        reason: 'signature',
      })
      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.outcome).toBe('ignored')
      expect(json.reason).toBe('signature')
    })
  })

  // 5. Duplicate event (Redis dedup) → 200 with outcome "ignored:dedupe"
  describe('deduplication', () => {
    it('returns 200 ignored:dedupe when dispatcher detects duplicate', async () => {
      mockHandleInboundEvent.mockResolvedValue({
        outcome: 'ignored',
        reason: 'dedupe',
      })
      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.outcome).toBe('ignored')
      expect(json.reason).toBe('dedupe')
    })
  })

  // 2. Valid Linear webhook (issue.updated) → patchWorkItem called → 200
  describe('issue.updated → patchWorkItem', () => {
    it('applies patch and returns outcome=applied action=patched', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.updated',
        externalId: 'LIN-123',
        isEcho: false,
        patch: { title: 'New Title', priority: 'high' },
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockPatchWorkItem.mockResolvedValue(makeWorkItem({ title: 'New Title' }))

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.outcome).toBe('applied')
      expect(json.action).toBe('patched')

      expect(mockPatchWorkItem).toHaveBeenCalledWith({
        id: WORK_ITEM_ID,
        patch: { title: 'New Title', priority: 'high' },
        actorProvider: 'linear',
      })
    })

    it('returns noop when patchWorkItem returns null', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.updated',
        externalId: 'LIN-123',
        isEcho: false,
        patch: { title: 'X' },
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockPatchWorkItem.mockResolvedValue(null)

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      const json = await res.json()
      expect(json.outcome).toBe('ignored')
      expect(json.action).toBe('noop')
    })

    it('returns noop when patch has no applicable fields', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.updated',
        externalId: 'LIN-123',
        isEcho: false,
        patch: { assigneeUserId: 'user-1' } as any, // field not mapped by mapEventPatch
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      const json = await res.json()
      // mapEventPatch returns null for non-applicable fields → falls through to noop
      expect(json.outcome).toBe('applied')
      expect(json.action).toBe('noop')
    })
  })

  // 3. Valid Linear webhook (issue.closed) → completeWorkItem called → 200
  describe('issue.closed → completeWorkItem', () => {
    it('completes work item and returns outcome=applied action=closed', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.closed',
        externalId: 'LIN-123',
        isEcho: false,
        resolution: 'completed',
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockCompleteWorkItem.mockResolvedValue({
        workItem: makeWorkItem(),
        promotedNodeIds: [],
      })

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.outcome).toBe('applied')
      expect(json.action).toBe('closed')

      expect(mockCompleteWorkItem).toHaveBeenCalledWith({
        id: WORK_ITEM_ID,
        userId: SYSTEM_SYNC_USER_ID,
        resolution: 'completed',
        resolutionNotes: 'Closed via linear webhook',
      })
    })

    it('resolves "rejected" resolution correctly', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.closed',
        externalId: 'LIN-123',
        isEcho: false,
        resolution: 'rejected',
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockCompleteWorkItem.mockResolvedValue({
        workItem: makeWorkItem({ resolution: 'rejected' }),
        promotedNodeIds: [],
      })

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      await POST(req as any, ctx)

      expect(mockCompleteWorkItem).toHaveBeenCalledWith(
        expect.objectContaining({ resolution: 'rejected' }),
      )
    })

    it('resolves "approved" resolution correctly', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.closed',
        externalId: 'LIN-123',
        isEcho: false,
        resolution: 'approved',
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockCompleteWorkItem.mockResolvedValue({
        workItem: makeWorkItem({ resolution: 'approved' }),
        promotedNodeIds: [],
      })

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      await POST(req as any, ctx)

      expect(mockCompleteWorkItem).toHaveBeenCalledWith(
        expect.objectContaining({ resolution: 'approved' }),
      )
    })

    it('resolves unknown resolution to "completed"', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.closed',
        externalId: 'LIN-123',
        isEcho: false,
        resolution: { custom: 'wont-fix' },
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockCompleteWorkItem.mockResolvedValue({
        workItem: makeWorkItem(),
        promotedNodeIds: [],
      })

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      await POST(req as any, ctx)

      expect(mockCompleteWorkItem).toHaveBeenCalledWith(
        expect.objectContaining({ resolution: 'completed' }),
      )
    })

    it('returns ignored:apply_failed when completeWorkItem returns null', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.closed',
        externalId: 'LIN-123',
        isEcho: false,
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockCompleteWorkItem.mockResolvedValue(null)

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      const json = await res.json()
      expect(json.outcome).toBe('ignored')
      expect(json.reason).toBe('apply_failed')
    })
  })

  // 8. DAG node completion path: completeWorkItem returns promotedNodeIds → broadcast sent
  describe('DAG node completion broadcast', () => {
    it('sends Supabase broadcast when promotedNodeIds are returned', async () => {
      const dagId = 'dag-001'
      const promotedIds = ['node-a', 'node-b']

      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.closed',
        externalId: 'LIN-123',
        isEcho: false,
        resolution: 'completed',
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockCompleteWorkItem.mockResolvedValue({
        workItem: makeWorkItem({ dag_id: dagId, kind: 'nerve_node' }),
        promotedNodeIds: promotedIds,
      })

      const { supabase } = await import('@/lib/db/client')

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      const json = await res.json()

      expect(json.outcome).toBe('applied')
      expect(json.action).toBe('closed')

      // Verify channel was opened and send was called
      expect(supabase.channel).toHaveBeenCalledWith('dag:advance:webhook')
      expect(mockChannelSend).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'nodes_promoted',
        payload: {
          dag_id: dagId,
          node_ids: promotedIds,
        },
      })
    })

    it('does not broadcast when promotedNodeIds is empty', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.closed',
        externalId: 'LIN-123',
        isEcho: false,
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockCompleteWorkItem.mockResolvedValue({
        workItem: makeWorkItem(),
        promotedNodeIds: [],
      })

      const { supabase } = await import('@/lib/db/client')

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      await POST(req as any, ctx)

      expect(supabase.channel).not.toHaveBeenCalled()
    })

    it('does not broadcast when dag_id is null', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.closed',
        externalId: 'LIN-123',
        isEcho: false,
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockCompleteWorkItem.mockResolvedValue({
        workItem: makeWorkItem({ dag_id: null }),
        promotedNodeIds: ['node-a'],
      })

      const { supabase } = await import('@/lib/db/client')

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      await POST(req as any, ctx)

      expect(supabase.channel).not.toHaveBeenCalled()
    })
  })

  // issue.reopened → reopenWorkItem
  describe('issue.reopened → reopenWorkItem', () => {
    it('reopens the work item and returns outcome=applied action=reopened', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.reopened',
        externalId: 'LIN-123',
        isEcho: false,
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockReopenWorkItem.mockResolvedValue(
        makeWorkItem({ status: 'open', resolution: null }),
      )

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      const json = await res.json()
      expect(json.outcome).toBe('applied')
      expect(json.action).toBe('reopened')
      expect(mockReopenWorkItem).toHaveBeenCalledWith(WORK_ITEM_ID, 'linear')
    })

    it('returns noop when reopenWorkItem returns null', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.reopened',
        externalId: 'LIN-123',
        isEcho: false,
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockReopenWorkItem.mockResolvedValue(null)

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      const json = await res.json()
      expect(json.outcome).toBe('ignored')
      expect(json.action).toBe('noop')
    })
  })

  // Unhandled event type (e.g., issue.commented) → noop
  describe('unhandled event types', () => {
    it('returns applied:noop for issue.commented events', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.commented',
        externalId: 'LIN-123',
        isEcho: false,
        comment: 'Hello',
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      const json = await res.json()
      expect(json.outcome).toBe('applied')
      expect(json.action).toBe('noop')
    })
  })

  // Error handling → 200 with outcome "ignored:server_error"
  describe('error handling', () => {
    it('returns 200 ignored:server_error when handleInboundEvent throws', async () => {
      mockHandleInboundEvent.mockRejectedValue(new Error('unexpected'))

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.outcome).toBe('ignored')
      expect(json.reason).toBe('server_error')
    })

    it('returns 200 ignored:server_error when completeWorkItem throws', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.closed',
        externalId: 'LIN-123',
        isEcho: false,
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockCompleteWorkItem.mockRejectedValue(new Error('db crash'))

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.outcome).toBe('ignored')
      expect(json.reason).toBe('server_error')
    })
  })

  // extractRawEventId coverage
  describe('raw event id extraction', () => {
    it('extracts Linear event id from data.id', async () => {
      mockHandleInboundEvent.mockResolvedValue({
        outcome: 'ignored',
        reason: 'parse',
      })
      const body = { data: { id: 'lin-evt-42' } }
      const [req, ctx] = makeRequest('linear', body)
      await POST(req as any, ctx)

      expect(mockHandleInboundEvent).toHaveBeenCalledWith(
        expect.objectContaining({ rawEventId: 'lin-evt-42' }),
      )
    })

    it('extracts Asana event id from events[0].guid', async () => {
      mockGetOrgPmConfig.mockResolvedValue(makeConfig({ provider: 'asana' }))
      mockHandleInboundEvent.mockResolvedValue({
        outcome: 'ignored',
        reason: 'parse',
      })
      const body = { events: [{ guid: 'asana-guid-1' }] }
      const [req, ctx] = makeRequest('asana', body)
      await POST(req as any, ctx)

      expect(mockHandleInboundEvent).toHaveBeenCalledWith(
        expect.objectContaining({ rawEventId: 'asana-guid-1' }),
      )
    })

    it('extracts Trello event id from action.id', async () => {
      mockGetOrgPmConfig.mockResolvedValue(makeConfig({ provider: 'trello' }))
      mockHandleInboundEvent.mockResolvedValue({
        outcome: 'ignored',
        reason: 'parse',
      })
      const body = { action: { id: 'trello-action-1' } }
      const [req, ctx] = makeRequest('trello', body)
      await POST(req as any, ctx)

      expect(mockHandleInboundEvent).toHaveBeenCalledWith(
        expect.objectContaining({ rawEventId: 'trello-action-1' }),
      )
    })

    it('extracts Monday event id from x-monday-delivery-id header', async () => {
      mockGetOrgPmConfig.mockResolvedValue(makeConfig({ provider: 'monday' }))
      mockHandleInboundEvent.mockResolvedValue({
        outcome: 'ignored',
        reason: 'parse',
      })
      const body = { event: { type: 'update' } }
      const [req, ctx] = makeRequest('monday', body, {
        'x-monday-delivery-id': 'monday-del-1',
      })
      await POST(req as any, ctx)

      expect(mockHandleInboundEvent).toHaveBeenCalledWith(
        expect.objectContaining({ rawEventId: 'monday-del-1' }),
      )
    })

    it('returns null rawEventId when body is not valid JSON', async () => {
      mockHandleInboundEvent.mockResolvedValue({
        outcome: 'ignored',
        reason: 'parse',
      })
      const [req, ctx] = makeRequest('linear', 'not-json{')
      await POST(req as any, ctx)

      expect(mockHandleInboundEvent).toHaveBeenCalledWith(
        expect.objectContaining({ rawEventId: null }),
      )
    })

    it('returns null rawEventId when payload shape is unexpected', async () => {
      mockHandleInboundEvent.mockResolvedValue({
        outcome: 'ignored',
        reason: 'parse',
      })
      const body = { unexpected: true }
      const [req, ctx] = makeRequest('linear', body)
      await POST(req as any, ctx)

      expect(mockHandleInboundEvent).toHaveBeenCalledWith(
        expect.objectContaining({ rawEventId: null }),
      )
    })
  })

  // Config passes webhookSecret to dispatcher
  describe('webhook secret passthrough', () => {
    it('passes webhookSecret from config to handleInboundEvent', async () => {
      mockGetOrgPmConfig.mockResolvedValue(
        makeConfig({ webhookSecret: 'my-secret' }),
      )
      mockHandleInboundEvent.mockResolvedValue({
        outcome: 'ignored',
        reason: 'parse',
      })

      const [req, ctx] = makeRequest('linear', { data: {} })
      await POST(req as any, ctx)

      expect(mockHandleInboundEvent).toHaveBeenCalledWith(
        expect.objectContaining({ webhookSecret: 'my-secret' }),
      )
    })

    it('passes null when webhookSecret is undefined', async () => {
      mockGetOrgPmConfig.mockResolvedValue(
        makeConfig({ webhookSecret: undefined }),
      )
      mockHandleInboundEvent.mockResolvedValue({
        outcome: 'ignored',
        reason: 'parse',
      })

      const [req, ctx] = makeRequest('linear', { data: {} })
      await POST(req as any, ctx)

      expect(mockHandleInboundEvent).toHaveBeenCalledWith(
        expect.objectContaining({ webhookSecret: null }),
      )
    })
  })

  // mapEventPatch coverage
  describe('mapEventPatch field mapping', () => {
    it('maps description field (including null)', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.updated',
        externalId: 'LIN-123',
        isEcho: false,
        patch: { description: null },
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockPatchWorkItem.mockResolvedValue(makeWorkItem())

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      await POST(req as any, ctx)

      expect(mockPatchWorkItem).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({ description: null }),
        }),
      )
    })

    it('maps labels array', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.updated',
        externalId: 'LIN-123',
        isEcho: false,
        patch: { labels: ['bug', 'urgent'] },
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockPatchWorkItem.mockResolvedValue(makeWorkItem())

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      await POST(req as any, ctx)

      expect(mockPatchWorkItem).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({ labels: ['bug', 'urgent'] }),
        }),
      )
    })

    it('maps dueAt to due_at', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.updated',
        externalId: 'LIN-123',
        isEcho: false,
        patch: { dueAt: '2026-05-01T00:00:00Z' },
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))
      mockPatchWorkItem.mockResolvedValue(makeWorkItem())

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      await POST(req as any, ctx)

      expect(mockPatchWorkItem).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({ due_at: '2026-05-01T00:00:00Z' }),
        }),
      )
    })

    it('rejects invalid priority values', async () => {
      const event: PmWebhookEvent = {
        provider: 'linear',
        type: 'issue.updated',
        externalId: 'LIN-123',
        isEcho: false,
        patch: { priority: 'ultra' as any },
      }
      mockHandleInboundEvent.mockResolvedValue(makeApplyResult(event))

      const [req, ctx] = makeRequest('linear', { data: { id: 'evt-1' } })
      const res = await POST(req as any, ctx)
      const json = await res.json()
      // Invalid priority is dropped by mapEventPatch, no other fields → noop
      expect(json.outcome).toBe('applied')
      expect(json.action).toBe('noop')
    })
  })

  // Headers are lowercased and forwarded
  describe('header normalization', () => {
    it('normalizes headers to lowercase', async () => {
      mockHandleInboundEvent.mockResolvedValue({
        outcome: 'ignored',
        reason: 'parse',
      })
      const [req, ctx] = makeRequest('linear', { data: {} }, {
        'X-Linear-Signature': 'sig-value',
        'X-Custom-Header': 'custom-value',
      })
      await POST(req as any, ctx)

      const calledHeaders = mockHandleInboundEvent.mock.calls[0][0].headers
      expect(calledHeaders['x-linear-signature']).toBe('sig-value')
      expect(calledHeaders['x-custom-header']).toBe('custom-value')
    })
  })
})
