/**
 * Asana Adapter — worker-side unit tests.
 *
 * Covers the pure-function surface: webhook signature verification,
 * webhook payload parsing, registry registration, plus HTTP method tests
 * for createIssue, updateIssue, closeIssue, fetchStatus with mocked Nango.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createHmac } from 'crypto'
import { asanaAdapter } from '../asana-adapter.js'
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
    providerConfigKey: 'asana',
    providerConfig: { projectGid: 'proj-123' },
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
    provider: 'asana',
    externalId: 'task-gid-1',
    externalUrl: 'https://app.asana.com/task/task-gid-1',
    ...overrides,
  }
}

function hmacBase64(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64')
}

describe('asanaAdapter', () => {
  describe('provider identity + registration', () => {
    beforeEach(() => {
      __resetRegistryForTests()
    })

    it('exposes provider = "asana"', () => {
      expect(asanaAdapter.provider).toBe('asana')
    })

    it('barrel import registers with the worker registry', async () => {
      await import('../index.js')
      expect(getAdapter('asana')).toBe(asanaAdapter)
    })

    it('registerAdapter() is idempotent', () => {
      registerAdapter(asanaAdapter)
      registerAdapter(asanaAdapter)
      expect(getAdapter('asana')).toBe(asanaAdapter)
    })
  })

  describe('verifySignature', () => {
    const secret = 'test-asana-secret'
    const body = JSON.stringify({ events: [{ action: 'changed' }] })

    it('returns true for a valid HMAC-SHA256 base64 signature', () => {
      const sig = hmacBase64(secret, body)
      expect(
        asanaAdapter.verifySignature(body, { 'x-hook-signature': sig }, secret),
      ).toBe(true)
    })

    it('returns false for an invalid signature', () => {
      expect(
        asanaAdapter.verifySignature(body, { 'x-hook-signature': 'bad' }, secret),
      ).toBe(false)
    })

    it('returns false when the signature header is missing', () => {
      expect(asanaAdapter.verifySignature(body, {}, secret)).toBe(false)
    })

    it('returns false when the secret is empty', () => {
      expect(
        asanaAdapter.verifySignature(body, { 'x-hook-signature': 'anything' }, ''),
      ).toBe(false)
    })

    it('returns false when body has been tampered with', () => {
      const sig = hmacBase64(secret, body)
      expect(
        asanaAdapter.verifySignature(body + 'x', { 'x-hook-signature': sig }, secret),
      ).toBe(false)
    })
  })

  describe('parseWebhook', () => {
    it('returns null for non-object payloads', async () => {
      expect(await asanaAdapter.parseWebhook(null, {})).toBeNull()
      expect(await asanaAdapter.parseWebhook('string', {})).toBeNull()
      expect(await asanaAdapter.parseWebhook(42, {})).toBeNull()
    })

    it('returns null when events array is empty', async () => {
      expect(await asanaAdapter.parseWebhook({ events: [] }, {})).toBeNull()
    })

    it('returns null when events is not an array', async () => {
      expect(await asanaAdapter.parseWebhook({ events: 'not-array' }, {})).toBeNull()
    })

    it('skips non-task events', async () => {
      const result = await asanaAdapter.parseWebhook(
        { events: [{ resource_type: 'project', action: 'changed', resource: { gid: '1' } }] },
        {},
      )
      expect(result).toBeNull()
    })

    it('maps action=added → issue.created', async () => {
      const event = await asanaAdapter.parseWebhook(
        {
          events: [{
            resource_type: 'task',
            action: 'added',
            resource: { gid: 'task-1' },
            user: { gid: 'user-1' },
            created_at: '2026-04-08T12:00:00Z',
          }],
        },
        {},
      )
      expect(event).not.toBeNull()
      expect(event?.type).toBe('issue.created')
      expect(event?.provider).toBe('asana')
      expect(event?.externalId).toBe('task-1')
      expect(event?.actorId).toBe('user-1')
      expect(event?.occurredAt).toBe('2026-04-08T12:00:00Z')
    })

    it('maps action=changed with completed field → issue.closed', async () => {
      const event = await asanaAdapter.parseWebhook(
        {
          events: [{
            resource_type: 'task',
            action: 'changed',
            resource: { gid: 'task-2' },
            change: { field: 'completed', new_value: true },
          }],
        },
        {},
      )
      expect(event?.type).toBe('issue.closed')
      expect(event?.resolution).toBe('completed')
    })

    it('maps action=changed with completed=false → issue.reopened', async () => {
      const event = await asanaAdapter.parseWebhook(
        {
          events: [{
            resource_type: 'task',
            action: 'changed',
            resource: { gid: 'task-3' },
            change: { field: 'completed', new_value: false },
          }],
        },
        {},
      )
      expect(event?.type).toBe('issue.reopened')
    })

    it('maps action=changed with non-completed field → issue.updated', async () => {
      const event = await asanaAdapter.parseWebhook(
        {
          events: [{
            resource_type: 'task',
            action: 'changed',
            resource: { gid: 'task-4' },
            change: { field: 'name' },
          }],
        },
        {},
      )
      expect(event?.type).toBe('issue.updated')
    })

    it('maps action=removed → issue.closed', async () => {
      const event = await asanaAdapter.parseWebhook(
        {
          events: [{
            resource_type: 'task',
            action: 'removed',
            resource: { gid: 'task-5' },
          }],
        },
        {},
      )
      expect(event?.type).toBe('issue.closed')
    })

    it('processes only the first relevant task event', async () => {
      const event = await asanaAdapter.parseWebhook(
        {
          events: [
            { resource_type: 'project', action: 'changed', resource: { gid: 'proj-1' } },
            { resource_type: 'task', action: 'added', resource: { gid: 'first-task' } },
            { resource_type: 'task', action: 'changed', resource: { gid: 'second-task' } },
          ],
        },
        {},
      )
      expect(event?.externalId).toBe('first-task')
    })

    it('skips events with missing resource gid', async () => {
      const result = await asanaAdapter.parseWebhook(
        { events: [{ resource_type: 'task', action: 'added', resource: {} }] },
        {},
      )
      expect(result).toBeNull()
    })
  })

  // ─── HTTP method tests (mocked Nango) ──────────────────────────────────

  describe('createIssue', () => {
    beforeEach(() => {
      mockNangoPost.mockReset()
      mockNangoGet.mockReset()
      mockNangoPut.mockReset()
    })

    it('sends correct POST to /tasks and returns externalId + url', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: {
          data: {
            gid: 'asana-task-99',
            permalink_url: 'https://app.asana.com/0/proj-123/asana-task-99',
          },
        },
      })

      const result = await asanaAdapter.createIssue(makeWorkItem(), makeCtx())

      expect(mockNangoPost).toHaveBeenCalledOnce()
      const call = mockNangoPost.mock.calls[0][0]
      expect(call.connectionId).toBe('conn-1')
      expect(call.providerConfigKey).toBe('asana')
      expect(call.endpoint).toBe('/tasks')
      expect(call.data.data.name).toBe('Fix the bug')
      expect(call.data.data.projects).toEqual(['proj-123'])

      expect(result.provider).toBe('asana')
      expect(result.externalId).toBe('asana-task-99')
      expect(result.externalUrl).toBe('https://app.asana.com/0/proj-123/asana-task-99')
      expect(result.metadata).toEqual({ projectGid: 'proj-123' })
    })

    it('throws PmSyncMappingError when projectGid is missing', async () => {
      const ctx = makeCtx({ providerConfig: {} })
      await expect(asanaAdapter.createIssue(makeWorkItem(), ctx)).rejects.toThrow(PmSyncMappingError)
    })

    it('includes due_on when work item has dueAt', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: {
          data: { gid: 't-2', permalink_url: 'https://app.asana.com/t-2' },
        },
      })

      await asanaAdapter.createIssue(makeWorkItem({ dueAt: '2026-04-30T00:00:00Z' }), makeCtx())

      const taskData = mockNangoPost.mock.calls[0][0].data.data
      expect(taskData.due_on).toBe('2026-04-30')
    })
  })

  describe('updateIssue', () => {
    beforeEach(() => {
      mockNangoPut.mockReset()
    })

    it('sends correct PUT for title change', async () => {
      mockNangoPut.mockResolvedValueOnce({ data: { data: {} } })

      await asanaAdapter.updateIssue(makeRef(), { title: 'New title' }, makeCtx())

      expect(mockNangoPut).toHaveBeenCalledOnce()
      const call = mockNangoPut.mock.calls[0][0]
      expect(call.endpoint).toBe('/tasks/task-gid-1')
      expect(call.data.data.name).toBe('New title')
    })

    it('sends correct PUT for description change', async () => {
      mockNangoPut.mockResolvedValueOnce({ data: { data: {} } })

      await asanaAdapter.updateIssue(makeRef(), { description: 'New desc' }, makeCtx())

      const data = mockNangoPut.mock.calls[0][0].data.data
      expect(data.notes).toBe('New desc')
    })

    it('skips API call when patch is empty', async () => {
      await asanaAdapter.updateIssue(makeRef(), {}, makeCtx())
      expect(mockNangoPut).not.toHaveBeenCalled()
    })
  })

  describe('closeIssue', () => {
    beforeEach(() => {
      mockNangoPut.mockReset()
    })

    it('marks task as completed', async () => {
      mockNangoPut.mockResolvedValueOnce({ data: { data: {} } })

      await asanaAdapter.closeIssue(makeRef(), 'completed', makeCtx())

      expect(mockNangoPut).toHaveBeenCalledOnce()
      const call = mockNangoPut.mock.calls[0][0]
      expect(call.endpoint).toBe('/tasks/task-gid-1')
      expect(call.data.data.completed).toBe(true)
    })
  })

  describe('fetchStatus', () => {
    beforeEach(() => {
      mockNangoGet.mockReset()
    })

    it('returns closed=true for completed task', async () => {
      mockNangoGet.mockResolvedValueOnce({
        data: {
          data: {
            gid: 'task-gid-1',
            completed: true,
            completed_at: '2026-04-08T00:00:00Z',
          },
        },
      })

      const result = await asanaAdapter.fetchStatus(makeRef(), makeCtx())

      expect(result).toEqual({ externalStatus: 'completed', closed: true })
    })

    it('returns closed=false for active task', async () => {
      mockNangoGet.mockResolvedValueOnce({
        data: {
          data: {
            gid: 'task-gid-1',
            completed: false,
            completed_at: null,
          },
        },
      })

      const result = await asanaAdapter.fetchStatus(makeRef(), makeCtx())

      expect(result).toEqual({ externalStatus: 'active', closed: false })
    })

    it('returns null when task is not found', async () => {
      mockNangoGet.mockResolvedValueOnce({
        data: { data: null },
      })

      const result = await asanaAdapter.fetchStatus(makeRef(), makeCtx())
      expect(result).toBeNull()
    })
  })
})
