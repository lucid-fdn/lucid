import { describe, it, expect } from 'vitest'
import { scanSkillFiles, parseSkillFile, classifySkillChange } from '../import-openclaw-skills.js'
import path from 'path'
import fs from 'fs'

describe('scanSkillFiles', () => {
  it('finds SKILL.md files in the vendored openclaw-core', () => {
    // Resolve from worker dir up to repo root
    const openclawDir = path.resolve(__dirname, '../../../../../packages/openclaw-core')
    if (!fs.existsSync(openclawDir)) return
    const files = scanSkillFiles(openclawDir)
    expect(files.length).toBeGreaterThan(0)
    expect(files.every(f => f.endsWith('SKILL.md'))).toBe(true)
  })
})

describe('parseSkillFile', () => {
  it('parses a real SKILL.md file from vendored repo', () => {
    const openclawRoot = path.resolve(__dirname, '../../../../../packages/openclaw-core')
    const skillPath = path.join(openclawRoot, 'extensions', 'diffs', 'skills', 'diffs', 'SKILL.md')
    if (!fs.existsSync(skillPath)) return

    const result = parseSkillFile(skillPath, openclawRoot)
    expect(result).not.toBeNull()
    if (!result) return

    expect(result.slug).toBe('diffs-diffs')
    expect(result.name).toBe('diffs')
    expect(typeof result.sanitizedContent).toBe('string')
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects file over 256KB', () => {
    const tmpPath = path.join(process.cwd(), '__test_large_skill.md')
    try {
      fs.writeFileSync(tmpPath, '---\nname: big\ndescription: too big\n---\n' + 'x'.repeat(300_000))
      const result = parseSkillFile(tmpPath, process.cwd())
      expect(result).toBeNull()
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    }
  })
})

describe('classifySkillChange', () => {
  it('returns "new" when no existing hash', () => {
    expect(classifySkillChange(undefined, 'abc123')).toBe('new')
  })

  it('returns "unchanged" when hashes match', () => {
    expect(classifySkillChange('abc123', 'abc123')).toBe('unchanged')
  })

  it('returns "changed" when hashes differ', () => {
    expect(classifySkillChange('abc123', 'def456')).toBe('changed')
  })
})
