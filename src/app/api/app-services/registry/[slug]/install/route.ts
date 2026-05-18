import { NextRequest } from 'next/server'
import { withCSRF } from '@/lib/auth/csrf'
import { installPlatformBlueprintFromRegistry, RegistryInstallInputSchema } from '@/lib/app-service/registry-actions'
import {
  appServicesError,
  appServicesOk,
  readAppServiceJsonBody,
  requireFoundrySurface,
  requireOrgAccess,
} from '../../../_shared'

export const dynamic = 'force-dynamic'

export const POST = withCSRF(async (
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) => {
  try {
    requireFoundrySurface()
    const { slug } = await params
    const input = RegistryInstallInputSchema.parse(await readAppServiceJsonBody(request))
    const { userId } = await requireOrgAccess(input.orgId, 'write')
    const result = await installPlatformBlueprintFromRegistry({ slug, input, userId })
    return appServicesOk(result, request, { status: 201 })
  } catch (error) {
    return appServicesError(error, request)
  }
})
