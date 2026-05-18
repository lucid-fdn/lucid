/**
 * Monday.com Adapter — worker-side unit tests.
 *
 * Covers the pure-function surface: webhook signature verification,
 * webhook payload parsing, registry registration, plus HTTP method tests
 * for createIssue, updateIssue, closeIssue, fetchStatus with mocked Nango,
 * and the challenge/response handshake.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mondayAdapter } from '../monday-adapter.js'
import {
  __resetRegistryForTests,
  getAdapter,
  registerAdapter,
} from '../../../registry.js'
import { PmSyncMappingError } from '../../../errors.js'
import type { HumanWorkItemLite, PmAdapterContext, PmIssueRef } from '../../../types.js'

// ─── Nango mock ────────────────────────────────────────────────────────────

const mockNangoPost = vi.fn()
const mockNangoGet = vi.fn()

vi.mock('../../../nango-helpers.js', () => ({
  requireNangoClient: () => ({
    post: mockNangoPost,
    get: mockNangoGet,
    put: vi.fn(),
  }),
  handleNangoError: (err: unknown) => {
    throw err
  },
}))

// ─── Test fixtures ─────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<PmAdapterContext> & { providerConfig?: Record<string, unknown> } = {}): PmAdapterContext {
  return {
    orgId: 'org-1',
    nangoConnectionId: 'conn-1',
    providerConfigKey: 'monday',
    providerConfig: { boardId: 'board-123', statusColumnId: 'status' },
    nowIso: () => '2026-04-09T00:00:00Z',
    ...overrides,
  }
}

function makeWorkItem(overrides: Partial<HumanWorkItemLite> = {}): HumanWorkItemLite {
  return {
    id: 'wi-1',
    orgId: 'org-1',
    title: 'Fix the bug',
    description: 'It is broken',
    priority: 'high',
    labels: [],
    status: 'open',
    resolution: null,
    assigneeUserId: null,
    assigneeRole: null,
    dueAt: null,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  }
}

function makeRef(overrides: Partial<PmIssueRef> = {}): PmIssueRef {
  return {
    provider: 'monday',
    externalId: '12345',
    externalUrl: 'https://monday.com/boards/board-123/pulses/12345',
    metadata: { boardId: 'board-123' },
    ...overrides,
  }
}

describe('mondayAdapter', () => {
  describe('provider identity + registration', () => {
    beforeEach(() => {
      __resetRegistryForTests()
    })

    it('exposes provider = "monday"', () => {
      expect(mondayAdapter.provider).toBe('monday')
    })

    it('barrel import registers with the worker registry', async () => {
      await import('../index.js')
      expect(getAdapter('monday')).toBe(mondayAdapter)
    })

    it('registerAdapter() is idempotent', () => {
      registerAdapter(mondayAdapter)
      registerAdapter(mondayAdapter)
      expect(getAdapter('monday')).toBe(mondayAdapter)
    })
  })

  describe('verifySignature', () => {
    const secret = 'test-monday-secret'
    const body = JSON.stringify({ event: { type: 'create_item' } })

    it('returns true when authorization header matches secret', () => {
      expect(
        mondayAdapter.verifySignature(body, { authorization: secret }, secret),
      ).toBe(true)
    })

    it('returns false when authorization header does not match', () => {
      expect(
        mondayAdapter.verifySignature(body, { authorization: 'wrong' }, secret),
      ).toBe(false)
    })

    it('returns false when authorization header is missing', () => {
      expect(mondayAdapter.verifySignature(body, {}, secret)).toBe(false)
    })

    it('returns false when secret is empty', () => {
      expect(
        mondayAdapter.verifySignature(body, { authorization: 'anything' }, ''),
      ).toBe(false)
    })
  })

  describe('parseWebhook', () => {
    it('returns null for non-object payloads', async () => {
      expect(await mondayAdapter.parseWebhook(null, {})).toBeNull()
      expect(await mondayAdapter.parseWebhook('string', {})).toBeNull()
    })

    it('returns null for challenge-response handshake', async () => {
      expect(await mondayAdapter.parseWebhook({ challenge: 'abc123' }, {})).toBeNull()
    })

    it('returns null when event is missing', async () => {
      expect(await mondayAdapter.parseWebhook({}, {})).toBeNull()
    })

    it('returns null when event has no item id', async () => {
      const result = await mondayAdapter.parseWebhook(
        { event: { type: 'create_pulse' } },
        {},
      )
      expect(result).toBeNull()
    })

    it('maps create_pulse → issue.created', async () => {
      const event = await mondayAdapter.parseWebhook(
        {
          event: {
            type: 'create_pulse',
            pulseId: 12345,
            userId: 67890,
            triggerTime: '2026-04-08T12:00:00Z',
          },
        },
        {},
      )
      expect(event).not.toBeNull()
      expect(event?.type).toBe('issue.created')
      expect(event?.provider).toBe('monday')
      expect(event?.externalId).toBe('12345')
      expect(event?.actorId).toBe('67890')
      expect(event?.occurredAt).toBe('2026-04-08T12:00:00Z')
    })

    it('maps create_item → issue.created', async () => {
      const event = await mondayAdapter.parseWebhook(
        { event: { type: 'create_item', itemId: 99 } },
        {},
      )
      expect(event?.type).toBe('issue.created')
      expect(event?.externalId).toBe('99')
    })

    it('maps update_column_value with status column → issue.updated', async () => {
      const event = await mondayAdapter.parseWebhook(
        {
          event: {
            type: 'update_column_value',
            pulseId: 111,
            columnType: 'color',
            columnId: 'status',
            value: { label: { text: 'Working on it' } },
          },
        },
        {},
      )
      expect(event?.type).toBe('issue.updated')
    })

    it('maps update_column_value with done label → issue.closed', async () => {
      const event = await mondayAdapter.parseWebhook(
        {
          event: {
            type: 'update_column_value',
            pulseId: 222,
            columnType: 'color',
            columnId: 'status',
            value: { label: { text: 'Done' } },
          },
        },
        {},
      )
      expect(event?.type).toBe('issue.closed')
      expect(event?.resolution).toBe('completed')
    })

    it('maps update_column_value with completed label → issue.closed', async () => {
      const event = await mondayAdapter.parseWebhook(
        {
          event: {
            type: 'change_column_value',
            pulseId: 333,
            columnType: 'color',
            value: { label: { text: 'Completed' } },
          },
        },
        {},
      )
      expect(event?.type).toBe('issue.closed')
    })

    it('maps non-status column update → issue.updated', async () => {
      const event = await mondayAdapter.parseWebhook(
        {
          event: {
            type: 'update_column_value',
            pulseId: 444,
            columnType: 'text',
            columnId: 'notes',
          },
        },
        {},
      )
      expect(event?.type).toBe('issue.updated')
    })

    it('maps delete_pulse → issue.closed', async () => {
      const event = await mondayAdapter.parseWebhook(
        { event: { type: 'delete_pulse', pulseId: 555 } },
        {},
      )
      expect(event?.type).toBe('issue.closed')
    })

    it('maps archive_pulse → issue.closed', async () => {
      const event = await mondayAdapter.parseWebhook(
        { event: { type: 'archive_pulse', pulseId: 666 } },
        {},
      )
      expect(event?.type).toBe('issue.closed')
    })

    it('maps update_name → issue.updated', async () => {
      const event = await mondayAdapter.parseWebhook(
        { event: { type: 'update_name', pulseId: 777 } },
        {},
      )
      expect(event?.type).toBe('issue.updated')
    })

    it('maps unknown event type → unknown', async () => {
      const event = await mondayAdapter.parseWebhook(
        { event: { type: 'something_else', pulseId: 888 } },
        {},
      )
      expect(event?.type).toBe('unknown')
    })

    it('returns null for challenge/response (challenge handled by route)', async () => {
      const result = await mondayAdapter.parseWebhook(
        { challenge: 'some-random-challenge-token-abc123' },
        {},
      )
      expect(result).toBeNull()
    })

    it('returns null for challenge even when event is also present', async () => {
      const result = await mondayAdapter.parseWebhook(
        {
          challenge: 'challenge-xyz',
          event: { type: 'create_item', itemId: 999 },
        },
        {},
      )
      expect(result).toBeNull()
    })
  })

  // ─── HTTP method tests (mocked Nango) ──────────────────────────────────

  describe('createIssue', () => {
    beforeEach(() => {
      mockNangoPost.mockReset()
    })

    it('sends correct GraphQL mutation and returns externalId + url', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: {
          data: {
            create_item: { id: '67890' },
          },
        },
      })

      const result = await mondayAdapter.createIssue(makeWorkItem(), makeCtx())

      expect(mockNangoPost).toHaveBeenCalledOnce()
      const call = mockNangoPost.mock.calls[0][0]
      expect(call.connectionId).toBe('conn-1')
      expect(call.providerConfigKey).toBe('monday')
      expect(call.endpoint).toBe('/v2')
      expect(call.data.variables.boardId).toBe('board-123')
      expect(call.data.variables.itemName).toBe('Fix the bug')

      expect(result.provider).toBe('monday')
      expect(result.externalId).toBe('67890')
      expect(result.externalUrl).toBe('https://monday.com/boards/board-123/pulses/67890')
      expect(result.metadata).toEqual({ boardId: 'board-123' })
    })

    it('throws PmSyncMappingError when boardId is missing', async () => {
      const ctx = makeCtx({ providerConfig: {} })
      await expect(mondayAdapter.createIssue(makeWorkItem(), ctx)).rejects.toThrow(PmSyncMappingError)
    })

    it('includes date column when work item has dueAt', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { create_item: { id: '111' } } },
      })

      await mondayAdapter.createIssue(makeWorkItem({ dueAt: '2026-04-30T00:00:00Z' }), makeCtx())

      const columnValues = JSON.parse(mockNangoPost.mock.calls[0][0].data.variables.columnValues)
      expect(columnValues.date).toEqual({ date: '2026-04-30' })
    })

    it('sets status column to Working on it for open items', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { create_item: { id: '222' } } },
      })

      await mondayAdapter.createIssue(makeWorkItem({ status: 'open' }), makeCtx())

      const columnValues = JSON.parse(mockNangoPost.mock.calls[0][0].data.variables.columnValues)
      expect(columnValues.status).toEqual({ label: 'Working on it' })
    })
  })

  describe('updateIssue', () => {
    beforeEach(() => {
      mockNangoPost.mockReset()
    })

    it('sends correct mutation for title change', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { change_simple_column_value: { id: '12345' } } },
      })

      await mondayAdapter.updateIssue(makeRef(), { title: 'New title' }, makeCtx())

      expect(mockNangoPost).toHaveBeenCalledOnce()
      const vars = mockNangoPost.mock.calls[0][0].data.variables
      expect(vars.boardId).toBe('board-123')
      expect(vars.itemId).toBe('12345')
      expect(vars.columnId).toBe('name')
      expect(vars.value).toBe(JSON.stringify('New title'))
    })

    it('sends correct mutation for dueAt change', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { change_simple_column_value: { id: '12345' } } },
      })

      await mondayAdapter.updateIssue(makeRef(), { dueAt: '2026-05-15T00:00:00Z' }, makeCtx())

      const vars = mockNangoPost.mock.calls[0][0].data.variables
      expect(vars.columnId).toBe('date')
      expect(vars.value).toBe(JSON.stringify({ date: '2026-05-15' }))
    })

    it('throws PmSyncMappingError when boardId is missing', async () => {
      const ref = makeRef({ metadata: undefined })
      const ctx = makeCtx({ providerConfig: {} })
      await expect(mondayAdapter.updateIssue(ref, { title: 'x' }, ctx)).rejects.toThrow(PmSyncMappingError)
    })
  })

  describe('closeIssue', () => {
    beforeEach(() => {
      mockNangoPost.mockReset()
    })

    it('sets status to Done for completed resolution', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { change_simple_column_value: { id: '12345' } } },
      })

      await mondayAdapter.closeIssue(makeRef(), 'completed', makeCtx())

      expect(mockNangoPost).toHaveBeenCalledOnce()
      const vars = mockNangoPost.mock.calls[0][0].data.variables
      expect(vars.columnId).toBe('status')
      const label = JSON.parse(vars.value).label
      expect(label).toBe('Done')
    })

    it('sets status to Done for cancelled resolution (default fallback)', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { change_simple_column_value: { id: '12345' } } },
      })

      await mondayAdapter.closeIssue(makeRef(), 'cancelled', makeCtx())

      const vars = mockNangoPost.mock.calls[0][0].data.variables
      const label = JSON.parse(vars.value).label
      expect(label).toBe('Done')
    })

    it('uses configured statusLabels for cancelled', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { change_simple_column_value: { id: '12345' } } },
      })

      const ctx = makeCtx({
        providerConfig: {
          boardId: 'board-123',
          statusColumnId: 'status',
          statusLabels: { cancelled: 'Stuck', done: 'Complete' },
        },
      })
      await mondayAdapter.closeIssue(makeRef(), 'cancelled', ctx)

      const vars = mockNangoPost.mock.calls[0][0].data.variables
      const label = JSON.parse(vars.value).label
      expect(label).toBe('Stuck')
    })

    it('throws PmSyncMappingError when boardId is missing', async () => {
      const ref = makeRef({ metadata: undefined })
      const ctx = makeCtx({ providerConfig: {} })
      await expect(mondayAdapter.closeIssue(ref, 'completed', ctx)).rejects.toThrow(PmSyncMappingError)
    })
  })

  describe('fetchStatus', () => {
    beforeEach(() => {
      mockNangoPost.mockReset()
    })

    it('returns closed=true when status matches done label', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: {
          data: {
            items: [{
              id: '12345',
              state: 'active',
              column_values: [
                { id: 'status', text: 'Done', type: 'color' },
              ],
            }],
          },
        },
      })

      const result = await mondayAdapter.fetchStatus(makeRef(), makeCtx())

      expect(result).toEqual({ externalStatus: 'Done', closed: true })
    })

    it('returns closed=false when status does not match done labels', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: {
          data: {
            items: [{
              id: '12345',
              state: 'active',
              column_values: [
                { id: 'status', text: 'Working on it', type: 'color' },
              ],
            }],
          },
        },
      })

      const result = await mondayAdapter.fetchStatus(makeRef(), makeCtx())

      expect(result).toEqual({ externalStatus: 'Working on it', closed: false })
    })

    it('returns closed=true for archived items', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: {
          data: {
            items: [{
              id: '12345',
              state: 'archived',
              column_values: [],
            }],
          },
        },
      })

      const result = await mondayAdapter.fetchStatus(makeRef(), makeCtx())

      expect(result).toEqual({ externalStatus: 'archived', closed: true })
    })

    it('returns null when item is not found', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { items: [] } },
      })

      const result = await mondayAdapter.fetchStatus(makeRef(), makeCtx())
      expect(result).toBeNull()
    })

    it('returns null for non-numeric external id', async () => {
      const ref = makeRef({ externalId: 'not-a-number' })
      const result = await mondayAdapter.fetchStatus(ref, makeCtx())
      expect(result).toBeNull()
    })
  })
})
