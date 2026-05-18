import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { BrainQueryRequestSchema } from '@/lib/brain/schemas'
import { queryBrain } from '@/lib/brain/query'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = BrainQueryRequestSchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({ userId, orgId: body.org_id })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const result = await queryBrain({
      ...body,
      actorUserId: userId,
      surface: 'app_api',
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/brain/query', method: 'POST' },
      tags: { layer: 'api', route: 'brain-runtime' },
    })
    return NextResponse.json({ error: 'Failed to query Brain' }, { status: 500 })
  }
}
