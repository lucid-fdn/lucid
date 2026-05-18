import { NextRequest } from 'next/server'
import { respondToPublicAppChat } from '@/lib/app-service/runtime-gateway/public'
import {
  publicRuntimeAccess,
  publicRuntimeErrorResponse,
  publicRuntimeOk,
  publicRuntimeOptionsResponse,
} from '@/lib/app-service/public-runtime-route'
import { requestIdFromRequest } from '@/lib/app-service/api'
import { requirePublicRuntimeSurfaces, readRuntimeJsonBody } from '../../../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const access = publicRuntimeAccess(request, 'chat')
  const reqId = requestIdFromRequest(request)
  try {
    requirePublicRuntimeSurfaces()
    const { slug } = await params
    const body = await readRuntimeJsonBody(request)
    const chat = await respondToPublicAppChat(slug, body, access)
    return publicRuntimeOk({ chat }, reqId, access)
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
