import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { allowsPreviewE2ERateLimitBypass } from '@/lib/env/e2e'
import { ErrorService } from '@/lib/errors/error-service'
import { previewCapabilityTemplateInstall } from '@/lib/templates/capabilities/preview-service'

export const dynamic = 'force-dynamic'

const previewBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
})

export const POST = withCSRF(async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  try {
    if (!allowsPreviewE2ERateLimitBypass()) {
      const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
      if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = previewBodySchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await ctx.params
    const preview = await previewCapabilityTemplateInstall({
      orgId: body.org_id,
      packId: id,
    })
    if (!preview) return NextResponse.json({ error: 'Capability template not found' }, { status: 404 })

    return NextResponse.json({ preview })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/packs/[id]/preview', method: 'POST' },
      tags: { layer: 'api', route: 'capability-template-preview' },
    })
    return NextResponse.json({ error: 'Failed to preview capability template' }, { status: 500 })
  }
})
