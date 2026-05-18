import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { ErrorService } from '@/lib/errors/error-service'
import { deleteDocument, getDocument } from '@/lib/rag'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

const deleteKnowledgeDocumentSchema = z.object({
  org_id: z.string().uuid(),
})

export const DELETE = withCSRF(async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await ctx.params
    const body = deleteKnowledgeDocumentSchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: true,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const document = await getDocument(id, body.org_id)
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    await deleteDocument(id, body.org_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/documents/[id]', method: 'DELETE' },
      tags: { layer: 'api', route: 'knowledge-manager' },
    })
    return NextResponse.json({ error: 'Failed to delete knowledge document' }, { status: 500 })
  }
})
