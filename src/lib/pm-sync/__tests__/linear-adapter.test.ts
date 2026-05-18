/**
 * Linear Adapter — control-plane unit tests.
 *
 * Mirrors the worker-side test in
 * `worker/src/pm-sync/adapters/linear/__tests__/linear-adapter.test.ts`
 * to guarantee both copies of the parse/verify logic stay byte-equivalent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createHmac } from 'crypto'

vi.mock('server-only', () => ({}))

const { linearAdapter } = await import('../adapters/linear/linear-adapter')
const { registerAdapter, getAdapter, __resetRegistryForTests } = await import(
  '../registry'
)

function hmacHex(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

describe('linearAdapter (control plane)', () => {
  describe('provider identity + registration', () => {
    beforeEach(() => {
      __resetRegistryForTests()
    })

    it('exposes provider = "linear"', () => {
      expect(linearAdapter.provider).toBe('linear')
    })

    it('barrel import registers with the control-plane registry', async () => {
      await import('../adapters/linear/index')
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

    it('returns false for an invalid signature', () => {
      expect(
        linearAdapter.verifySignature(
          body,
          { 'linear-signature': 'deadbeef' },
          secret,
        ),
      ).toBe(false)
    })

    it('returns false when header is missing', () => {
      expect(linearAdapter.verifySignature(body, {}, secret)).toBe(false)
    })

    it('returns false when secret is empty', () => {
      const sig = hmacHex(secret, body)
      expect(
        linearAdapter.verifySignature(body, { 'linear-signature': sig }, ''),
      ).toBe(false)
    })

    it('returns false when body is tampered', () => {
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
      expect(
        await linearAdapter.parseWebhook(
          { type: 'Comment', action: 'create', data: { id: 'c-1' } },
          {},
        ),
      ).toBeNull()
    })

    it('returns null when data.id is missing', async () => {
      expect(
        await linearAdapter.parseWebhook(
          { type: 'Issue', action: 'create', data: {} },
          {},
        ),
      ).toBeNull()
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
            description: 'repro',
            priority: 1,
            state: { type: 'unstarted' },
          },
        },
        {},
      )
      expect(event?.type).toBe('issue.created')
      expect(event?.provider).toBe('linear')
      expect(event?.externalId).toBe('iss-1')
      expect(event?.actorId).toBe('user-1')
      expect(event?.patch?.title).toBe('New bug')
      expect(event?.patch?.priority).toBe('critical') // Linear 1 → critical
      expect(event?.isEcho).toBe(false)
    })

    it('maps update with state completed → issue.closed + completed', async () => {
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'update',
          data: { id: 'iss-2', state: { type: 'completed' } },
          updatedFrom: { state: { type: 'started' } },
        },
        {},
      )
      expect(event?.type).toBe('issue.closed')
      expect(event?.resolution).toBe('completed')
    })

    it('maps update with state canceled → issue.closed + cancelled', async () => {
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'update',
          data: { id: 'iss-3', state: { type: 'canceled' } },
          updatedFrom: { state: { type: 'started' } },
        },
        {},
      )
      expect(event?.type).toBe('issue.closed')
      expect(event?.resolution).toBe('cancelled')
    })

    it('maps update leaving completed → issue.reopened', async () => {
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'update',
          data: { id: 'iss-4', state: { type: 'started' } },
          updatedFrom: { state: { type: 'completed' } },
        },
        {},
      )
      expect(event?.type).toBe('issue.reopened')
    })

    it('maps update with unchanged state → issue.updated', async () => {
      const event = await linearAdapter.parseWebhook(
        {
          type: 'Issue',
          action: 'update',
          data: { id: 'iss-5', title: 'Edited', state: { type: 'started' } },
          updatedFrom: { state: { type: 'started' } },
        },
        {},
      )
      expect(event?.type).toBe('issue.updated')
      expect(event?.patch?.title).toBe('Edited')
    })

    it('maps action=remove → issue.closed', async () => {
      const event = await linearAdapter.parseWebhook(
        { type: 'Issue', action: 'remove', data: { id: 'iss-6' } },
        {},
      )
      expect(event?.type).toBe('issue.closed')
    })

    it('flags an update carrying the Lucid marker as echo', async () => {
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
      expect(event?.isEcho).toBe(true)
    })

    it('does NOT flag a create carrying the marker as echo', async () => {
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

    it('returns null for non-object payloads', async () => {
      expect(await linearAdapter.parseWebhook(null, {})).toBeNull()
      expect(await linearAdapter.parseWebhook('string', {})).toBeNull()
      expect(await linearAdapter.parseWebhook(42, {})).toBeNull()
    })
  })
})
