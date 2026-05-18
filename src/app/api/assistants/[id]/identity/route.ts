import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import {
  buildAgentIdentityPackage,
  createAgentIdentityDocument,
  listAgentIdentityDocuments,
} from '@/lib/db/agent-identity'
import { CreateAgentIdentityDocumentSchema } from '@contracts/agent-identity'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

async function authorizeAssistant(userId: string, assistantId: string) {
  const assistant = await getAssistant(assistantId)
  if (!assistant) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }

  const isMember = await isUserOrgMember(userId, assistant.org_id)
  if (!isMember) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  return { assistant }
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId } = await params
    const auth = await authorizeAssistant(userId, assistantId)
    if (auth.error) return auth.error

    const [documents, identityPackage] = await Promise.all([
      listAgentIdentityDocuments(assistantId),
      buildAgentIdentityPackage(assistantId),
    ])

    return NextResponse.json({ documents, identityPackage })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/identity', method: 'GET' },
      tags: { layer: 'api', route: 'agent-identity' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withCSRF(async (_request: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: assistantId } = await (ctx as Params).params
    const auth = await authorizeAssistant(userId, assistantId)
    if (auth.error) return auth.error

    const body = await _request.json()
    const input = CreateAgentIdentityDocumentSchema.parse(body)
    const document = await createAgentIdentityDocument(assistantId, input, userId)

    if (!document) {
      return NextResponse.json({ error: 'Failed to create identity document' }, { status: 500 })
    }

    return NextResponse.json({ document }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/identity', method: 'POST' },
      tags: { layer: 'api', route: 'agent-identity' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
