/**
 * Discord hosted bot env audit.
 *
 * Per docs/plans/2026-04-08-discord-byob-and-shared-bot.md §2e, the hosted
 * Discord OAuth/install secrets (DISCORD_HOSTED_CLIENT_ID,
 * DISCORD_HOSTED_CLIENT_SECRET, DISCORD_HOSTED_PUBLIC_KEY) are control-plane
 * only. The worker may read DISCORD_HOSTED_BOT_TOKEN for shared-bot inbound
 * message handling, but must never depend on OAuth/client verification
 * credentials.
 *
 * This test is a source-level audit (not a runtime env check) so it catches
 * accidental references even if the env var happens to be unset locally.
 */

import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import path from 'node:path'

const WORKER_SRC = path.resolve(__dirname, '..')

function grepWorkerSrc(pattern: string): string[] {
  try {
    const out = execSync(
      `grep -rl --include='*.ts' --include='*.tsx' --include='*.js' -- ${JSON.stringify(pattern)} ${JSON.stringify(WORKER_SRC)}`,
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .toString()
      .trim()
    if (!out) return []
    return out
      .split('\n')
      .filter((p) => !p.endsWith('discord-hosted-env-audit.test.ts'))
  } catch {
    return []
  }
}

describe('Discord hosted bot env audit (worker)', () => {
  it('worker source contains no references to control-plane-only Discord secrets', () => {
    const hits = [
      ...grepWorkerSrc('DISCORD_HOSTED_CLIENT_ID'),
      ...grepWorkerSrc('DISCORD_HOSTED_CLIENT_SECRET'),
      ...grepWorkerSrc('DISCORD_HOSTED_PUBLIC_KEY'),
    ]
    expect(
      Array.from(new Set(hits)),
      `Control-plane-only Discord secrets must never be read by the worker. Found references in:\n  ${Array.from(new Set(hits)).join('\n  ')}`,
    ).toEqual([])
  })

  it('process.env does not contain control-plane-only DISCORD_HOSTED_* vars at worker boot', () => {
    const leaked = Object.keys(process.env).filter((k) =>
      ['DISCORD_HOSTED_CLIENT_ID', 'DISCORD_HOSTED_CLIENT_SECRET', 'DISCORD_HOSTED_PUBLIC_KEY'].includes(k),
    )
    expect(
      leaked,
      `Control-plane Discord secrets leaked into worker env: ${leaked.join(', ')}`,
    ).toEqual([])
  })
})
