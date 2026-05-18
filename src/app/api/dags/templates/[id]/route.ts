/**
 * DAG Templates REST API — Phase 4N-c, Task 47.
 *
 * GET    /api/dags/templates/[id]?orgId=…  — fetch one template
 * PUT    /api/dags/templates/[id]          — update (admin/owner)
 * DELETE /api/dags/templates/[id]          — delete (admin/owner)
 *
 * org_id is bound via querystring on GET and request body on PUT/DELETE so
 * we can keep the path param to a single uuid (template id). Both routes
 * resolve org membership before touching the DB layer.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember, getOrgMemberRole } from '@/lib/db'
import {
  getDagTemplate,
  updateDagTemplate,
  deleteDagTemplate,
  updateTemplateInputSchema,
} from '@/lib/db/dag-templates'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const orgIdSchema = z.string().uuid()

const updateBodySchema = updateTemplateInputSchema.extend({
  orgId: z.string().uuid(),
})

const deleteBodySchema = z.object({
  orgId: z.string().uuid(),
})

/**
 * GET — fetch one template by id, scoped to the caller's org.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: templateId } = await params
    const orgIdParsed = orgIdSchema.safeParse(req.nextUrl.searchParams.get('orgId'))
    if (!orgIdParsed.success) {
      return NextResponse.json({ error: 'orgId query param is required' }, { status: 400 })
    }
    const orgId = orgIdParsed.data

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const template = await getDagTemplate(orgId, templateId)
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/dags/templates/[id]', method: 'GET' },
      tags: { layer: 'api', route: 'dag-templates' },
    })
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 })
  }
}

/**
 * PUT — update an existing template. Admin/owner only.
 */
export const PUT = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: templateId } = await (ctx as { params: Promise<{ id: string }> }).params

    const body = await req.json()
    const validated = updateBodySchema.parse(body)

    const role = await getOrgMemberRole(userId, validated.orgId)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const { orgId, ...patch } = validated
    const template = await updateDagTemplate(orgId, templateId, patch)

    if (!template) {
      // Either id mismatch, cross-org, or it's a global row (org_id IS NULL).
      return NextResponse.json({ error: 'Template not found or not editable' }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/dags/templates/[id]', method: 'PUT' },
      tags: { layer: 'api', route: 'dag-templates' },
    })
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
})

/**
 * DELETE — remove a template. Admin/owner only. Refuses to delete global
 * (org_id IS NULL) rows since those are managed by seed migrations.
 */
export const DELETE = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: templateId } = await (ctx as { params: Promise<{ id: string }> }).params

    const body = await req.json()
    const validated = deleteBodySchema.parse(body)

    const role = await getOrgMemberRole(userId, validated.orgId)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const success = await deleteDagTemplate(validated.orgId, templateId)
    if (!success) {
      return NextResponse.json({ error: 'Template not found or not deletable' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/dags/templates/[id]', method: 'DELETE' },
      tags: { layer: 'api', route: 'dag-templates' },
    })
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
})
