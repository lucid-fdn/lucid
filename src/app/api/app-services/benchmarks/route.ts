import { NextRequest } from 'next/server'
import { buildAppServiceBenchmarkProof } from '@/lib/app-service/benchmark-proof-core'
import {
  appServicesError,
  appServicesOk,
  requireFoundrySurface,
} from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    requireFoundrySurface()
    return appServicesOk({ benchmark: buildAppServiceBenchmarkProof() }, request)
  } catch (error) {
    return appServicesError(error, request)
  }
}
