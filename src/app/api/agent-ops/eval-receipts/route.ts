import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  EvalJudgeResultSchema,
  EvalReceiptSourceTypeSchema,
  EvalReceiptVerdictSchema,
} from '@contracts/eval-receipts'
import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember, listEvalReceipts, recordEvalReceipt } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const listEvalReceiptsQuerySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  run_id: z.string().uuid().nullable().optional(),
  source_type: EvalReceiptSourceTypeSchema.optional(),
  source_id: z.string().max(240).nullable().optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined))
    .pipe(z.number().int().positive().max(200).optional()),
})

const createEvalReceiptBodySchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable().optional(),
  run_id: z.string().uuid().nullable().optional(),
  source_type: EvalReceiptSourceTypeSchema,
  source_id: z.string().min(1).max(240),
  task: z.string().min(1).max(4000),
  output_hash: z.string().min(16).max(160),
  dimensions: z.array(z.string().min(1).max(240)).default([]),
  judges: z.array(EvalJudgeResultSchema).default([]),
  verdict: EvalReceiptVerdictSchema,
  aggregate: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.RELAXED)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = listEvalReceiptsQuerySchema.safeParse({
      org_id: req.nextUrl.searchParams.get('org_id'),
      project_id: req.nextUrl.searchParams.get('project_id') ?? undefined,
      run_id: req.nextUrl.searchParams.get('run_id') ?? undefined,
      source_type: req.nextUrl.searchParams.get('source_type') ?? undefined,
      source_id: req.nextUrl.searchParams.get('source_id') ?? undefined,
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    if (!(await isUserOrgMember(userId, parsed.data.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const receipts = await listEvalReceipts({
      orgId: parsed.data.org_id,
      projectId: parsed.data.project_id,
      runId: parsed.data.run_id,
      sourceType: parsed.data.source_type,
      sourceId: parsed.data.source_id,
      limit: parsed.data.limit,
    })
    return NextResponse.json({ receipts })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/eval-receipts', method: 'GET' },
      tags: { layer: 'api', route: 'eval-receipts' },
    })
    return NextResponse.json({ error: 'Failed to list eval receipts' }, { status: 500 })
  }
}

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = createEvalReceiptBodySchema.parse(await req.json())
    if (!(await isUserOrgMember(userId, body.org_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const receipt = await recordEvalReceipt({
      orgId: body.org_id,
      projectId: body.project_id ?? null,
      runId: body.run_id ?? null,
      sourceType: body.source_type,
      sourceId: body.source_id,
      task: body.task,
      outputHash: body.output_hash,
      dimensions: body.dimensions,
      judges: body.judges,
      verdict: body.verdict,
      aggregate: body.aggregate,
      metadata: body.metadata,
    })
    return NextResponse.json({ receipt }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agent-ops/eval-receipts', method: 'POST' },
      tags: { layer: 'api', route: 'eval-receipts' },
    })
    return NextResponse.json({ error: 'Failed to record eval receipt' }, { status: 500 })
  }
})
