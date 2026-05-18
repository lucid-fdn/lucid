import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Runtime Lockdown — SaaS Security Guarantee', () => {
  it('vendored SKILL.md files exist on disk', () => {
    const openclawDir = path.resolve(__dirname, '../../../../../packages/openclaw-core')
    const skillPath = path.join(openclawDir, 'extensions', 'diffs', 'skills', 'diffs', 'SKILL.md')
    expect(fs.existsSync(openclawDir)).toBe(true)
    if (fs.existsSync(openclawDir)) {
      expect(fs.existsSync(skillPath)).toBe(true)
    }
  })
})

import { buildOpenClawRunConfig } from '../../runtime/embedded.js'
import { buildSkillsSnapshotFromRows } from '../snapshot-builder.js'

describe('buildOpenClawRunConfig — actual function', () => {
  it('disables filesystem skill discovery', () => {
    const config = buildOpenClawRunConfig('https://example.com')
    expect(config.skills).toEqual({ load: { extraDirs: [], disabled: true } })
  })

  it('disables plugin auto-loading', () => {
    const config = buildOpenClawRunConfig('https://example.com')
    expect(config.plugins).toEqual({ enabled: false, installs: [] })
  })

  it('returns a fresh object each call (immutable per-run)', () => {
    const a = buildOpenClawRunConfig('https://example.com')
    const b = buildOpenClawRunConfig('https://example.com')
    expect(a).not.toBe(b)
    a.tools.deny.push('test')
    expect(b.tools.deny).toHaveLength(0)
  })
})

describe('SkillSnapshot fallback safety', () => {
  it('empty rows produce resolvedSkills=[] (not undefined)', () => {
    const snapshot = buildSkillsSnapshotFromRows([])
    expect(snapshot.resolvedSkills).toEqual([])
    expect(snapshot.resolvedSkills).not.toBeUndefined()
  })

  it('snapshot uses custom inline formatter (not formatSkillsForPrompt file paths)', () => {
    const snapshot = buildSkillsSnapshotFromRows([{
      skill_slug: 'test',
      skill_name: 'Test',
      skill_description: 'desc',
      sanitized_content: 'content\n',
      frontmatter: {},
      sort_order: 100,
      content_chars: 8,
    }])
    // Must NOT contain file path references or "read tool" instructions
    expect(snapshot.prompt).not.toContain('<location>')
    expect(snapshot.prompt).not.toContain('read tool')
    expect(snapshot.prompt).not.toContain('filePath')
    // Must contain inline content
    expect(snapshot.prompt).toContain('content')
    expect(snapshot.prompt).toContain('<available_skills>')
  })
})
