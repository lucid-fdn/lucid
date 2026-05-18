import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { runAndRecordEvalReceipt } from '@/lib/evals/receipt-store'
import { ErrorService } from '@/lib/errors/error-service'
import { thinkWithKnowledge } from '@/lib/knowledge/think'
import { resolveKnowledgeManagerAccess } from '@/features/knowledge-manager/server-auth'

export const dynamic = 'force-dynamic'

const knowledgeThinkBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  assistant_id: z.string().uuid().nullable().optional(),
  scoped_user_id: z.string().uuid().nullable().optional(),
  query: z.string().min(1).max(4000),
  mode: z.enum(['answer', 'compare', 'decision', 'risk']).default('answer'),
  persist_claim: z.boolean().default(false),
  record_eval_receipt: z.boolean().default(false),
})

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = knowledgeThinkBodySchema.parse(await req.json())
    const access = await resolveKnowledgeManagerAccess({
      userId,
      orgId: body.org_id,
      requireWrite: body.persist_claim,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const result = await thinkWithKnowledge({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      teamId: body.team_id ?? null,
      assistantId: body.assistant_id ?? null,
      scopedUserId: body.scoped_user_id ?? userId,
      query: body.query,
      mode: body.mode,
      persistClaim: body.persist_claim,
      createdByUserId: userId,
    })

    let evalReceipt = null
    if (body.record_eval_receipt) {
      try {
        const receiptResult = await runAndRecordEvalReceipt({
          orgId: body.org_id,
          projectId: body.project_id ?? null,
          runId: null,
          sourceType: 'knowledge_think',
          sourceId: result.persistedClaimId ?? buildKnowledgeThinkSourceId(body.mode, body.query),
          task: body.query,
          output: {
            summary: result.summary,
            findings: result.findings.map((finding) => ({
              title: finding.title,
              body: finding.body,
              confidence: finding.confidence,
              citationCount: finding.citations.length,
            })),
            telemetry: result.telemetry,
          },
          dimensions: ['correctness', 'completeness', 'evidence'],
          metadata: {
            source: 'knowledge_think',
            mode: body.mode,
            persisted_claim_id: result.persistedClaimId,
            requested_by_user_id: userId,
          },
        })
        evalReceipt = receiptResult.receipt
      } catch (receiptError) {
        ErrorService.captureException(receiptError as Error, {
          severity: 'warning',
          context: { endpoint: '/api/knowledge/think', operation: 'recordEvalReceipt', orgId: body.org_id },
          tags: { layer: 'api', route: 'knowledge-think' },
        })
      }
    }

    return NextResponse.json({ result, evalReceipt })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/knowledge/think', method: 'POST' },
      tags: { layer: 'api', route: 'knowledge-think' },
    })
    return NextResponse.json({ error: 'Failed to think with Knowledge' }, { status: 500 })
  }
})

function buildKnowledgeThinkSourceId(mode: string, query: string): string {
  const digest = crypto.createHash('sha256').update(`${mode}:${query}`).digest('hex').slice(0, 24)
  return `knowledge_think:${mode}:${digest}`
}
