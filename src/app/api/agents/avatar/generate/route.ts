import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkAIGenerationRateLimit } from '@/lib/ai/rate-limit'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import { ErrorService } from '@/lib/errors/error-service'
import {
  avatarGenerateRequestSchema,
  buildAvatarSpec,
  resolveAvatarOrgContext,
} from '@/lib/ai/agent-avatar/request'
import {
  createAgentAvatarGenerationJob,
  serializeAgentAvatarJob,
} from '@/lib/ai/agent-avatar/jobs'
import { isImageGenerationError } from '@/lib/ai/images/errors'
import { isAIGenerationFeatureDisabledError } from '@/lib/ai/control-plane/flags'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = withCSRF(async (req: NextRequest): Promise<NextResponse> => {
  try {
    const body = avatarGenerateRequestSchema.parse(await req.json())
    const context = await resolveAvatarOrgContext(body.orgId)
    if (!context.ok) return context.response as NextResponse

    const rateLimit = await checkAIGenerationRateLimit(context.userId)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 })
    }

    const entitlement = await evaluateEntitlement({ orgId: context.orgId, action: 'ai_query' })
    const entitlementGuard = guardEntitlement(entitlement, {
      orgId: context.orgId,
      route: '/api/agents/avatar/generate',
    })
    if (entitlementGuard) return entitlementGuard

    const job = await createAgentAvatarGenerationJob(buildAvatarSpec({
      body,
      userId: context.userId,
      orgId: context.orgId,
    }))

    return NextResponse.json({
      data: serializeAgentAvatarJob(job),
    }, { status: 202 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    if (isImageGenerationError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode })
    }

    if (isAIGenerationFeatureDisabledError(error)) {
      return NextResponse.json({ error: error.message, code: 'feature_disabled', flag: error.flag }, { status: 503 })
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/agents/avatar/generate', method: 'POST' },
      tags: { layer: 'api', route: 'agent-avatar-generate' },
    })
    return NextResponse.json({ error: 'Failed to generate agent avatar' }, { status: 500 })
  }
})
