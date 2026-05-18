import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { getBrainHealthReport } from '@/lib/brain/health'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  orgId: z.string().uuid(),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = querySchema.parse({
      orgId: req.nextUrl.searchParams.get('org_id'),
    })
    const access = await resolveKnowledgeManagerAccess({ userId, orgId: parsed.orgId })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const report = await getBrainHealthReport({ orgId: parsed.orgId })
    return NextResponse.json({ report })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/brain/health', method: 'GET' },
      tags: { layer: 'api', route: 'brain-runtime' },
    })
    return NextResponse.json({ error: 'Failed to inspect Brain health' }, { status: 500 })
  }
}
