import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { InstallLucidPackRequestSchema } from '@contracts/lucid-pack'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { getOrgMemberRole, isUserOrgMember, listLucidPackInstalls, listLucidPackManagedResources } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { installTemplatePack } from '@/lib/templates/install'

export const dynamic = 'force-dynamic'
const WRITE_ROLES = new Set(['owner', 'admin'])

const listInstallsQuerySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  include_resources: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(200).optional()),
})

const installPackBodySchema = InstallLucidPackRequestSchema.extend({
  pack_id: z.string().uuid(),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = listInstallsQuerySchema.safeParse({
      org_id: req.nextUrl.searchParams.get('org_id'),
      project_id: req.nextUrl.searchParams.get('project_id') ?? undefined,
      include_resources: req.nextUrl.searchParams.get('include_resources') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    if (!(await isUserOrgMember(userId, parsed.data.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const installs = await listLucidPackInstalls({
      orgId: parsed.data.org_id,
      projectId: parsed.data.project_id,
      limit: parsed.data.limit,
    })
    const resources = parsed.data.include_resources
      ? await listLucidPackManagedResources({ orgId: parsed.data.org_id, limit: 500 })
      : undefined
    return NextResponse.json({ installs, ...(resources ? { resources } : {}) })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/packs/install', method: 'GET' },
      tags: { layer: 'api', route: 'lucid-packs' },
    })
    return NextResponse.json({ error: 'Failed to list pack installs' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = installPackBodySchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const role = await getOrgMemberRole(userId, body.org_id)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const result = await installTemplatePack({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      packId: body.pack_id,
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
      context: { endpoint: '/api/agent-ops/packs/install', method: 'POST' },
      tags: { layer: 'api', route: 'lucid-packs' },
    })
    return NextResponse.json({ error: 'Failed to install pack' }, { status: 500 })
  }
})
