import { describe, it, expect, afterEach } from 'vitest'
import { NATIVE_DENY, NATIVE_DENY_DEDICATED, buildOpenClawToolPolicy } from '../native-deny.js'

describe('NATIVE_DENY (shared)', () => {
  it('contains all dangerous tools', () => {
    expect(NATIVE_DENY).toContain('exec')
    expect(NATIVE_DENY).toContain('browser')
    expect(NATIVE_DENY).toContain('read')
    expect(NATIVE_DENY).toContain('write')
    expect(NATIVE_DENY).toContain('edit')
  })

  it('contains tenancy-unsafe tools', () => {
    expect(NATIVE_DENY).toContain('memory_search')
    expect(NATIVE_DENY).toContain('memory_get')
    expect(NATIVE_DENY).toContain('canvas')
  })

  it('contains Lucid-replaced tools', () => {
    expect(NATIVE_DENY).toContain('cron')
    expect(NATIVE_DENY).toContain('sessions_send')
    expect(NATIVE_DENY).toContain('sessions_spawn')
    expect(NATIVE_DENY).toContain('gateway')
  })

  it('does NOT deny safe native tools', () => {
    expect(NATIVE_DENY).not.toContain('web_search')
    expect(NATIVE_DENY).not.toContain('web_fetch')
    expect(NATIVE_DENY).not.toContain('image')
    expect(NATIVE_DENY).not.toContain('pdf')
  })
})

describe('NATIVE_DENY_DEDICATED', () => {
  it('is empty — all native tools allowed on dedicated', () => {
    expect(NATIVE_DENY_DEDICATED).toHaveLength(0)
  })

  it('does NOT deny dangerous tools (safe on dedicated — agent owns container)', () => {
    expect(NATIVE_DENY_DEDICATED).not.toContain('exec')
    expect(NATIVE_DENY_DEDICATED).not.toContain('browser')
    expect(NATIVE_DENY_DEDICATED).not.toContain('read')
    expect(NATIVE_DENY_DEDICATED).not.toContain('write')
    expect(NATIVE_DENY_DEDICATED).not.toContain('edit')
    expect(NATIVE_DENY_DEDICATED).not.toContain('process')
    expect(NATIVE_DENY_DEDICATED).not.toContain('apply_patch')
  })

  it('does NOT deny tenancy-unsafe tools (single-tenant on dedicated)', () => {
    expect(NATIVE_DENY_DEDICATED).not.toContain('memory_search')
    expect(NATIVE_DENY_DEDICATED).not.toContain('memory_get')
    expect(NATIVE_DENY_DEDICATED).not.toContain('canvas')
    expect(NATIVE_DENY_DEDICATED).not.toContain('tts')
  })

  it('does NOT deny cron/messaging/subagent (native versions used on dedicated)', () => {
    expect(NATIVE_DENY_DEDICATED).not.toContain('cron')
    expect(NATIVE_DENY_DEDICATED).not.toContain('sessions_send')
    expect(NATIVE_DENY_DEDICATED).not.toContain('sessions_spawn')
    expect(NATIVE_DENY_DEDICATED).not.toContain('message')
    expect(NATIVE_DENY_DEDICATED).not.toContain('subagents')
  })
})

describe('buildOpenClawToolPolicy', () => {
  afterEach(() => {
    delete process.env.OPENCLAW_NATIVE_DENY_EXTRA
    delete process.env.LUCID_RUNTIME_ID
  })

  it('uses full deny list on shared worker', () => {
    delete process.env.LUCID_RUNTIME_ID
    const policy = buildOpenClawToolPolicy()
    expect(policy).toHaveProperty('tools.deny')
    expect(policy.tools.deny).toContain('exec')
    expect(policy.tools.deny).toContain('browser')
    expect(policy.tools.deny).toContain('memory_search')
    expect(policy.tools.deny).toContain('cron')
    expect(policy.tools.deny).toContain('sessions_send')
    expect(policy.tools.deny).toContain('sessions_spawn')
  })

  it('uses empty deny list on dedicated runtime (all native allowed)', () => {
    process.env.LUCID_RUNTIME_ID = '00000000-0000-0000-0000-000000000001'
    const policy = buildOpenClawToolPolicy()
    // Nothing denied — all native tools available
    expect(policy.tools.deny).toHaveLength(0)
    expect(policy.tools.deny).not.toContain('exec')
    expect(policy.tools.deny).not.toContain('browser')
    expect(policy.tools.deny).not.toContain('read')
    expect(policy.tools.deny).not.toContain('write')
    expect(policy.tools.deny).not.toContain('memory_search')
    expect(policy.tools.deny).not.toContain('cron')
    expect(policy.tools.deny).not.toContain('sessions_send')
    expect(policy.tools.deny).not.toContain('sessions_spawn')
  })

  it('includes extra deny from env on shared', () => {
    process.env.OPENCLAW_NATIVE_DENY_EXTRA = 'new_tool,another_tool'
    const policy = buildOpenClawToolPolicy()
    expect(policy.tools.deny).toContain('new_tool')
    expect(policy.tools.deny).toContain('another_tool')
    // Still has base deny
    expect(policy.tools.deny).toContain('exec')
  })

  it('includes extra deny on dedicated too', () => {
    process.env.LUCID_RUNTIME_ID = '00000000-0000-0000-0000-000000000001'
    process.env.OPENCLAW_NATIVE_DENY_EXTRA = 'custom_block'
    const policy = buildOpenClawToolPolicy()
    expect(policy.tools.deny).toContain('custom_block')
    // But no base deny on dedicated
    expect(policy.tools.deny).toHaveLength(1)
  })
})
