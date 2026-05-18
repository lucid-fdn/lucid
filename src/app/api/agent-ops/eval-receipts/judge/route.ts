import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { EvalReceiptSourceTypeSchema } from '@contracts/eval-receipts'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { runAndRecordEvalReceipt } from '@/lib/evals/receipt-store'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const judgeEvalReceiptBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  run_id: z.string().uuid().nullable().optional(),
  source_type: EvalReceiptSourceTypeSchema,
  source_id: z.string().min(1).max(240),
  task: z.string().min(1).max(4000),
  output: z.unknown(),
  dimensions: z.array(z.string().min(1).max(240)).max(16).default(['correctness', 'completeness', 'evidence']),
  min_successful_judges: z.number().int().positive().max(10).optional(),
  pass_threshold: z.number().min(0).max(10).optional(),
  cost_cap_usd: z.number().nonnegative().max(25).optional(),
  timeout_ms: z.number().int().min(250).max(60_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
}).refine((value) => Object.prototype.hasOwnProperty.call(value, 'output'), {
  path: ['output'],
  message: 'output is required',
})

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = judgeEvalReceiptBodySchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await runAndRecordEvalReceipt({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      runId: body.run_id ?? null,
      sourceType: body.source_type,
      sourceId: body.source_id,
      task: body.task,
      output: body.output,
      dimensions: body.dimensions,
      minSuccessfulJudges: body.min_successful_judges,
      passThreshold: body.pass_threshold,
      costCapUsd: body.cost_cap_usd,
      timeoutMs: body.timeout_ms,
      metadata: {
        ...body.metadata,
        requested_by_user_id: userId,
        route: '/api/agent-ops/eval-receipts/judge',
      },
    })

    return NextResponse.json({
      receipt: result.receipt,
      evaluation: {
        successfulJudgeCount: result.evaluation.successfulJudgeCount,
        failedJudgeCount: result.evaluation.failedJudgeCount,
        skippedJudgeCount: result.evaluation.skippedJudgeCount,
        estimatedCostUsd: result.evaluation.estimatedCostUsd,
      },
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/eval-receipts/judge', method: 'POST' },
      tags: { layer: 'api', route: 'eval-receipts' },
    })
    return NextResponse.json({ error: 'Failed to judge eval receipt' }, { status: 500 })
  }
})
