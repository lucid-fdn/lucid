/**
 * Integration Test — In-Process Action Execution
 *
 * Tests the full in-process path: load real .cjs script → create mock adapter → exec.
 * No network calls — the adapter is mocked to verify scripts call the right methods.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type { NangoProxyAdapter } from '../nango-proxy-adapter.js'

const BUILD_DIR = resolve(import.meta.dirname, '../../../../../nango-integrations/build')
const require = createRequire(import.meta.url)

/** Create a mock adapter that records calls */
function createMockAdapter(proxyResponse: unknown = { data: { ok: true }, status: 200, headers: {} }): NangoProxyAdapter {
  const proxyCalls: Array<{ method: string; config: unknown }> = []
  const makeProxy = (method: string) => vi.fn(async (config: unknown) => {
    proxyCalls.push({ method, config })
    return proxyResponse
  })
  return {
    connectionId: 'test-conn',
    providerConfigKey: 'test-provider',
    proxy: makeProxy('proxy'),
    get: makeProxy('get'),
    post: makeProxy('post'),
    put: makeProxy('put'),
    patch: makeProxy('patch'),
    delete: makeProxy('delete'),
    getConnection: vi.fn().mockResolvedValue({ credentials: { access_token: 'mock-token' } }),
    log: vi.fn(),
    ActionError: class extends Error { type = 'action_script_runtime_error'; payload: Record<string, unknown>; constructor(p: Record<string, unknown>) { super((p.message as string) || ''); this.payload = p } },
    // Expose recorded calls for assertions
    _calls: proxyCalls,
  } as NangoProxyAdapter & { _calls: typeof proxyCalls }
}

function loadScript(integration: string, action: string) {
  const path = resolve(BUILD_DIR, `${integration}_actions_${action}.cjs`)
  if (!existsSync(path)) return null
  const mod = require(path)
  return mod.default || mod
}

describe('In-Process Action Execution', () => {
  describe('slack scripts', () => {
    it('list-channels calls proxy with conversations.list endpoint', async () => {
      const script = loadScript('slack', 'list-channels')
      expect(script).not.toBeNull()

      const adapter = createMockAdapter({
        data: { ok: true, channels: [{ id: 'C1', name: 'general' }] },
        status: 200,
        headers: {},
      }) as NangoProxyAdapter & { _calls: Array<{ method: string; config: any }> }

      const result = await script.exec(adapter, {})
      expect(result).toBeTruthy()
      expect(adapter._calls.length).toBeGreaterThanOrEqual(1)
      const call = adapter._calls[0]
      expect(call.config.endpoint).toContain('conversations.list')
    })

    it('list-users calls proxy with users.list endpoint', async () => {
      const script = loadScript('slack', 'list-users')
      expect(script).not.toBeNull()

      const adapter = createMockAdapter({
        data: { ok: true, members: [{ id: 'U1', name: 'alice' }] },
        status: 200,
        headers: {},
      }) as NangoProxyAdapter & { _calls: Array<{ method: string; config: any }> }

      const result = await script.exec(adapter, {})
      expect(result).toBeTruthy()
      expect(adapter._calls[0].config.endpoint).toContain('users.list')
    })
  })

  describe('notion scripts', () => {
    it('search-pages calls proxy with search endpoint', async () => {
      const script = loadScript('notion', 'search-pages')
      expect(script).not.toBeNull()

      const adapter = createMockAdapter({
        data: { results: [{ id: 'page-1', object: 'page' }], has_more: false },
        status: 200,
        headers: {},
      }) as NangoProxyAdapter & { _calls: Array<{ method: string; config: any }> }

      const result = await script.exec(adapter, { query: 'test' })
      expect(result).toBeTruthy()
      expect(adapter._calls.length).toBeGreaterThanOrEqual(1)
      const call = adapter._calls[0]
      expect(call.config.endpoint).toContain('search')
    })

    it('list-users calls proxy with users endpoint', async () => {
      const script = loadScript('notion', 'list-users')
      expect(script).not.toBeNull()

      const adapter = createMockAdapter({
        data: { results: [{ id: 'user-1', name: 'Bob' }], has_more: false },
        status: 200,
        headers: {},
      }) as NangoProxyAdapter & { _calls: Array<{ method: string; config: any }> }

      const result = await script.exec(adapter, {})
      expect(result).toBeTruthy()
      expect(adapter._calls[0].config.endpoint).toContain('users')
    })
  })

  describe('github scripts', () => {
    it('list-repos calls proxy with user/repos endpoint', async () => {
      const script = loadScript('github', 'list-repos')
      expect(script).not.toBeNull()

      const adapter = createMockAdapter({
        data: [{ id: 1, name: 'my-repo', full_name: 'user/my-repo' }],
        status: 200,
        headers: {},
      }) as NangoProxyAdapter & { _calls: Array<{ method: string; config: any }> }

      const result = await script.exec(adapter, {})
      expect(result).toBeTruthy()
      expect(adapter._calls.length).toBeGreaterThanOrEqual(1)
      const call = adapter._calls[0]
      expect(call.config.endpoint).toMatch(/repos/)
    })
  })

  describe('error handling', () => {
    it('script throws ActionError on API failure', async () => {
      const script = loadScript('slack', 'list-channels')
      expect(script).not.toBeNull()

      const adapter = createMockAdapter({
        data: { ok: false, error: 'invalid_auth' },
        status: 200,
        headers: {},
      })

      await expect(script.exec(adapter, {})).rejects.toThrow()
    })

    it('script receives input args correctly', async () => {
      const script = loadScript('notion', 'search-pages')
      expect(script).not.toBeNull()

      const adapter = createMockAdapter({
        data: { results: [], has_more: false },
        status: 200,
        headers: {},
      }) as NangoProxyAdapter & { _calls: Array<{ method: string; config: any }> }

      await script.exec(adapter, { query: 'my-search-term' })
      // Verify the script used the input (should appear in the proxy call body)
      const call = adapter._calls[0]
      const bodyStr = JSON.stringify(call.config)
      expect(bodyStr).toContain('my-search-term')
    })
  })
})
