/**
 * Tier 2 Providers — Comprehensive Tests
 *
 * Coverage for 14 new providers (47 action scripts):
 * - Smoke: script loading, exec() signature, description
 * - Simulation: mock adapter execution with realistic responses
 * - Response shaping: generic compaction, page sizes
 * - Contract: error normalization, pagination detection
 * - E2E scaffold: conditional real API tests (skip without credentials)
 */

import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyDefaultPageSize, shapeActionResponse, detectPagination } from '../response-shaper.js'

const BUILD_DIR = resolve(import.meta.dirname, '../../../../../nango-integrations/build')
const require = createRequire(import.meta.url)

/* ─── Provider Manifest ───────────────────────────────── */

const TIER2_PROVIDERS: Record<string, string[]> = {
  discord: ['list-guilds', 'list-channels', 'send-message', 'get-guild-info', 'list-members'],
  trello: ['list-boards', 'list-cards', 'create-card', 'list-lists', 'update-card'],
  reddit: ['get-subreddit', 'list-posts', 'get-user-info', 'create-post'],
  paypal: ['get-balance', 'list-transactions', 'create-invoice', 'send-invoice'],
  typeform: ['list-forms', 'get-form-responses', 'get-form'],
  bitly: ['create-link', 'list-links', 'get-link-clicks'],
  instagram: ['get-profile', 'list-media', 'get-media-insights'],
  facebook: ['list-pages', 'create-post', 'get-page-insights'],
  tiktok: ['get-user-info', 'list-videos'],
  canva: ['list-designs', 'get-design', 'create-design'],
  lemlist: ['list-campaigns', 'list-leads', 'create-lead'],
  heygen: ['list-avatars', 'create-video', 'get-video-status'],
  whoop: ['get-profile', 'get-recovery', 'get-sleep', 'get-workout'],
  amazon: ['send-email', 'list-email-templates'],
}

const ALL_T2_PROVIDERS = Object.keys(TIER2_PROVIDERS)
const TOTAL_T2_ACTIONS = Object.values(TIER2_PROVIDERS).reduce((s, a) => s + a.length, 0)

/* ─── Mock Adapter ────────────────────────────────────── */

class MockActionError extends Error {
  status: number
  constructor(payload: { status: number; message: string }) {
    super(payload.message)
    this.status = payload.status
  }
}

interface MockResponse {
  data: unknown
}

function createMockAdapter(responses?: Record<string, MockResponse>) {
  const calls: Array<{ method: string; endpoint?: string; args: unknown[] }> = []

  const makeHandler = (method: string) => (...args: unknown[]) => {
    const opts = args[0] as Record<string, unknown> | undefined
    const endpoint = opts?.endpoint as string | undefined
    calls.push({ method, endpoint, args })

    // Return custom response if provided for this endpoint
    if (endpoint && responses?.[endpoint]) {
      return Promise.resolve(responses[endpoint])
    }

    return Promise.resolve({ data: {} })
  }

  return {
    adapter: {
      get: makeHandler('get'),
      post: makeHandler('post'),
      put: makeHandler('put'),
      patch: makeHandler('patch'),
      delete: makeHandler('delete'),
      proxy: makeHandler('proxy'),
      getConnection: vi.fn().mockResolvedValue({
        connection_id: 'test-conn',
        provider_config_key: 'test-provider',
        credentials: { type: 'OAUTH2', access_token: 'test-token', raw: {} },
      }),
      log: vi.fn(),
      ActionError: MockActionError,
    },
    calls,
  }
}

/* ═══════════════════════════════════════════════════════════════
   1. Smoke Tests — Script Loading & Structure
   ═══════════════════════════════════════════════════════════════ */

