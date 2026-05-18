/**
 * Shared AES-256-GCM decryption for channel secrets.
 *
 * Channel secrets are stored as "iv:authTag:ciphertext" hex strings.
 * Used by inbound.ts, outbound.ts, and DiscordGatewayManager.
 */

import crypto from 'node:crypto'
import { redact } from '../utils/pii-redactor.js'

/**
 * Decrypt an AES-256-GCM encrypted string in "ivHex:authTagHex:ciphertextHex" format.
 * Returns the parsed JSON object, or {} on any failure.
 */
export function decryptChannelSecrets(
  encrypted: string,
  keyHex: string,
): Record<string, string> {
  try {
    const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':')

    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const ciphertext = Buffer.from(ciphertextHex, 'hex')
    const key = Buffer.from(keyHex, 'hex')

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(ciphertext, undefined, 'utf8')
    decrypted += decipher.final('utf8')

    return JSON.parse(decrypted)
  } catch (error) {
    console.error('[decrypt] Failed to decrypt channel secrets:', redact(error instanceof Error ? error.message : String(error)))
    return {}
  }
}
