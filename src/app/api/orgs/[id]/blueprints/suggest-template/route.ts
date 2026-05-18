import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { validateAIPrompt } from '@/lib/ai/validation'
import { withCSRF } from '@/lib/auth/csrf'
import { requireOrgRequestContext } from '@/lib/request-context/org'
import { listDeployableTemplateCatalogEntries } from '@/lib/templates/library-server'
import { ErrorService } from '@/lib/errors/error-service'
import { suggestBuilderTemplate } from '@/lib/ai/project-generation/template-suggestion'
import type { BuilderTemplateSuggestion } from '@/lib/ai/project-generation/template-suggestion'
import { logBuilderTelemetry } from '@/lib/ai/project-generation/builder-telemetry'

export const dynamic = 'force-dynamic'
const BUILDER_TEMPLATE_SUGGESTION_CACHE_TTL_MS = 60_000
const builderTemplateSuggestionCache = new Map<string, {
  expiresAt: number
  suggestion: BuilderTemplateSuggestion | null
}>()
const builderTemplateSuggestionInflight = new Map<string, Promise<BuilderTemplateSuggestion | null>>()

const routeParamsSchema = z.object({
  id: z.string().uuid(),
})

const requestSchema = z.object({
  prompt: z.string().trim().min(1),
  selected_template_slug: z.string().trim().optional().nullable(),
})

export const POST = withCSRF(async (
  req: NextRequest,
  ctx: unknown,
): Promise<NextResponse> => {
  const startedAt = Date.now()
  try {
    const { id: orgId } = routeParamsSchema.parse(
      await (ctx as { params: Promise<{ id: string }> }).params,
    )

    const contextResult = await requireOrgRequestContext({ orgId, permission: 'editProjects' })
    if (!contextResult.ok) {
      return contextResult.response as NextResponse
    }

    const body = requestSchema.parse(await req.json())
    const promptValidation = validateAIPrompt(body.prompt)
    if (!promptValidation.valid || !promptValidation.sanitized) {
      return NextResponse.json(
        { error: 'Invalid input', issues: promptValidation.issues ?? ['Prompt is required'] },
        { status: 400 },
      )
    }

    const templatesStartedAt = Date.now()
    const suggestion = await getCachedBuilderTemplateSuggestion({
      orgId,
      prompt: promptValidation.sanitized,
      selectedTemplateSlug: body.selected_template_slug,
    })

    logBuilderTelemetry('[builder:suggest-template]', {
      orgId,
      hasSuggestion: Boolean(suggestion),
      templateSlug: suggestion?.match.slug ?? null,
      confidence: suggestion?.confidence ?? null,
      templates_ms: Date.now() - templatesStartedAt,
      total_ms: Date.now() - startedAt,
    })

    return NextResponse.json(
      { suggestion },
      {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        },
      },
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/blueprints/suggest-template', method: 'POST' },
      tags: { layer: 'api', route: 'blueprints-suggest-template' },
    })
    return NextResponse.json({ error: 'Failed to suggest template' }, { status: 500 })
  }
})

async function getCachedBuilderTemplateSuggestion(input: {
  orgId: string
  prompt: string
  selectedTemplateSlug?: string | null
}): Promise<BuilderTemplateSuggestion | null> {
  const normalizedPrompt = input.prompt.trim().toLowerCase()
  const cacheKey = `${input.orgId}:${normalizedPrompt}:${input.selectedTemplateSlug ?? ''}`
  const cached = builderTemplateSuggestionCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.suggestion
  }

  const existing = builderTemplateSuggestionInflight.get(cacheKey)
  if (existing) return existing

  const inflight = listDeployableTemplateCatalogEntries({ orgId: input.orgId })
    .then((templates) => suggestBuilderTemplate({
      prompt: input.prompt,
      templates,
      selectedTemplateSlug: input.selectedTemplateSlug,
    }))

  builderTemplateSuggestionInflight.set(cacheKey, inflight)
  try {
    const suggestion = await inflight
    builderTemplateSuggestionCache.set(cacheKey, {
      expiresAt: Date.now() + BUILDER_TEMPLATE_SUGGESTION_CACHE_TTL_MS,
      suggestion,
    })
    return suggestion
  } finally {
    builderTemplateSuggestionInflight.delete(cacheKey)
  }
}
