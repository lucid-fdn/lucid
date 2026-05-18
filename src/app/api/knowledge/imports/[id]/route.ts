import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { getKnowledgeImportJob, listKnowledgeImportItems } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

const getImportQuerySchema = z.object({
  org_id: z.string().uuid(),
  include_items: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
})

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = getImportQuerySchema.safeParse({
      org_id: req.nextUrl.searchParams.get('org_id'),
      include_items: req.nextUrl.searchParams.get('include_items') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const access = await resolveKnowledgeManagerAccess({ userId, orgId: parsed.data.org_id })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const { id } = await ctx.params
    const job = await getKnowledgeImportJob({ orgId: parsed.data.org_id, importJobId: id })
    if (!job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 })

    const items = parsed.data.include_items
      ? await listKnowledgeImportItems({ orgId: parsed.data.org_id, importJobId: id, limit: 500 })
      : undefined
    return NextResponse.json({ job, ...(items ? { items } : {}) })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/imports/[id]', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge-imports' },
    })
    return NextResponse.json({ error: 'Failed to get import job' }, { status: 500 })
  }
}
