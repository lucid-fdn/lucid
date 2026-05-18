import { NextRequest, NextResponse } from 'next/server'

import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import {
  getAgentAvatarGenerationJob,
  serializeAgentAvatarJob,
} from '@/lib/ai/agent-avatar/jobs'
import { isTransientSupabaseError, supabase } from '@/lib/db/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled'])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function streamAvatarJob(input: {
  jobId: string
  orgId: string
  signal: AbortSignal
}): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now()
      let lastPayload = ''

      try {
        while (!input.signal.aborted && Date.now() - startedAt < 5 * 60 * 1000) {
          const job = await getAgentAvatarGenerationJob({ jobId: input.jobId, orgId: input.orgId })
          if (!job) {
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Avatar generation job not found' })}\n\n`))
            break
          }

          const payload = JSON.stringify({ data: serializeAgentAvatarJob(job) })
          if (payload !== lastPayload) {
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
            lastPayload = payload
          } else {
            controller.enqueue(encoder.encode(': heartbeat\n\n'))
          }

          if (TERMINAL_STATUSES.has(job.status)) break
          await sleep(1000)
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({
          error: error instanceof Error ? error.message : 'Avatar job stream failed',
        })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { jobId } = await ctx.params
    const { data: jobRef, error: refError } = await supabase
      .from('agent_avatar_generation_jobs')
      .select('id, org_id, status')
      .eq('id', jobId)
      .maybeSingle()

    if (refError) throw refError
    if (!jobRef) {
      return NextResponse.json({ error: 'Avatar generation job not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, jobRef.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const job = await getAgentAvatarGenerationJob({ jobId, orgId: jobRef.org_id })
    if (!job) {
      return NextResponse.json({ error: 'Avatar generation job not found' }, { status: 404 })
    }

    if (req.nextUrl.searchParams.get('stream') === '1') {
      return streamAvatarJob({ jobId, orgId: jobRef.org_id, signal: req.signal })
    }

    return NextResponse.json({ data: serializeAgentAvatarJob(job) })
  } catch (error) {
    const transient = isTransientSupabaseError(error)
    ErrorService.captureException(error as Error, {
      severity: transient ? 'warning' : 'error',
      context: { endpoint: '/api/ai/avatar-jobs/[jobId]', method: 'GET' },
      tags: { layer: 'api', route: 'avatar-job-status' },
    })
    return NextResponse.json(
      { error: transient ? 'Avatar job status temporarily unavailable' : 'Failed to load avatar generation job' },
      { status: transient ? 503 : 500, headers: transient ? { 'Retry-After': '2' } : undefined },
    )
  }
}
