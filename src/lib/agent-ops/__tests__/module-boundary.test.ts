import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const agentOpsRoot = join(process.cwd(), 'src/lib/agent-ops')

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      return entry === '__tests__' ? [] : listSourceFiles(fullPath)
    }
    return fullPath.endsWith('.ts') ? [fullPath] : []
  })
}

describe('Agent Ops module boundaries', () => {
  it('does not import the legacy visual workflow surface', () => {
    const forbidden = [
      '@/lib/workflow',
      'src/lib/workflow',
      '@/stores/workflow',
      'src/stores/workflow',
      '@/components/workflow',
      'src/components/workflow',
      'app/(workflow)',
    ]

    for (const file of listSourceFiles(agentOpsRoot)) {
      const source = readFileSync(file, 'utf8')
      for (const pattern of forbidden) {
        expect(source, `${file} imports ${pattern}`).not.toContain(pattern)
      }
    }
  })

  it('does not import concrete channel or runtime implementations', () => {
    const forbidden = [
      '@/lib/telegram',
      '@/lib/discord',
      '@/lib/whatsapp',
      '@/lib/channels/slack',
      'worker/src',
      '@/lib/db/client',
    ]

    for (const file of listSourceFiles(agentOpsRoot)) {
      const source = readFileSync(file, 'utf8')
      for (const pattern of forbidden) {
        expect(source, `${file} imports ${pattern}`).not.toContain(pattern)
      }
    }
  })
})
