import { NextRequest } from 'next/server'
import { getPublicAppConfig } from '@/lib/app-service/runtime-gateway/public'
import {
  publicRuntimeAccess,
  publicRuntimeErrorResponse,
  publicRuntimeOk,
  publicRuntimeOptionsResponse,
} from '@/lib/app-service/public-runtime-route'
import { requestIdFromRequest } from '@/lib/app-service/api'
import { requirePublicRuntimeSurfaces } from '../../../../_shared'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const access = publicRuntimeAccess(request, 'config', false)
  const reqId = requestIdFromRequest(request)
  try {
    requirePublicRuntimeSurfaces()
    const { slug } = await params
    const config = await getPublicAppConfig(slug, access)
    return publicRuntimeOk({ config }, reqId, access)
  } catch (error) {
    return publicRuntimeErrorResponse(error, reqId, access)
  }
}

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  return publicRuntimeOptionsResponse(slug, request)
}
