/**
 * DAG Templates REST API — Phase 4N-c, Task 46.
 *
 * GET  /api/dags/templates                 — list visible templates (org + global)
 * POST /api/dags/templates                 — create new template (admin/owner)
 *
 * Auth: session cookie → user → org membership lookup. Mutations require
 * admin or owner. Spec validation happens in `createDagTemplate()` against
 * `dagSpecSchema` from `contracts/dag.ts`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember, getOrgMemberRole } from '@/lib/db'
import {
  listDagTemplates,
  createDagTemplate,
  createTemplateInputSchema,
} from '@/lib/db/dag-templates'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const listQuerySchema = z.object({
  orgId: z.string().uuid(),
  activeOnly: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().max(500).optional()),
})

// orgId is body-bound on POST so the request envelope mirrors the rest of
// /api/dags/* and we don't need a path-param variant per org.
const createBodySchema = createTemplateInputSchema.extend({
  orgId: z.string().uuid(),
})

/**
 * GET — list templates visible to the requesting org. Includes global rows.
 */
export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = listQuerySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('orgId'),
      activeOnly: req.nextUrl.searchParams.get('activeOnly') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const { orgId, activeOnly, limit } = parsed.data

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const templates = await listDagTemplates(orgId, { activeOnly, limit })
    return NextResponse.json({ templates })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/dags/templates', method: 'GET' },
      tags: { layer: 'api', route: 'dag-templates' },
    })
    return NextResponse.json({ error: 'Failed to list templates' }, { status: 500 })
  }
}

/**
 * POST — create a new template. Admin/owner only. Validates the spec via
 * `createTemplateInputSchema` (which embeds `dagSpecSchema`). Maps duplicate
 * (org_id, slug, version) to 409.
 */
export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const validated = createBodySchema.parse(body)

    const role = await getOrgMemberRole(userId, validated.orgId)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const { orgId, ...input } = validated
    const template = await createDagTemplate(orgId, userId, input)

    if (!template) {
      return NextResponse.json(
        { error: 'A template with this slug and version already exists' },
        { status: 409 },
      )
    }

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/dags/templates', method: 'POST' },
      tags: { layer: 'api', route: 'dag-templates' },
    })
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
})
