import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { InstallLucidPackRequestSchema } from '@contracts/lucid-pack'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getOrgMemberRole,
  isUserOrgMember,
} from '@/lib/db'
import { allowsPreviewE2ERateLimitBypass } from '@/lib/env/e2e'
import { ErrorService } from '@/lib/errors/error-service'
import { installTemplatePack } from '@/lib/templates/install'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

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

    const body = InstallLucidPackRequestSchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const role = await getOrgMemberRole(userId, body.org_id)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const { id } = await ctx.params
    const result = await installTemplatePack({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      packId: id,
      config: body.config,
      userId,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/packs/[id]/install', method: 'POST' },
      tags: { layer: 'api', route: 'lucid-packs' },
    })
    return NextResponse.json({ error: 'Failed to install pack' }, { status: 500 })
  }
})
