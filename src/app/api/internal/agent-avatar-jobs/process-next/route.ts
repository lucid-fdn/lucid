import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { ErrorService } from '@/lib/errors/error-service'
import {
  claimNextAgentAvatarGenerationJobs,
  processClaimedAgentAvatarGenerationJob,
  serializeAgentAvatarJob,
} from '@/lib/ai/agent-avatar/jobs'
import { isTransientSupabaseError } from '@/lib/db/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const processNextSchema = z.object({
  workerId: z.string().trim().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(10).optional(),
  staleAfterSeconds: z.number().int().min(60).max(3600).optional(),
})

function authorize(req: NextRequest): boolean {
  const secret = process.env.WORKER_TRIGGER_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const parsed = processNextSchema.parse(await req.json().catch(() => ({})))
    const workerId = parsed.workerId || `control-plane-${process.pid}`
    const claimed = await claimNextAgentAvatarGenerationJobs({
      workerId,
      limit: parsed.limit ?? 1,
      staleAfterSeconds: parsed.staleAfterSeconds ?? 900,
    })

    const results = []
    for (const job of claimed) {
      const processed = await processClaimedAgentAvatarGenerationJob(job)
      results.push(serializeAgentAvatarJob(processed))
    }

    return NextResponse.json({
      data: {
        claimed: claimed.length,
        processed: results.length,
        jobs: results,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    const transient = isTransientSupabaseError(error)
    ErrorService.captureException(error as Error, {
      severity: transient ? 'warning' : 'error',
      context: { endpoint: '/api/internal/agent-avatar-jobs/process-next', method: 'POST' },
      tags: { layer: 'api', route: 'internal-agent-avatar-job-worker' },
    })
    return NextResponse.json(
      { error: transient ? 'Avatar worker temporarily unavailable' : 'Failed to process avatar generation jobs' },
      { status: transient ? 503 : 500, headers: transient ? { 'Retry-After': '2' } : undefined },
    )
  }
}
