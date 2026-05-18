import { describe, expect, it } from 'vitest'

import {
  detectBuilderIntentProfile,
  recommendProfileCapabilities,
} from './intent-profiles'
import { shortlistTemplates } from './template-shortlist'

describe('builder intent profiles', () => {
  it('detects the personal-agent profile from a broad prompt', () => {
    const profile = detectBuilderIntentProfile('create my personal agent')

    expect(profile?.id).toBe('personal-agent')
    expect(profile?.suggestedIntegrations).toContain('calendar')
    expect(profile?.suggestedIntegrations).toContain('email')
  })

  it('detects the personal-agent profile through common assistant typos', () => {
    const profile = detectBuilderIntentProfile('start daily assistnat')

    expect(profile?.id).toBe('personal-agent')
  })

  it('falls back to the personal-agent profile for generic noisy assistant asks', () => {
    const profile = detectBuilderIntentProfile('createe assisntat')

    expect(profile?.id).toBe('personal-agent')
    expect(profile?.suggestedIntegrations).toContain('tasks')
  })

  it('detects the personal-agent profile through noisy accented personal-assistant prompts', () => {
    const profile = detectBuilderIntentProfile('daily êrsonal assistant')

    expect(profile?.id).toBe('personal-agent')
    expect(profile?.suggestedIntegrations).toContain('calendar')
  })

  it('recommends relevant capabilities from the registry for a matched profile', () => {
    const suggestions = recommendProfileCapabilities({
      profile: detectBuilderIntentProfile('create my personal agent'),
      registry: {
        internalTools: [],
        templates: [],
        skills: [
          {
            slug: 'calendar-ops',
            name: 'Calendar Ops',
            source: 'catalog',
            requiredTools: [],
            requiredServers: [],
          },
          {
            slug: 'email-triage',
            name: 'Email Triage',
            source: 'catalog',
            requiredTools: [],
            requiredServers: [],
          },
        ],
        plugins: [
          {
            slug: 'gmail',
            name: 'Gmail',
            installed: false,
            riskLevel: 'low',
            toolNames: ['gmail.read'],
          },
        ],
        toolServers: [
          {
            name: 'calendar-mcp',
            transport: 'http',
            url: 'mcp://calendar-mcp',
            source: 'skill-variant',
          },
        ],
      },
    })

    expect(suggestions.skills.map((item) => item.slug)).toContain('calendar-ops')
    expect(suggestions.plugins.map((item) => item.slug)).toContain('gmail')
  })

  it('lets official templates dominate recommendation when they match strongly', () => {
    const matches = shortlistTemplates(
      [
        {
          id: '1',
          slug: 'support-agent',
          name: 'Support Agent',
          description: 'Handle support requests and escalations.',
          category: 'support',
          kind: 'agent',
          source: 'platform',
          status: 'approved',
          is_public: true,
          owner_org_id: null,
          spec: { kind: 'agent', system_prompt: 'Support' },
          params: [],
          preview_prompt: 'Customer support',
          tags: ['support', 'helpdesk'],
          install_count: 10,
          created_by: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          version: '1.0.0',
          changelog: null,
          forked_from_id: null,
          forked_from_ver: null,
          component_type: null,
          cert_status: 'uncertified',
          cert_score: null,
          cert_checked_at: null,
          outcome_data: {},
        },
      ],
      'create a support agent',
    )

    expect(matches[0]?.slug).toBe('support-agent')
    expect((matches[0]?.score ?? 0) > 0).toBe(true)
  })
})
