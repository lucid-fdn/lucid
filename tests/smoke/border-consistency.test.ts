import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Smoke test: Ensures no agent-facing component files regress to
 * border-white/[0.04] or border-white/[0.06] (should be border-zinc-800).
 * Also ensures no raw `border-white` usage (should be border-zinc-100 for active indicators).
 *
 * Launchpad files are excluded — different design system.
 */

const AGENT_FACING_DIRS = [
  'src/components/panels',
  'src/components/introspection',
  'src/components/assistant',
]

const BORDER_OPACITY_VIOLATION = /border-white\/\[0\.0[46]\]/g
const BORDER_WHITE_RAW = /\bborder-white\b/g

// Active tab indicators intentionally use border-zinc-100 (not border-white)
// If border-white appears here, it's a regression
const KNOWN_EXCLUSIONS: string[] = []

function collectFiles(dir: string): string[] {
  const root = path.resolve(__dirname, '../../', dir)
  if (!fs.existsSync(root)) return []
  const files: string[] = []
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(d, entry.name))
      else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        files.push(path.join(d, entry.name))
      }
    }
  }
  walk(root)
  return files
}

describe('Border consistency smoke test', () => {
  const violations: Array<{ file: string; line: number; text: string; type: string }> = []

  for (const dir of AGENT_FACING_DIRS) {
    for (const file of collectFiles(dir)) {
      const relFile = path.relative(path.resolve(__dirname, '../../'), file)
      if (KNOWN_EXCLUSIONS.includes(relFile)) continue

      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      lines.forEach((line, idx) => {
        if (BORDER_OPACITY_VIOLATION.test(line)) {
          violations.push({
            file: relFile,
            line: idx + 1,
            text: line.trim(),
            type: 'opacity',
          })
        }
        // Reset lastIndex for global regex
        BORDER_OPACITY_VIOLATION.lastIndex = 0

        if (BORDER_WHITE_RAW.test(line)) {
          // Allow hover:bg-white/[0.04] and similar non-border uses
          // Only flag actual border-white class usage
          violations.push({
            file: relFile,
            line: idx + 1,
            text: line.trim(),
            type: 'raw',
          })
        }
        BORDER_WHITE_RAW.lastIndex = 0
      })
    }
  }

  it('has zero border-white/[0.04] or border-white/[0.06] in agent-facing components', () => {
    const opacityViolations = violations.filter((v) => v.type === 'opacity')
    if (opacityViolations.length > 0) {
      const report = opacityViolations
        .map((v) => `  ${v.file}:${v.line} → ${v.text}`)
        .join('\n')
      expect.fail(
        `Found ${opacityViolations.length} border-white opacity violation(s). Use border-zinc-800 instead:\n${report}`,
      )
    }
    expect(opacityViolations).toHaveLength(0)
  })

  it('has zero raw border-white in agent-facing components (use border-zinc-100 for active states)', () => {
    const rawViolations = violations.filter((v) => v.type === 'raw')
    if (rawViolations.length > 0) {
      const report = rawViolations
        .map((v) => `  ${v.file}:${v.line} → ${v.text}`)
        .join('\n')
      expect.fail(
        `Found ${rawViolations.length} raw border-white usage(s). Use border-zinc-100 instead:\n${report}`,
      )
    }
    expect(rawViolations).toHaveLength(0)
  })
})
