import { NextRequest } from 'next/server'
import { buildAppServiceRegistryCatalog } from '@/lib/app-service/registry-catalog-core'
import {
  appServicesError,
  appServicesOk,
  requireFoundrySurface,
} from '../_shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    requireFoundrySurface()
    return appServicesOk({ catalog: buildAppServiceRegistryCatalog() }, request)
  } catch (error) {
    return appServicesError(error, request)
  }
}
