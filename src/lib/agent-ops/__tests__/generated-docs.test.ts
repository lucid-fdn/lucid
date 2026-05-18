import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('Agent Ops generated docs', () => {
  it('keeps capability docs fresh', { timeout: 15_000 }, () => {
    expect(() => {
      const command = process.platform === 'win32' ? 'cmd.exe' : 'npm'
      const args = process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npm run agent-ops:capability-docs:check']
        : ['run', 'agent-ops:capability-docs:check']
      execFileSync(command, args, {
        cwd: process.cwd(),
        stdio: 'pipe',
      })
    }).not.toThrow()
  })
})
