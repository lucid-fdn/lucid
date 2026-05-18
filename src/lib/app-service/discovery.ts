import 'server-only'

import { z } from 'zod'
import { AppBlueprintDiscoveryMetadataSchema } from '@contracts/app-service'
import type { PublicAppCapability } from '@contracts/app-runtime'
import { supabase } from '@/lib/db/client'
import { AppServiceError } from './errors'
import {
  getPublicAppConfig,
  getPublicAppRuntimeContext,
} from './runtime-gateway/public'
import { buildAppDiscoveryManifest } from './discovery-core'
import type { PublicRuntimeAccess } from './public-runtime-core'
import { APP_DEPLOYMENT_SELECT } from './projections'
import { AppDeploymentSchema, type AppDeployment } from '@contracts/app-service'

export const OperatorDiscoveryPatchSchema = z.object({
  discovery_metadata: AppBlueprintDiscoveryMetadataSchema,
})

function appCapabilities(app: AppDeployment): PublicAppCapability[] {
  const allowed = new Set<PublicAppCapability>([
    'chat',
    'lead',
    'feedback',
    'status',
    'uploads',
    'public_actions',
    'paid_actions',
  ])
  return Array.isArray(app.frontend_manifest.capabilities)
    ? app.frontend_manifest.capabilities.filter((item): item is PublicAppCapability => (
      typeof item === 'string' && allowed.has(item as PublicAppCapability)
    ))
    : ['status']
}

export async function getPublicAppDiscovery(slug: string, access?: PublicRuntimeAccess) {
  const context = await getPublicAppRuntimeContext(slug, access)
  const config = await getPublicAppConfig(slug, access)
  return buildAppDiscoveryManifest({
    config,
    manifest: context.manifest,
  })
}

export function getOperatorAppDiscovery(app: AppDeployment) {
  const status = app.status === 'active'
    ? 'active'
    : app.status === 'paused'
      ? 'paused'
      : app.status === 'preview' || app.status === 'draft'
        ? 'setup_required'
        : 'maintenance'

  return buildAppDiscoveryManifest({
    config: {
      app_id: app.id,
      slug: app.slug,
      name: app.name,
      description: typeof app.frontend_manifest.description === 'string' ? app.frontend_manifest.description : null,
      status,
      visibility: app.visibility === 'public' ? 'public' : 'unlisted',
      capabilities: appCapabilities(app),
      theme: {},
      public_endpoints: {
        config: `/api/app-runtime/v1/public/apps/${app.slug}/config`,
        discovery: `/api/app-runtime/v1/public/apps/${app.slug}/discovery`,
        status: `/api/app-runtime/v1/public/apps/${app.slug}/status`,
      },
      commerce: { paid_actions: {} },
      consent: {},
    },
    manifest: app.frontend_manifest,
  })
}

export async function updateOperatorAppDiscoveryMetadata(params: {
  app: AppDeployment
  input: unknown
}): Promise<AppDeployment> {
  const input = OperatorDiscoveryPatchSchema.parse(params.input)
  const manifest = {
    ...params.app.frontend_manifest,
    discovery_metadata: input.discovery_metadata,
  }
  const { data, error } = await supabase
    .from('app_deployments')
    .update({ frontend_manifest: manifest })
    .eq('id', params.app.id)
    .select(APP_DEPLOYMENT_SELECT)
    .single()

  if (error || !data) {
    throw error ?? new AppServiceError('internal_error', 'Discovery metadata update returned no row.', 500)
  }

  return AppDeploymentSchema.parse(data)
}
