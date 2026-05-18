import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getOrgMemberRole,
  isUserOrgMember,
  listKnowledgeEngineHomeProjectionCandidates,
  upsertKnowledgeEngineHomeProjectionCandidates,
} from '@/lib/db'
import { buildEngineHomeProjectionCandidates } from '@/lib/knowledge/engine-home-projection'
import type { EngineHomeSnapshot } from '@lucid/runtime-compat'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const listQuerySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  assistantId: z.string().uuid().optional(),
  status: z.enum(['candidate', 'promoted', 'rejected', 'ignored']).optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(100).optional()),
})

const resourceSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().nullable().optional(),
  contentHash: z.string().nullable().optional(),
  byteLength: z.number().int().nonnegative().nullable().optional(),
  modifiedAt: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const snapshotSchema = z.object({
  id: z.string().min(1).max(200),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  descriptor: z.object({
    engine: z.enum(['openclaw', 'hermes', 'langchain', 'crewai', 'autogen', 'smolagents', 'lucid']),
    kind: z.enum(['hermes_hhv', 'openclaw_ohv', 'generic_ehv']),
    authority: z.enum(['local_authoritative', 'lucid_authoritative', 'evaluation_only']),
    runtimeFlavor: z.enum(['shared', 'c1_managed', 'c2a_autonomous']),
    channelOwnership: z.enum(['lucid_relay', 'runtime_native']),
    runtimeId: z.string().uuid().nullable().optional(),
    assistantId: z.string().uuid().nullable().optional(),
    homePath: z.string().nullable().optional(),
  }),
  resources: z.array(resourceSchema).max(100),
  createdAt: z.string(),
  diffId: z.string().nullable().optional(),
})

const postBodySchema = z.object({
  snapshot: snapshotSchema,
  options: z.object({
    allowHermesAutoPromotion: z.boolean().optional(),
    allowOpenClawProjection: z.boolean().optional(),
    maxSummaryChars: z.number().int().positive().max(2000).optional(),
  }).optional(),
})

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
  if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = listQuerySchema.safeParse({
    orgId: req.nextUrl.searchParams.get('org_id'),
    projectId: req.nextUrl.searchParams.get('project_id') ?? undefined,
    assistantId: req.nextUrl.searchParams.get('assistant_id') ?? undefined,
    status: req.nextUrl.searchParams.get('status') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })

  if (!(await isUserOrgMember(userId, parsed.data.orgId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const candidates = await listKnowledgeEngineHomeProjectionCandidates({
    orgId: parsed.data.orgId,
    projectId: parsed.data.projectId,
    assistantId: parsed.data.assistantId,
    status: parsed.data.status,
    limit: parsed.data.limit,
  })
  return NextResponse.json({ candidates })
}

export const POST = withCSRF(async (req: NextRequest) => {
  const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
  if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = postBodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })

  if (!(await isUserOrgMember(userId, parsed.data.snapshot.orgId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const role = await getOrgMemberRole(userId, parsed.data.snapshot.orgId)
  if (!role || !WRITE_ROLES.has(role)) {
    return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
  }

  const candidates = buildEngineHomeProjectionCandidates(
    parsed.data.snapshot as EngineHomeSnapshot,
    parsed.data.options,
  )
  const stored = await upsertKnowledgeEngineHomeProjectionCandidates(candidates)
  return NextResponse.json({ candidates: stored })
})
