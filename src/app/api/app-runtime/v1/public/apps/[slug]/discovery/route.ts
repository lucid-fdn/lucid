import { NextRequest } from 'next/server'
import { getPublicAppDiscovery } from '@/lib/app-service/discovery'
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
  const access = publicRuntimeAccess(request, 'discovery', false)
  const reqId = requestIdFromRequest(request)
  try {
    requirePublicRuntimeSurfaces()
    const { slug } = await params
    const discovery = await getPublicAppDiscovery(slug, access)
    return publicRuntimeOk({ discovery }, reqId, access)
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
