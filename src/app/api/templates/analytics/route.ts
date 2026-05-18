import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { getTemplateProductFunnelSummary, isUserOrgMember, recordTemplateProductEvent } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const templateAnalyticsSchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  template_id: z.string().max(240).nullable().optional(),
  template_slug: z.string().trim().min(1).max(200),
  template_name: z.string().trim().max(240).nullable().optional(),
  template_type: z.enum(['agent', 'team', 'capability']),
  backing_kind: z.literal('lucid_pack').nullable().optional(),
  event_type: z.enum([
    'gallery_view',
    'detail_view',
    'preview',
    'install',
    'reconcile',
    'first_run',
    'repeat_use',
    'combine_view',
    'combine_click',
  ]),
  source: z.enum(['templates', 'template_detail', 'installed_capability', 'channel', 'mission_control', 'api']).optional(),
  install_id: z.string().uuid().nullable().optional(),
  run_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const templateAnalyticsQuerySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const query = templateAnalyticsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))
    if (!(await isUserOrgMember(userId, query.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const summary = await getTemplateProductFunnelSummary({
      orgId: query.org_id,
      projectId: query.project_id,
      sinceDays: query.days,
      limit: query.limit,
    })

    return NextResponse.json({ summary })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'warning',
      context: { endpoint: '/api/templates/analytics', method: 'GET' },
      tags: { layer: 'api', route: 'templates-analytics' },
    })
    return NextResponse.json({ error: 'Failed to load template analytics' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = templateAnalyticsSchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await recordTemplateProductEvent({
      orgId: body.org_id,
      actorUserId: userId,
      projectId: body.project_id ?? null,
      templateId: body.template_id ?? null,
      templateSlug: body.template_slug,
      templateName: body.template_name ?? null,
      templateType: body.template_type,
      backingKind: body.backing_kind ?? null,
      eventType: body.event_type,
      source: body.source ?? 'templates',
      installId: body.install_id ?? null,
      runId: body.run_id ?? null,
      metadata: body.metadata ?? {},
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'warning',
      context: { endpoint: '/api/templates/analytics', method: 'POST' },
      tags: { layer: 'api', route: 'templates-analytics' },
    })
    return NextResponse.json({ error: 'Failed to record template event' }, { status: 500 })
  }
})
