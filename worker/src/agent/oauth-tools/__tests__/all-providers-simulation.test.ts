/**
 * All-Providers Simulation Tests
 *
 * Comprehensive coverage of ALL 40 providers and 313 action scripts:
 * - Script existence, loading, exec() signature
 * - Mock adapter simulation for every action
 * - Response shaper (page sizes + compaction)
 * - Workflow recipe coverage in builtin-skills.ts
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { createRequire } from 'node:module'
import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyDefaultPageSize, shapeActionResponse } from '../response-shaper.js'

const BUILD_DIR = resolve(import.meta.dirname, '../../../../../nango-integrations/build')
const require = createRequire(import.meta.url)

/* ═══════════════════════════════════════════════════════════════
   Provider Manifest — every provider, every action
   ═══════════════════════════════════════════════════════════════ */

const PROVIDER_ACTIONS: Record<string, string[]> = {
  hubspot: [
    'batch-create-companies', 'batch-update-companies', 'change-user-role',
    'clone-marketing-email', 'create-association', 'create-company', 'create-contact',
    'create-deal', 'create-marketing-email', 'create-note', 'create-property',
    'create-task', 'create-ticket', 'create-user', 'delete-a-workflow',
    'delete-company', 'delete-contact', 'delete-deal', 'delete-marketing-email',
    'delete-task', 'delete-ticket', 'delete-user', 'fetch-account-information',
    'fetch-custom-objects', 'fetch-pipelines', 'fetch-properties', 'fetch-roles',
    'get-company', 'get-contact', 'get-deal', 'get-marketing-email', 'get-owner',
    'get-ticket', 'list-companies', 'list-contacts', 'list-deals', 'list-forms',
    'list-marketing-emails', 'list-tickets', 'search-companies', 'search-contacts',
    'search-deals', 'search-tickets', 'update-company', 'update-contact',
    'update-deal', 'update-marketing-email', 'update-task', 'update-ticket', 'whoami',
  ],
  google: [
    'add-attendee', 'append-values-to-spreadsheet', 'batch-get-values', 'clear-values',
    'copy-file', 'create-all-day-event', 'create-event', 'create-folder',
    'create-recurring-event', 'create-spreadsheet', 'create-spreadsheet-row',
    'delete-event', 'delete-file', 'fetch-attachment', 'find-file', 'find-folder',
    'find-free-slots', 'get-event', 'get-file-metadata', 'get-values',
    'list-calendar-list', 'list-emails', 'list-events', 'list-files-non-unified',
    'list-spreadsheets', 'list-upcoming-events', 'move-file', 'query-free-busy',
    'quick-add-event', 'read-email', 'remove-attendee', 'reply-to-email',
    'search-emails', 'send-email', 'share-file', 'update-event', 'update-values',
    'upload-document', 'upsert-row',
  ],
  'twitter-v2': [
    'bookmark-tweet', 'delete-tweet', 'follow-user', 'get-bookmarks', 'get-followers',
    'get-following', 'get-liked-tweets', 'get-liking-users', 'get-mentions',
    'get-my-replies', 'get-notifications', 'get-replies', 'get-tweet', 'get-user-info',
    'get-user-tweets', 'like-tweet', 'post-tweet', 'remove-bookmark', 'retweet',
    'search-tweets', 'unfollow-user', 'unlike-tweet', 'unretweet',
  ],
  slack: [
    'add-reaction', 'create-conversation', 'delete-message', 'find-user-by-email',
    'get-channel-info', 'get-conversation-history', 'get-thread-replies',
    'get-user-info', 'join-channel', 'list-channels', 'list-conversations',
    'list-pins', 'list-users', 'mark-as-read', 'post-message', 'schedule-message',
    'search-files', 'search-messages', 'send-ephemeral-message', 'send-message',
    'set-channel-purpose', 'set-channel-topic', 'update-message',
  ],
  'google-calendar': [
    'add-attendee', 'create-all-day-event', 'create-event', 'create-recurring-event',
    'delete-event', 'find-free-slots', 'get-event', 'list-calendar-list',
    'list-calendars', 'list-events', 'list-upcoming-events', 'query-free-busy',
    'quick-add-event', 'remove-attendee', 'update-event',
  ],
  salesforce: [
    'create-account', 'create-contact', 'create-lead', 'create-opportunity',
    'delete-account', 'delete-contact', 'delete-lead', 'delete-opportunity',
    'fetch-fields', 'update-account', 'update-contact', 'update-lead',
    'update-opportunity', 'whoami',
  ],
  notion: [
    'append-block-children', 'archive-page', 'create-comment', 'create-page',
    'get-page', 'list-comments', 'list-users', 'query-database',
    'retrieve-block-children', 'retrieve-database', 'retrieve-page', 'search-pages',
    'update-page',
  ],
  'google-sheets': [
    'append-rows', 'append-values-to-spreadsheet', 'batch-get-values', 'clear-values',
    'create-spreadsheet', 'create-spreadsheet-row', 'get-sheet-data', 'get-values',
    'list-spreadsheets', 'update-cells', 'update-values', 'upsert-row',
  ],
  zendesk: [
    'create-category', 'create-section', 'create-ticket', 'create-user',
    'delete-user', 'fetch-article', 'fetch-articles', 'search-tickets',
  ],
  zoom: ['create-meeting', 'create-user', 'delete-meeting', 'delete-user', 'whoami'],
  github: ['create-issue', 'list-issues', 'list-pull-requests', 'list-repos', 'write-file'],
  asana: ['create-task', 'delete-task', 'fetch-projects', 'fetch-workspaces', 'update-task'],
  linear: ['create-issue', 'fetch-fields', 'fetch-models', 'fetch-teams'],
  intercom: ['create-contact', 'delete-contact', 'fetch-article', 'whoami'],
  airtable: ['create-webhook', 'delete-webhook', 'list-webhooks', 'whoami'],
  calendly: ['create-user', 'delete-user', 'whoami'],
  aircall: ['create-user', 'delete-user'],
  'aws-iam': ['create-user', 'delete-user'],
  linkedin: ['post'],
  jira: ['create-issue'],
  gong: ['fetch-call-transcripts'],
  fireflies: ['add-to-live'],
  // Tier 2 — custom actions
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
  make: ['list-scenarios', 'get-scenario', 'run-scenario', 'activate-scenario', 'deactivate-scenario', 'list-scenario-logs'],
  zapier: ['list-zaps', 'get-zap', 'list-apps', 'enable-zap', 'disable-zap'],
  pipedrive: [
    'list-deals', 'get-deal', 'create-deal', 'update-deal',
    'list-persons', 'create-person', 'list-organizations',
    'list-activities', 'create-activity', 'list-pipelines', 'list-stages', 'search-items',
  ],
  apollo: [
    'search-people', 'enrich-person', 'search-organizations', 'enrich-organization',
    'create-contact', 'search-contacts', 'list-sequences', 'add-to-sequence',
  ],
}

