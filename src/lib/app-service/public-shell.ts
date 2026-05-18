import 'server-only'

import type { PublicAppConfig } from '@contracts/app-runtime'
import { supabase, ErrorService } from '@/lib/db/client'
import { isUserOrgMember } from '@/lib/db'
import { AppServiceError } from './errors'
import {
  normalizePublicShellManifest,
  type PublicShellManifest,
} from './public-shell-core'
import { statusForPublicConfig } from './runtime-gateway/public'

interface PublicShellDeploymentRow {
  id: string
  org_id: string
  project_id: string
  generation_run_id: string | null
  slug: string
  name: string
  status: string
  visibility: string
  frontend_manifest: Record<string, unknown> | null
  public_url: string | null
  preview_url: string | null
  assistant_ids?: string[] | null
  updated_at: string
}

export interface PublicAppShellData {
  app: {
    id: string
    slug: string
    name: string
    status: string
    visibility: string
    preview_url: string | null
    public_url: string | null
    updated_at: string
  }
  manifest: PublicShellManifest
  config: Omit<PublicAppConfig, 'visibility'> & {
    visibility: 'private' | 'unlisted' | 'public'
  }
  isPreview: boolean
}

function publicEndpointsForApp(slug: string, capabilities: string[]) {
  const base = `/api/app-runtime/v1/public/apps/${slug}`
  const endpoints: Record<string, string> = {
    config: `${base}/config`,
    sessions: `${base}/sessions`,
    status: `${base}/status`,
  }

  if (capabilities.includes('chat')) endpoints.chat = `${base}/chat`
  if (capabilities.includes('lead')) endpoints.lead = `${base}/lead`
  if (capabilities.includes('feedback')) endpoints.feedback = `${base}/feedback`
  if (capabilities.includes('uploads')) endpoints.uploads = `${base}/uploads`
  if (capabilities.includes('public_actions')) endpoints.actions = `${base}/actions/{action}`

  return endpoints
}

async function readDeploymentForShell(slug: string): Promise<PublicShellDeploymentRow | null> {
  const { data, error } = await supabase
    .from('app_deployments')
    .select('id, org_id, project_id, generation_run_id, slug, name, status, visibility, frontend_manifest, public_url, preview_url, assistant_ids, updated_at')
    .eq('slug', slug)
    .neq('status', 'archived')
    .maybeSingle()

  if (error) throw error
  return data as PublicShellDeploymentRow | null
}

export async function getPublicAppShellData(
  slug: string,
  viewerUserId?: string | null,
): Promise<PublicAppShellData> {
  try {
    const app = await readDeploymentForShell(slug)
    if (!app) {
      throw new AppServiceError('not_found', 'Generated app was not found.', 404)
    }

    const isPubliclyVisible = app.visibility === 'unlisted' || app.visibility === 'public'
    const isMemberPreview = viewerUserId ? await isUserOrgMember(viewerUserId, app.org_id) : false
    if (!isPubliclyVisible && !isMemberPreview) {
      throw new AppServiceError('not_found', 'Generated app was not found.', 404)
    }

    const manifest = normalizePublicShellManifest(app.frontend_manifest, {
      name: app.name,
      slug: app.slug,
    })
    const status = statusForPublicConfig(app.status)
    const capabilities = manifest.capabilities

    return {
      app: {
        id: app.id,
        slug: app.slug,
        name: app.name,
        status: app.status,
        visibility: app.visibility,
        preview_url: app.preview_url,
        public_url: app.public_url,
        updated_at: app.updated_at,
      },
      manifest,
      config: {
        app_id: app.id,
        slug: app.slug,
        name: app.name,
        description: manifest.description,
        status,
        visibility: app.visibility as 'private' | 'unlisted' | 'public',
        capabilities,
        theme: { ...manifest.theme },
        public_endpoints: publicEndpointsForApp(app.slug, capabilities),
        commerce: manifest.commerce,
        consent: manifest.consent,
      },
      isPreview: app.status !== 'active' || app.visibility === 'private',
    }
  } catch (error) {
    if (error instanceof AppServiceError) throw error
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'getPublicAppShellData', slug },
      tags: { layer: 'app-service', feature: 'public-shell' },
    })
    throw new AppServiceError('internal_error', 'Failed to read generated app shell.', 500)
  }
}
