import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { getKnowledgeSource, getOrgMemberRole, isUserOrgMember, updateKnowledgeSourcePolicy } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const querySchema = z.object({
  orgId: z.string().uuid(),
})

const patchSchema = z.object({
  org_id: z.string().uuid(),
  label: z.string().min(1).max(240).nullable().optional(),
  visibility: z.enum(['private', 'team', 'project', 'org', 'federated']).optional(),
  trust_level: z.enum(['unverified', 'observed', 'operator_approved', 'system', 'l2_verified']).optional(),
  federation_policy: z.enum(['isolated', 'source_scoped', 'org_federated']).optional(),
  retention_policy: z.enum(['ephemeral', 'standard', 'audit', 'legal_hold']).optional(),
  status: z.enum(['active', 'paused', 'stale', 'errored', 'archived']).optional(),
  include_in_retrieval: z.boolean().optional(),
  refresh_policy: z.enum(['manual', 'on_change', 'scheduled']).optional(),
  refresh_interval_seconds: z.number().int().min(300).nullable().optional(),
  stale_after: z.string().datetime().nullable().optional(),
  connector_key: z.string().min(1).max(160).nullable().optional(),
  external_etag: z.string().min(1).max(512).nullable().optional(),
})

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await ctx.params
    const parsed = querySchema.safeParse({ orgId: req.nextUrl.searchParams.get('org_id') })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    if (!(await isUserOrgMember(userId, parsed.data.orgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const source = await getKnowledgeSource({ orgId: parsed.data.orgId, sourceId: id })
    if (!source) return NextResponse.json({ error: 'Knowledge source not found' }, { status: 404 })
    return NextResponse.json({ source })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/sources/[id]', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to load knowledge source' }, { status: 500 })
  }
}

export const PATCH = withCSRF(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await ctx.params
    const body = patchSchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const role = await getOrgMemberRole(userId, body.org_id)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const source = await updateKnowledgeSourcePolicy({
      orgId: body.org_id,
      sourceId: id,
      label: body.label,
      visibility: body.visibility,
      trustLevel: body.trust_level,
      federationPolicy: body.federation_policy,
      retentionPolicy: body.retention_policy,
      status: body.status,
      includeInRetrieval: body.include_in_retrieval,
      refreshPolicy: body.refresh_policy,
      refreshIntervalSeconds: body.refresh_interval_seconds,
      staleAfter: body.stale_after,
      connectorKey: body.connector_key,
      externalEtag: body.external_etag,
    })

    if (!source) return NextResponse.json({ error: 'Knowledge source not found' }, { status: 404 })
    return NextResponse.json({ source })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/sources/[id]', method: 'PATCH' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to update knowledge source' }, { status: 500 })
  }
})
