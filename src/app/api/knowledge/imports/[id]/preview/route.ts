import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { KnowledgeImportPreviewRequestSchema } from '@contracts/knowledge-imports'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { ErrorService } from '@/lib/errors/error-service'
import {
  executeKnowledgeOperation,
  KnowledgeOperationExecutionError,
} from '@/lib/knowledge/operation-executor'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

export const POST = withCSRF(async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = KnowledgeImportPreviewRequestSchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: true,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const { id } = await ctx.params
    const result = await executeKnowledgeOperation('knowledge.imports.preview', {
      org_id: body.org_id,
      import_job_id: id,
      raw_text: body.raw_text,
      items: body.items,
      metadata: body.metadata,
    }, userId)

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof KnowledgeOperationExecutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/imports/[id]/preview', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge-imports' },
    })
    return NextResponse.json({ error: 'Failed to preview import job' }, { status: 500 })
  }
})
