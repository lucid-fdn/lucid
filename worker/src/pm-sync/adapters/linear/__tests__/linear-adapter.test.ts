/**
 * Linear Adapter — worker-side unit tests.
 *
 * Covers the pure-function surface of the adapter: webhook signature
 * verification and webhook payload parsing, plus HTTP method tests for
 * createIssue, updateIssue, closeIssue, fetchStatus with mocked Nango.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createHmac } from 'crypto'
import { linearAdapter } from '../linear-adapter.js'
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
    providerConfigKey: 'linear',
    providerConfig: { teamId: 'team-abc', doneStateId: 'state-done', cancelledStateId: 'state-cancelled' },
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
    provider: 'linear',
    externalId: 'ext-1',
    externalUrl: 'https://linear.app/issue/EXT-1',
    ...overrides,
  }
}

function hmacHex(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

describe('linearAdapter', () => {
  describe('provider identity + registration', () => {
    beforeEach(() => {
      __resetRegistryForTests()
    })

    it('exposes provider = "linear"', () => {
      expect(linearAdapter.provider).toBe('linear')
    })

    it('barrel import registers with the worker registry', async () => {
      await import('../index.js')
      expect(getAdapter('linear')).toBe(linearAdapter)
    })

    it('registerAdapter() is idempotent', () => {
      registerAdapter(linearAdapter)
      registerAdapter(linearAdapter)
      expect(getAdapter('linear')).toBe(linearAdapter)
    })
  })

  describe('verifySignature', () => {
    const secret = 'test-linear-secret'
    const body = JSON.stringify({ action: 'create', type: 'Issue' })

    it('returns true for a valid HMAC-SHA256 hex signature', () => {
      const sig = hmacHex(secret, body)
      expect(
        linearAdapter.verifySignature(body, { 'linear-signature': sig }, secret),
      ).toBe(true)
    })

    it('accepts the mixed-case header variant', () => {
      const sig = hmacHex(secret, body)
      expect(
        linearAdapter.verifySignature(body, { 'Linear-Signature': sig }, secret),
      ).toBe(true)
    })

    it('returns false for an invalid signature', () => {
      expect(
        linearAdapter.verifySignature(
          body,
          { 'linear-signature': 'deadbeef' },
          secret,
        ),
      ).toBe(false)
    })

    it('returns false when the signature header is missing', () => {
      expect(linearAdapter.verifySignature(body, {}, secret)).toBe(false)
    })

    it('returns false when the secret is empty', () => {
      const sig = hmacHex(secret, body)
      expect(
        linearAdapter.verifySignature(body, { 'linear-signature': sig }, ''),
      ).toBe(false)
    })

    it('returns false when the body has been tampered with', () => {
      const sig = hmacHex(secret, body)
      expect(
        linearAdapter.verifySignature(
          body + 'x',
          { 'linear-signature': sig },
          secret,
        ),
      ).toBe(false)
    })
  })

  describe('parseWebhook', () => {
    it('returns null for non-Issue events', async () => {
      const result = await linearAdapter.parseWebhook(
        { type: 'Comment', action: 'create', data: { id: 'c-1' } },
        {},
      )
      expect(result).toBeNull()
    })

    it('returns null when data.id is missing', async () => {
      const result = await linearAdapter.parseWebhook(
        { type: 'Issue', action: 'create', data: {} },
        {},
      )
      expect(result).toBeNull()
    })

    it('maps action=create → issue.created', async () => {
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'create',
          createdAt: '2026-04-08T12:00:00Z',
          actor: { id: 'user-1' },
          data: {
            id: 'iss-1',
            title: 'New bug',
            description: 'repro steps',
            priority: 2,
            state: { type: 'unstarted' },
          },
        },
        {},
      )
      expect(event).not.toBeNull()
      expect(event?.type).toBe('issue.created')
      expect(event?.provider).toBe('linear')
      expect(event?.externalId).toBe('iss-1')
      expect(event?.actorId).toBe('user-1')
      expect(event?.occurredAt).toBe('2026-04-08T12:00:00Z')
      expect(event?.patch?.title).toBe('New bug')
      expect(event?.patch?.priority).toBe('high') // Linear 2 → high
      expect(event?.isEcho).toBe(false)
    })

    it('maps action=update with unchanged state → issue.updated', async () => {
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'update',
          data: {
            id: 'iss-2',
            title: 'Updated title',
            state: { type: 'started' },
          },
          updatedFrom: { state: { type: 'started' } },
        },
        {},
      )
      expect(event?.type).toBe('issue.updated')
    })

    it('maps update with state → completed as issue.closed with completed resolution', async () => {
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'update',
          data: {
            id: 'iss-3',
            state: { type: 'completed' },
          },
          updatedFrom: { state: { type: 'started' } },
        },
        {},
      )
      expect(event?.type).toBe('issue.closed')
      expect(event?.resolution).toBe('completed')
    })

    it('maps update with state → canceled as issue.closed with cancelled resolution', async () => {
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'update',
          data: {
            id: 'iss-4',
            state: { type: 'canceled' },
          },
          updatedFrom: { state: { type: 'started' } },
        },
        {},
      )
      expect(event?.type).toBe('issue.closed')
      expect(event?.resolution).toBe('cancelled')
    })

    it('maps update leaving a completed state → issue.reopened', async () => {
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'update',
          data: {
            id: 'iss-5',
            state: { type: 'started' },
          },
          updatedFrom: { state: { type: 'completed' } },
        },
        {},
      )
      expect(event?.type).toBe('issue.reopened')
    })

    it('maps action=remove → issue.closed', async () => {
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'remove',
          data: { id: 'iss-6' },
        },
        {},
      )
      expect(event?.type).toBe('issue.closed')
    })

    it('flags an update carrying the Lucid marker as an echo', async () => {
      const wiId = '00000000-0000-4000-8000-000000000000'
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'update',
          data: {
            id: 'iss-7',
            description: `<!-- lucid-work-item: ${wiId} -->\n\nbody`,
            state: { type: 'started' },
          },
          updatedFrom: { state: { type: 'started' } },
        },
        {},
      )
      expect(event?.type).toBe('issue.updated')
      expect(event?.isEcho).toBe(true)
    })

    it('does NOT flag a create carrying the marker as an echo', async () => {
      const wiId = '00000000-0000-4000-8000-000000000000'
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'create',
          data: {
            id: 'iss-8',
            description: `<!-- lucid-work-item: ${wiId} -->\n\nbody`,
            state: { type: 'unstarted' },
          },
        },
        {},
      )
      expect(event?.type).toBe('issue.created')
      expect(event?.isEcho).toBe(false)
    })

    it('maps all Linear priority integers to Lucid priorities', async () => {
      const cases: Array<[number, 'critical' | 'high' | 'normal' | 'low']> = [
        [0, 'normal'],
        [1, 'critical'],
        [2, 'high'],
        [3, 'normal'],
        [4, 'low'],
      ]
      for (const [linearPriority, expected] of cases) {
        const event = await linearAdapter.parseWebhook(
          {
            type: 'Issue',
            action: 'update',
            data: {
              id: `iss-p-${linearPriority}`,
              priority: linearPriority,
              state: { type: 'started' },
            },
            updatedFrom: { state: { type: 'started' } },
          },
          {},
        )
        expect(event?.patch?.priority).toBe(expected)
      }
    })

    it('carries dueDate through as patch.dueAt', async () => {
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'update',
          data: {
            id: 'iss-9',
            dueDate: '2026-04-30',
            state: { type: 'started' },
          },
          updatedFrom: { state: { type: 'started' } },
        },
        {},
      )
      expect(event?.patch?.dueAt).toBe('2026-04-30')
    })

    it('omits patch entirely when no mappable fields are present', async () => {
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'update',
          data: {
            id: 'iss-10',
            state: { type: 'started' },
          },
          updatedFrom: { state: { type: 'started' } },
        },
        {},
      )
      expect(event?.patch).toBeUndefined()
    })

    it('returns null for non-object payloads', async () => {
      expect(await linearAdapter.parseWebhook(null, {})).toBeNull()
      expect(await linearAdapter.parseWebhook('string', {})).toBeNull()
      expect(await linearAdapter.parseWebhook(42, {})).toBeNull()
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
            issueCreate: {
              success: true,
              issue: { id: 'lin-123', identifier: 'ENG-42', url: 'https://linear.app/issue/ENG-42' },
            },
          },
        },
      })

      const result = await linearAdapter.createIssue(makeWorkItem(), makeCtx())

      expect(mockNangoPost).toHaveBeenCalledOnce()
      const call = mockNangoPost.mock.calls[0][0]
      expect(call.connectionId).toBe('conn-1')
      expect(call.providerConfigKey).toBe('linear')
      expect(call.endpoint).toBe('/graphql')
      expect(call.data.variables.input.teamId).toBe('team-abc')
      expect(call.data.variables.input.title).toBe('Fix the bug')
      expect(call.data.variables.input.priority).toBe(2) // high → 2

      expect(result.provider).toBe('linear')
      expect(result.externalId).toBe('lin-123')
      expect(result.externalUrl).toBe('https://linear.app/issue/ENG-42')
      expect(result.metadata).toEqual({ identifier: 'ENG-42', teamId: 'team-abc' })
    })

    it('throws PmSyncMappingError when teamId is missing', async () => {
      const ctx = makeCtx({ providerConfig: {} })
      await expect(linearAdapter.createIssue(makeWorkItem(), ctx)).rejects.toThrow(PmSyncMappingError)
    })

    it('includes dueDate when work item has dueAt', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: {
          data: {
            issueCreate: {
              success: true,
              issue: { id: 'lin-2', identifier: 'ENG-2', url: 'https://linear.app/issue/ENG-2' },
            },
          },
        },
      })

      await linearAdapter.createIssue(makeWorkItem({ dueAt: '2026-04-30T00:00:00Z' }), makeCtx())

      const input = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(input.dueDate).toBe('2026-04-30')
    })
  })

  describe('updateIssue', () => {
    beforeEach(() => {
      mockNangoPost.mockReset()
    })

    it('sends correct mutation for title change', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { issueUpdate: { success: true } } },
      })

      await linearAdapter.updateIssue(makeRef(), { title: 'New title' }, makeCtx())

      expect(mockNangoPost).toHaveBeenCalledOnce()
      const vars = mockNangoPost.mock.calls[0][0].data.variables
      expect(vars.id).toBe('ext-1')
      expect(vars.input.title).toBe('New title')
    })

    it('sends correct mutation for description + priority changes', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { issueUpdate: { success: true } } },
      })

      await linearAdapter.updateIssue(makeRef(), { description: 'New desc', priority: 'critical' }, makeCtx())

      const input = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(input.description).toBe('New desc')
      expect(input.priority).toBe(1) // critical → 1
    })

    it('skips API call when patch is empty', async () => {
      await linearAdapter.updateIssue(makeRef(), {}, makeCtx())
      expect(mockNangoPost).not.toHaveBeenCalled()
    })
  })

  describe('closeIssue', () => {
    beforeEach(() => {
      mockNangoPost.mockReset()
    })

    it('moves to doneStateId for completed resolution', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { issueUpdate: { success: true } } },
      })

      await linearAdapter.closeIssue(makeRef(), 'completed', makeCtx())

      const input = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(input.stateId).toBe('state-done')
    })

    it('moves to cancelledStateId for cancelled resolution', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { issueUpdate: { success: true } } },
      })

      await linearAdapter.closeIssue(makeRef(), 'cancelled', makeCtx())

      const input = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(input.stateId).toBe('state-cancelled')
    })

    it('throws PmSyncMappingError when doneStateId is missing', async () => {
      const ctx = makeCtx({ providerConfig: { teamId: 'team-abc' } })
      await expect(linearAdapter.closeIssue(makeRef(), 'completed', ctx)).rejects.toThrow(PmSyncMappingError)
    })
  })

  describe('fetchStatus', () => {
    beforeEach(() => {
      mockNangoPost.mockReset()
    })

    it('returns correct mapped status for completed state', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: {
          data: {
            issue: {
              id: 'ext-1',
              state: { id: 's1', name: 'Done', type: 'completed' },
              completedAt: '2026-04-08T00:00:00Z',
              canceledAt: null,
            },
          },
        },
      })

      const result = await linearAdapter.fetchStatus(makeRef(), makeCtx())

      expect(result).toEqual({ externalStatus: 'completed', closed: true })
    })

    it('returns correct mapped status for started state (open)', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: {
          data: {
            issue: {
              id: 'ext-1',
              state: { id: 's2', name: 'In Progress', type: 'started' },
              completedAt: null,
              canceledAt: null,
            },
          },
        },
      })

      const result = await linearAdapter.fetchStatus(makeRef(), makeCtx())

      expect(result).toEqual({ externalStatus: 'started', closed: false })
    })

    it('returns null when issue is not found', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { issue: null } },
      })

      const result = await linearAdapter.fetchStatus(makeRef(), makeCtx())
      expect(result).toBeNull()
    })
  })
})
