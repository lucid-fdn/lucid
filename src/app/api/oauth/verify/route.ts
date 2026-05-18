/**
 * OAuth Verify API Route
 *
 * After OAuth popup completes, checks Nango for the connection and syncs
 * it to our DB so the worker can resolve connectionId at runtime.
 *
 * Writes to:
 *   1. assistant_oauth_bindings      - assistant-level connection status
 *   2. org_integration_connections   - org-level connection record
 *   3. org_plugin_installations      - links active connection to install
 *   4. assistant_plugin_activations  - auto-activates on existing assistants
 */

import { NextRequest, NextResponse } from 'next/server'

import { requireUserId } from '@/lib/auth/session'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { supabase } from '@/lib/db/client'
import { ensurePluginInstallation } from '@/lib/db/plugins'
import { ErrorService } from '@/lib/errors/error-service'
import { maskIdentifier } from '@/lib/logging/safe-log'
import { nangoFetch } from '@/lib/oauth/nango-fetch'
import { OAuthRateLimits } from '@/lib/oauth/rate-limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NANGO_API_URL = process.env.NANGO_API_BASE || `${process.env.NEXT_PUBLIC_OAUTH_API_URL || 'http://localhost:3001'}/nango`
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY

interface NangoConnection {
  id: number
  connection_id: string
  provider_config_key: string
  provider: string
  end_user: { id: string } | null
  created: string
}

async function getExistingVerifiedState(
  assistantId: string | undefined,
  provider: string,
  orgId: string | null,
) {
  if (orgId) {
    const { data: orgConnection } = await supabase
      .from('org_integration_connections')
      .select('connection_id')
      .eq('org_id', orgId)
      .eq('auth_provider', provider)
      .eq('status', 'active')
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (orgConnection?.connection_id) {
      return { connectionId: orgConnection.connection_id, source: 'org_integration_connections' as const }
    }
  }

  if (!assistantId) return null

  const { data: binding } = await supabase
    .from('assistant_oauth_bindings')
    .select('connection_id')
    .eq('assistant_id', assistantId)
    .eq('provider', provider)
    .maybeSingle()

  if (binding?.connection_id) {
    return { connectionId: binding.connection_id, source: 'assistant_oauth_bindings' as const }
  }

  return null
}

async function syncAssistantBinding(
  assistantId: string | undefined,
  provider: string,
  connectionId: string,
) {
  if (!assistantId) return

  await supabase
    .from('assistant_oauth_bindings')
    .upsert(
      { assistant_id: assistantId, provider, connection_id: connectionId },
      { onConflict: 'assistant_id,provider' },
    )
}

