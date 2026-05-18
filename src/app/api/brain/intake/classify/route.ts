import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { planBrainIntake } from '@/lib/brain-intake/plan-brain-intake'
import { BrainIntakeClassifyRequestSchema } from '@/lib/brain-intake/schema'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = BrainIntakeClassifyRequestSchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.orgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(await planBrainIntake({ request: body, userId }))
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/brain/intake/classify', method: 'POST' },
      tags: { layer: 'api', route: 'brain-intake' },
    })
    return NextResponse.json({ error: 'Failed to classify Brain input' }, { status: 500 })
  }
}
