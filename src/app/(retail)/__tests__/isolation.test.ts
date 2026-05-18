import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

describe('retail boundary enforcement', () => {
  it('blocks imports from src/components/assistant/* in retail files', { timeout: 30000 }, async () => {
    const eslint = new ESLint({ overrideConfigFile: 'eslint.config.mjs' })
    const results = await eslint.lintText(
      `import { Foo } from '@/components/assistant/something'\nexport const x = Foo`,
      { filePath: 'src/components/retail/__forbidden__.tsx' },
    )
    const messages = results[0]?.messages ?? []
    const restricted = messages.find((m) => m.ruleId === 'no-restricted-imports')
    expect(restricted, 'expected no-restricted-imports to fire').toBeDefined()
  })

  it('blocks imports from src/app/(app)/* in retail files', { timeout: 30000 }, async () => {
    const eslint = new ESLint({ overrideConfigFile: 'eslint.config.mjs' })
    const results = await eslint.lintText(
      `import { Foo } from '@/app/(app)/something'\nexport const x = Foo`,
      { filePath: 'src/components/retail/__forbidden__.tsx' },
    )
    const messages = results[0]?.messages ?? []
    const restricted = messages.find((m) => m.ruleId === 'no-restricted-imports')
    expect(restricted, 'expected no-restricted-imports to fire').toBeDefined()
  })
})
