import { FEATURES, isAppServiceKillSwitchActive } from '@/lib/features'
import { AppServiceError } from './errors'

export type AppServiceSurface =
  | 'foundry'
  | 'runtimeApi'
  | 'publicApps'
  | 'v0'
  | 'vercel'
  | 'marketplace'
  | 'dedicatedRuntime'

const SURFACE_FLAGS: Record<AppServiceSurface, keyof typeof FEATURES> = {
  foundry: 'appServiceFoundry',
  runtimeApi: 'appRuntimeApi',
  publicApps: 'appPublicApps',
  v0: 'appV0Generation',
  vercel: 'appVercelDeploy',
  marketplace: 'appMarketplacePublish',
  dedicatedRuntime: 'appDedicatedRuntime',
}

export function isAppServiceSurfaceEnabled(surface: AppServiceSurface): boolean {
  if (isAppServiceKillSwitchActive()) return false
  return Boolean(FEATURES[SURFACE_FLAGS[surface]])
}

export function assertAppServiceSurfaceEnabled(surface: AppServiceSurface): void {
  if (isAppServiceKillSwitchActive()) {
    throw new AppServiceError(
      'kill_switch_active',
      'App Service Foundry is temporarily disabled.',
      503,
      { retryable: true },
    )
  }

  if (!FEATURES[SURFACE_FLAGS[surface]]) {
    throw new AppServiceError(
      'feature_disabled',
      `App Service surface "${surface}" is not enabled.`,
      404,
    )
  }
}

export function assertAppServiceSurfacesEnabled(surfaces: AppServiceSurface[]): void {
  for (const surface of surfaces) {
    assertAppServiceSurfaceEnabled(surface)
  }
}
