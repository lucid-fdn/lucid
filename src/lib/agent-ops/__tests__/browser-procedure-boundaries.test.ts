import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PRODUCT_LAYER_FILES = [
  'src/lib/agent-ops/browser-procedures.ts',
  'src/lib/db/agent-ops-browser-procedures.ts',
  'src/app/api/agent-ops/browser-procedures/route.ts',
  'src/app/api/agent-ops/browser-procedures/[id]/route.ts',
  'src/app/api/agent-ops/browser-procedures/[id]/versions/route.ts',
  'src/app/api/agent-ops/browser-procedures/[id]/runs/route.ts',
  'src/app/api/agent-ops/runs/[id]/promote-browser-procedure/route.ts',
]

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"][^'"]*openclaw[^'"]*['"]/i,
  /from\s+['"][^'"]*hermes[^'"]*['"]/i,
  /from\s+['"][^'"]*playwright[^'"]*['"]/i,
  /from\s+['"][^'"]*puppeteer[^'"]*['"]/i,
  /from\s+['"][^'"]*browser-use[^'"]*['"]/i,
  /require\(\s*['"][^'"]*(openclaw|hermes|playwright|puppeteer|browser-use)[^'"]*['"]\s*\)/i,
]

describe('Browser Procedure product-layer boundaries', () => {
  it('does not import concrete browser engines or agent runtimes', () => {
    for (const file of PRODUCT_LAYER_FILES) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8')
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(source, `${file} should stay runtime/engine agnostic`).not.toMatch(pattern)
      }
    }
  })
})
