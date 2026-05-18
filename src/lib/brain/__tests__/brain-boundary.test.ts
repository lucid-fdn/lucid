import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const repoRoot = process.cwd()
const allowedDirectRetrievalImports = new Set([
  'src/lib/brain/query.ts',
  'src/lib/knowledge/service.ts',
])

describe('Brain runtime boundary', () => {
  it('keeps direct Knowledge retrieval behind queryBrain', () => {
    const offenders: string[] = []

    for (const file of walk(join(repoRoot, 'src'))) {
      if (!/\.(ts|tsx)$/.test(file)) continue
      if (file.includes(`${sep}__tests__${sep}`)) continue

      const normalized = relative(repoRoot, file).replaceAll('\\', '/')
      if (allowedDirectRetrievalImports.has(normalized)) continue

      const source = readFileSync(file, 'utf8')
      if (
        source.includes("from '@/lib/knowledge/service'") ||
        source.includes('from "@/lib/knowledge/service"') ||
        /\bretrieveKnowledgeContext\s*\(/.test(source)
      ) {
        offenders.push(normalized)
      }
    }

    expect(offenders).toEqual([])
  })
})

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      yield* walk(fullPath)
    } else if (stat.isFile()) {
      yield fullPath
    }
  }
}