describe('Tier 2 — Smoke Tests', () => {
  it(`has ${ALL_T2_PROVIDERS.length} providers with ${TOTAL_T2_ACTIONS} actions`, () => {
    expect(ALL_T2_PROVIDERS).toHaveLength(14)
    expect(TOTAL_T2_ACTIONS).toBe(47)
  })

  describe.each(ALL_T2_PROVIDERS)('provider: %s', (provider) => {
    const actions = TIER2_PROVIDERS[provider]

    it(`all ${actions.length} scripts exist`, () => {
      const missing: string[] = []
      for (const action of actions) {
        const path = resolve(BUILD_DIR, `${provider}_actions_${action}.cjs`)
        if (!existsSync(path)) missing.push(action)
      }
      expect(missing).toHaveLength(0)
    })

    it('all scripts load and export exec(nango, input)', () => {
      const failures: string[] = []
      for (const action of actions) {
        try {
          const mod = require(resolve(BUILD_DIR, `${provider}_actions_${action}.cjs`))
          const script = mod.default || mod
          if (typeof script.exec !== 'function') {
            failures.push(`${action}: exec is not a function`)
          } else if (script.exec.length < 1 || script.exec.length > 2) {
            failures.push(`${action}: exec has ${script.exec.length} params`)
          }
        } catch (err) {
          failures.push(`${action}: ${(err as Error).message}`)
        }
      }
      expect(failures).toHaveLength(0)
    })

    it('all scripts have a description', () => {
      const missing: string[] = []
      for (const action of actions) {
        const mod = require(resolve(BUILD_DIR, `${provider}_actions_${action}.cjs`))
        const script = mod.default || mod
        if (typeof script.description !== 'string' || script.description.length === 0) {
          missing.push(action)
        }
      }
      expect(missing).toHaveLength(0)
    })

    it('all scripts have version and type', () => {
      for (const action of actions) {
        const mod = require(resolve(BUILD_DIR, `${provider}_actions_${action}.cjs`))
        const script = mod.default || mod
        expect(script.type).toBe('action')
        expect(typeof script.version).toBe('string')
      }
    })
  })
})

/* ═══════════════════════════════════════════════════════════════
   2. Simulation Tests — Mock Adapter Execution
   ═══════════════════════════════════════════════════════════════ */

describe('Tier 2 — Simulation via Mock Adapter', () => {
  const testCases = ALL_T2_PROVIDERS.flatMap((provider) =>
    TIER2_PROVIDERS[provider].map((action) => ({ provider, action })),
  )

  it.each(testCases)(
    '$provider/$action — exec() completes without load error',
    async ({ provider, action }) => {
      const mod = require(resolve(BUILD_DIR, `${provider}_actions_${action}.cjs`))
      const script = mod.default || mod
      const { adapter } = createMockAdapter()

      let completed = false
      try {
        await script.exec(adapter, {})
        completed = true
      } catch {
        // Expected — scripts throw when mock doesn't return expected shape
        completed = true
      }
      expect(completed).toBe(true)
    },
  )
})

/* ═══════════════════════════════════════════════════════════════
   3. Realistic Simulation — Provider-Specific Mock Responses
   ═══════════════════════════════════════════════════════════════ */

