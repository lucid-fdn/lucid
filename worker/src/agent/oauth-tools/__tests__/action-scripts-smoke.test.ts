/**
 * Smoke Tests — Real Action Script Loading
 *
 * Loads actual .cjs scripts from nango-integrations/build/ to verify:
 * - All scripts load without errors
 * - All scripts export { exec } function
 * - File naming convention matches expected pattern
 * - Scripts are loadable via createRequire (CJS-in-ESM)
 *
 * These tests use real files, no mocks.
 */

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readdirSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'

const BUILD_DIR = resolve(import.meta.dirname, '../../../../../nango-integrations/build')
const require = createRequire(import.meta.url)

/** Parse provider + action from filename like `slack_actions_send-message.cjs` */
function parseScriptName(filename: string) {
  const match = filename.match(/^(.+)_actions_(.+)\.cjs$/)
  if (!match) return null
  return { integrationId: match[1], actionName: match[2] }
}

// Discover all scripts
const allScripts = existsSync(BUILD_DIR)
  ? readdirSync(BUILD_DIR).filter((f) => f.endsWith('.cjs'))
  : []

const EXPECTED_PROVIDERS = [
  // Original integrations
  'slack', 'notion', 'google', 'google-calendar', 'google-sheets', 'twitter-v2',
  // Tier 1 — template-based
  'hubspot', 'salesforce', 'linear', 'asana', 'airtable', 'intercom', 'zendesk',
  'aircall', 'zoom', 'linkedin', 'calendly', 'fireflies', 'gong', 'jira',
  'github', 'aws-iam',
  // Tier 2 — custom actions
  'discord', 'instagram', 'facebook', 'reddit', 'tiktok', 'bitly',
  'trello', 'typeform', 'whoop', 'heygen', 'paypal', 'canva', 'lemlist', 'amazon',
]

describe('Action Scripts — Smoke', () => {
  it('build directory exists and has scripts', () => {
    expect(existsSync(BUILD_DIR)).toBe(true)
    expect(allScripts.length).toBeGreaterThan(200)
  })

  it('all filenames match naming convention', () => {
    for (const f of allScripts) {
      const parsed = parseScriptName(f)
      expect(parsed, `${f} does not match {provider}_actions_{name}.cjs`).not.toBeNull()
    }
  })

  it('all scripts are loadable via createRequire', () => {
    const failures: string[] = []
    for (const f of allScripts) {
      try {
        const mod = require(resolve(BUILD_DIR, f))
        if (!mod) failures.push(`${f}: module is falsy`)
      } catch (err) {
        failures.push(`${f}: ${(err as Error).message}`)
      }
    }
    expect(failures, `Failed to load: ${failures.join(', ')}`).toHaveLength(0)
  })

  it('all scripts export an exec() function', () => {
    const missing: string[] = []
    for (const f of allScripts) {
      const mod = require(resolve(BUILD_DIR, f))
      const script = mod.default || mod
      if (typeof script.exec !== 'function') {
        missing.push(f)
      }
    }
    expect(missing, `Missing exec(): ${missing.join(', ')}`).toHaveLength(0)
  })

  it('covers all expected providers', () => {
    const providers = new Set(allScripts.map((f) => parseScriptName(f)?.integrationId).filter(Boolean))
    for (const p of EXPECTED_PROVIDERS) {
      expect(providers.has(p), `Missing provider: ${p}`).toBe(true)
    }
  })

  it('has expected key actions per provider', () => {
    const scriptSet = new Set(allScripts)
    const expected = [
      'slack_actions_send-message.cjs',
      'slack_actions_list-channels.cjs',
      'notion_actions_search-pages.cjs',
      'notion_actions_create-page.cjs',
      'google_actions_send-email.cjs',
      'google_actions_list-events.cjs',
      'github_actions_create-issue.cjs',
      'github_actions_list-repos.cjs',
      'twitter-v2_actions_post-tweet.cjs',
      'hubspot_actions_create-contact.cjs',
      'hubspot_actions_search-deals.cjs',
      'salesforce_actions_create-lead.cjs',
      'salesforce_actions_whoami.cjs',
      'linear_actions_create-issue.cjs',
      'asana_actions_create-task.cjs',
      'zendesk_actions_create-ticket.cjs',
      'zendesk_actions_search-tickets.cjs',
      'intercom_actions_create-contact.cjs',
      'zoom_actions_create-meeting.cjs',
      'jira_actions_create-issue.cjs',
      'gong_actions_fetch-call-transcripts.cjs',
      'linkedin_actions_post.cjs',
      'airtable_actions_whoami.cjs',
      'discord_actions_send-message.cjs',
      'trello_actions_create-card.cjs',
      'paypal_actions_get-balance.cjs',
      'reddit_actions_list-posts.cjs',
      'canva_actions_list-designs.cjs',
    ]
    for (const name of expected) {
      expect(scriptSet.has(name), `Missing: ${name}`).toBe(true)
    }
  })

  describe('individual script shape', () => {
    const samples = [
      'slack_actions_list-channels.cjs',
      'notion_actions_search-pages.cjs',
      'google_actions_list-events.cjs',
      'github_actions_list-repos.cjs',
      'hubspot_actions_create-contact.cjs',
      'salesforce_actions_create-lead.cjs',
      'zendesk_actions_create-ticket.cjs',
      'zoom_actions_create-meeting.cjs',
      'linear_actions_create-issue.cjs',
    ]

    for (const name of samples) {
      it(`${name} has correct structure`, () => {
        const mod = require(resolve(BUILD_DIR, name))
        const script = mod.default || mod
        expect(typeof script.exec).toBe('function')
        expect(script.exec.length).toBe(2) // (nango, input) => ...
        // Some templates use createAction() which doesn't set type='action'
        if (script.type) expect(script.type).toBe('action')
        expect(typeof script.description).toBe('string')
        expect(script.description.length).toBeGreaterThan(0)
      })
    }
  })
})
