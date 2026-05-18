import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withCSRF } from '@/lib/auth/csrf'
import { recordAppServiceEvent } from '@/lib/app-service/events'
import {
  appServicesError,
  appServicesOk,
  readAppServiceJsonBody,
  requireAppAccess,
  requireFoundrySurface,
} from '../../_shared'

export const dynamic = 'force-dynamic'

const AppFeedbackRequestSchema = z.object({
  category: z.string().min(1).max(120),
  sentiment: z.enum(['works', 'blocked', 'love']),
  message: z.string().trim().min(1).max(2_000),
  source: z.string().max(120).optional(),
})

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    requireFoundrySurface()
    const { id } = await params
    const { app, userId } = await requireAppAccess(id, 'read')
    const body = AppFeedbackRequestSchema.parse(await readAppServiceJsonBody(request))
    const event = await recordAppServiceEvent({
      appDeploymentId: app.id,
      generationRunId: app.generation_run_id,
      eventType: 'app_beta_feedback_submitted',
      severity: body.sentiment === 'blocked' ? 'warning' : 'info',
      message: body.message,
      payload: {
        category: body.category,
        sentiment: body.sentiment,
        source: body.source ?? 'operator_cockpit',
        submitted_by: userId,
      },
    })
    return appServicesOk({ feedback: { status: 'received', event_id: event?.id ?? null } }, request, { status: 202 })
  } catch (error) {
    return appServicesError(error, request)
  }
})
