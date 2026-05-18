import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { createBoardMemory, writeProjectKnowledge, writeTeamKnowledge } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import type { KnowledgeSource } from '@/lib/knowledge/types'
import { createKnowledgeFactSchema } from '@/features/knowledge-manager/schema'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = createKnowledgeFactSchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: true,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    if (body.scope_type === 'workspace') {
      const fact = await createBoardMemory(body.org_id, userId, {
        content: body.truth,
        category: 'context',
        importance: mapTrustToImportance(body.trust_level),
        source: body.trust_level === 'system' ? 'system' : 'operator',
      })

      return NextResponse.json({
        fact,
        recall_suggestion: { query: `What should agents know about ${body.subject}?` },
      }, { status: fact ? 201 : 200 })
    }

    if (body.scope_type === 'project') {
      if (!body.project_id) {
        return NextResponse.json({ error: 'project_id is required for project facts' }, { status: 400 })
      }
      const source = buildManualKnowledgeSource(body, userId)
      const page = await writeProjectKnowledge({
        orgId: body.org_id,
        projectId: body.project_id,
        source,
        subject: body.subject,
        compiledTruthPatch: body.truth,
        event: {
          type: 'created',
          summary: 'Operator added a project fact.',
          confidence: mapTrustToConfidence(body.trust_level),
        },
        evidence: body.evidence,
      })

      return NextResponse.json({
        fact: page,
        recall_suggestion: { query: `What should agents know about ${body.subject}?` },
      }, { status: 201 })
    }

    if (body.scope_type === 'team') {
      if (!body.team_id) {
        return NextResponse.json({ error: 'team_id is required for team facts' }, { status: 400 })
      }
      const source = buildManualKnowledgeSource(body, userId)
      const page = await writeTeamKnowledge({
        orgId: body.org_id,
        projectId: body.project_id ?? null,
        teamId: body.team_id,
        source,
        subject: body.subject,
        compiledTruthPatch: body.truth,
        event: {
          type: 'created',
          summary: 'Operator added a team fact.',
          confidence: mapTrustToConfidence(body.trust_level),
        },
        evidence: body.evidence,
      })

      return NextResponse.json({
        fact: page,
        recall_suggestion: { query: `What should agents know about ${body.subject}?` },
      }, { status: 201 })
    }

    return NextResponse.json({
      error: 'Agent-scoped manual facts are not writable from this surface yet. Use assistant memory correction flows until durable assistant Knowledge writes are enabled.',
    }, { status: 409 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/facts', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge-manager' },
    })
    return NextResponse.json({ error: 'Failed to save knowledge fact' }, { status: 500 })
  }
})

function buildManualKnowledgeSource(
  body: z.infer<typeof createKnowledgeFactSchema>,
  userId: string,
): KnowledgeSource {
  return {
    type: 'manual',
    orgId: body.org_id,
    projectId: body.project_id ?? null,
    teamId: body.team_id ?? null,
    assistantId: body.assistant_id ?? null,
    scopedUserId: userId,
    label: 'Manual knowledge',
    visibility: body.scope_type === 'team' ? 'team' : 'project',
    trustLevel: body.trust_level ?? 'operator_approved',
    federationPolicy: 'source_scoped',
    retentionPolicy: 'standard',
  }
}

function mapTrustToConfidence(trustLevel: string | undefined): number {
  if (trustLevel === 'l2_verified') return 0.99
  if (trustLevel === 'system') return 0.95
  if (trustLevel === 'operator_approved') return 0.9
  return 0.72
}

function mapTrustToImportance(trustLevel: string | undefined): number {
  if (trustLevel === 'l2_verified') return 0.95
  if (trustLevel === 'system') return 0.9
  if (trustLevel === 'operator_approved') return 0.82
  return 0.65
}