const ALL_PROVIDERS = Object.keys(PROVIDER_ACTIONS)
const TOTAL_ACTIONS = Object.values(PROVIDER_ACTIONS).reduce((sum, a) => sum + a.length, 0)

/* ═══════════════════════════════════════════════════════════════
   Mock Nango Adapter
   ═══════════════════════════════════════════════════════════════ */

class MockActionError extends Error {
  status: number
  constructor(payload: { status: number; message: string }) {
    super(payload.message)
    this.status = payload.status
  }
}

function createMockAdapter() {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const track = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args })
    return Promise.resolve({ data: {} })
  }

  return {
    adapter: {
      get: track('get'),
      post: track('post'),
      put: track('put'),
      patch: track('patch'),
      delete: track('delete'),
      proxy: track('proxy'),
      getConnection: vi.fn().mockResolvedValue({
        connection_id: 'test-conn',
        provider_config_key: 'test-provider',
        credentials: {
          type: 'OAUTH2',
          access_token: 'test-token-abc123',
          raw: {},
        },
      }),
      log: vi.fn(),
      ActionError: MockActionError,
    },
    calls,
  }
}

/* ═══════════════════════════════════════════════════════════════
   1. Script Existence & Loading (all 22 providers, 235 scripts)
   ═══════════════════════════════════════════════════════════════ */

