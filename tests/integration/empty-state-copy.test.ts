import { describe, it, expect } from 'vitest'
import { EMPTY_STATE_EXPRESSIONS, getEmptyState } from '@/lib/expressions/index'

/**
 * Integration test: Validates all EMPTY_STATE_EXPRESSIONS follow
 * the "emotional headline + practical CTA" pattern.
 *
 * Rules:
 * - title ends with period
 * - description ends with period
 * - No exclamation marks
 * - No playful/snarky words (crickets, calm before storm, etc.)
 * - getEmptyState returns valid entry for each category
 */

const PLAYFUL_WORDS = [
  'crickets',
  'calm before the storm',
  'shh',
  'shhh',
  'tumbleweeds',
  'echo echo',
  'boo',
  'peek-a-boo',
  'knock knock',
  'radio silence',
  'ghost town',
]

const ALL_CATEGORIES = Object.keys(EMPTY_STATE_EXPRESSIONS)

describe('Empty state copy consistency', () => {
  it('all categories have at least 2 entries', () => {
    for (const category of ALL_CATEGORIES) {
      const entries = EMPTY_STATE_EXPRESSIONS[category]
      expect(entries.length, `${category} should have ≥2 entries`).toBeGreaterThanOrEqual(2)
    }
  })

  it('all titles end with a period', () => {
    const failures: string[] = []
    for (const [category, entries] of Object.entries(EMPTY_STATE_EXPRESSIONS)) {
      for (const entry of entries) {
        if (!entry.title.endsWith('.')) {
          failures.push(`${category}: "${entry.title}"`)
        }
      }
    }
    expect(failures, `Titles missing periods:\n${failures.join('\n')}`).toHaveLength(0)
  })

  it('all descriptions end with a period', () => {
    const failures: string[] = []
    for (const [category, entries] of Object.entries(EMPTY_STATE_EXPRESSIONS)) {
      for (const entry of entries) {
        if (!entry.description.endsWith('.')) {
          failures.push(`${category}: "${entry.description}"`)
        }
      }
    }
    expect(failures, `Descriptions missing periods:\n${failures.join('\n')}`).toHaveLength(0)
  })

  it('no exclamation marks in any entry', () => {
    const failures: string[] = []
    for (const [category, entries] of Object.entries(EMPTY_STATE_EXPRESSIONS)) {
      for (const entry of entries) {
        if (entry.title.includes('!') || entry.description.includes('!')) {
          failures.push(`${category}: "${entry.title}" / "${entry.description}"`)
        }
      }
    }
    expect(failures, `Exclamation marks found:\n${failures.join('\n')}`).toHaveLength(0)
  })

  it('no playful/snarky words in any entry', () => {
    const failures: string[] = []
    for (const [category, entries] of Object.entries(EMPTY_STATE_EXPRESSIONS)) {
      for (const entry of entries) {
        const combined = `${entry.title} ${entry.description}`.toLowerCase()
        for (const word of PLAYFUL_WORDS) {
          if (combined.includes(word)) {
            failures.push(`${category}: "${entry.title}" contains "${word}"`)
          }
        }
      }
    }
    expect(failures, `Playful/snarky words found:\n${failures.join('\n')}`).toHaveLength(0)
  })

  it('getEmptyState returns valid entry for each category', () => {
    for (const category of ALL_CATEGORIES) {
      const result = getEmptyState(category)
      expect(result.title).toBeTruthy()
      expect(result.description).toBeTruthy()
      expect(typeof result.title).toBe('string')
      expect(typeof result.description).toBe('string')
    }
  })

  it('getEmptyState is deterministic for same seed', () => {
    for (const category of ALL_CATEGORIES) {
      const first = getEmptyState(category, 'test-seed-123')
      const second = getEmptyState(category, 'test-seed-123')
      expect(first).toEqual(second)
    }
  })

  it('getEmptyState varies with different seeds', () => {
    // At least one category should show variation across different seeds
    let hasVariation = false
    for (const category of ALL_CATEGORIES) {
      const results = new Set<string>()
      for (let i = 0; i < 20; i++) {
        results.add(getEmptyState(category, `seed-${i}`).title)
      }
      if (results.size > 1) {
        hasVariation = true
        break
      }
    }
    expect(hasVariation).toBe(true)
  })

  it('expected categories exist', () => {
    const expected = ['agents', 'feed', 'context', 'memories', 'conversations', 'assistants']
    for (const cat of expected) {
      expect(EMPTY_STATE_EXPRESSIONS[cat], `Missing category: ${cat}`).toBeDefined()
    }
  })
})
