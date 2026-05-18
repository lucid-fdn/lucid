import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { updateAgentIdentityDocument } from '@/lib/db/agent-identity'
import { UpdateAgentIdentityDocumentSchema } from '@contracts/agent-identity'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; documentId: string }> }

export const PATCH = withCSRF(async (request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId, documentId } = await (ctx as Params).params
    const assistant = await getAssistant(assistantId)
    if (!assistant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const input = UpdateAgentIdentityDocumentSchema.parse(await request.json())
    const document = await updateAgentIdentityDocument(documentId, assistantId, input)
    if (!document) return NextResponse.json({ error: 'Identity document not found' }, { status: 404 })

    return NextResponse.json({ document })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/identity/[documentId]', method: 'PATCH' },
      tags: { layer: 'api', route: 'agent-identity' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
