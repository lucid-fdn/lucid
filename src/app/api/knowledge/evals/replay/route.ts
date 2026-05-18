import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getOrgMemberRole,
  isUserOrgMember,
  listKnowledgeRetrievalEvalCases,
  recordKnowledgeRetrievalEvalRun,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { evaluateKnowledgeRetrieval } from '@/lib/knowledge/retrieval-evals'
import { queryBrain } from '@/lib/brain/query'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

const bodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  category: z.enum(['preference', 'project_fact', 'org_policy', 'source_conflict', 'evidence_heavy']).optional(),
  limit: z.number().int().positive().max(100).optional(),
  dry_run: z.boolean().optional(),
})

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = bodySchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const role = await getOrgMemberRole(userId, body.org_id)
    if (!role || !WRITE_ROLES.has(role)) return NextResponse.json({ error: 'Admin or owner role required' }, { status: 403 })

    const cases = await listKnowledgeRetrievalEvalCases({
      orgId: body.org_id,
      projectId: body.project_id,
      category: body.category,
      status: 'active',
      limit: body.limit ?? 50,
    })

    const results = []
    for (const evalCase of cases) {
      const startedAt = Date.now()
      const result = await queryBrain({
        org_id: evalCase.orgId,
        project_id: evalCase.projectId,
        team_id: evalCase.teamId,
        query: evalCase.query,
        actorUserId: userId,
        surface: 'mission_control',
        audit: false,
        knowledgeLayers: evalCase.requiredLayers.length > 0 ? evalCase.requiredLayers : undefined,
        evalCapture: {
          enabled: false,
          caseId: evalCase.id,
          expectedItemIds: evalCase.expectedItemIds,
          expectedCitationKeys: evalCase.expectedCitationKeys,
          actorUserId: userId,
          surface: 'mission_control',
        },
      })
      const packet = result.packet
      const metrics = evaluateKnowledgeRetrieval(packet, {
        expectedItemIds: evalCase.expectedItemIds,
        expectedCitationKeys: evalCase.expectedCitationKeys,
        baselineTopItemId: evalCase.baselineTopItemId,
        maxLatencyMs: packet.budget.maxLatencyMs,
      })
      const status = metrics.failureTypes.length === 0
        ? 'passed'
        : metrics.failureTypes.includes('missing_source') || metrics.failureTypes.includes('bad_citation')
          ? 'failed'
          : 'warning'
      results.push({
        caseId: evalCase.id,
        status,
        metrics,
        latencyMs: packet.telemetry.durationMs || Date.now() - startedAt,
        summary: `${evalCase.slug}: ${status}${metrics.failureTypes.length ? ` (${metrics.failureTypes.join(', ')})` : ''}`,
        metadata: {
          slug: evalCase.slug,
          category: evalCase.category,
          topItemId: packet.items[0]?.id ?? null,
          itemCount: packet.items.length,
        },
      } satisfies {
        caseId: string
        status: 'passed' | 'failed' | 'warning' | 'skipped'
        metrics: ReturnType<typeof evaluateKnowledgeRetrieval>
        latencyMs: number
        summary: string
        metadata: Record<string, unknown>
      })
    }

    const run = body.dry_run
      ? { evalRunId: null, summary: null }
      : await recordKnowledgeRetrievalEvalRun({
          orgId: body.org_id,
          projectId: body.project_id,
          results,
          createdBy: userId,
          metadata: {
            category: body.category ?? null,
            dryRun: false,
          },
        })

    return NextResponse.json({
      evalRunId: run.evalRunId,
      summary: run.summary,
      results,
    })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/evals/replay', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge' },
    })
    return NextResponse.json({ error: 'Failed to replay Knowledge retrieval evals' }, { status: 500 })
  }
})
