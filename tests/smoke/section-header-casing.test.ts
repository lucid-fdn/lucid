import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Smoke test: Agent-facing section headers must use sentence case,
 * not uppercase tracking-wider. Exceptions:
 * - ≤11px metadata labels (fine per visual rules)
 * - Launchpad (separate design system)
 */

const AGENT_FACING_DIRS = [
  'src/components/panels',
  'src/components/introspection',
  'src/components/assistant',
]

// Matches class strings that combine uppercase + tracking-wider
// (which indicates a section header, not a small metadata label)
const UPPERCASE_HEADER = /uppercase\s+tracking-wider|tracking-wider\s+uppercase/

function collectTsxFiles(dir: string): string[] {
  const root = path.resolve(__dirname, '../../', dir)
  if (!fs.existsSync(root)) return []
  const files: string[] = []
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(d, entry.name))
      else if (entry.name.endsWith('.tsx')) files.push(path.join(d, entry.name))
    }
  }
  walk(root)
  return files
}

describe('Section header casing smoke test', () => {
  const violations: Array<{ file: string; line: number; text: string }> = []

  for (const dir of AGENT_FACING_DIRS) {
    for (const file of collectTsxFiles(dir)) {
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      lines.forEach((line, idx) => {
        // Skip lines with text-[10px] or text-[11px] — those are metadata labels
        if (/text-\[1[01]px\]/.test(line)) return
        if (UPPERCASE_HEADER.test(line)) {
          violations.push({
            file: path.relative(path.resolve(__dirname, '../../'), file),
            line: idx + 1,
            text: line.trim(),
          })
        }
      })
    }
  }

  it('has no uppercase tracking-wider section headers in agent-facing components', () => {
    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} → ${v.text}`)
        .join('\n')
      expect.fail(
        `Found ${violations.length} uppercase header(s). Use sentence case instead:\n${report}`,
      )
    }
    expect(violations).toHaveLength(0)
  })
})
