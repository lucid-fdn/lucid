/**
 * Credential Core — EnvVar Adapter
 *
 * Fallback adapter for self-hosted environments.
 * Checks environment variables following the convention:
 *   {PROVIDER}_TOKEN → {PROVIDER}_API_KEY → {PROVIDER}_SECRET_KEY
 *
 * e.g., for authProvider='slack':
 *   SLACK_TOKEN → SLACK_API_KEY → SLACK_SECRET_KEY
 */

import type { CredentialAdapter, EnvVarAdapterConfig, TokenResult } from './types.js'

const ENV_SUFFIXES = ['_TOKEN', '_API_KEY', '_SECRET_KEY'] as const

export class EnvVarAdapter implements CredentialAdapter {
  readonly name = 'env-var'
  private readonly prefixOverrides: Record<string, string>

  constructor(config?: EnvVarAdapterConfig) {
    this.prefixOverrides = config?.prefixOverrides ?? {}
  }

  isAvailable(): boolean {
    // Always available — env vars may or may not be set
    return true
  }

  async resolve(authProvider: string, _connectionId: string): Promise<TokenResult | null> {
    const prefix = this.prefixOverrides[authProvider] ?? authProvider.toUpperCase().replace(/-/g, '_')

    for (const suffix of ENV_SUFFIXES) {
      const envKey = `${prefix}${suffix}`
      const value = process.env[envKey]
      if (value) {
        return {
          accessToken: value,
          tokenType: 'api-key',
          metadata: { source: 'env-var', envKey },
        }
      }
    }

    return null
  }
}
