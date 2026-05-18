import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkAIGenerationRateLimit } from '@/lib/ai/rate-limit'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import { ErrorService } from '@/lib/errors/error-service'
import { getUserId } from '@/lib/auth/server-utils'
import { avatarGenerateRequestSchema, buildAvatarSpec } from '@/lib/ai/agent-avatar/request'
import {
  createAgentAvatarGenerationJob,
  serializeAgentAvatarJob,
} from '@/lib/ai/agent-avatar/jobs'
import { isImageGenerationError } from '@/lib/ai/images/errors'
import { isAIGenerationFeatureDisabledError } from '@/lib/ai/control-plane/flags'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = withCSRF(async (
  req: NextRequest,
  ctx: unknown,
): Promise<NextResponse> => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await (ctx as { params: Promise<{ id: string }> }).params
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = avatarGenerateRequestSchema.parse(await req.json())

    const rateLimit = await checkAIGenerationRateLimit(userId)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 })
    }

    const entitlement = await evaluateEntitlement({ orgId: assistant.org_id, action: 'ai_query' })
    const entitlementGuard = guardEntitlement(entitlement, {
      orgId: assistant.org_id,
      route: '/api/assistants/[id]/avatar/generate',
    })
    if (entitlementGuard) return entitlementGuard

    const job = await createAgentAvatarGenerationJob(buildAvatarSpec({
      body: {
        ...body,
        name: body.name || assistant.name || 'Lucid Agent',
        description: body.description || assistant.description || undefined,
      },
      userId,
      orgId: assistant.org_id,
      assistantId,
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
      context: { endpoint: '/api/assistants/[id]/avatar/generate', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-avatar-generate' },
    })
    return NextResponse.json({ error: 'Failed to generate assistant avatar' }, { status: 500 })
  }
})
