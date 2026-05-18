import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { getUserId } from '@/lib/auth/server-utils'
import { requireAssistantPermission } from '@/lib/access-control/api'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const routeParamsSchema = z.object({
  id: z.string().uuid(),
})

const appBindingBodySchema = z.object({
  plugin_id: z.string().uuid(),
  org_connection_id: z.string().uuid().nullable(),
  enabled_actions: z.array(z.string()).nullable().optional(),
})

export async function GET(
  _req: NextRequest,
  ctx: unknown,
): Promise<NextResponse> {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId } = routeParamsSchema.parse(
      await (ctx as { params: Promise<{ id: string }> }).params,
    )
    const access = await requireAssistantPermission(userId, assistantId, 'editProjects')
    if (!access.ok) return access.response

    const { data, error } = await supabase
      .from('assistant_app_bindings')
      .select(`
        id,
        assistant_id,
        plugin_id,
        org_connection_id,
        status,
        enabled_actions,
        config,
        org_integration_connections(id, connection_id, account_label, account_id, status, auth_provider)
      `)
      .eq('assistant_id', assistantId)

    if (error) throw error
    return NextResponse.json({ bindings: data ?? [] })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/app-bindings', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-app-bindings' },
    })
    return NextResponse.json({ error: 'Failed to load app bindings' }, { status: 500 })
  }
}

export const POST = withCSRF(async (
  req: NextRequest,
  ctx: unknown,
): Promise<NextResponse> => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId } = routeParamsSchema.parse(
      await (ctx as { params: Promise<{ id: string }> }).params,
    )
    const access = await requireAssistantPermission(userId, assistantId, 'editProjects')
    if (!access.ok) return access.response

    const body = appBindingBodySchema.parse(await req.json())
    const { assistant } = access

    if (body.org_connection_id) {
      const { data: connection, error: connectionError } = await supabase
        .from('org_integration_connections')
        .select('id, org_id, plugin_id, status')
        .eq('id', body.org_connection_id)
        .eq('org_id', assistant.org_id)
        .eq('plugin_id', body.plugin_id)
        .single()

      if (connectionError || !connection) {
        return NextResponse.json({ error: 'Connection not found for this app' }, { status: 404 })
      }

      if (connection.status !== 'active') {
        return NextResponse.json({ error: 'Connection is not active' }, { status: 409 })
      }
    }

    const { data, error } = await supabase
      .from('assistant_app_bindings')
      .upsert(
        {
          assistant_id: assistantId,
          plugin_id: body.plugin_id,
          org_connection_id: body.org_connection_id,
          status: body.org_connection_id ? 'active' : 'needs_connection',
          enabled_actions: body.enabled_actions ?? null,
        },
        { onConflict: 'assistant_id,plugin_id' },
      )
      .select('id, assistant_id, plugin_id, org_connection_id, status, enabled_actions')
      .single()

    if (error) throw error
    return NextResponse.json({ binding: data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/app-bindings', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-app-bindings' },
    })
    return NextResponse.json({ error: 'Failed to update app binding' }, { status: 500 })
  }
})
