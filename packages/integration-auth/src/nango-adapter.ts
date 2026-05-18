/**
 * Credential Core — Nango Adapter
 *
 * Resolves OAuth credentials via the self-hosted Nango server.
 * Nango manages token refresh automatically — we just fetch the current token.
 *
 * Server: lucid.foundation/Nango
 */

import type { CredentialAdapter, NangoAdapterConfig, TokenResult } from './types.js'
import { fetchWithRetry } from './retry.js'

export class NangoAdapter implements CredentialAdapter {
  readonly name = 'nango'
  private readonly config: NangoAdapterConfig

  constructor(config: NangoAdapterConfig) {
    this.config = config
  }

  isAvailable(): boolean {
    return !!(this.config.serverUrl && this.config.secretKey)
  }

  async resolve(authProvider: string, connectionId: string): Promise<TokenResult | null> {
    if (!this.isAvailable()) return null

    try {
      // Nango REST API: GET /connection/:connectionId
      // Returns the current access token (auto-refreshed by Nango).
      const url = `${this.config.serverUrl}/connection/${encodeURIComponent(connectionId)}`
      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          'Provider-Config-Key': authProvider,
        },
        timeoutMs: 10_000,
        maxRetries: 3,
        label: `nango:${authProvider}`,
      })

      if (!response.ok) {
        if (response.status === 404) return null
        const text = await response.text().catch(() => '')
        console.error(`[credential-core:nango] ${response.status} for ${authProvider}/${connectionId}: ${text}`)
        return null
      }

      const data = (await response.json()) as {
        credentials?: {
          access_token?: string
          token_type?: string
          expires_at?: string
          refresh_token?: string
          raw?: Record<string, unknown>
        }
      }

      const creds = data.credentials
      if (!creds?.access_token) return null

      return {
        accessToken: creds.access_token,
        tokenType: (creds.token_type?.toLowerCase() === 'bearer' ? 'bearer' : 'api-key') as TokenResult['tokenType'],
        expiresAt: creds.expires_at ?? undefined,
        refreshToken: creds.refresh_token ?? undefined,
        metadata: creds.raw,
      }
    } catch (error) {
      console.error(`[credential-core:nango] Error resolving ${authProvider}/${connectionId}:`, error)
      return null
    }
  }
}
