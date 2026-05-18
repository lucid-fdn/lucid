import { NextRequest, NextResponse } from 'next/server'
import { APP_RUNTIME_OPENAPI } from '@/lib/app-service/public-api-contract'
import { requireRuntimeSurfaces, runtimeRouteError } from '../../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    requireRuntimeSurfaces()
    return NextResponse.json(APP_RUNTIME_OPENAPI)
  } catch (error) {
    return runtimeRouteError(error, request)
  }
}
