import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  SystemNoticeActionSchema,
  SystemNoticeMetadataItemSchema,
  SystemNoticeToneSchema,
  SystemNoticeTypeSchema,
} from '@contracts/system-notice'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { createSystemNotice, isUserOrgMember, listSystemNotices } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const listSchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  run_id: z.string().uuid().nullable().optional(),
  unresolved_only: z.enum(['true', 'false']).optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined)),
})

const createNoticeSchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  run_id: z.string().uuid().nullable().optional(),
  agent_id: z.string().uuid().nullable().optional(),
  type: SystemNoticeTypeSchema,
  tone: SystemNoticeToneSchema.default('neutral'),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  channel_type: z.string().max(80).nullable().optional(),
  dedupe_key: z.string().max(240).nullable().optional(),
  metadata: z.array(SystemNoticeMetadataItemSchema).default([]),
  actions: z.array(SystemNoticeActionSchema).default([]),
  details: z.record(z.string(), z.unknown()).default({}),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = listSchema.safeParse({
      org_id: req.nextUrl.searchParams.get('org_id'),
      project_id: req.nextUrl.searchParams.get('project_id') ?? undefined,
      run_id: req.nextUrl.searchParams.get('run_id') ?? undefined,
      unresolved_only: req.nextUrl.searchParams.get('unresolved_only') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, parsed.data.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const notices = await listSystemNotices({
      orgId: parsed.data.org_id,
      projectId: parsed.data.project_id ?? null,
      runId: parsed.data.run_id ?? null,
      unresolvedOnly: parsed.data.unresolved_only === 'true',
      limit: parsed.data.limit,
    })

    return NextResponse.json({ notices })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/notices', method: 'GET' },
      tags: { layer: 'api', route: 'mission-control-notices' },
    })
    return NextResponse.json({ error: 'Failed to list notices' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = createNoticeSchema.parse(await req.json())
    const isMember = await isUserOrgMember(userId, body.org_id)
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const notice = await createSystemNotice({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      runId: body.run_id ?? null,
      agentId: body.agent_id ?? null,
      type: body.type,
      tone: body.tone,
      title: body.title,
      body: body.body,
      channelType: body.channel_type ?? null,
      dedupeKey: body.dedupe_key ?? null,
      metadata: body.metadata,
      actions: body.actions,
      details: body.details,
      createdByUserId: userId,
    })
    return NextResponse.json({ notice }, { status: notice ? 201 : 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/notices', method: 'POST' },
      tags: { layer: 'api', route: 'mission-control-notices' },
    })
    return NextResponse.json({ error: 'Failed to create notice' }, { status: 500 })
  }
})
