import { describe, expect, it } from 'vitest'
import {
  getPrimaryShellPage,
  normalizePublicShellManifest,
} from '../public-shell-core'

describe('public shell core', () => {
  it('normalizes generated app manifests for public rendering', () => {
    const manifest = normalizePublicShellManifest({
      name: 'Support Concierge',
      slug: 'support-concierge',
      description: 'Answers support questions.',
      outcome: 'Resolve support issues faster.',
      capabilities: ['chat', 'lead', 'unknown'],
      theme: { mode: 'dark', radius: 'md', primary_color: '#2563eb' },
      pages: [
        {
          path: '/',
          title: 'Home',
          blocks: [
            { id: 'hero', type: 'hero', props: { title: 'Support Concierge' } },
            { id: 'chat', type: 'demo_chat' },
          ],
        },
      ],
      marketplace: {
        demo_prompts: ['How can you help?'],
        tags: ['support'],
      },
      system_prompt: 'do not render',
      oauth_token: 'refresh_secret',
    }, {
      name: 'Fallback',
      slug: 'fallback',
    })

    expect(manifest.name).toBe('Support Concierge')
    expect(manifest.capabilities).toEqual(['chat', 'lead'])
    expect(manifest.theme).toMatchObject({ mode: 'dark', radius: 'md', primary_color: '#2563eb' })
    expect(manifest.consent.transcript_retention_days).toBe(30)
    expect(getPrimaryShellPage(manifest).blocks).toHaveLength(2)
    expect(JSON.stringify(manifest)).not.toContain('refresh_secret')
    expect(JSON.stringify(manifest)).not.toContain('do not render')
  })

  it('creates sensible default pages from sparse manifests', () => {
    const manifest = normalizePublicShellManifest({}, {
      name: 'Ops Monitor',
      slug: 'ops-monitor',
    })

    expect(manifest.name).toBe('Ops Monitor')
    expect(manifest.slug).toBe('ops-monitor')
    expect(manifest.capabilities).toEqual(['status'])
    expect(manifest.consent.transcript_retention_days).toBe(30)
    expect(getPrimaryShellPage(manifest).blocks.map((block) => block.type)).toContain('proof_metrics')
  })
})
