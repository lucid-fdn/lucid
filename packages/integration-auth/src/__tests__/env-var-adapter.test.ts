import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EnvVarAdapter } from '../env-var-adapter.js'

describe('EnvVarAdapter', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('isAvailable always returns true', () => {
    const adapter = new EnvVarAdapter()
    expect(adapter.isAvailable()).toBe(true)
  })

  it('resolves {PROVIDER}_TOKEN', async () => {
    process.env.SLACK_TOKEN = 'xoxb-slack-token'
    const adapter = new EnvVarAdapter()
    const result = await adapter.resolve('slack', 'conn-1')
    expect(result).toEqual({
      accessToken: 'xoxb-slack-token',
      tokenType: 'api-key',
      metadata: { source: 'env-var', envKey: 'SLACK_TOKEN' },
    })
  })

  it('falls through to {PROVIDER}_API_KEY', async () => {
    process.env.HUBSPOT_API_KEY = 'hb-key-123'
    const adapter = new EnvVarAdapter()
    const result = await adapter.resolve('hubspot', 'conn-1')
    expect(result?.accessToken).toBe('hb-key-123')
    expect(result?.metadata).toEqual({ source: 'env-var', envKey: 'HUBSPOT_API_KEY' })
  })

  it('falls through to {PROVIDER}_SECRET_KEY', async () => {
    process.env.NOTION_SECRET_KEY = 'secret_xyz'
    const adapter = new EnvVarAdapter()
    const result = await adapter.resolve('notion', 'conn-1')
    expect(result?.accessToken).toBe('secret_xyz')
  })

  it('returns null when no env var found', async () => {
    const adapter = new EnvVarAdapter()
    const result = await adapter.resolve('missing-provider', 'conn-1')
    expect(result).toBeNull()
  })

  it('handles hyphenated provider names', async () => {
    process.env.GOOGLE_SHEETS_TOKEN = 'gs-token'
    const adapter = new EnvVarAdapter()
    const result = await adapter.resolve('google-sheets', 'conn-1')
    expect(result?.accessToken).toBe('gs-token')
  })

  it('supports prefix overrides', async () => {
    process.env.MY_CUSTOM_PREFIX_TOKEN = 'custom-val'
    const adapter = new EnvVarAdapter({ prefixOverrides: { slack: 'MY_CUSTOM_PREFIX' } })
    const result = await adapter.resolve('slack', 'conn-1')
    expect(result?.accessToken).toBe('custom-val')
  })
})