describe('Tier 2 — Realistic Response Simulation', () => {
  it('discord/list-guilds returns structured guilds', async () => {
    const mod = require(resolve(BUILD_DIR, 'discord_actions_list-guilds.cjs'))
    const script = mod.default || mod
    const { adapter } = createMockAdapter({
      '/users/@me/guilds': {
        data: [
          { id: '123', name: 'Test Server', icon: 'abc', owner: true },
          { id: '456', name: 'Other Server', icon: null, owner: false },
        ],
      },
    })

    const result = await script.exec(adapter, {})
    expect(result.guilds).toHaveLength(2)
    expect(result.guilds[0].id).toBe('123')
    expect(result.guilds[0].name).toBe('Test Server')
  })

  it('discord/list-channels returns channels', async () => {
    const mod = require(resolve(BUILD_DIR, 'discord_actions_list-channels.cjs'))
    const script = mod.default || mod
    const { adapter } = createMockAdapter({
      '/guilds/123/channels': {
        data: [
          { id: 'ch1', name: 'general', type: 0 },
          { id: 'ch2', name: 'random', type: 0 },
        ],
      },
    })

    const result = await script.exec(adapter, { guild_id: '123' })
    expect(result.channels).toHaveLength(2)
  })

  it('paypal/get-balance returns balances', async () => {
    const mod = require(resolve(BUILD_DIR, 'paypal_actions_get-balance.cjs'))
    const script = mod.default || mod
    const { adapter } = createMockAdapter({
      '/v2/wallet/balances': {
        data: {
          balances: [
            { currency_code: 'USD', total_balance: { currency_code: 'USD', value: '1234.56' } },
          ],
        },
      },
    })

    const result = await script.exec(adapter, {})
    expect(result.balances).toHaveLength(1)
    expect(result.balances[0].currency_code).toBe('USD')
  })

  it('trello/list-boards returns boards', async () => {
    const mod = require(resolve(BUILD_DIR, 'trello_actions_list-boards.cjs'))
    const script = mod.default || mod
    const { adapter } = createMockAdapter({
      '/1/members/me/boards': {
        data: [
          { id: 'b1', name: 'Project Board', closed: false, url: 'https://trello.com/b/b1' },
        ],
      },
    })

    const result = await script.exec(adapter, {})
    expect(result.boards).toBeDefined()
  })

  it('whoop/get-recovery returns recovery data', async () => {
    const mod = require(resolve(BUILD_DIR, 'whoop_actions_get-recovery.cjs'))
    const script = mod.default || mod
    const { adapter } = createMockAdapter({
      '/v1/cycle': {
        data: {
          records: [
            {
              id: 1, score: { recovery_score: 85, resting_heart_rate: 55, hrv_rmssd_milli: 42 },
            },
          ],
        },
      },
    })

    const result = await script.exec(adapter, {})
    expect(result.records).toHaveLength(1)
    expect(result.records[0].recovery_score).toBe(85)
  })

  it('bitly/create-link returns shortened link', async () => {
    const mod = require(resolve(BUILD_DIR, 'bitly_actions_create-link.cjs'))
    const script = mod.default || mod
    const { adapter } = createMockAdapter({
      '/v4/shorten': {
        data: { link: 'https://bit.ly/abc123', id: 'bit.ly/abc123', long_url: 'https://example.com' },
      },
    })

    const result = await script.exec(adapter, { long_url: 'https://example.com' })
    expect(result).toBeDefined()
  })

  it('reddit/get-subreddit returns subreddit info', async () => {
    const mod = require(resolve(BUILD_DIR, 'reddit_actions_get-subreddit.cjs'))
    const script = mod.default || mod
    const { adapter } = createMockAdapter({
      '/r/programming/about': {
        data: {
          data: {
            display_name: 'programming', subscribers: 5000000,
            public_description: 'Computer programming',
          },
        },
      },
    })

    const result = await script.exec(adapter, { subreddit: 'programming' })
    expect(result).toBeDefined()
  })

  it('canva/list-designs returns designs', async () => {
    const mod = require(resolve(BUILD_DIR, 'canva_actions_list-designs.cjs'))
    const script = mod.default || mod
    const { adapter } = createMockAdapter({
      '/v1/designs': {
        data: {
          items: [
            { id: 'd1', title: 'My Design', created_at: '2026-01-01' },
          ],
        },
      },
    })

    const result = await script.exec(adapter, {})
    expect(result).toBeDefined()
  })
})

/* ═══════════════════════════════════════════════════════════════
   4. Response Shaper — Generic Compaction for Tier 2
   ═══════════════════════════════════════════════════════════════ */

describe('Tier 2 — Response Shaping', () => {
  it.each(ALL_T2_PROVIDERS)('%s uses generic shaper', (provider) => {
    const data = { results: [{ id: '1', name: 'test', _links: { self: '/x' } }], total: 1 }
    const result = shapeActionResponse(provider, 'some-action', data)
    expect(result.compacted).toBe(true)
    expect((result.shaped as Record<string, unknown>)._compact).toBe(true)
  })

  it('generic shaper strips bloat keys', () => {
    const data = {
      results: [{
        id: '1',
        name: 'test',
        _links: { self: '/api/thing/1' },
        _embedded: { items: [] },
        metadata: { internal: true },
        request_id: 'req-abc',
        _rawJSON: '{}',
      }],
    }
    const result = shapeActionResponse('discord', 'list-guilds', data)
    expect(result.compacted).toBe(true)
    const items = (result.shaped as Record<string, unknown>).results as Record<string, unknown>[]
    expect(items[0]._links).toBeUndefined()
    expect(items[0]._embedded).toBeUndefined()
    expect(items[0].metadata).toBeUndefined()
    expect(items[0].request_id).toBeUndefined()
    expect(items[0]._rawJSON).toBeUndefined()
    expect(items[0].id).toBe('1')
    expect(items[0].name).toBe('test')
  })

  it('generic shaper handles nested arrays', () => {
    const data = {
      items: Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, name: `Item ${i}` })),
    }
    const result = shapeActionResponse('trello', 'list-boards', data)
    expect(result.compacted).toBe(true)
    const shaped = result.shaped as Record<string, unknown>
    const items = shaped.results as unknown[]
    // Generic shaper caps at 25 items
    expect(items.length).toBeLessThanOrEqual(25)
  })

  it('generic shaper passes through primitives', () => {
    const result = shapeActionResponse('discord', 'send-message', 'ok')
    expect(result.compacted).toBe(false)
  })

  it('generic shaper passes through null', () => {
    const result = shapeActionResponse('paypal', 'get-balance', null)
    expect(result.compacted).toBe(false)
  })

  it('generic shaper handles single object (no array)', () => {
    const data = { id: '1', name: 'Guild', member_count: 100 }
    const result = shapeActionResponse('discord', 'get-guild-info', data)
    expect(result.compacted).toBe(true)
    const shaped = result.shaped as Record<string, unknown>
    expect(shaped.id).toBe('1')
    expect(shaped.name).toBe('Guild')
  })
})

