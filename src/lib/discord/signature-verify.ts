/**
 * Discord interaction signature verification.
 *
 * Discord signs every interactions POST with Ed25519. The signature is
 * computed over `(timestamp || raw_body)` using the application's public
 * key (hex). Verification MUST happen on the raw text body — parsing JSON
 * first will corrupt whitespace/ordering and break the hash.
 *
 * We use Node's built-in crypto (no tweetnacl dependency). Node 18+ supports
 * `crypto.verify('ed25519', ...)` with raw 32-byte public keys via DER SPKI
 * wrapping. We hand-roll the SPKI prefix for Ed25519 (RFC 8410):
 *   30 2a 30 05 06 03 2b 65 70 03 21 00 <32-byte-key>
 *
 * Docs: https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
 */

import { createPublicKey, verify } from 'node:crypto'

/**
 * Ed25519 SPKI DER prefix. Any 32-byte raw public key with this prefix
 * becomes a parseable SPKI blob that Node's KeyObject accepts.
 */
const ED25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
])

function hexToBuffer(hex: string): Buffer | null {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) return null
  return Buffer.from(hex, 'hex')
}

/**
 * Build a KeyObject from a 32-byte raw Ed25519 public key in hex.
 * Returns null on any malformation. Cached per hex string to avoid
 * re-parsing the SPKI blob on every interaction.
 */
const keyCache = new Map<string, ReturnType<typeof createPublicKey>>()
function parsePublicKey(hex: string) {
  const cached = keyCache.get(hex)
  if (cached) return cached

  const raw = hexToBuffer(hex)
  if (!raw || raw.length !== 32) return null

  const spki = Buffer.concat([ED25519_SPKI_PREFIX, raw])
  try {
    const key = createPublicKey({
      key: spki,
      format: 'der',
      type: 'spki',
    })
    keyCache.set(hex, key)
    return key
  } catch {
    return null
  }
}

export interface VerifyDiscordSignatureInput {
  /** Hex-encoded 32-byte Ed25519 public key from the Discord application. */
  publicKeyHex: string
  /** `X-Signature-Ed25519` header — 128 hex chars (64-byte signature). */
  signatureHex: string
  /** `X-Signature-Timestamp` header — UNIX seconds as a string. */
  timestamp: string
  /** Raw request body, exactly as it appeared on the wire. */
  rawBody: string
}

/**
 * Verify a Discord interactions POST signature. Returns true only when all
 * of: public key parses, signature is well-formed, timestamp is present, and
 * the Ed25519 verify succeeds over `timestamp || rawBody`.
 *
 * Constant-time w.r.t. the signature by construction (crypto.verify uses a
 * constant-time comparison internally). Any exception is swallowed and
 * returns false — we never want an implementation bug to admit a bad
 * signature.
 */
export function verifyDiscordSignature(input: VerifyDiscordSignatureInput): boolean {
  if (!input.signatureHex || !input.timestamp || !input.rawBody) return false

  const key = parsePublicKey(input.publicKeyHex)
  if (!key) return false

  const signature = hexToBuffer(input.signatureHex)
  if (!signature || signature.length !== 64) return false

  const message = Buffer.concat([
    Buffer.from(input.timestamp, 'utf8'),
    Buffer.from(input.rawBody, 'utf8'),
  ])

  try {
    return verify(null, message, key, signature)
  } catch {
    return false
  }
}
