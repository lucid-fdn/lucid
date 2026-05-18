import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getOrgMemberRole,
  isUserOrgMember,
  listKnowledgePages,
  seedProjectKnowledgeFromAgentOps,
  seedTeamKnowledgeFromCrew,
  writeProjectKnowledge,
  writeTeamKnowledge,
} from '@/lib/db'
import type { KnowledgeSource } from '@/lib/knowledge/types'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const listQuerySchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  scopeType: z.enum(['project', 'team', 'org']).optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(100).optional()),
})

const evidenceSchema = z.object({
  kind: z.enum(['run', 'channel_event', 'message', 'file', 'url', 'screenshot', 'transcript', 'diff', 'log', 'approval', 'l2_proof']),
  runId: z.string().nullable().optional(),
  channelEventId: z.string().nullable().optional(),
  messageId: z.string().nullable().optional(),
  artifactId: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
  l2ReceiptId: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
})

const writeBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  scope_type: z.enum(['project', 'team']),
  subject: z.string().min(1).max(240),
  compiled_truth: z.string().min(1).max(20000),
  event_type: z.enum(['created', 'updated', 'corrected', 'superseded', 'archived']).optional(),
  event_summary: z.string().min(1).max(4000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.array(evidenceSchema).optional().default([]),
  source: z.object({
    type: z.enum(['channel', 'file', 'repo', 'url', 'run', 'manual', 'project', 'team', 'org', 'engine_home', 'agent_ops', 'board_memory']).default('manual'),
    label: z.string().nullable().optional(),
    url: z.string().url().nullable().optional(),
    visibility: z.enum(['private', 'team', 'project', 'org', 'federated']).optional(),
    trust_level: z.enum(['unverified', 'observed', 'operator_approved', 'system', 'l2_verified']).optional(),
    federation_policy: z.enum(['isolated', 'source_scoped', 'org_federated']).optional(),
    retention_policy: z.enum(['ephemeral', 'standard', 'audit', 'legal_hold']).optional(),
  }).optional(),
})

const seedBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  action: z.enum(['seed_project', 'seed_team']),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = listQuerySchema.safeParse({
      orgId: req.nextUrl.searchParams.get('org_id'),
      projectId: req.nextUrl.searchParams.get('project_id') ?? undefined,
      teamId: req.nextUrl.searchParams.get('team_id') ?? undefined,
      scopeType: req.nextUrl.searchParams.get('scope_type') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    if (!(await isUserOrgMember(userId, parsed.data.orgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const pages = await listKnowledgePages({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      teamId: parsed.data.teamId,
      scopeType: parsed.data.scopeType,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ pages })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/pages', method: 'GET' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to list knowledge pages' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const json = await req.json()
    const seed = seedBodySchema.safeParse(json)
    if (seed.success) {
      if (!(await isUserOrgMember(userId, seed.data.org_id))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const role = await getOrgMemberRole(userId, seed.data.org_id)
      if (!role || !WRITE_ROLES.has(role)) {
        return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
      }
      if (seed.data.action === 'seed_team' && !seed.data.team_id) {
        return NextResponse.json({ error: 'team_id is required for seed_team' }, { status: 400 })
      }
      if (seed.data.action === 'seed_project' && !seed.data.project_id) {
        return NextResponse.json({ error: 'project_id is required for seed_project' }, { status: 400 })
      }
      const pages = seed.data.action === 'seed_team'
        ? await seedTeamKnowledgeFromCrew({
            orgId: seed.data.org_id,
            teamId: seed.data.team_id!,
            actorUserId: userId,
          })
        : await seedProjectKnowledgeFromAgentOps({
            orgId: seed.data.org_id,
            projectId: seed.data.project_id!,
            actorUserId: userId,
          })
      return NextResponse.json({ pages }, { status: 201 })
    }

    const body = writeBodySchema.parse(json)
    if (!(await isUserOrgMember(userId, body.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const role = await getOrgMemberRole(userId, body.org_id)
    if (!role || !WRITE_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })
    }

    const source: KnowledgeSource = {
      type: body.source?.type ?? 'manual',
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      teamId: body.team_id ?? null,
      label: body.source?.label ?? 'Manual knowledge',
      url: body.source?.url ?? null,
      visibility: body.source?.visibility ?? (body.scope_type === 'team' ? 'team' : 'project'),
      trustLevel: body.source?.trust_level ?? 'operator_approved',
      federationPolicy: body.source?.federation_policy ?? 'source_scoped',
      retentionPolicy: body.source?.retention_policy ?? 'standard',
    }

    const page = body.scope_type === 'team'
      ? await writeTeamKnowledge({
          orgId: body.org_id,
          projectId: body.project_id ?? null,
          teamId: body.team_id ?? null,
          source,
          subject: body.subject,
          compiledTruthPatch: body.compiled_truth,
          event: {
            type: body.event_type ?? 'created',
            summary: body.event_summary ?? 'Operator wrote team knowledge.',
            confidence: body.confidence ?? 0.9,
          },
          evidence: body.evidence,
        })
      : await writeProjectKnowledge({
          orgId: body.org_id,
          projectId: body.project_id ?? null,
          source,
          subject: body.subject,
          compiledTruthPatch: body.compiled_truth,
          event: {
            type: body.event_type ?? 'created',
            summary: body.event_summary ?? 'Operator wrote project knowledge.',
            confidence: body.confidence ?? 0.9,
          },
          evidence: body.evidence,
        })

    return NextResponse.json({ page }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/pages', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to write knowledge page' }, { status: 500 })
  }
})