async function resolveOrgId(
  assistantId: string | undefined,
  requestedOrgId: string | undefined,
  userId: string,
) {
  if (assistantId) {
    const { data: assistant } = await supabase
      .from('ai_assistants')
      .select('org_id')
      .eq('id', assistantId)
      .single()

    if (!assistant?.org_id) {
      return { error: NextResponse.json({ error: 'Assistant not found' }, { status: 404 }), orgId: null }
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('org_id', assistant.org_id)
      .eq('user_id', userId)
      .single()

    if (!membership) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), orgId: null }
    }

    return { error: null, orgId: assistant.org_id }
  }

  if (requestedOrgId) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('org_id', requestedOrgId)
      .eq('user_id', userId)
      .single()

    if (!membership) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), orgId: null }
    }

    return { error: null, orgId: requestedOrgId }
  }

  return { error: null, orgId: null }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId()

    const rl = await checkRateLimit(`oauth:verify:${userId}`, OAuthRateLimits.SESSION)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      )
    }

    const { provider, assistantId, orgId: requestedOrgId } = await request.json()
    if (!provider || typeof provider !== 'string') {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 })
    }

    if (!NANGO_SECRET_KEY) {
      return NextResponse.json({ error: 'OAuth not configured' }, { status: 500 })
    }

    const access = await resolveOrgId(assistantId, requestedOrgId, userId)
    if (access.error) return access.error
    const orgId = access.orgId

    let match: NangoConnection | null = null

    try {
      const result = await nangoFetch<{ connections: NangoConnection[] }>({
        url: `${NANGO_API_URL}/connections`,
        method: 'GET',
        headers: { Authorization: `Bearer ${NANGO_SECRET_KEY}` },
        label: 'verify-connection',
        skipRetry: true,
        timeoutMs: 8_000,
      })

      if (!result.ok) {
        console.error('[OAuth Verify] Nango query failed:', result.status)
        const existing = await getExistingVerifiedState(assistantId, provider, orgId)
        if (existing) {
          await syncAssistantBinding(assistantId, provider, existing.connectionId)
          return NextResponse.json({
            connected: true,
            provider,
            connectionId: existing.connectionId,
            fallback: existing.source,
          })
        }
        return NextResponse.json({ connected: false, error: 'OAuth service unavailable' }, { status: 503 })
      }

      const connections = result.data?.connections ?? []
      match = connections.find(
        (candidate) => candidate.provider_config_key === provider && candidate.end_user?.id === userId,
      ) ?? null
    } catch (nangoError) {
      console.error('[OAuth Verify] Nango connection lookup failed:', nangoError)
      const existing = await getExistingVerifiedState(assistantId, provider, orgId)
      if (existing) {
        await syncAssistantBinding(assistantId, provider, existing.connectionId)
        return NextResponse.json({
          connected: true,
          provider,
          connectionId: existing.connectionId,
          fallback: existing.source,
        })
      }
      throw nangoError
    }

    if (!match) {
      console.warn('[OAuth Verify] No connection for', { provider, userId: maskIdentifier(userId) })
      const existing = await getExistingVerifiedState(assistantId, provider, orgId)
      if (existing) {
        await syncAssistantBinding(assistantId, provider, existing.connectionId)
        return NextResponse.json({
          connected: true,
          provider,
          connectionId: existing.connectionId,
          fallback: existing.source,
        })
      }
      return NextResponse.json({ connected: false, provider })
    }

    const connectionId = match.connection_id

    if (orgId) {
      const { data: plugin } = await supabase
        .from('plugin_catalog')
        .select('id, slug')
        .eq('auth_provider', provider)
        .eq('kind', 'integration')
        .single()

      const writes: PromiseLike<unknown>[] = []

      if (assistantId) {
        writes.push(
          supabase
            .from('assistant_oauth_bindings')
            .upsert(
              { assistant_id: assistantId, provider, connection_id: connectionId },
              { onConflict: 'assistant_id,provider' },
            )
            .then(({ error }) => {
              if (error) console.error('[OAuth Verify] assistant_oauth_bindings upsert failed:', error)
            }),
        )
      }

      if (plugin?.id && plugin.slug) {
        writes.push(
          ensurePluginInstallation(orgId, plugin.slug, userId)
            .then(async () => {
              const { data: connRow, error: connErr } = await supabase
                .from('org_integration_connections')
                .upsert(
                  {
                    org_id: orgId,
                    plugin_id: plugin.id,
                    connection_id: connectionId,
                    auth_provider: provider,
                    status: 'active',
                    connected_by: userId,
                    metadata: { source: 'verify', nango_id: match.id },
                  },
                  { onConflict: 'org_id,connection_id' },
                )
                .select('id')
                .single()

              if (connErr) {
                console.error('[OAuth Verify] org_integration_connections upsert failed:', connErr)
                return
              }
              if (!connRow?.id) return

              const { data: installRow, error: linkErr } = await supabase
                .from('org_plugin_installations')
                .update({ active_connection_id: connRow.id })
                .eq('org_id', orgId)
                .eq('plugin_id', plugin.id)
                .select('id')
                .maybeSingle()

              if (linkErr) {
                console.error('[OAuth Verify] active_connection_id link failed:', linkErr)
                return
              }
              if (!installRow?.id || !assistantId) return

              const { error: actErr } = await supabase
                .from('assistant_plugin_activations')
                .upsert(
                  {
                    assistant_id: assistantId,
                    installation_id: installRow.id,
                    is_active: true,
                    enabled_tools: null,
                  },
                  { onConflict: 'assistant_id,installation_id' },
                )

              if (actErr) {
                console.error('[OAuth Verify] assistant_plugin_activations upsert failed:', actErr)
              }
            })
            .catch((installError) => {
              console.error('[OAuth Verify] plugin installation ensure failed:', installError)
            }),
        )
      } else {
        console.warn('[OAuth Verify] No plugin_catalog entry for provider:', provider)
      }

      await Promise.allSettled(writes)
    }

    return NextResponse.json({ connected: true, provider, connectionId })
  } catch (error) {
    console.error('[OAuth Verify] Error:', error)
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/oauth/verify', method: 'POST' },
      tags: { layer: 'api', route: 'oauth-verify' },
    })
    return NextResponse.json({ connected: false }, { status: 500 })
  }
}
