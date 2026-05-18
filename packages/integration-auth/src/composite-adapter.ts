/**
 * Credential Core — Composite Adapter
 *
 * Chains adapters in priority order: Nango → Database → EnvVar.
 * Returns the first non-null result (first-wins strategy).
 *
 * This is the primary entry point for credential resolution at runtime.
 */

import type { CredentialAdapter, CompositeAdapterConfig, TokenResult } from './types.js'
import { NangoAdapter } from './nango-adapter.js'
import { DatabaseAdapter } from './database-adapter.js'
import { EnvVarAdapter } from './env-var-adapter.js'

export class CompositeAdapter implements CredentialAdapter {
  readonly name = 'composite'
  private readonly chain: CredentialAdapter[]

  constructor(config: CompositeAdapterConfig) {
    this.chain = []

    // Build chain in priority order
    if (config.nango) {
      this.chain.push(new NangoAdapter(config.nango))
    }
    if (config.database) {
      this.chain.push(new DatabaseAdapter(config.database))
    }
    // EnvVar is always last (fallback)
    this.chain.push(new EnvVarAdapter(config.envVar))
  }

  /**
   * Create a composite adapter from explicit adapter instances.
   * Useful when you want to inject custom or mock adapters.
   */
  static fromAdapters(adapters: CredentialAdapter[]): CompositeAdapter {
    const instance = Object.create(CompositeAdapter.prototype) as CompositeAdapter
    Object.defineProperty(instance, 'name', { value: 'composite' })
    Object.defineProperty(instance, 'chain', { value: adapters })
    return instance
  }

  isAvailable(): boolean {
    return this.chain.some((a) => a.isAvailable())
  }

  async resolve(authProvider: string, connectionId: string): Promise<TokenResult | null> {
    for (const adapter of this.chain) {
      if (!adapter.isAvailable()) continue

      try {
        const result = await adapter.resolve(authProvider, connectionId)
        if (result) return result
      } catch (error) {
        // Log and continue to next adapter (graceful degradation)
        console.error(`[credential-core:composite] ${adapter.name} failed for ${authProvider}/${connectionId}:`, error)
      }
    }

    return null
  }

  /** Get the list of adapters in the chain (for diagnostics). */
  getAdapterNames(): string[] {
    return this.chain.map((a) => `${a.name}${a.isAvailable() ? '' : ' (unavailable)'}`)
  }
}
