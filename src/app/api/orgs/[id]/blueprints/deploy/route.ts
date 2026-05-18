import { NextRequest, NextResponse } from 'next/server'

import { z } from 'zod'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { requireOrgRequestContext } from '@/lib/request-context/org'
import { ErrorService } from '@/lib/errors/error-service'
import { allowsPreviewE2ERateLimitBypass } from '@/lib/env/e2e'
import { deployProjectBlueprint } from '@/lib/projects/blueprint-deploy'
import { ProjectBlueprintSchema } from '@contracts/project-blueprint'

export const dynamic = 'force-dynamic'

const routeParamsSchema = z.object({
  id: z.string().uuid(),
})

const deployBlueprintBodySchema = z.object({
  blueprint: ProjectBlueprintSchema,
  project_id: z.string().uuid().optional(),
  create_project: z.boolean().optional(),
  runtime_id: z.string().uuid().optional(),
  app_bindings: z.record(z.string(), z.string().uuid().nullable()).optional(),
})

export const POST = withCSRF(async (
  req: NextRequest,
  ctx: unknown,
): Promise<NextResponse> => {
  try {
    if (!allowsPreviewE2ERateLimitBypass()) {
      const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
      if (!rl.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
      }
    }

    const { id: orgId } = routeParamsSchema.parse(
      await (ctx as { params: Promise<{ id: string }> }).params,
    )

    const contextResult = await requireOrgRequestContext({ orgId, permission: 'editProjects' })
    if (!contextResult.ok) {
      return contextResult.response
    }
    const { userId } = contextResult.context

    const body = deployBlueprintBodySchema.parse(await req.json())
    const result = await deployProjectBlueprint(body.blueprint, orgId, userId, {
      projectId: body.project_id,
      createProject: body.create_project,
      runtimeId: body.runtime_id,
      selectedConnectionIdsByProvider: body.app_bindings,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      )
    }

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/blueprints/deploy', method: 'POST' },
      tags: { layer: 'api', route: 'blueprints-deploy' },
    })
    return NextResponse.json({ error: 'Failed to deploy blueprint' }, { status: 500 })
  }
})
