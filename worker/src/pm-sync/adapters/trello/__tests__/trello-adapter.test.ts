/**
 * Trello Adapter — worker-side unit tests.
 *
 * Covers the pure-function surface: webhook signature verification,
 * webhook payload parsing, registry registration, plus HTTP method tests
 * for createIssue, updateIssue, closeIssue, fetchStatus with mocked Nango.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createHmac } from 'crypto'
import { trelloAdapter } from '../trello-adapter.js'
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
const mockNangoPut = vi.fn()

vi.mock('../../../nango-helpers.js', () => ({
  requireNangoClient: () => ({
    post: mockNangoPost,
    get: mockNangoGet,
    put: mockNangoPut,
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
    providerConfigKey: 'trello',
    providerConfig: { listId: 'list-abc' },
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
    provider: 'trello',
    externalId: 'card-1',
    externalUrl: 'https://trello.com/c/card-1',
    ...overrides,
  }
}

function hmacSha1Base64(secret: string, body: string): string {
  return createHmac('sha1', secret).update(body, 'utf8').digest('base64')
}

describe('trelloAdapter', () => {
  describe('provider identity + registration', () => {
    beforeEach(() => {
      __resetRegistryForTests()
    })

    it('exposes provider = "trello"', () => {
      expect(trelloAdapter.provider).toBe('trello')
    })

    it('barrel import registers with the worker registry', async () => {
      await import('../index.js')
      expect(getAdapter('trello')).toBe(trelloAdapter)
    })

    it('registerAdapter() is idempotent', () => {
      registerAdapter(trelloAdapter)
      registerAdapter(trelloAdapter)
      expect(getAdapter('trello')).toBe(trelloAdapter)
    })
  })

  describe('verifySignature', () => {
    const secret = 'test-trello-secret'
    const body = JSON.stringify({ action: { type: 'createCard' } })
    const callbackUrl = 'https://example.com/webhook/trello'

    it('returns true for a valid HMAC-SHA1 base64 signature over body+callbackURL', () => {
      const sig = hmacSha1Base64(secret, body + callbackUrl)
      expect(
        trelloAdapter.verifySignature(
          body,
          { 'x-trello-webhook': sig, 'x-trello-callback-url': callbackUrl },
          secret,
        ),
      ).toBe(true)
    })

    it('returns false for an invalid signature', () => {
      expect(
        trelloAdapter.verifySignature(
          body,
          { 'x-trello-webhook': 'bad', 'x-trello-callback-url': callbackUrl },
          secret,
        ),
      ).toBe(false)
    })

    it('returns false when the signature header is missing', () => {
      expect(trelloAdapter.verifySignature(body, {}, secret)).toBe(false)
    })

    it('returns false when the secret is empty', () => {
      expect(
        trelloAdapter.verifySignature(body, { 'x-trello-webhook': 'anything' }, ''),
      ).toBe(false)
    })

    it('uses empty string when callback URL header is absent', () => {
      const sig = hmacSha1Base64(secret, body + '')
      expect(
        trelloAdapter.verifySignature(body, { 'x-trello-webhook': sig }, secret),
      ).toBe(true)
    })
  })

  describe('parseWebhook', () => {
    it('returns null for non-object payloads', async () => {
      expect(await trelloAdapter.parseWebhook(null, {})).toBeNull()
      expect(await trelloAdapter.parseWebhook('string', {})).toBeNull()
    })

    it('returns null when action is missing', async () => {
      expect(await trelloAdapter.parseWebhook({}, {})).toBeNull()
    })

    it('returns null when card id is missing', async () => {
      const result = await trelloAdapter.parseWebhook(
        { action: { type: 'createCard', data: { card: {} } } },
        {},
      )
      expect(result).toBeNull()
    })

    it('maps createCard → issue.created', async () => {
      const event = await trelloAdapter.parseWebhook(
        {
          action: {
            type: 'createCard',
            data: { card: { id: 'card-1' } },
            memberCreator: { id: 'member-1' },
            date: '2026-04-08T12:00:00Z',
          },
        },
        {},
      )
      expect(event).not.toBeNull()
      expect(event?.type).toBe('issue.created')
      expect(event?.provider).toBe('trello')
      expect(event?.externalId).toBe('card-1')
      expect(event?.actorId).toBe('member-1')
      expect(event?.occurredAt).toBe('2026-04-08T12:00:00Z')
    })

    it('maps updateCard with closed=true → issue.closed', async () => {
      const event = await trelloAdapter.parseWebhook(
        {
          action: {
            type: 'updateCard',
            data: { card: { id: 'card-2', closed: true }, old: { closed: false } },
          },
        },
        {},
      )
      expect(event?.type).toBe('issue.closed')
      expect(event?.resolution).toBe('completed')
    })

    it('maps updateCard with closed=false → issue.reopened', async () => {
      const event = await trelloAdapter.parseWebhook(
        {
          action: {
            type: 'updateCard',
            data: { card: { id: 'card-3', closed: false }, old: { closed: true } },
          },
        },
        {},
      )
      expect(event?.type).toBe('issue.reopened')
    })

    it('maps updateCard without closed change → issue.updated', async () => {
      const event = await trelloAdapter.parseWebhook(
        {
          action: {
            type: 'updateCard',
            data: { card: { id: 'card-4' }, old: { name: 'old name' } },
          },
        },
        {},
      )
      expect(event?.type).toBe('issue.updated')
    })

    it('maps deleteCard → issue.closed', async () => {
      const event = await trelloAdapter.parseWebhook(
        {
          action: {
            type: 'deleteCard',
            data: { card: { id: 'card-5' } },
          },
        },
        {},
      )
      expect(event?.type).toBe('issue.closed')
    })
  })

  // ─── HTTP method tests (mocked Nango) ──────────────────────────────────

  describe('createIssue', () => {
    beforeEach(() => {
      mockNangoPost.mockReset()
      mockNangoGet.mockReset()
      mockNangoPut.mockReset()
    })

    it('sends correct POST to /1/cards and returns externalId + url', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { id: 'trello-card-99', shortUrl: 'https://trello.com/c/trello-card-99' },
      })

      const result = await trelloAdapter.createIssue(makeWorkItem(), makeCtx())

      expect(mockNangoPost).toHaveBeenCalledOnce()
      const call = mockNangoPost.mock.calls[0][0]
      expect(call.connectionId).toBe('conn-1')
      expect(call.providerConfigKey).toBe('trello')
      expect(call.endpoint).toBe('/1/cards')
      expect(call.data.name).toBe('Fix the bug')
      expect(call.data.idList).toBe('list-abc')
      expect(call.data.pos).toBe('bottom')

      expect(result.provider).toBe('trello')
      expect(result.externalId).toBe('trello-card-99')
      expect(result.externalUrl).toBe('https://trello.com/c/trello-card-99')
      expect(result.metadata).toEqual({ listId: 'list-abc' })
    })

    it('throws PmSyncMappingError when listId is missing', async () => {
      const ctx = makeCtx({ providerConfig: {} })
      await expect(trelloAdapter.createIssue(makeWorkItem(), ctx)).rejects.toThrow(PmSyncMappingError)
    })

    it('includes due when work item has dueAt', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { id: 'c-2', shortUrl: 'https://trello.com/c/c-2' },
      })

      await trelloAdapter.createIssue(makeWorkItem({ dueAt: '2026-04-30T00:00:00Z' }), makeCtx())

      const cardData = mockNangoPost.mock.calls[0][0].data
      expect(cardData.due).toBe('2026-04-30T00:00:00Z')
    })
  })

  describe('updateIssue', () => {
    beforeEach(() => {
      mockNangoPut.mockReset()
    })

    it('sends correct PUT for title change', async () => {
      mockNangoPut.mockResolvedValueOnce({ data: {} })

      await trelloAdapter.updateIssue(makeRef(), { title: 'New title' }, makeCtx())

      expect(mockNangoPut).toHaveBeenCalledOnce()
      const call = mockNangoPut.mock.calls[0][0]
      expect(call.endpoint).toBe('/1/cards/card-1')
      expect(call.data.name).toBe('New title')
    })

    it('sends correct PUT for description change', async () => {
      mockNangoPut.mockResolvedValueOnce({ data: {} })

      await trelloAdapter.updateIssue(makeRef(), { description: 'New desc' }, makeCtx())

      const data = mockNangoPut.mock.calls[0][0].data
      expect(data.desc).toBe('New desc')
    })

    it('skips API call when patch is empty', async () => {
      await trelloAdapter.updateIssue(makeRef(), {}, makeCtx())
      expect(mockNangoPut).not.toHaveBeenCalled()
    })
  })

  describe('closeIssue', () => {
    beforeEach(() => {
      mockNangoPut.mockReset()
    })

    it('archives the card with closed=true', async () => {
      mockNangoPut.mockResolvedValueOnce({ data: {} })

      await trelloAdapter.closeIssue(makeRef(), 'completed', makeCtx())

      expect(mockNangoPut).toHaveBeenCalledOnce()
      const call = mockNangoPut.mock.calls[0][0]
      expect(call.endpoint).toBe('/1/cards/card-1')
      expect(call.data.closed).toBe(true)
    })

    it('moves to doneListId when configured', async () => {
      mockNangoPut.mockResolvedValueOnce({ data: {} })

      const ctx = makeCtx({ providerConfig: { listId: 'list-abc', doneListId: 'list-done' } })
      await trelloAdapter.closeIssue(makeRef(), 'completed', ctx)

      const data = mockNangoPut.mock.calls[0][0].data
      expect(data.closed).toBe(true)
      expect(data.idList).toBe('list-done')
    })
  })

  describe('fetchStatus', () => {
    beforeEach(() => {
      mockNangoGet.mockReset()
    })

    it('returns closed=true for archived card', async () => {
      mockNangoGet.mockResolvedValueOnce({
        data: { id: 'card-1', closed: true },
      })

      const result = await trelloAdapter.fetchStatus(makeRef(), makeCtx())

      expect(result).toEqual({ externalStatus: 'archived', closed: true })
    })

    it('returns closed=false for active card', async () => {
      mockNangoGet.mockResolvedValueOnce({
        data: { id: 'card-1', closed: false },
      })

      const result = await trelloAdapter.fetchStatus(makeRef(), makeCtx())

      expect(result).toEqual({ externalStatus: 'active', closed: false })
    })

    it('returns null when card is not found', async () => {
      mockNangoGet.mockResolvedValueOnce({ data: null })

      const result = await trelloAdapter.fetchStatus(makeRef(), makeCtx())
      expect(result).toBeNull()
    })
  })
})
