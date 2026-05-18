/**
 * OAuth Provider Disconnect API Route
 *
 * DELETE /api/oauth/[provider] — Disconnect a provider connection.
 *
 * Flow:
 *   1. Verify assistant ownership (if assistantId provided)
 *   2. Cleanup local DB (parallel):
 *      - Remove assistant_oauth_bindings
 *      - Revoke org_integration_connections + clear active_connection_id
 *   3. Best-effort delete from Nango (short timeout, non-blocking for UX)
 *
 * Security:
 *   - Rate limited (10/min per user)
 *   - Assistant ownership verified via org membership
 *   - Timeout protected (30s)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { OAuthRateLimits } from '@/lib/oauth/rate-limits'
import { nangoFetch } from '@/lib/oauth/nango-fetch'
import { supabase } from '@/lib/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NANGO_API_URL = process.env.NANGO_API_BASE || `${process.env.NEXT_PUBLIC_OAUTH_API_URL || 'http://localhost:3001'}/nango`
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params

  try {
    const userId = await requireUserId()

    const rl = await checkRateLimit(`oauth:disconnect:${userId}`, OAuthRateLimits.DISCONNECT)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      )
    }

    let body: { connectionId?: string; assistantId?: string } = {}
    try {
      body = await request.json()
    } catch {
      // Body might be empty
    }

    const { connectionId, assistantId } = body

    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 })
    }

    // -----------------------------------------------------------------------
    // 1. Verify assistant ownership (if assistantId provided)
    // -----------------------------------------------------------------------
    if (assistantId) {
      const { data: assistant } = await supabase
        .from('ai_assistants')
        .select('org_id')
        .eq('id', assistantId)
        .single()

      if (!assistant?.org_id) {
        return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
      }

      const { data: membership } = await supabase
        .from('organization_members')
        .select('id')
        .eq('org_id', assistant.org_id)
        .eq('user_id', userId)
        .single()

      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // -----------------------------------------------------------------------
    // 2. Cleanup local DB (parallel)
    // -----------------------------------------------------------------------
    const cleanups: PromiseLike<void>[] = []

    // 3a. Remove assistant_oauth_bindings
    if (assistantId) {
      cleanups.push(
        supabase
          .from('assistant_oauth_bindings')
          .delete()
          .eq('assistant_id', assistantId)
          .eq('provider', provider)
          .then(({ error }) => {
            if (error) console.error('[OAuth Disconnect] assistant_oauth_bindings delete failed:', error)
          }),
      )
    }

    // 3b. Revoke org_integration_connections + clear active_connection_id
    cleanups.push(
      supabase
        .from('org_integration_connections')
        .update({ status: 'revoked', disconnected_at: new Date().toISOString() })
        .eq('connection_id', connectionId)
        .eq('auth_provider', provider)
        .select('id, org_id, plugin_id')
        .then(async ({ data: connRows }) => {
          if (!connRows?.length) return
          // Clear active_connection_id — use eq on active_connection_id to avoid
          // overwriting a newer connection set by a concurrent verify
          await Promise.all(
            connRows.map((row) =>
              supabase
                .from('org_plugin_installations')
                .update({ active_connection_id: null })
                .eq('org_id', row.org_id)
                .eq('plugin_id', row.plugin_id)
                .eq('active_connection_id', row.id)
                .then(({ error }) => {
                  if (error) console.error('[OAuth Disconnect] clear active_connection_id failed:', error)
                }),
            ),
          )
        }),
    )

    await Promise.allSettled(cleanups)

    // -----------------------------------------------------------------------
    // 3. Best-effort delete from Nango
    // -----------------------------------------------------------------------
    if (NANGO_SECRET_KEY) {
      const nangoUrl = `${NANGO_API_URL}/connection/${encodeURIComponent(connectionId)}?provider_config_key=${encodeURIComponent(provider)}`
      void Promise.race([
        nangoFetch({
          url: nangoUrl,
          method: 'DELETE',
          headers: { Authorization: `Bearer ${NANGO_SECRET_KEY}` },
          label: 'disconnect-connection',
          skipRetry: true,
          timeoutMs: 4_000,
        }).then((nangoResult) => {
          if (!nangoResult.ok && nangoResult.status !== 404) {
            console.error('[OAuth Disconnect] Nango DELETE failed:', nangoResult.status)
          }
        }),
        new Promise((resolve) => setTimeout(resolve, 4_250)),
      ]).catch((nangoError) => {
        console.error('[OAuth Disconnect] Nango DELETE errored:', nangoError)
      })
    }

    return NextResponse.json({ disconnected: true, provider })
  } catch (error) {
    console.error('[OAuth Disconnect] Error:', error)

    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: `/api/oauth/${provider}`, method: 'DELETE', provider },
      tags: { layer: 'api', route: 'oauth-disconnect' },
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
