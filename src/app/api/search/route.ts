import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { GlobalSearchRequestSchema, GlobalSearchScopeSchema } from '@contracts/global-search'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { globalSearch } from '@/lib/search/global-search'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  org_id: z.string().uuid(),
  workspace_slug: z.string().min(1).max(160).optional(),
  q: z.string().min(1).max(500),
  scopes: z.string().optional(),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined)),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = querySchema.safeParse({
      org_id: req.nextUrl.searchParams.get('org_id'),
      workspace_slug: req.nextUrl.searchParams.get('workspace_slug') ?? undefined,
      q: req.nextUrl.searchParams.get('q'),
      scopes: req.nextUrl.searchParams.get('scopes') ?? undefined,
      project_id: req.nextUrl.searchParams.get('project_id') ?? undefined,
      team_id: req.nextUrl.searchParams.get('team_id') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const scopes = (parsed.data.scopes ?? 'all')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
      .map((scope) => GlobalSearchScopeSchema.parse(scope))

    const input = GlobalSearchRequestSchema.parse({
      orgId: parsed.data.org_id,
      workspaceSlug: parsed.data.workspace_slug,
      query: parsed.data.q,
      scopes,
      projectId: parsed.data.project_id ?? null,
      teamId: parsed.data.team_id ?? null,
      limit: parsed.data.limit ?? 25,
    })

    return NextResponse.json(await globalSearch(input))
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/search', method: 'GET' },
      tags: { layer: 'api', route: 'global-search' },
    })
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
