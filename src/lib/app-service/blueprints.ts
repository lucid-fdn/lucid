import 'server-only'

import { z } from 'zod'
import {
  AppBlueprintDiscoveryMetadataSchema,
  AppBlueprintSchema,
  AppBlueprintUpgradeMetadataSchema,
  AppServiceSpecSchema,
  FrontendBuildBriefSchema,
  type AppBlueprint,
} from '@contracts/app-service'
import { supabase, ErrorService } from '@/lib/db/client'
import { AppServiceError } from './errors'
import { buildFrontendBriefFromSpec } from './generation-service'
import { resolveMarketplaceBlueprintStatus } from './product-policy-core'
import { APP_BLUEPRINT_SELECT } from './projections'

export const CreateAppBlueprintInputSchema = z.object({
  orgId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  spec: AppServiceSpecSchema,
  source: z.enum(['platform', 'community', 'org']).default('org'),
  status: z.enum(['draft', 'pending_review', 'approved', 'deprecated']).default('draft'),
  visibility: z.enum(['private', 'unlisted', 'public']).default('private'),
  version: z.string().default('1.0.0'),
  upgradeMetadata: AppBlueprintUpgradeMetadataSchema.optional(),
  discoveryMetadata: AppBlueprintDiscoveryMetadataSchema.optional(),
  tags: z.array(z.string()).default([]),
})

export type CreateAppBlueprintInput = z.infer<typeof CreateAppBlueprintInputSchema>

export async function listAppBlueprints(params: {
  orgId?: string
  category?: string
  status?: string
  limit?: number
}): Promise<AppBlueprint[]> {
  try {
    let query = supabase
      .from('app_blueprints')
      .select(APP_BLUEPRINT_SELECT)
      .order('updated_at', { ascending: false })
      .limit(params.limit ?? 100)

    if (params.orgId) query = query.or(`org_id.eq.${params.orgId},source.eq.platform`)
    if (params.category) query = query.eq('category', params.category)
    if (params.status) query = query.eq('status', params.status)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((row) => AppBlueprintSchema.parse(row))
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'listAppBlueprints', orgId: params.orgId },
      tags: { layer: 'app-service', feature: 'blueprints' },
    })
    throw new AppServiceError('internal_error', 'Failed to list app blueprints.', 500)
  }
}

export async function getAppBlueprint(id: string): Promise<AppBlueprint | null> {
  try {
    const { data, error } = await supabase
      .from('app_blueprints')
      .select(APP_BLUEPRINT_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data ? AppBlueprintSchema.parse(data) : null
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'getAppBlueprint', id },
      tags: { layer: 'app-service', feature: 'blueprints' },
    })
    throw new AppServiceError('internal_error', 'Failed to read app blueprint.', 500)
  }
}

export async function createAppBlueprint(
  rawInput: CreateAppBlueprintInput,
  userId: string,
): Promise<AppBlueprint> {
  const input = CreateAppBlueprintInputSchema.parse(rawInput)
  const brief = FrontendBuildBriefSchema.parse(buildFrontendBriefFromSpec(input.spec))
  const status = resolveMarketplaceBlueprintStatus({
    source: input.source,
    requestedStatus: input.status,
  })

  try {
    const { data, error } = await supabase
      .from('app_blueprints')
      .insert({
        template_id: input.templateId ?? null,
        org_id: input.orgId ?? null,
        project_id: input.projectId ?? null,
        slug: input.spec.slug,
        name: input.spec.name,
        description: input.spec.description,
        category: input.spec.category,
        source: input.source,
        status,
        visibility: input.visibility,
        version: input.version,
        spec: input.spec,
        frontend_brief: brief,
        upgrade_metadata: input.upgradeMetadata ?? undefined,
        discovery_metadata: input.discoveryMetadata ?? undefined,
        tags: input.tags,
        created_by: userId,
      })
      .select(APP_BLUEPRINT_SELECT)
      .single()

    if (error || !data) {
      throw error ?? new Error('App blueprint creation returned no row')
    }

    return AppBlueprintSchema.parse(data)
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'createAppBlueprint', orgId: input.orgId, slug: input.spec.slug },
      tags: { layer: 'app-service', feature: 'blueprints' },
    })
    throw new AppServiceError('internal_error', 'Failed to create app blueprint.', 500)
  }
}
