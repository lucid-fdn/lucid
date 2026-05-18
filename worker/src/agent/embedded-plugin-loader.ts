// TODO: [lucid-plugins migration] Move domain-specific tool implementations
// (polymarket trade/automation/hedge, dex, wallet, hyperliquid) from worker/src/
// to the lucid-plugins monorepo as MCP servers, installable via plugin catalog.
// See: docs/plans/2026-03-21-mission-control-deferred.md

/**
 * Embedded Plugin Loader
 *
 * Maps plugin slugs to lucid-plugins MCP server factories.
 * Lazy: only creates McpServer on first tool call for that plugin.
 * Falls through gracefully if a plugin can't be loaded.
 *
 * Renamed from "skill loader" — these are MCP servers (plugins), not skills (prompts).
 * See: docs/plans/2026-03-23-unified-capability-architecture-rfc.md
 */

import { registerEmbeddedServer, isEmbeddedServer } from './embedded-registry.js'
import { addBreadcrumb, captureError } from '../monitoring/sentry.js'

type ServerFactory = () => unknown // McpServer — avoid importing the type at top-level

const PLUGIN_FACTORIES: Record<string, () => Promise<ServerFactory>> = {
  'lucid-trade':         async () => (await import('@lucid-fdn/plugins-embedded')).createTradeServer,
  'lucid-quantum':       async () => (await import('@lucid-fdn/plugins-embedded')).createQuantumServer,
  'lucid-seo':           async () => (await import('@lucid-fdn/plugins-embedded')).createSeoServer,
  'lucid-audit':         async () => (await import('@lucid-fdn/plugins-embedded')).createAuditServer,
  'lucid-tax':           async () => (await import('@lucid-fdn/plugins-embedded')).createTaxServer,
  'lucid-veille':        async () => (await import('@lucid-fdn/plugins-embedded')).createVeilleServer,
  // lucid-helius: removed — now an internal data provider, not a user-facing plugin
  'lucid-hype':          async () => (await import('@lucid-fdn/plugins-embedded')).createHypeServer,
  'lucid-compete':       async () => (await import('@lucid-fdn/plugins-embedded')).createCompeteServer,
  'lucid-prospect':      async () => (await import('@lucid-fdn/plugins-embedded')).createProspectServer,
  'lucid-recruit':       async () => (await import('@lucid-fdn/plugins-embedded')).createRecruitServer,
  'lucid-bridge':        async () => (await import('@lucid-fdn/plugins-embedded')).createBridgeServer,
  'lucid-meet':          async () => (await import('@lucid-fdn/plugins-embedded')).createMeetServer,
  'lucid-invoice':       async () => (await import('@lucid-fdn/plugins-embedded')).createInvoiceServer,
  'lucid-propose':       async () => (await import('@lucid-fdn/plugins-embedded')).createProposeServer,
  'lucid-metrics':       async () => (await import('@lucid-fdn/plugins-embedded')).createMetricsServer,
  // lucid-moralis: removed — now an internal data provider, not a user-facing plugin
  'lucid-feedback':      async () => (await import('@lucid-fdn/plugins-embedded')).createFeedbackServer,
  'lucid-video':         async () => (await import('@lucid-fdn/plugins-embedded')).createVideoServer,
  'lucid-observability': async () => (await import('@lucid-fdn/plugins-embedded')).createObservabilityServer,
}

/** Number of first-party embedded plugins available */
export const FIRST_PARTY_PLUGIN_COUNT = Object.keys(PLUGIN_FACTORIES).length

let bundleVersion: string | undefined

const loadingServers = new Map<string, Promise<void>>()

export async function ensureEmbeddedPlugin(slug: string): Promise<boolean> {
  if (isEmbeddedServer(slug)) return true
  if (!(slug in PLUGIN_FACTORIES)) return false

  if (!loadingServers.has(slug)) {
    loadingServers.set(slug, (async () => {
      try {
        const t0 = Date.now()
        const getFactory = PLUGIN_FACTORIES[slug]
        const factory = await getFactory()

        // Capture bundle version on first load
        if (!bundleVersion) {
          try {
            const mod = await import('@lucid-fdn/plugins-embedded')
            bundleVersion = (mod as Record<string, unknown>).VERSION as string || 'unknown'
            console.log(`[embedded] Bundle version: ${bundleVersion}`)
          } catch { bundleVersion = 'unknown' }
        }

        const server = await Promise.resolve(factory())
        // registerEmbeddedServer expects McpServer — the factory returns one
        registerEmbeddedServer(server as never, slug)
        addBreadcrumb(`Loaded plugin: ${slug} (${Date.now() - t0}ms)`, 'embedded')
        console.log(`[embedded] Registered: ${slug}`)
      } catch (err) {
        loadingServers.delete(slug) // Allow retry on next call
        captureError(err, { plugin: slug, phase: 'plugin_load' })
        throw err
      }
    })())
  }

  await loadingServers.get(slug)
  return true
}

export function isFirstPartyPlugin(slug: string): boolean {
  return slug in PLUGIN_FACTORIES
}

/** Get the loaded bundle version (undefined until first plugin is loaded) */
export function getBundleVersion(): string | undefined {
  return bundleVersion
}
