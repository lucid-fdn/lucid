/**
 * PM Adapter Registry — Worker-side copy.
 *
 * Parallel to `src/lib/pm-sync/registry.ts`. The worker cannot import
 * from src/ so the registry is duplicated. Adapters register themselves
 * via `registerAdapter()` from their own barrel file (side-effect import).
 *
 * Design: docs/plans/2026-04-08-pm-external-adapter-plan.md Section B.2
 */

import type { PmAdapter, PmProvider } from './types.js'

const adapters = new Map<PmProvider, PmAdapter>()

export function registerAdapter(adapter: PmAdapter): void {
  adapters.set(adapter.provider, adapter)
}

export function getAdapter(provider: PmProvider): PmAdapter | null {
  return adapters.get(provider) ?? null
}

export function listRegisteredProviders(): PmProvider[] {
  return Array.from(adapters.keys()).sort()
}

export function __resetRegistryForTests(): void {
  adapters.clear()
}
