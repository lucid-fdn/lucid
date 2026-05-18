import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, getAssistantMemories, isUserOrgMember } from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

// GET /api/assistants/[id]/memories?limit=50
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await params
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') || '50'),
      200,
    )

    const result = await getAssistantMemories(assistantId, limit)
    return NextResponse.json(result)
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/memories', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-memories' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const deleteSchema = z.object({
  memoryId: z.string().uuid().optional(),
  clearAll: z.boolean().optional(),
})

// DELETE /api/assistants/[id]/memories
export const DELETE = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await (ctx as { params: Promise<{ id: string }> }).params
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const validated = deleteSchema.parse(body)

    if (validated.clearAll) {
      const { error } = await supabase
        .from('assistant_memory')
        .delete()
        .eq('assistant_id', assistantId)

      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (validated.memoryId) {
      const { error } = await supabase
        .from('assistant_memory')
        .delete()
        .eq('id', validated.memoryId)
        .eq('assistant_id', assistantId)

      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: 'memoryId or clearAll required' },
      { status: 400 },
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/memories', method: 'DELETE' },
      tags: { layer: 'api', route: 'assistant-memories' },
    })
    return NextResponse.json({ error: 'Failed to delete memories' }, { status: 500 })
  }
})
