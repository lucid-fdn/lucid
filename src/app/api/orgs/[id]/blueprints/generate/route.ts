import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { requireOrgRequestContext } from '@/lib/request-context/org'
import { validateAIPrompt } from '@/lib/ai/validation'
import { checkAIGenerationRateLimit } from '@/lib/ai/rate-limit'
import { DEFAULT_MODEL_ID } from '@/lib/ai/models'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import { ErrorService } from '@/lib/errors/error-service'
import { incrementUsage } from '@/lib/plans'
import { builderGenerationAdapter } from '@/lib/ai/control-plane/adapters/builder'
import { runAIGeneration } from '@/lib/ai/control-plane/run-generation'
import {
  generatedBlueprintResultSchema,
  generationDraftSchema,
} from '@/lib/ai/project-generation/schemas'

export const dynamic = 'force-dynamic'

const routeParamsSchema = z.object({
  id: z.string().uuid(),
})

const requestSchema = z.object({
  prompt: z.string().trim().min(1),
  draft: generationDraftSchema.optional(),
  selected_template_slug: z.string().trim().optional(),
  preferred_mode: z.enum(['auto', 'template', 'agent', 'team']).optional(),
  runtime_mode: z.enum(['shared', 'dedicated', 'byo']).optional(),
  model: z.string().trim().optional(),
})

export const POST = withCSRF(async (
  req: NextRequest,
  ctx: unknown,
): Promise<NextResponse> => {
  try {
    const { id: orgId } = routeParamsSchema.parse(
      await (ctx as { params: Promise<{ id: string }> }).params,
    )

    const contextResult = await requireOrgRequestContext({ orgId, permission: 'editProjects' })
    if (!contextResult.ok) {
      return contextResult.response
    }
    const { userId } = contextResult.context

    const body = requestSchema.parse(await req.json())
    const promptValidation = validateAIPrompt(body.prompt)
    if (!promptValidation.valid || !promptValidation.sanitized) {
      return NextResponse.json(
        { error: 'Invalid input', issues: promptValidation.issues ?? ['Prompt is required'] },
        { status: 400 },
      )
    }

    const rateLimit = await checkAIGenerationRateLimit(userId)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 },
      )
    }

    const entitlement = await evaluateEntitlement({ orgId, action: 'ai_query' })
    const entitlementGuard = guardEntitlement(entitlement, { orgId, route: '/api/orgs/[id]/blueprints/generate' })
    if (entitlementGuard) return entitlementGuard

    const { output } = await runAIGeneration({
      context: {
        userId,
        orgId,
      },
      feature: 'project-generation',
      modality: 'builder',
      model: body.model || DEFAULT_MODEL_ID,
      prompt: promptValidation.sanitized,
      input: {
        orgId,
        prompt: promptValidation.sanitized,
        draft: body.draft,
        selectedTemplateSlug: body.selected_template_slug,
        preferredMode: body.preferred_mode,
        runtimeMode: body.runtime_mode,
        requestedModelId: body.model || DEFAULT_MODEL_ID,
        telemetry: {
          userId,
          orgId,
        },
      },
      metadata: {
        route: '/api/orgs/[id]/blueprints/generate',
        selectedTemplateSlug: body.selected_template_slug,
        preferredMode: body.preferred_mode,
        runtimeMode: body.runtime_mode,
        hasDraft: Boolean(body.draft),
      },
      adapter: builderGenerationAdapter,
    })

    const parsedResult = generatedBlueprintResultSchema.parse(output.result)

    const idemKey = req.headers.get('x-idempotency-key') || crypto.randomUUID()
    incrementUsage(orgId, 'ai_queries_monthly', 1, `gen-blueprint:${orgId}:${idemKey}`).catch(() => {})

    return NextResponse.json(parsedResult, { status: 200 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }

    const message = error instanceof Error ? error.message : 'Failed to generate blueprint'
    console.error('[blueprints/generate] Request failed:', error)
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/blueprints/generate', method: 'POST' },
      tags: { layer: 'api', route: 'blueprints-generate' },
    })
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === 'development' ? message : 'Failed to generate blueprint',
      },
      { status: 500 },
    )
  }
})
