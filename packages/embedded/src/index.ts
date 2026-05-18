/**
 * Embedded Skills Bundle
 *
 * Re-exports all lucid-plugins MCP server factory functions for in-process
 * embedding via InMemoryTransport.
 */

import { createRequire } from 'node:module'

export { EmbeddedRegistry } from './registry.js'

const nodeRequire = createRequire(import.meta.url)

const OPTIONAL_PACKAGES = [
  '@lucid-fdn/audit',
  '@lucid-fdn/bridge',
  '@lucid-fdn/compete',
  '@lucid-fdn/feedback',
  '@lucid-fdn/hype',
  '@lucid-fdn/invoice',
  '@lucid-fdn/meet',
  '@lucid-fdn/metrics',
  '@lucid-fdn/moralis',
  '@lucid-fdn/observability',
  '@lucid-fdn/predict',
  '@lucid-fdn/propose',
  '@lucid-fdn/prospect',
  '@lucid-fdn/quantum',
  '@lucid-fdn/recruit',
  '@lucid-fdn/seo',
  '@lucid-fdn/tax',
  '@lucid-fdn/trade',
  '@lucid-fdn/veille',
  '@lucid-fdn/video',
] as const

function hasOptionalPackage(packageName: string): boolean {
  try {
    nodeRequire.resolve(packageName)
    return true
  } catch {
    return false
  }
}

const hasEmbeddedPlugins = OPTIONAL_PACKAGES.some(hasOptionalPackage)

export const VERSION = hasEmbeddedPlugins ? '1.5.0' : '0.0.0-stub'

async function createOptionalServer(packageName: string, exportName: string): Promise<unknown> {
  try {
    const mod = await import(packageName)
    const factory = (mod as Record<string, unknown>)[exportName]
    if (typeof factory !== 'function') {
      throw new Error(`${packageName} does not export ${exportName}`)
    }
    return factory()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Embedded plugin package ${packageName} is not available: ${message}`)
  }
}

export function createAuditServer() { return createOptionalServer('@lucid-fdn/audit', 'createAuditServer') }
export function createBridgeServer() { return createOptionalServer('@lucid-fdn/bridge', 'createBridgeServer') }
export function createCompeteServer() { return createOptionalServer('@lucid-fdn/compete', 'createCompeteServer') }
export function createFeedbackServer() { return createOptionalServer('@lucid-fdn/feedback', 'createFeedbackServer') }
export function createHypeServer() { return createOptionalServer('@lucid-fdn/hype', 'createHypeServer') }
export function createInvoiceServer() { return createOptionalServer('@lucid-fdn/invoice', 'createInvoiceServer') }
export function createMeetServer() { return createOptionalServer('@lucid-fdn/meet', 'createMeetServer') }
export function createMetricsServer() { return createOptionalServer('@lucid-fdn/metrics', 'createMetricsServer') }
export function createMoralisServer() { return createOptionalServer('@lucid-fdn/moralis', 'createMoralisServer') }
export function createObservabilityServer() { return createOptionalServer('@lucid-fdn/observability', 'createObservabilityServer') }
export function createPredictServer() { return createOptionalServer('@lucid-fdn/predict', 'createPredictServer') }
export function createProposeServer() { return createOptionalServer('@lucid-fdn/propose', 'createProposeServer') }
export function createProspectServer() { return createOptionalServer('@lucid-fdn/prospect', 'createProspectServer') }
export function createQuantumServer() { return createOptionalServer('@lucid-fdn/quantum', 'createQuantumServer') }
export function createRecruitServer() { return createOptionalServer('@lucid-fdn/recruit', 'createRecruitServer') }
export function createSeoServer() { return createOptionalServer('@lucid-fdn/seo', 'createSeoServer') }
export function createTaxServer() { return createOptionalServer('@lucid-fdn/tax', 'createTaxServer') }
export function createTradeServer() { return createOptionalServer('@lucid-fdn/trade', 'createTradeServer') }
export function createVeilleServer() { return createOptionalServer('@lucid-fdn/veille', 'createVeilleServer') }
export function createVideoServer() { return createOptionalServer('@lucid-fdn/video', 'createVideoServer') }
