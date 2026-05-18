import { describe, expect, it } from 'vitest'

import { RETAIL_TEMPLATES, getTemplateBySlug } from '../templates'
import type { RetailTemplate } from '../types'

const VALID_CHANNELS: Array<RetailTemplate['defaultChannel']> = [
  'telegram',
  'web',
  'slack',
  'discord',
]
const VALID_AUDIENCES: Array<RetailTemplate['audience']> = ['generic', 'crypto']
const VALID_SOULS: Array<RetailTemplate['soulPreset']> = [
  'friendly',
  'professional',
  'witty',
  'expert',
  'concise',
]

describe('RETAIL_TEMPLATES', () => {
  it('contains the 10 templates documented in the plan', () => {
    expect(RETAIL_TEMPLATES).toHaveLength(10)
  })

  it('has unique kebab-case slugs', () => {
    const slugs = RETAIL_TEMPLATES.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })

  it('every template uses valid enum values', () => {
    for (const t of RETAIL_TEMPLATES) {
      expect(VALID_CHANNELS).toContain(t.defaultChannel)
      expect(VALID_AUDIENCES).toContain(t.audience)
      expect(VALID_SOULS).toContain(t.soulPreset)
    }
  })

  it('every template has 3 sample prompts and a positive cost cap', () => {
    for (const t of RETAIL_TEMPLATES) {
      expect(t.samplePrompts).toHaveLength(3)
      expect(t.monthlyCostCapUsd).toBeGreaterThan(0)
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.tagline.length).toBeGreaterThan(0)
      expect(t.description.length).toBeGreaterThan(0)
    }
  })

  it('covers both audiences', () => {
    const audiences = new Set(RETAIL_TEMPLATES.map((t) => t.audience))
    expect(audiences.has('generic')).toBe(true)
    expect(audiences.has('crypto')).toBe(true)
  })
})

describe('getTemplateBySlug', () => {
  it('returns the template when the slug exists', () => {
    const t = getTemplateBySlug('personal-research-assistant')
    expect(t).not.toBeNull()
    expect(t?.slug).toBe('personal-research-assistant')
  })

  it('returns null for an unknown slug', () => {
    expect(getTemplateBySlug('does-not-exist')).toBeNull()
  })
})
