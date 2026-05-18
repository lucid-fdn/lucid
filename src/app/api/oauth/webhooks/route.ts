/**
 * OAuth Webhooks API Route
 *
 * Receives webhooks from Nango when OAuth connections are created/updated/deleted.
 * Updates connection health status in DB and emits user notifications.
 *
 * Security:
 *   - HMAC-SHA256 signature verification (fail-closed)
 *   - crypto.timingSafeEqual to prevent timing attacks
 *
 * @see https://nango.dev/docs/implementation-guides/platform/webhooks-from-nango
 */

import { NextRequest, NextResponse } from 'next/server'
import { ErrorService } from '@/lib/errors/error-service'
import { syncConnectionHealth } from '@/lib/db/integration-health'
import { maskIdentifier, summarizeError } from '@/lib/logging/safe-log'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NANGO_HMAC_KEY = process.env.NANGO_HMAC_KEY

// ---------------------------------------------------------------------------
// HMAC Verification
// ---------------------------------------------------------------------------

function verifyHmacSignature(rawBody: string, signature: string | null): boolean {
  if (!NANGO_HMAC_KEY) {
    console.warn('[OAuth Webhook] NANGO_HMAC_KEY is not configured — rejecting webhook (fail closed)')
    return false
  }

  if (!signature) {
    console.error('[OAuth Webhook] No X-Nango-Signature header found')
    return false
  }

  try {
    const hmac = crypto.createHmac('sha256', NANGO_HMAC_KEY)
    hmac.update(rawBody)
    const expectedSignature = hmac.digest('hex')

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    )

    if (!isValid) {
      console.error('[OAuth Webhook] HMAC signature verification failed')
    }

    return isValid
  } catch (error) {
    console.error('[OAuth Webhook] HMAC verification error:', summarizeError(error))
    return false
  }
}

// ---------------------------------------------------------------------------
// POST /api/oauth/webhooks
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('X-Nango-Signature')

    if (!verifyHmacSignature(rawBody, signature)) {
      if (!NANGO_HMAC_KEY) {
        return NextResponse.json({ error: 'Webhook verification not configured' }, { status: 500 })
      }
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody)

    if (body.type === 'auth') {
      const { connectionId, endUser, providerConfigKey } = body

      if ((body.operation === 'creation' || body.operation === 'override') && body.success) {
        console.info('[OAuth Webhook] Connection created/overridden', {
          provider: providerConfigKey,
          userId: maskIdentifier(endUser?.endUserId),
          connectionId: maskIdentifier(connectionId),
        })

        // Restore connection health if it was previously broken
        void syncConnectionHealth(connectionId, 'active', providerConfigKey).catch(() => {})

      } else if (body.operation === 'deletion') {
        console.info('[OAuth Webhook] Connection deleted', {
          userId: maskIdentifier(endUser?.endUserId),
          connectionId: maskIdentifier(connectionId),
        })

        // Mark connection as revoked
        void syncConnectionHealth(connectionId, 'revoked', providerConfigKey).catch(() => {})

      } else if (body.operation === 'refresh' && !body.success) {
        console.warn('[OAuth Webhook] Token refresh failed', {
          provider: providerConfigKey,
          connectionId: maskIdentifier(connectionId),
          error: body.error,
          errorType: body.errorType,
        })

        // Mark connection as expired — token refresh failed
        void syncConnectionHealth(connectionId, 'expired', providerConfigKey, {
          error_code: body.errorType,
          error_message: body.error,
        }).catch(() => {})

      } else if (!body.success) {
        console.warn('[OAuth Webhook] OAuth failed', {
          operation: body.operation,
          error: body.error,
          errorType: body.errorType,
          endUserId: maskIdentifier(endUser?.endUserId),
        })
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[OAuth Webhook] Error processing webhook:', summarizeError(error))

    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/oauth/webhooks', method: 'POST' },
      tags: { layer: 'api', route: 'oauth-webhooks' },
    })

    // Return 200 to prevent webhook retries — error is logged for investigation
    return NextResponse.json({ received: true, error: 'Processing failed' })
  }
}

// ---------------------------------------------------------------------------
// GET /api/oauth/webhooks — health check
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'oauth-webhooks',
    hmacConfigured: !!NANGO_HMAC_KEY,
  })
}
