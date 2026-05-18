/**
 * GET /api/templates/[id]
 * Single template by id (UUID) or slug.
 *
 * Public callers can read active platform Lucid Pack templates.
 * Authenticated org members can pass ?org_id=... to include org-scoped packs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getLucidPack, getLucidPackByPackKey, isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { lucidPackToLibraryItem } from '@/lib/templates/library'
import { isPackBackedTemplate, packBackedTemplateToCatalogEntry } from '@/lib/templates/pack-adapter'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const templateIdSchema = z.object({
  id: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/i),
})
const templateQuerySchema = z.object({
  org_id: z.string().uuid().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()

    const { id } = templateIdSchema.parse(await params)
    const parsedQuery = templateQuerySchema.parse({
      org_id: req.nextUrl.searchParams.get('org_id') ?? undefined,
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

    const pack = UUID_RE.test(id)
      ? await getLucidPack({ packId: id, orgId })
      : await getLucidPackByPackKey({ packKey: id, orgId })
    if (pack && isPackBackedTemplate(pack)) {
      return NextResponse.json({
        template: packBackedTemplateToCatalogEntry(pack),
        pack,
        item: lucidPackToLibraryItem(pack),
      })
    }

    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/templates/[id]', method: 'GET' },
      tags: { layer: 'api', route: 'templates' },
    })
    return NextResponse.json({ error: 'Failed to load template' }, { status: 500 })
  }
}
