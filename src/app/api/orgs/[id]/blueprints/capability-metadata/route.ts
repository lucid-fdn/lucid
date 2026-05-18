import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireOrgRequestContext } from '@/lib/request-context/org'
import { getUnifiedSkillsForOrg } from '@/lib/db/unified-skills'
import { ErrorService } from '@/lib/errors/error-service'
import { filterPublicBuilderCapabilities } from '@/lib/builder/state/builder-selectors'
import type { UnifiedSkillItem } from '@contracts/unified-skill'
import { logBuilderTelemetry } from '@/lib/ai/project-generation/builder-telemetry'

export const dynamic = 'force-dynamic'
const BUILDER_CAPABILITY_METADATA_CACHE_TTL_MS = 60_000
const builderCapabilityMetadataCache = new Map<string, {
  expiresAt: number
  items: UnifiedSkillItem[]
}>()
const builderCapabilityMetadataInflight = new Map<string, Promise<UnifiedSkillItem[]>>()

const routeParamsSchema = z.object({
  id: z.string().uuid(),
})

export async function GET(
  req: NextRequest,
  ctx: unknown,
): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const { id: orgId } = routeParamsSchema.parse(
      await (ctx as { params: Promise<{ id: string }> }).params,
    )

    const contextResult = await requireOrgRequestContext({ orgId, permission: 'editProjects' })
    if (!contextResult.ok) {
      return contextResult.response as NextResponse
    }

    const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1'
    const items = await getCachedBuilderCapabilityMetadata(orgId, { forceRefresh })
    logBuilderTelemetry('[builder:capability-metadata]', {
      orgId,
      count: items.length,
      cached: !forceRefresh,
      total_ms: Date.now() - startedAt,
    })

    return NextResponse.json(
      { items },
      {
        headers: {
          'Cache-Control': forceRefresh
            ? 'private, no-store'
            : 'private, max-age=30, stale-while-revalidate=60',
        },
      },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/blueprints/capability-metadata', method: 'GET' },
      tags: { layer: 'api', route: 'blueprints-capability-metadata' },
    })
    return NextResponse.json({ error: 'Failed to load capability metadata' }, { status: 500 })
  }
}

async function getCachedBuilderCapabilityMetadata(
  orgId: string,
  options?: { forceRefresh?: boolean },
) {
  if (options?.forceRefresh) {
    builderCapabilityMetadataCache.delete(orgId)
  }

  const cached = builderCapabilityMetadataCache.get(orgId)
  if (!options?.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.items
  }

  const existing = builderCapabilityMetadataInflight.get(orgId)
  if (!options?.forceRefresh && existing) return existing

  const inflight = getUnifiedSkillsForOrg({ orgId })
    .then((items) => filterPublicBuilderCapabilities(items))

  builderCapabilityMetadataInflight.set(orgId, inflight)
  try {
    const items = await inflight
    builderCapabilityMetadataCache.set(orgId, {
      expiresAt: Date.now() + BUILDER_CAPABILITY_METADATA_CACHE_TTL_MS,
      items,
    })
    return items
  } finally {
    builderCapabilityMetadataInflight.delete(orgId)
  }
}
