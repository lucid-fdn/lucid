import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  archiveBoardMemory,
  archiveKnowledgePage,
  deleteBoardMemory,
  updateBoardMemory,
  updateKnowledgePageManual,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { updateKnowledgeFactSchema } from '@/features/knowledge-manager/schema'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

export const PATCH = withCSRF(async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await ctx.params
    const body = updateKnowledgeFactSchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: true,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    if (body.storage_type === 'board_memory') {
      const fact = body.archive
        ? await archiveBoardMemory(body.org_id, id).then((ok) => ok ? { id } : null)
        : await updateBoardMemory(body.org_id, id, {
            content: body.truth,
            importance: mapTrustToImportance(body.trust_level),
            source: body.trust_level === 'system' ? 'system' : undefined,
          })
      if (!fact) return NextResponse.json({ error: 'Knowledge fact not found' }, { status: 404 })
      return NextResponse.json({ fact })
    }

    const fact = body.archive
      ? await archiveKnowledgePage({ orgId: body.org_id, pageId: id }).then((ok) => ok ? { id } : null)
      : await updateKnowledgePageManual({
          orgId: body.org_id,
          pageId: id,
          subject: body.subject,
          compiledTruth: body.truth,
          trustLevel: body.trust_level,
          confidence: mapTrustToConfidence(body.trust_level),
        })
    if (!fact) return NextResponse.json({ error: 'Knowledge fact not found' }, { status: 404 })
    return NextResponse.json({ fact })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/facts/[id]', method: 'PATCH' },
      tags: { layer: 'api', route: 'knowledge-manager' },
    })
    return NextResponse.json({ error: 'Failed to update knowledge fact' }, { status: 500 })
  }
})

export const DELETE = withCSRF(async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await ctx.params
    const body = updateKnowledgeFactSchema.pick({ org_id: true, storage_type: true }).parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: true,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const ok = body.storage_type === 'board_memory'
      ? await deleteBoardMemory(body.org_id, id)
      : await archiveKnowledgePage({ orgId: body.org_id, pageId: id, reason: 'Operator removed knowledge from the self-serve manager.' })

    if (!ok) return NextResponse.json({ error: 'Knowledge fact not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/facts/[id]', method: 'DELETE' },
      tags: { layer: 'api', route: 'knowledge-manager' },
    })
    return NextResponse.json({ error: 'Failed to delete knowledge fact' }, { status: 500 })
  }
})

function mapTrustToConfidence(trustLevel: string | undefined): number | undefined {
  if (!trustLevel) return undefined
  if (trustLevel === 'l2_verified') return 0.99
  if (trustLevel === 'system') return 0.95
  if (trustLevel === 'operator_approved') return 0.9
  return 0.72
}

function mapTrustToImportance(trustLevel: string | undefined): number | undefined {
  if (!trustLevel) return undefined
  if (trustLevel === 'l2_verified') return 0.95
  if (trustLevel === 'system') return 0.9
  if (trustLevel === 'operator_approved') return 0.82
  return 0.65
}
