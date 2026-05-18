import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

// Skip integration tests when @lucid-fdn/plugins-embedded is a stub (no lucid-plugins link)
const isStub = await import('@lucid-fdn/plugins-embedded').then(m => m.VERSION === '0.0.0-stub').catch(() => true)

// Skill factories require env vars to construct — set dummies for testing
beforeAll(() => {
  const prefixes = [
    'TRADE', 'PREDICT', 'QUANTUM', 'SEO', 'AUDIT', 'TAX', 'VEILLE',
    'HYPE', 'COMPETE', 'PROSPECT', 'RECRUIT', 'BRIDGE', 'MEET',
    'INVOICE', 'PROPOSE', 'METRICS', 'FEEDBACK', 'VIDEO', 'OBSERVABILITY',
  ]
  for (const p of prefixes) {
    process.env[`${p}_SUPABASE_URL`] ??= 'https://test.supabase.co'
    process.env[`${p}_SUPABASE_KEY`] ??= 'test-key'
    process.env[`${p}_TENANT_ID`] ??= 'test-tenant'
  }
  // Some skills check generic vars
  process.env.SUPABASE_URL ??= 'https://test.supabase.co'
  process.env.SUPABASE_KEY ??= 'test-key'
  process.env.TENANT_ID ??= 'test-tenant'
})

// Use vi.resetModules() for fresh module state per test group
async function freshImport() {
  vi.resetModules()
  return {
    loader: await import('../embedded-plugin-loader.js'),
    registry: await import('../embedded-registry.js'),
  }
}

describe('embedded-plugin-loader', () => {
  describe('isFirstPartyPlugin', () => {
    let loader: Awaited<ReturnType<typeof freshImport>>['loader']

    beforeEach(async () => {
      const mod = await freshImport()
      loader = mod.loader
    })

    it('returns true for known slugs', () => {
      const known = [
        'lucid-trade', 'lucid-quantum', 'lucid-seo',
        'lucid-audit', 'lucid-tax', 'lucid-veille', 'lucid-hype',
        'lucid-compete', 'lucid-prospect', 'lucid-recruit', 'lucid-bridge',
        'lucid-meet', 'lucid-invoice', 'lucid-propose', 'lucid-metrics',
        'lucid-feedback', 'lucid-video', 'lucid-observability',
      ]
      for (const slug of known) {
        expect(loader.isFirstPartyPlugin(slug), `${slug} should be first-party`).toBe(true)
      }
    })

    it('returns false for unknown slugs', () => {
      expect(loader.isFirstPartyPlugin('lucid-defi')).toBe(false) // pure markdown, no MCP
      expect(loader.isFirstPartyPlugin('lucid-unknown')).toBe(false)
      expect(loader.isFirstPartyPlugin('community-plugin')).toBe(false)
      expect(loader.isFirstPartyPlugin('')).toBe(false)
    })
  })

  describe.skipIf(isStub)('ensureEmbeddedPlugin (integration)', () => {
    it('loads lucid-seo and registers it in the registry', async () => {
      const { loader, registry } = await freshImport()

      // lucid-seo is a lightweight plugin — good for integration test
      expect(registry.isEmbeddedServer('lucid-seo')).toBe(false)

      const loaded = await loader.ensureEmbeddedPlugin('lucid-seo')
      expect(loaded).toBe(true)
      expect(registry.isEmbeddedServer('lucid-seo')).toBe(true)

      // Call a real tool
      const result = await registry.callEmbeddedTool('lucid-seo', 'seo_status', {})
      expect(result.isError).toBe(false)
      expect(result.content.length).toBeGreaterThan(0)
    }, 30_000)

    it('returns false for unknown slug', async () => {
      const { loader } = await freshImport()
      const result = await loader.ensureEmbeddedPlugin('not-a-real-plugin')
      expect(result).toBe(false)
    })

    it('second call reuses cached server (idempotent)', async () => {
      const { loader, registry } = await freshImport()

      await loader.ensureEmbeddedPlugin('lucid-seo')
      const count1 = registry.embeddedServerCount()

      await loader.ensureEmbeddedPlugin('lucid-seo')
      const count2 = registry.embeddedServerCount()

      expect(count1).toBe(count2) // No duplicate registrations
    }, 30_000)

    it('loads multiple plugins independently', async () => {
      const { loader, registry } = await freshImport()

      await Promise.all([
        loader.ensureEmbeddedPlugin('lucid-seo'),
        loader.ensureEmbeddedPlugin('lucid-hype'),
      ])

      expect(registry.isEmbeddedServer('lucid-seo')).toBe(true)
      expect(registry.isEmbeddedServer('lucid-hype')).toBe(true)
      expect(registry.embeddedServerCount()).toBe(2)
    }, 30_000)
  })
})