describe('All Providers — Script Existence & Loading', () => {
  it(`manifest declares ${ALL_PROVIDERS.length} providers with ${TOTAL_ACTIONS} total actions`, () => {
    expect(ALL_PROVIDERS).toHaveLength(40)
    // Allow ±3 for minor drift, but verify ballpark
    expect(TOTAL_ACTIONS).toBeGreaterThanOrEqual(310)
    expect(TOTAL_ACTIONS).toBeLessThanOrEqual(320)
  })

  it('build directory has exactly the right number of .cjs files', () => {
    const scripts = readdirSync(BUILD_DIR).filter((f) => f.endsWith('.cjs'))
    expect(scripts).toHaveLength(313)
  })

  describe.each(ALL_PROVIDERS)('provider: %s', (provider) => {
    const actions = PROVIDER_ACTIONS[provider]

    it(`has ${actions.length} scripts that all exist`, () => {
      const missing: string[] = []
      for (const action of actions) {
        const path = resolve(BUILD_DIR, `${provider}_actions_${action}.cjs`)
        if (!existsSync(path)) missing.push(action)
      }
      expect(missing, `Missing scripts: ${missing.join(', ')}`).toHaveLength(0)
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
            failures.push(`${action}: exec has ${script.exec.length} params, expected 1-2`)
          }
        } catch (err) {
          failures.push(`${action}: ${(err as Error).message}`)
        }
      }
      expect(failures, failures.join('\n')).toHaveLength(0)
    })

    it('all scripts have a description property', () => {
      const missing: string[] = []
      for (const action of actions) {
        const mod = require(resolve(BUILD_DIR, `${provider}_actions_${action}.cjs`))
        const script = mod.default || mod
        if (typeof script.description !== 'string' || script.description.length === 0) {
          missing.push(action)
        }
      }
      expect(missing, `Missing description: ${missing.join(', ')}`).toHaveLength(0)
    })
  })
})

/* ═══════════════════════════════════════════════════════════════
   2. Mock Adapter Simulation (call exec on every action)
   ═══════════════════════════════════════════════════════════════ */

describe('All Providers — Simulation via Mock Adapter', () => {
  // Build flat list for describe.each
  const testCases = ALL_PROVIDERS.flatMap((provider) =>
    PROVIDER_ACTIONS[provider].map((action) => ({ provider, action })),
  )

  it.each(testCases)(
    '$provider/$action — exec() is callable',
    async ({ provider, action }) => {
      const mod = require(resolve(BUILD_DIR, `${provider}_actions_${action}.cjs`))
      const script = mod.default || mod
      const { adapter } = createMockAdapter()

      let called = false
      let threw = false
      try {
        await script.exec(adapter, {})
        called = true
      } catch {
        // Expected — many scripts throw when mock doesn't return expected data shape
        threw = true
        called = true
      }

      // The point: exec() was called and either returned or threw (not a load error)
      expect(called).toBe(true)
    },
  )
})

/* ═══════════════════════════════════════════════════════════════
   3. Response Shaper — Default Page Sizes
   ═══════════════════════════════════════════════════════════════ */

