/**
 * PM Adapter Registry — Maps `PmProvider` → `PmAdapter` instance.
 *
 * Mirrors the shape of `worker/src/agent/embedded-plugin-loader.ts`:
 * a plain Map populated at module init, no lazy imports, no DB roundtrip.
 * Adapters register themselves via `registerAdapter()` inside their own
 * `index.ts` barrel — the control plane then calls `getAdapter(provider)`
 * to dispatch.
 *
 * This file is intentionally empty of adapter imports. The webhook route
 * and config API import per-adapter `index.ts` files which call
 * `registerAdapter()` as a side effect. That keeps compile dependencies
 * linear (no circular imports between dispatcher → registry → adapters).
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.2
 */

import 'server-only'
import type { PmAdapter, PmProvider } from '@contracts/pm-adapter'

const adapters = new Map<PmProvider, PmAdapter>()

/**
 * Register (or replace) the adapter for a provider. Safe to call multiple
 * times — the last registration wins. Tests use this to inject fakes.
 */
export function registerAdapter(adapter: PmAdapter): void {
  adapters.set(adapter.provider, adapter)
}

/**
 * Fetch the adapter for a provider. Returns null if none is registered —
 * callers MUST handle the null case so an unknown provider in a DB row
 * (e.g., 'jira' before we implement it) does not crash the dispatcher.
 */
export function getAdapter(provider: PmProvider): PmAdapter | null {
  return adapters.get(provider) ?? null
}

/**
 * List all registered providers. Used by the org-config API to enumerate
 * which providers are available in the current deployment.
 */
export function listRegisteredProviders(): PmProvider[] {
  return Array.from(adapters.keys()).sort()
}

/**
 * Test-only: drop every adapter. Never called from production code.
 */
export function __resetRegistryForTests(): void {
  adapters.clear()
}
