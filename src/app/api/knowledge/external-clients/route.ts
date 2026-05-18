import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { KnowledgeAuthScopeSchema } from '@contracts/knowledge-auth'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { createExternalKnowledgeClient, listExternalKnowledgeClients } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'
import { buildExternalKnowledgeClientSetup } from '@/lib/knowledge/external-client-manifest'

export const dynamic = 'force-dynamic'

const listClientsQuerySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'revoked', 'expired']).optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(200).optional()),
})

const createClientBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  scopes: z.array(KnowledgeAuthScopeSchema).min(1),
  expires_at: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = listClientsQuerySchema.safeParse({
      org_id: req.nextUrl.searchParams.get('org_id'),
      project_id: req.nextUrl.searchParams.get('project_id') ?? undefined,
      team_id: req.nextUrl.searchParams.get('team_id') ?? undefined,
      status: req.nextUrl.searchParams.get('status') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const access = await resolveKnowledgeManagerAccess({ userId, orgId: parsed.data.org_id })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const clients = await listExternalKnowledgeClients({
      orgId: parsed.data.org_id,
      projectId: parsed.data.project_id,
      teamId: parsed.data.team_id,
      status: parsed.data.status,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ clients })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/external-clients', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge-external-clients' },
    })
    return NextResponse.json({ error: 'Failed to list external Knowledge clients' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = createClientBodySchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: true,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const result = await createExternalKnowledgeClient({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      teamId: body.team_id ?? null,
      name: body.name,
      scopes: body.scopes,
      expiresAt: body.expires_at ?? null,
      metadata: body.metadata,
      createdByUserId: userId,
    })
    return NextResponse.json({
      ...result,
      setup: buildExternalKnowledgeClientSetup({
        client: result.client,
        token: result.token,
        origin: req.nextUrl.origin,
      }),
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/external-clients', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge-external-clients' },
    })
    return NextResponse.json({ error: 'Failed to create external Knowledge client' }, { status: 500 })
  }
})
