/**
 * Bot Framework JWT Validator for Microsoft Teams webhooks.
 *
 * Validates the `Authorization: Bearer <token>` header on incoming
 * activity POSTs from Bot Framework. Uses Microsoft's published JWKS
 * (OpenID Connect) to verify token signatures.
 *
 * jose's `createRemoteJWKSet` handles internal key caching + rotation
 * automatically. On "no applicable key" errors we force-create a fresh
 * JWKS instance and retry once (covers edge-case key rotation).
 *
 * Claims validated:
 *  - iss: must be `https://api.botframework.com`
 *  - aud: must match TEAMS_APP_ID env var (the bot's Azure AD app ID)
 *  - exp/nbf: standard time validation (jose handles this)
 */

import 'server-only'

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

const BOT_FRAMEWORK_OPENID_URL =
  'https://login.botframework.com/v1/.well-known/keys'

const EXPECTED_ISSUER = 'https://api.botframework.com'

// jose handles internal key caching + rotation. We hold a single instance
// and only recreate it on "no applicable key" errors (forced refresh).
let jwks = createRemoteJWKSet(new URL(BOT_FRAMEWORK_OPENID_URL))

export interface JwtValidationResult {
  valid: boolean
  payload?: JWTPayload
  error?: string
}

/**
 * Validate a Bot Framework JWT token.
 *
 * @param authHeader - The full `Authorization` header value (e.g. "Bearer eyJ...")
 * @param expectedAudience - The bot's Azure AD app ID (from channel secrets or env)
 * @returns validation result with payload on success
 */
export async function validateBotFrameworkJwt(
  authHeader: string | null,
  expectedAudience: string | null,
): Promise<JwtValidationResult> {
  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' }
  }

  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token || token === authHeader) {
    return { valid: false, error: 'Invalid Authorization header format' }
  }

  if (!expectedAudience) {
    // If no app ID configured, skip JWT validation (backwards compat)
    // This allows hosted/shared bots that don't have per-channel app IDs
    return { valid: true }
  }

  const verifyOpts = { issuer: EXPECTED_ISSUER, audience: expectedAudience }

  try {
    const { payload } = await jwtVerify(token, jwks, verifyOpts)
    return { valid: true, payload }
  } catch (err) {
    // On key not found, force-create a fresh JWKS instance and retry once
    if (err instanceof Error && err.message.includes('no applicable key')) {
      jwks = createRemoteJWKSet(new URL(BOT_FRAMEWORK_OPENID_URL))
      try {
        const { payload } = await jwtVerify(token, jwks, verifyOpts)
        return { valid: true, payload }
      } catch (retryErr) {
        return {
          valid: false,
          error: `JWT verification failed after key refresh: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
        }
      }
    }

    return {
      valid: false,
      error: `JWT verification failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