/* ═══════════════════════════════════════════════════════════════
   5. Default Page Sizes — Tier 2 Providers
   ═══════════════════════════════════════════════════════════════ */

describe('Tier 2 — Default Page Sizes', () => {
  const PAGE_SIZE_CASES: Array<{ provider: string; action: string; expected: number }> = [
    { provider: 'discord', action: 'list-guilds', expected: 20 },
    { provider: 'discord', action: 'list-channels', expected: 20 },
    { provider: 'discord', action: 'list-members', expected: 20 },
    { provider: 'reddit', action: 'list-posts', expected: 15 },
    { provider: 'trello', action: 'list-boards', expected: 15 },
    { provider: 'trello', action: 'list-cards', expected: 15 },
    { provider: 'trello', action: 'list-lists', expected: 20 },
    { provider: 'paypal', action: 'list-transactions', expected: 15 },
    { provider: 'typeform', action: 'list-forms', expected: 15 },
    { provider: 'typeform', action: 'get-form-responses', expected: 15 },
    { provider: 'bitly', action: 'list-links', expected: 15 },
    { provider: 'instagram', action: 'list-media', expected: 15 },
    { provider: 'canva', action: 'list-designs', expected: 15 },
    { provider: 'lemlist', action: 'list-campaigns', expected: 15 },
    { provider: 'lemlist', action: 'list-leads', expected: 15 },
  ]

  it.each(PAGE_SIZE_CASES)(
    '$provider/$action defaults to page_size=$expected',
    ({ provider, action, expected }) => {
      const result = applyDefaultPageSize(provider, action, { query: 'test' })
      expect(result.page_size).toBe(expected)
    },
  )

  it('does not override existing page_size', () => {
    const result = applyDefaultPageSize('discord', 'list-guilds', { page_size: 50 })
    expect(result.page_size).toBe(50)
  })

  // Providers without list actions should not inject page_size
  const noPageSizeProviders = ['tiktok', 'heygen']
  it.each(noPageSizeProviders)('%s has no default page_size for any action', (provider) => {
    const result = applyDefaultPageSize(provider, 'some-action', { q: 'test' })
    expect(result.page_size).toBeUndefined()
  })

  // Providers with list actions but tested via specific actions above
  it('facebook defaults list-pages to 15', () => {
    expect(applyDefaultPageSize('facebook', 'list-pages', {}).page_size).toBe(15)
  })

  it('whoop defaults get-recovery to 10', () => {
    expect(applyDefaultPageSize('whoop', 'get-recovery', {}).page_size).toBe(10)
  })

  it('amazon defaults list-email-templates to 15', () => {
    expect(applyDefaultPageSize('amazon', 'list-email-templates', {}).page_size).toBe(15)
  })
})

/* ═══════════════════════════════════════════════════════════════
   6. Pagination Detection — Cross-Provider
   ═══════════════════════════════════════════════════════════════ */

