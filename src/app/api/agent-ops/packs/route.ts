import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { LucidPackManifestSchema } from '@contracts/lucid-pack'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { createLucidPack, getOrgMemberRole, isUserOrgMember, listLucidPacks } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { assertLucidPackManifestSafe, LucidPackManifestSafetyError } from '@/lib/packs'

export const dynamic = 'force-dynamic'
const WRITE_ROLES = new Set(['owner', 'admin'])

const listPacksQuerySchema = z.object({
  org_id: z.string().uuid().optional(),
  status: z.enum(['active', 'deprecated', 'archived']).optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(200).optional()),
})

const createPackBodySchema = z.object({
  org_id: z.string().uuid().nullable().optional(),
  manifest: LucidPackManifestSchema,
  status: z.enum(['active', 'deprecated', 'archived']).default('active'),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = listPacksQuerySchema.safeParse({
      org_id: req.nextUrl.searchParams.get('org_id') ?? undefined,
      status: req.nextUrl.searchParams.get('status') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    if (parsed.data.org_id && !(await isUserOrgMember(userId, parsed.data.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const packs = await listLucidPacks({
      orgId: parsed.data.org_id,
      status: parsed.data.status,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ packs })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/packs', method: 'GET' },
      tags: { layer: 'api', route: 'lucid-packs' },
    })
    return NextResponse.json({ error: 'Failed to list packs' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = createPackBodySchema.parse(await req.json())
    if (!body.org_id) {
      return NextResponse.json({ error: 'Organization id is required to create an org pack' }, { status: 400 })
    }
    if (!(await isUserOrgMember(userId, body.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const role = await getOrgMemberRole(userId, body.org_id)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }
    assertLucidPackManifestSafe(body.manifest)

    const pack = await createLucidPack({
      orgId: body.org_id,
      packKey: body.manifest.key,
      name: body.manifest.name,
      description: body.manifest.description,
      version: body.manifest.version,
      manifest: body.manifest,
      status: body.status,
    })
    return NextResponse.json({ pack }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    if (error instanceof LucidPackManifestSafetyError) {
      return NextResponse.json({ error: error.message, details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/packs', method: 'POST' },
      tags: { layer: 'api', route: 'lucid-packs' },
    })
    return NextResponse.json({ error: 'Failed to create pack' }, { status: 500 })
  }
})
