import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { SubmitLucidPackMarketplaceReviewRequestSchema } from '@contracts/lucid-pack'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getOrgMemberRole,
  isUserOrgMember,
  listLucidPackMarketplaceSubmissions,
  submitLucidPackForMarketplaceReview,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const listQuerySchema = z.object({
  org_id: z.string().uuid(),
  pack_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'submitted', 'needs_changes', 'approved', 'rejected', 'withdrawn']).optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(100).optional()),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = listQuerySchema.safeParse({
      org_id: req.nextUrl.searchParams.get('org_id'),
      pack_id: req.nextUrl.searchParams.get('pack_id') ?? undefined,
      status: req.nextUrl.searchParams.get('status') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    if (!(await isUserOrgMember(userId, parsed.data.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const submissions = await listLucidPackMarketplaceSubmissions({
      orgId: parsed.data.org_id,
      packId: parsed.data.pack_id,
      status: parsed.data.status,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ submissions })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/templates/marketplace-submissions', method: 'GET' },
      tags: { layer: 'api', route: 'template-marketplace-submissions' },
    })
    return NextResponse.json({ error: 'Failed to list marketplace submissions' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = SubmitLucidPackMarketplaceReviewRequestSchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const role = await getOrgMemberRole(userId, body.org_id)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const submission = await submitLucidPackForMarketplaceReview({
      orgId: body.org_id,
      packId: body.pack_id,
      submittedByUserId: userId,
      qualityReport: body.quality_report,
      reviewNotes: body.review_notes ?? null,
    })
    return NextResponse.json({ submission }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/templates/marketplace-submissions', method: 'POST' },
      tags: { layer: 'api', route: 'template-marketplace-submissions' },
    })
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to submit Pack for marketplace review',
    }, { status: 500 })
  }
})
