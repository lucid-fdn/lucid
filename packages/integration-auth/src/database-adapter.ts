/**
 * Credential Core — Database Adapter
 *
 * Resolves API keys and other non-OAuth credentials stored encrypted in the DB.
 * Uses AES-256-GCM with PBKDF2 key derivation (same scheme as src/lib/credentials/encryption.ts).
 *
 * The actual DB query is injected via config (no direct Supabase dependency).
 */

import crypto from 'node:crypto'
import type { CredentialAdapter, DatabaseAdapterConfig, TokenResult } from './types.js'

// Encryption constants (must match src/lib/credentials/encryption.ts)
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const SALT_LENGTH = 64
const TAG_LENGTH = 16
const KEY_LENGTH = 32
const ITERATIONS = 100_000

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(masterKey, salt, ITERATIONS, KEY_LENGTH, 'sha512')
}

function decrypt(encryptedBase64: string, masterKey: string): string {
  const combined = Buffer.from(encryptedBase64, 'base64')

  const salt = combined.subarray(0, SALT_LENGTH)
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH)

  const key = deriveKey(masterKey, salt)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export class DatabaseAdapter implements CredentialAdapter {
  readonly name = 'database'
  private readonly config: DatabaseAdapterConfig

  constructor(config: DatabaseAdapterConfig) {
    this.config = config
  }

  isAvailable(): boolean {
    return !!(this.config.encryptionKey && this.config.encryptionKey.length >= 32 && this.config.fetchEncryptedCredential)
  }

  async resolve(authProvider: string, connectionId: string): Promise<TokenResult | null> {
    if (!this.isAvailable()) return null

    try {
      const row = await this.config.fetchEncryptedCredential(authProvider, connectionId)
      if (!row) return null

      const decrypted = decrypt(row.encryptedData, this.config.encryptionKey)
      const parsed = JSON.parse(decrypted) as Record<string, unknown>

      // Extract the token value — supports multiple field names
      const accessToken =
        (parsed.access_token as string) ??
        (parsed.accessToken as string) ??
        (parsed.key as string) ??
        (parsed.api_key as string) ??
        (parsed.token as string)

      if (!accessToken) return null

      return {
        accessToken,
        tokenType: (row.tokenType as TokenResult['tokenType']) ?? 'api-key',
        expiresAt: row.expiresAt ?? undefined,
      }
    } catch (error) {
      console.error(`[credential-core:database] Error resolving ${authProvider}/${connectionId}:`, error)
      return null
    }
  }
}