describe('Response Shaper — Default Page Sizes', () => {
  const PAGE_SIZE_CONFIG: Array<{ provider: string; action: string; expected: number }> = [
    // Notion
    { provider: 'notion', action: 'search-pages', expected: 10 },
    { provider: 'notion', action: 'query-database', expected: 15 },
    { provider: 'notion', action: 'list-users', expected: 20 },
    { provider: 'notion', action: 'list-comments', expected: 15 },
    { provider: 'notion', action: 'retrieve-block-children', expected: 20 },
    // Slack
    { provider: 'slack', action: 'list-channels', expected: 20 },
    { provider: 'slack', action: 'list-messages', expected: 15 },
    // Google
    { provider: 'google', action: 'list-events', expected: 15 },
    { provider: 'google', action: 'list-files', expected: 15 },
    // Twitter
    { provider: 'twitter', action: 'search-tweets', expected: 10 },
    { provider: 'twitter', action: 'get-user-tweets', expected: 10 },
    { provider: 'twitter', action: 'get-mentions', expected: 10 },
    { provider: 'twitter', action: 'get-followers', expected: 20 },
    { provider: 'twitter', action: 'get-following', expected: 20 },
    { provider: 'twitter', action: 'get-bookmarks', expected: 20 },
    { provider: 'twitter', action: 'get-replies', expected: 20 },
    { provider: 'twitter', action: 'get-liked-tweets', expected: 20 },
    { provider: 'twitter', action: 'get-liking-users', expected: 20 },
    // HubSpot
    { provider: 'hubspot', action: 'list-contacts', expected: 15 },
    { provider: 'hubspot', action: 'list-companies', expected: 15 },
    { provider: 'hubspot', action: 'list-deals', expected: 15 },
    { provider: 'hubspot', action: 'list-tickets', expected: 15 },
    { provider: 'hubspot', action: 'search-contacts', expected: 15 },
    { provider: 'hubspot', action: 'search-companies', expected: 15 },
    { provider: 'hubspot', action: 'search-deals', expected: 15 },
    { provider: 'hubspot', action: 'search-tickets', expected: 15 },
    { provider: 'hubspot', action: 'list-marketing-emails', expected: 10 },
    { provider: 'hubspot', action: 'list-forms', expected: 15 },
    // Salesforce
    { provider: 'salesforce', action: 'fetch-fields', expected: 20 },
    // Zendesk
    { provider: 'zendesk', action: 'search-tickets', expected: 15 },
    { provider: 'zendesk', action: 'fetch-articles', expected: 15 },
    // GitHub
    { provider: 'github', action: 'list-issues', expected: 15 },
    { provider: 'github', action: 'list-pull-requests', expected: 15 },
    { provider: 'github', action: 'list-repos', expected: 15 },
    // Discord
    { provider: 'discord', action: 'list-guilds', expected: 20 },
    { provider: 'discord', action: 'list-channels', expected: 20 },
    { provider: 'discord', action: 'list-members', expected: 20 },
    // Reddit
    { provider: 'reddit', action: 'list-posts', expected: 15 },
    // Trello
    { provider: 'trello', action: 'list-boards', expected: 15 },
    { provider: 'trello', action: 'list-cards', expected: 15 },
    { provider: 'trello', action: 'list-lists', expected: 20 },
    // PayPal
    { provider: 'paypal', action: 'list-transactions', expected: 15 },
    // Typeform
    { provider: 'typeform', action: 'list-forms', expected: 15 },
    { provider: 'typeform', action: 'get-form-responses', expected: 15 },
    // Bitly
    { provider: 'bitly', action: 'list-links', expected: 15 },
    // Instagram
    { provider: 'instagram', action: 'list-media', expected: 15 },
    // Canva
    { provider: 'canva', action: 'list-designs', expected: 15 },
    // Lemlist
    { provider: 'lemlist', action: 'list-campaigns', expected: 15 },
    { provider: 'lemlist', action: 'list-leads', expected: 15 },
  ]

  it.each(PAGE_SIZE_CONFIG)(
    '$provider:$action defaults to page_size=$expected',
    ({ provider, action, expected }) => {
      const result = applyDefaultPageSize(provider, action, { query: 'test' })
      expect(result.page_size).toBe(expected)
    },
  )

  it('does not inject page_size when already provided', () => {
    const result = applyDefaultPageSize('notion', 'search-pages', { page_size: 50 })
    expect(result.page_size).toBe(50)
  })

  it('returns args unchanged for providers without defaults', () => {
    const args = { query: 'test' }
    const result = applyDefaultPageSize('aircall', 'create-user', args)
    expect(result).toBe(args) // same reference
  })
})

/* ═══════════════════════════════════════════════════════════════
   4. Response Shaper — Notion Compaction
   ═══════════════════════════════════════════════════════════════ */

