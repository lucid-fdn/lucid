import { describe, expect, it } from 'vitest'
import { vercelSandboxProvider } from '../sandbox-providers/vercel'

describe('vercel sandbox provider', () => {
  it('uses the mock sandbox in test mode', async () => {
    const result = await vercelSandboxProvider.validate({
      files: [{ path: 'package.json', content: '{"type":"module"}' }],
      commands: [{ cmd: 'npm', args: ['run', 'build'] }],
      env: { SECRET: 'hidden' },
      networkPolicy: { allow: ['registry.npmjs.org'] },
    })

    expect(result).toMatchObject({
      provider: 'mock',
      passed: true,
    })
    expect(result.logs.join('\n')).toContain('Mock sandbox validation passed.')
    expect(result.metadata?.env).toEqual({ SECRET: '[redacted]' })
  })
})
