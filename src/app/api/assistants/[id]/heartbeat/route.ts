import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { createSharedContextRecord, updateSharedContextRecord } from '@/lib/db/shared-context'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

const AgentHeartbeatSchema = z.object({
  status: z.string().min(1).max(80).default('active'),
  focus: z.string().max(1000).nullable().optional(),
  health: z.record(z.string(), z.unknown()).default({}),
  next_heartbeat_at: z.string().datetime().nullable().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId } = await params
    const assistant = await getAssistant(assistantId)
    if (!assistant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await supabase
      .from('agent_heartbeats')
      .select('id, workspace_id, project_id, agent_id, status, focus, health, next_check_in_at, context_record_id, created_at')
      .eq('agent_id', assistantId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error
    return NextResponse.json({ heartbeats: data ?? [] })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/heartbeat', method: 'GET' },
      tags: { layer: 'api', route: 'agent-heartbeat' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withCSRF(async (request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId } = await (ctx as Params).params
    const assistant = await getAssistant(assistantId)
    if (!assistant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const input = AgentHeartbeatSchema.parse(await request.json())
    const contextRecord = await createSharedContextRecord(assistant.org_id, {
      project_id: assistant.project_id ?? null,
      agent_id: assistantId,
      scope_type: 'agent',
      scope_id: assistantId,
      record_type: 'daily_intel',
      title: `Agent heartbeat: ${assistant.name}`,
      body: input.focus ?? input.status,
      source_type: 'agent_heartbeat',
      source_id: assistantId,
      confidence: 1,
      status: 'active',
      metadata: { health: input.health },
      links: [],
    }, userId)

    const { data, error } = await supabase
      .from('agent_heartbeats')
      .insert({
        workspace_id: assistant.org_id,
        project_id: assistant.project_id ?? null,
        agent_id: assistantId,
        status: input.status,
        focus: input.focus ?? null,
        health: input.health,
        next_check_in_at: input.next_heartbeat_at ?? null,
        context_record_id: contextRecord?.id ?? null,
      })
      .select()
      .single()

    if (error) throw error
    const linkedContextRecord = contextRecord
      ? await updateSharedContextRecord(contextRecord.id, {
          links: [{
            target_type: 'heartbeat',
            target_id: String(data.id),
            label: `Heartbeat ${input.status}`,
            provenance: 'Recorded from the assistant heartbeat API.',
            observed_at: String(data.created_at),
            metadata: { agent_id: assistantId },
          }],
        }, { userId })
      : null
    return NextResponse.json({ heartbeat: data, contextRecord: linkedContextRecord ?? contextRecord }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/heartbeat', method: 'POST' },
      tags: { layer: 'api', route: 'agent-heartbeat' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
