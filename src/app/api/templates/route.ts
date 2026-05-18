/**
 * GET /api/templates
 * List templates visible to the caller.
 *
 * Public callers get approved platform/community templates.
 * Authenticated org members can pass ?org_id=... to include org-owned drafts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { listDeployableTemplateCatalogEntries, listTemplateLibraryItems } from '@/lib/templates/library-server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const templatesQuerySchema = z.object({
  category: z.string().trim().min(1).max(80).regex(/^[a-z0-9 _-]+$/i).optional(),
  kind: z.enum(['agent', 'team', 'capability']).optional(),
  type: z.enum(['agent', 'team', 'capability']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  org_id: z.string().uuid().optional(),
  include_capabilities: z.enum(['true', 'false']).optional(),
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()

    const parsedQuery = templatesQuerySchema.parse({
      category: req.nextUrl.searchParams.get('category') ?? undefined,
      kind: req.nextUrl.searchParams.get('kind') ?? undefined,
      type: req.nextUrl.searchParams.get('type') ?? undefined,
      search: req.nextUrl.searchParams.get('search') ?? undefined,
      org_id: req.nextUrl.searchParams.get('org_id') ?? undefined,
      include_capabilities: req.nextUrl.searchParams.get('include_capabilities') ?? undefined,
    })

    let orgId: string | undefined
    if (parsedQuery.org_id) {
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const isMember = await isUserOrgMember(userId, parsedQuery.org_id)
      if (!isMember) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      orgId = parsedQuery.org_id
    }

    const itemType = parsedQuery.type ?? parsedQuery.kind
    const includePacks = parsedQuery.include_capabilities !== 'false'
    const [items, templates] = await Promise.all([
      listTemplateLibraryItems({
        orgId: orgId ?? null,
        category: parsedQuery.category,
        type: itemType,
        search: parsedQuery.search,
        includeCapabilities: includePacks,
      }),
      itemType === 'capability'
        ? Promise.resolve([])
        : listDeployableTemplateCatalogEntries({
            orgId: orgId ?? null,
            category: parsedQuery.category,
            kind: itemType === 'agent' || itemType === 'team' ? itemType : undefined,
            search: parsedQuery.search,
          }),
    ])

    return NextResponse.json({ templates, items })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/templates', method: 'GET' },
      tags: { layer: 'api', route: 'templates' },
    })
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  }
}
