import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withCSRF } from '@/lib/auth/csrf'
import {
  CreateAppBlueprintInputSchema,
  createAppBlueprint,
  listAppBlueprints,
} from '@/lib/app-service/blueprints'
import { APP_SERVICE_FIRST_PLATFORM_BLUEPRINTS } from '@/lib/app-service/platform-blueprints-core'
import {
  appServicesError,
  appServicesOk,
  readAppServiceJsonBody,
  requireFoundrySurface,
  requireOrgAccess,
} from '../_shared'
import { AppServiceError } from '@/lib/app-service/errors'

export const dynamic = 'force-dynamic'

const BlueprintsQuerySchema = z.object({
  org_id: z.string().uuid().optional(),
  category: z.string().min(1).max(80).optional(),
  status: z.string().min(1).max(80).optional(),
})

export async function GET(request: NextRequest) {
  try {
    requireFoundrySurface()
    const query = BlueprintsQuerySchema.parse({
      org_id: request.nextUrl.searchParams.get('org_id') ?? undefined,
      category: request.nextUrl.searchParams.get('category') ?? undefined,
      status: request.nextUrl.searchParams.get('status') ?? undefined,
    })
    if (query.org_id) {
      await requireOrgAccess(query.org_id, 'read')
    }

    const blueprints = query.org_id
      ? await listAppBlueprints({
          orgId: query.org_id,
          category: query.category,
          status: query.status,
          limit: 100,
        })
      : []

    return appServicesOk({
      platform_blueprints: APP_SERVICE_FIRST_PLATFORM_BLUEPRINTS,
      blueprints,
    }, request)
  } catch (error) {
    return appServicesError(error, request)
  }
}

export const POST = withCSRF(async (request: NextRequest) => {
  try {
    requireFoundrySurface()
    const input = CreateAppBlueprintInputSchema.parse(await readAppServiceJsonBody(request))
    if (!input.orgId) {
      throw new AppServiceError('validation_failed', 'Custom blueprints must belong to an organization.', 400)
    }
    if (input.source === 'platform') {
      throw new AppServiceError('validation_failed', 'Platform blueprints are seeded by code.', 400)
    }
    const { userId } = await requireOrgAccess(input.orgId, 'write')
    const blueprint = await createAppBlueprint(input, userId)
    return appServicesOk({ blueprint }, request, { status: 201 })
  } catch (error) {
    return appServicesError(error, request)
  }
})
