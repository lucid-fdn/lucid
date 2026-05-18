/**
 * Assistant OAuth Tool Bindings API
 *
 * GET    — List all OAuth bindings for this assistant
 * POST   — Create/update a binding (upsert by assistant_id + provider)
 * DELETE — Remove a binding
 *
 * Auth: Privy JWT → org membership check
 *
 * Validation: provider and action names are validated against the
 * oauth_action_catalog DB table (dynamic — no hardcoded list).
 * At execution time, Nango triggerAction provides a second validation layer.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

// ============================================================================
// GET /api/assistants/[id]/oauth-tools
// ============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId } = await params
    const assistant = await getAssistant(assistantId)
    if (!assistant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await supabase.rpc('get_assistant_oauth_bindings', {
      p_assistant_id: assistantId,
    })

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { assistantId, operation: 'get_assistant_oauth_bindings' },
        tags: { layer: 'api', route: 'oauth-tools' },
      })
      return NextResponse.json({ error: 'Failed to fetch bindings' }, { status: 500 })
    }

    return NextResponse.json({ bindings: data || [] })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/oauth-tools', method: 'GET' },
      tags: { layer: 'api', route: 'oauth-tools' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ============================================================================
// POST /api/assistants/[id]/oauth-tools
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId } = await params
    const assistant = await getAssistant(assistantId)
    if (!assistant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { provider, connectionId, integrationId, enabledActions, requiresConfirmationActions, maxCallsPerRun } = body as {
      provider: string
      connectionId: string
      integrationId?: string
      enabledActions?: string[]
      requiresConfirmationActions?: string[]
      maxCallsPerRun?: number
    }

    if (!provider || !connectionId) {
      return NextResponse.json({ error: 'provider and connectionId are required' }, { status: 400 })
    }

    // Validate provider exists in DB catalog
    const { data: providerActions } = await supabase.rpc('get_oauth_provider_actions', {
      p_provider: provider,
    })

    if (!providerActions || providerActions.length === 0) {
      return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
    }

    // Validate enabledActions against DB catalog
    if (enabledActions && enabledActions.length > 0) {
      const knownActions = new Set((providerActions as Array<{ action_name: string }>).map(a => a.action_name))
      const invalid = enabledActions.filter(name => !knownActions.has(name))
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Unknown actions for ${provider}: ${invalid.join(', ')}` },
          { status: 400 },
        )
      }
    }

    // Validate requiresConfirmationActions against DB catalog
    if (requiresConfirmationActions && requiresConfirmationActions.length > 0) {
      const knownActions = new Set((providerActions as Array<{ action_name: string }>).map(a => a.action_name))
      const invalid = requiresConfirmationActions.filter(name => !knownActions.has(name))
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Unknown confirmation actions for ${provider}: ${invalid.join(', ')}` },
          { status: 400 },
        )
      }
    }

    // Validate maxCallsPerRun bounds
    if (maxCallsPerRun !== undefined && (maxCallsPerRun < 1 || maxCallsPerRun > 1000)) {
      return NextResponse.json({ error: 'maxCallsPerRun must be between 1 and 1000' }, { status: 400 })
    }

    // Verify the connection belongs to this user and is active
    const { data: isOwner } = await supabase.rpc('verify_oauth_connection_owner', {
      p_user_id: userId,
      p_connection_id: connectionId,
    })

    if (!isOwner) {
      return NextResponse.json({ error: 'Connection not found or not owned by you' }, { status: 403 })
    }

    // Upsert binding (UNIQUE on assistant_id + provider)
    const { data, error } = await supabase
      .from('assistant_oauth_bindings')
      .upsert(
        {
          assistant_id: assistantId,
          provider,
          connection_id: connectionId,
          integration_id: integrationId || provider,
          enabled_actions: enabledActions || [],
          requires_confirmation_actions: requiresConfirmationActions || [],
          max_calls_per_run: maxCallsPerRun ?? 50,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'assistant_id,provider' },
      )
      .select()
      .single()

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { assistantId, provider, operation: 'upsert_oauth_binding' },
        tags: { layer: 'api', route: 'oauth-tools' },
      })
      return NextResponse.json({ error: 'Failed to create binding' }, { status: 500 })
    }

    return NextResponse.json({ binding: data })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/oauth-tools', method: 'POST' },
      tags: { layer: 'api', route: 'oauth-tools' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ============================================================================
// DELETE /api/assistants/[id]/oauth-tools
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId } = await params
    const assistant = await getAssistant(assistantId)
    if (!assistant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { provider } = body as { provider: string }

    if (!provider) {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('assistant_oauth_bindings')
      .delete()
      .eq('assistant_id', assistantId)
      .eq('provider', provider)

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { assistantId, provider, operation: 'delete_oauth_binding' },
        tags: { layer: 'api', route: 'oauth-tools' },
      })
      return NextResponse.json({ error: 'Failed to delete binding' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/oauth-tools', method: 'DELETE' },
      tags: { layer: 'api', route: 'oauth-tools' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
