import { describe, expect, it } from 'vitest'

import type { TemplateCatalogEntry } from '@contracts/template'
import { shortlistTemplates } from './template-shortlist'

function makeTemplate(
  input: Pick<
    TemplateCatalogEntry,
    'slug' | 'name' | 'description' | 'category' | 'kind' | 'preview_prompt' | 'tags'
  >,
): TemplateCatalogEntry {
  return {
    id: input.slug,
    slug: input.slug,
    name: input.name,
    description: input.description,
    category: input.category,
    kind: input.kind,
    source: 'platform',
    status: 'approved',
    is_public: true,
    owner_org_id: null,
    spec: { kind: input.kind, system_prompt: input.name },
    params: [],
    preview_prompt: input.preview_prompt,
    tags: input.tags,
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
  }
}

const templates = [
  makeTemplate({
    slug: 'personal-agent',
    name: 'Personal Agent',
    description: 'A daily personal operator for email triage, calendar planning, reminders, and task organization.',
    category: 'productivity',
    kind: 'agent',
    preview_prompt: 'Help me stay on top of email, calendar planning, reminders, and day-to-day organization',
    tags: ['personal-assistant', 'email-triage', 'calendar-planning', 'task-management', 'daily-ops'],
  }),
  makeTemplate({
    slug: 'sales-outreach-lemlist',
    name: 'Lemlist Launcher',
    description: 'Build outbound prospect lists and launch personalized Lemlist sequences fast.',
    category: 'sales',
    kind: 'agent',
    preview_prompt: 'Prospect fintech ops leaders and launch a 3-step Lemlist campaign this week',
    tags: ['outbound-prospecting', 'lemlist-sequences', 'sales-personalization', 'campaign-launch'],
  }),
  makeTemplate({
    slug: 'ceo-briefing',
    name: 'Executive Brief',
    description: 'Arm leadership with one sharp weekly brief on performance, risk, and decisions.',
    category: 'operations',
    kind: 'team',
    preview_prompt: 'Prepare this week\'s CEO brief with key metrics, risks, and decisions',
    tags: ['executive-reporting', 'weekly-briefing', 'leadership-ops'],
  }),
  makeTemplate({
    slug: 'support-agent',
    name: 'Support Agent',
    description: 'Handle customer questions, billing triage, troubleshooting, and escalation routing.',
    category: 'support',
    kind: 'agent',
    preview_prompt: 'Answer customer questions and escalate billing issues to the right team',
    tags: ['customer-support', 'billing-triage', 'helpdesk', 'support-ops'],
  }),
  makeTemplate({
    slug: 'brand-monitor',
    name: 'Brand Watch',
    description: 'Monitor brand mentions, sentiment, and alerts across public channels.',
    category: 'monitoring',
    kind: 'agent',
    preview_prompt: 'Track brand mentions and post alerts when sentiment shifts',
    tags: ['brand-watch', 'mention-monitoring', 'social-listening', 'alerts'],
  }),
  makeTemplate({
    slug: 'contract-sentinel',
    name: 'Contract Sentinel',
    description: 'Track renewals, review clauses, and flag legal or compliance risk.',
    category: 'operations',
    kind: 'agent',
    preview_prompt: 'Review contracts for renewal risks and flag unusual clauses',
    tags: ['contract-review', 'legal-ops', 'renewal-tracking', 'compliance'],
  }),
]

describe('template shortlist', () => {
  it('ranks the personal template above sales outreach for typoed daily assistant prompts', () => {
    const matches = shortlistTemplates(templates, 'daily assistante')
    const personal = matches.find((match) => match.slug === 'personal-agent')
    const sales = matches.find((match) => match.slug === 'sales-outreach-lemlist')

    expect(matches[0]?.slug).toBe('personal-agent')
    expect(personal?.score).toBeGreaterThan(0)
    if (sales) {
      expect(sales.score).toBeLessThan(personal?.score ?? 0)
    } else {
      expect(matches.some((match) => match.slug === 'sales-outreach-lemlist')).toBe(false)
    }
  })

  it('keeps noisy accented personal-assistant prompts in the personal lane', () => {
    const matches = shortlistTemplates(templates, 'daily êrsonal assistant')

    expect(matches[0]?.slug).toBe('personal-agent')
  })

  it('keeps personal assistant prompts out of sales templates', () => {
    const matches = shortlistTemplates(templates, 'create my personal assistant')

    expect(matches[0]?.slug).toBe('personal-agent')
    expect(matches[0]?.reason).toContain('lane')
  })

  it('ranks executive and personal templates above sales for ceo daily assistant prompts', () => {
    const matches = shortlistTemplates(templates, 'create my ceo daily assistant')

    const personalIndex = matches.findIndex((match) => match.slug === 'personal-agent')
    const executiveIndex = matches.findIndex((match) => match.slug === 'ceo-briefing')
    const salesIndex = matches.findIndex((match) => match.slug === 'sales-outreach-lemlist')

    expect(personalIndex).toBeGreaterThanOrEqual(0)
    expect(executiveIndex).toBeGreaterThanOrEqual(0)
    if (salesIndex >= 0) {
      expect(personalIndex).toBeLessThan(salesIndex)
      expect(executiveIndex).toBeLessThan(salesIndex)
    } else {
      expect(matches.some((match) => match.slug === 'sales-outreach-lemlist')).toBe(false)
    }
  })

  it('ranks support templates first for support and billing prompts', () => {
    const matches = shortlistTemplates(templates, 'build a support agent for billing questions and escalations')

    expect(matches[0]?.slug).toBe('support-agent')
  })

  it('ranks monitoring templates first for brand watch prompts', () => {
    const matches = shortlistTemplates(templates, 'monitor our brand mentions and send alerts when sentiment drops')

    expect(matches[0]?.slug).toBe('brand-monitor')
  })

  it('ranks contract templates first for legal review prompts', () => {
    const matches = shortlistTemplates(templates, 'review customer contracts for renewal risk and clause issues')

    expect(matches[0]?.slug).toBe('contract-sentinel')
  })
})
