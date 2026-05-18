import { NextRequest } from 'next/server'
import {
  requirePublicAppActionCommercePayment,
  runPublicAppAction,
} from '@/lib/app-service/runtime-gateway/public'
import {
  publicRuntimeAccess,
  publicRuntimeErrorResponse,
  publicRuntimeOk,
  publicRuntimeOptionsResponse,
  publicRuntimeResponse,
} from '@/lib/app-service/public-runtime-route'
import { requestIdFromRequest } from '@/lib/app-service/api'
import { requirePublicRuntimeSurfaces, readRuntimeJsonBody } from '../../../../../_shared'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; action: string }> },
) {
  const access = publicRuntimeAccess(request, 'action')
  const reqId = requestIdFromRequest(request)
  try {
    requirePublicRuntimeSurfaces()
    const { slug, action } = await params
    const body = await readRuntimeJsonBody(request)
    const gate = await requirePublicAppActionCommercePayment(slug, action, body, access, request)
    if (gate.response) {
      return publicRuntimeResponse(gate.response, access)
    }

    const result = await runPublicAppAction(slug, action, body, access, {
      skipRuntimeGuards: gate.runtimeGuardsReserved,
      commerce: gate.commerce,
      runtimeContext: gate.runtimeContext,
    })
    return publicRuntimeOk({ action: result }, reqId, access)
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