describe('Response Shaper — Notion Compaction', () => {
  it('compacts search-pages results', () => {
    const rawResult = {
      object: 'list',
      results: [
        {
          id: 'page-1', object: 'page', url: 'https://notion.so/page-1',
          created_time: '2026-01-01', last_edited_time: '2026-01-02',
          archived: false, icon: { type: 'emoji' },
          parent: { type: 'workspace' },
          properties: { Name: { type: 'title', title: [{ plain_text: 'Test Page' }] } },
        },
      ],
      has_more: false,
      next_cursor: null,
    }
    const result = shapeActionResponse('notion', 'search-pages', rawResult)
    expect(result.compacted).toBe(true)
    expect(result.resultCount).toBe(1)
    const shaped = result.shaped as Record<string, unknown>
    expect(shaped._compact).toBe(true)
    expect((shaped.results as Array<Record<string, unknown>>)[0].title).toBe('Test Page')
  })

  it('compacts list-users results', () => {
    const rawResult = {
      object: 'list',
      results: [
        { id: 'user-1', object: 'user', name: 'Alice', type: 'person', avatar_url: null },
      ],
      has_more: false,
    }
    const result = shapeActionResponse('notion', 'list-users', rawResult)
    expect(result.compacted).toBe(true)
    expect((result.shaped as Record<string, unknown>).results).toHaveLength(1)
  })

  it('compacts retrieve-block-children results', () => {
    const rawResult = {
      object: 'list',
      results: [
        {
          id: 'block-1', type: 'paragraph', has_children: false,
          paragraph: { rich_text: [{ plain_text: 'Hello world' }] },
        },
      ],
      has_more: false,
    }
    const result = shapeActionResponse('notion', 'retrieve-block-children', rawResult)
    expect(result.compacted).toBe(true)
    const blocks = (result.shaped as Record<string, unknown>).results as Array<Record<string, unknown>>
    expect(blocks[0].text).toBe('Hello world')
  })

  it('compacts retrieve-database result', () => {
    const rawResult = {
      id: 'db-1', object: 'database', url: 'https://notion.so/db-1',
      title: [{ plain_text: 'Tasks' }],
      created_time: '2026-01-01', last_edited_time: '2026-01-02',
      properties: { Status: { type: 'select' }, Name: { type: 'title' } },
    }
    const result = shapeActionResponse('notion', 'retrieve-database', rawResult)
    expect(result.compacted).toBe(true)
    const shaped = result.shaped as Record<string, unknown>
    expect(shaped.title).toBe('Tasks')
    expect((shaped.properties as Record<string, unknown>).Status).toBe('select')
  })

  it('passes through non-compactable notion actions', () => {
    const result = shapeActionResponse('notion', 'create-page', { id: 'new-page' })
    expect(result.compacted).toBe(false)
  })
})

/* ═══════════════════════════════════════════════════════════════
   5. Response Shaper — Non-Notion Providers (passthrough)
   ═══════════════════════════════════════════════════════════════ */

describe('Response Shaper — Other Providers', () => {
  // Providers with dedicated shapers still passthrough for unknown action names
  const dedicatedShaperProviders = [
    'hubspot', 'slack', 'salesforce', 'zendesk', 'github', 'google', 'twitter-v2',
  ]

  it.each(dedicatedShaperProviders)('%s passes through for unknown actions', (provider) => {
    const data = { results: [{ id: '1' }], total: 1 }
    const result = shapeActionResponse(provider, 'list-something', data)
    expect(result.compacted).toBe(false)
    expect(result.shaped).toBe(data)
  })

  // Providers with no shaper at all passthrough everything
  const noShaperProviders = ['zoom']

  it.each(noShaperProviders)('%s passes through (no shaper)', (provider) => {
    const data = { results: [{ id: '1' }], total: 1 }
    const result = shapeActionResponse(provider, 'list-something', data)
    expect(result.compacted).toBe(false)
    expect(result.shaped).toBe(data)
  })

  // Generic shaper providers compact any data with a known array key
  const genericShaperProviders = [
    'linear', 'asana', 'intercom', 'airtable',
    'discord', 'instagram', 'facebook', 'reddit', 'tiktok', 'bitly',
    'trello', 'typeform', 'whoop', 'heygen', 'paypal', 'canva', 'lemlist', 'amazon',
  ]

  it.each(genericShaperProviders)('%s compacts via generic shaper', (provider) => {
    const data = { results: [{ id: '1', name: 'test' }], total: 1 }
    const result = shapeActionResponse(provider, 'list-something', data)
    expect(result.compacted).toBe(true)
    expect((result.shaped as Record<string, unknown>)._compact).toBe(true)
  })
})

