import { describe, it, expect } from 'vitest'
import { buildSkillsSnapshotFromRows } from '../snapshot-builder.js'
import type { ActiveSkillRow } from '../types.js'

function makeRow(overrides: Partial<ActiveSkillRow> = {}): ActiveSkillRow {
  return {
    skill_slug: 'test-skill',
    skill_name: 'Test Skill',
    skill_description: 'A test skill',
    sanitized_content: 'Use this skill for testing.\n',
    frontmatter: {},
    sort_order: 100,
    content_chars: 27,
    ...overrides,
  }
}

describe('buildSkillsSnapshotFromRows', () => {
  it('returns empty snapshot for empty input', () => {
    const snapshot = buildSkillsSnapshotFromRows([])
    expect(snapshot.resolvedSkills).toEqual([])
    expect(snapshot.skills).toEqual([])
    expect(snapshot.prompt).toBe('')
  })

  it('resolvedSkills is always an array, never undefined', () => {
    const snapshot = buildSkillsSnapshotFromRows([])
    expect(Array.isArray(snapshot.resolvedSkills)).toBe(true)
    expect(snapshot.resolvedSkills).not.toBeUndefined()
  })

  it('builds resolved skills with synthetic filePath and baseDir', () => {
    const snapshot = buildSkillsSnapshotFromRows([makeRow()])
    expect(snapshot.resolvedSkills[0].filePath).toBe('db://skills/test-skill')
    expect(snapshot.resolvedSkills[0].baseDir).toBe('db://skills')
  })

  it('respects sort_order', () => {
    const rows = [
      makeRow({ skill_slug: 'b', sort_order: 200 }),
      makeRow({ skill_slug: 'a', sort_order: 100 }),
    ]
    // Rows arrive pre-sorted, but verify output order matches
    const snapshot = buildSkillsSnapshotFromRows(rows)
    expect(snapshot.resolvedSkills[0].name).toBe('b')
    expect(snapshot.resolvedSkills[1].name).toBe('a')
  })

  it('enforces 30K char budget', () => {
    // Each skill ~10K chars → only 3 fit in 30K
    const bigContent = 'x'.repeat(10_000)
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow({
        skill_slug: `skill-${i}`,
        sanitized_content: bigContent,
        content_chars: 10_000,
        sort_order: i,
      })
    )
    const snapshot = buildSkillsSnapshotFromRows(rows)
    expect(snapshot.resolvedSkills.length).toBe(3)
  })

  it('enforces 150 skill count limit', () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      makeRow({
        skill_slug: `skill-${i}`,
        content_chars: 10,
        sort_order: i,
      })
    )
    const snapshot = buildSkillsSnapshotFromRows(rows)
    expect(snapshot.resolvedSkills.length).toBe(150)
  })

  it('renders inline prompt with <available_skills> XML', () => {
    const snapshot = buildSkillsSnapshotFromRows([makeRow()])
    expect(snapshot.prompt).toContain('<available_skills>')
    expect(snapshot.prompt).toContain('</available_skills>')
    expect(snapshot.prompt).toContain('<skill name="test-skill"')
    expect(snapshot.prompt).toContain('Use this skill for testing.')
  })

  it('populates skills array with primaryEnv from frontmatter', () => {
    const row = makeRow({ frontmatter: { primaryEnv: 'NODE_ENV', requires: { env: ['API_KEY'] } } })
    const snapshot = buildSkillsSnapshotFromRows([row])
    expect(snapshot.skills[0].primaryEnv).toBe('NODE_ENV')
    expect(snapshot.skills[0].requiredEnv).toEqual(['API_KEY'])
  })
})