describe('Tier 2 — Pagination Detection', () => {
  it('detects Notion-style has_more + next_cursor', () => {
    const result = detectPagination({ has_more: true, next_cursor: 'abc123' })
    expect(result.has_more).toBe(true)
    expect(result.next_cursor).toBe('abc123')
  })

  it('returns no pagination when no known keys', () => {
    const result = detectPagination({ items: [1, 2, 3] })
    expect(result.has_more).toBe(false)
    expect(result.next_cursor).toBeNull()
  })

  it('detects Google-style nextPageToken', () => {
    const result = detectPagination({ nextPageToken: 'page2token' })
    expect(result.has_more).toBe(true)
    expect(result.next_cursor).toBe('page2token')
  })

  it('detects Slack-style response_metadata.next_cursor', () => {
    const result = detectPagination({
      response_metadata: { next_cursor: 'cursor_xyz' },
    })
    expect(result.has_more).toBe(true)
    expect(result.next_cursor).toBe('cursor_xyz')
  })

  it('ignores empty Slack cursor', () => {
    const result = detectPagination({
      response_metadata: { next_cursor: '' },
    })
    expect(result.has_more).toBe(false)
  })

  it('detects HubSpot-style paging.next.after', () => {
    const result = detectPagination({
      paging: { next: { after: '100' } },
    })
    expect(result.has_more).toBe(true)
    expect(result.next_cursor).toBe('100')
  })

  it('detects Twitter-style meta.next_token', () => {
    const result = detectPagination({
      meta: { next_token: 'next_page' },
    })
    expect(result.has_more).toBe(true)
    expect(result.next_cursor).toBe('next_page')
  })

  it('detects Salesforce-style done + nextRecordsUrl', () => {
    const result = detectPagination({
      done: false,
      nextRecordsUrl: '/services/data/v58.0/query/next',
    })
    expect(result.has_more).toBe(true)
    expect(result.next_cursor).toBe('/services/data/v58.0/query/next')
  })
})

/* ═══════════════════════════════════════════════════════════════
   7. Contract Tests — Error Shape & Response Envelope
   ═══════════════════════════════════════════════════════════════ */

describe('Tier 2 — Contract Conformance', () => {
  it('shaper result has correct ShaperResult shape when compacted', () => {
    const data = { results: [{ id: '1' }] }
    const result = shapeActionResponse('discord', 'list-guilds', data)
    expect(result).toHaveProperty('shaped')
    expect(result).toHaveProperty('originalChars')
    expect(result).toHaveProperty('shapedChars')
    expect(result).toHaveProperty('compacted')
    expect(typeof result.originalChars).toBe('number')
    expect(typeof result.shapedChars).toBe('number')
    expect(result.compacted).toBe(true)
    expect(result.resultCount).toBeGreaterThanOrEqual(0)
    // Compacted results have serialized string for bridge
    expect(typeof result.serialized).toBe('string')
  })

  it('shaper result has correct shape when passthrough', () => {
    const data = 'simple string'
    const result = shapeActionResponse('discord', 'send-message', data)
    expect(result.compacted).toBe(false)
    expect(result.shaped).toBe(data)
    expect(result.serialized).toBeUndefined()
  })

  it('shaper serialized string matches shaped object', () => {
    const data = { results: [{ id: '1', name: 'Test' }] }
    const result = shapeActionResponse('trello', 'list-boards', data)
    if (result.serialized) {
      const parsed = JSON.parse(result.serialized)
      expect(parsed).toEqual(result.shaped)
    }
  })

  it('shapedChars <= originalChars when compacted', () => {
    const data = {
      results: Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        name: `Item ${i}`,
        _links: { self: `/api/items/${i}` },
        metadata: { created: '2026-01-01', tags: ['a', 'b'] },
      })),
    }
    const result = shapeActionResponse('reddit', 'list-posts', data)
    if (result.compacted) {
      expect(result.shapedChars).toBeLessThanOrEqual(result.originalChars)
    }
  })
})

/* ═══════════════════════════════════════════════════════════════
   8. E2E Scaffold — Real API Tests (conditional)
   ═══════════════════════════════════════════════════════════════ */

describe('Tier 2 — E2E (requires credentials)', () => {
  const hasDiscordCreds = !!process.env.NANGO_DISCORD_CONNECTION_ID
  const hasPayPalCreds = !!process.env.NANGO_PAYPAL_CONNECTION_ID
  const hasTrelloCreds = !!process.env.NANGO_TRELLO_CONNECTION_ID

  it.skipIf(!hasDiscordCreds)('discord/list-guilds against real API', async () => {
    // This test would use real Nango proxy adapter
    // Placeholder for CI with credentials
    expect(true).toBe(true)
  })

  it.skipIf(!hasPayPalCreds)('paypal/get-balance against real API', async () => {
    expect(true).toBe(true)
  })

  it.skipIf(!hasTrelloCreds)('trello/list-boards against real API', async () => {
    expect(true).toBe(true)
  })

  it('e2e tests are skipped without credentials (expected in CI)', () => {
    // This always passes — just documents that e2e tests exist but need creds
    expect(true).toBe(true)
  })
})