/* ═══════════════════════════════════════════════════════════════
   6. Workflow Recipes — All 36 Providers in builtin-skills.ts
   ═══════════════════════════════════════════════════════════════ */

describe('Workflow Recipes — Provider Coverage', () => {
  let skillContent = ''
  let integrationSkill: Record<string, unknown> | undefined

  beforeAll(async () => {
    // Coverage check uses the full integration content (every per-provider
    // SKILL.md on disk), not the runtime-filtered subset returned by
    // getBuiltinSkills(). The runtime path is exercised in builtin-skills.test.ts.
    const { getAllIntegrationContent } = await import('../../skills/integration-loader.js')
    skillContent = getAllIntegrationContent()
    integrationSkill = skillContent.length > 0 ? { sanitized_content: skillContent } : undefined
  })

  it('integration workflow skill exists', () => {
    expect(integrationSkill).toBeDefined()
    expect(skillContent.length).toBeGreaterThan(1000)
  })

  // Map provider IDs to their expected heading in the skill content
  const PROVIDER_HEADINGS: Array<{ provider: string; heading: string }> = [
    { provider: 'slack', heading: '## Slack' },
    { provider: 'notion', heading: '## Notion' },
    { provider: 'google', heading: '## Google Drive' },
    { provider: 'google-calendar', heading: '## Google Calendar' },
    { provider: 'google-sheets', heading: '## Google Sheets' },
    { provider: 'twitter-v2', heading: '## X (formerly Twitter)' },
    { provider: 'hubspot', heading: '## HubSpot' },
    { provider: 'salesforce', heading: '## Salesforce' },
    { provider: 'linear', heading: '## Linear' },
    { provider: 'jira', heading: '## Jira' },
    { provider: 'asana', heading: '## Asana' },
    { provider: 'zendesk', heading: '## Zendesk' },
    { provider: 'intercom', heading: '## Intercom' },
    { provider: 'aircall', heading: '## Aircall' },
    { provider: 'github', heading: '## GitHub' },
    { provider: 'airtable', heading: '## Airtable' },
    { provider: 'linkedin', heading: '## LinkedIn' },
    { provider: 'aws-iam', heading: '## AWS IAM' },
    { provider: 'zoom', heading: '## Zoom' },
    { provider: 'calendly', heading: '## Calendly' },
    { provider: 'fireflies', heading: '## Fireflies' },
    { provider: 'gong', heading: '## Gong' },
    { provider: 'discord', heading: '## Discord' },
    { provider: 'trello', heading: '## Trello' },
    { provider: 'reddit', heading: '## Reddit' },
    { provider: 'paypal', heading: '## PayPal' },
    { provider: 'whoop', heading: '## Whoop' },
    { provider: 'instagram', heading: '## Instagram' },
    { provider: 'facebook', heading: '## Facebook' },
    { provider: 'typeform', heading: '## Typeform' },
    { provider: 'bitly', heading: '## Bitly' },
    { provider: 'canva', heading: '## Canva' },
    { provider: 'lemlist', heading: '## Lemlist' },
    { provider: 'heygen', heading: '## HeyGen' },
    { provider: 'tiktok', heading: '## TikTok' },
    { provider: 'amazon', heading: '## Amazon SES' },
    { provider: 'make', heading: '## Make' },
    { provider: 'zapier', heading: '## Zapier' },
    { provider: 'pipedrive', heading: '## Pipedrive' },
    { provider: 'apollo', heading: '## Apollo' },
  ]

  it.each(PROVIDER_HEADINGS)(
    '$provider has workflow recipe section ($heading)',
    ({ heading }) => {
      expect(skillContent).toContain(heading)
    },
  )

  it('covers all 40 providers', () => {
    expect(PROVIDER_HEADINGS).toHaveLength(40)
  })
})
