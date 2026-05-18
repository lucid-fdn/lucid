import 'server-only'

import { z } from 'zod'
import {
  AppBlueprintUpgradeRunSchema,
  AppDeploymentSchema,
  type AppBlueprint,
  type AppBlueprintUpgradePlan,
  type AppBlueprintUpgradeRun,
  type AppDeployment,
} from '@contracts/app-service'
import { supabase, ErrorService } from '@/lib/db/client'
import { AppServiceError } from './errors'
import { getAppBlueprint } from './blueprints'
import { getFirstPlatformBlueprintBySlug } from './platform-blueprints-core'
import { buildAppBlueprintUpgradePlan, type BlueprintUpgradeTarget } from './blueprint-upgrades-core'
import { compileAppServiceSpec } from './compiler'
import { recordAppServiceEvent } from './events'
import {
  APP_BLUEPRINT_UPGRADE_RUN_SELECT,
  APP_DEPLOYMENT_SELECT,
} from './projections'

export const AppBlueprintUpgradeTargetInputSchema = z.object({
  blueprintId: z.string().uuid().optional(),
  blueprintSlug: z.string().max(120).regex(/^[a-z0-9-]+$/).optional(),
}).refine((input) => Boolean(input.blueprintId || input.blueprintSlug), {
  message: 'blueprintId or blueprintSlug is required.',
  path: ['blueprintId'],
})

export const ApplyAppBlueprintUpgradeInputSchema = AppBlueprintUpgradeTargetInputSchema.extend({
  note: z.string().trim().max(2_000).optional(),
  requireNoBlockers: z.boolean().default(true),
})

export type AppBlueprintUpgradeTargetInput = z.infer<typeof AppBlueprintUpgradeTargetInputSchema>
export type ApplyAppBlueprintUpgradeInput = z.infer<typeof ApplyAppBlueprintUpgradeInputSchema>

function blueprintToTarget(blueprint: AppBlueprint): BlueprintUpgradeTarget {
  return {
    id: blueprint.id,
    slug: blueprint.slug,
    version: blueprint.version,
    source: blueprint.source,
    status: blueprint.status,
    spec: blueprint.spec,
  }
}

async function resolveBlueprintUpgradeTarget(
  input: AppBlueprintUpgradeTargetInput,
  orgId: string,
): Promise<BlueprintUpgradeTarget> {
  if (input.blueprintId) {
    const blueprint = await getAppBlueprint(input.blueprintId)
    if (!blueprint) {
      throw new AppServiceError('not_found', 'Blueprint was not found.', 404)
    }
    if (blueprint.source !== 'platform' && blueprint.org_id !== orgId) {
      throw new AppServiceError('forbidden', 'Blueprint belongs to a different organization.', 403)
    }
    return blueprintToTarget(blueprint)
  }

  const platform = input.blueprintSlug ? getFirstPlatformBlueprintBySlug(input.blueprintSlug) : null
  if (!platform) {
    throw new AppServiceError('not_found', 'Platform blueprint was not found.', 404)
  }
  return {
    id: null,
    slug: platform.slug,
    version: platform.version,
    source: 'platform',
    status: 'approved',
    spec: platform.spec,
  }
}

export async function planAppBlueprintUpgrade(params: {
  app: AppDeployment
  input: unknown
}): Promise<AppBlueprintUpgradePlan> {
  const input = AppBlueprintUpgradeTargetInputSchema.parse(params.input)
  const target = await resolveBlueprintUpgradeTarget(input, params.app.org_id)
  return buildAppBlueprintUpgradePlan({ app: params.app, target })
}

export async function applyAppBlueprintUpgrade(params: {
  app: AppDeployment
  input: unknown
  userId: string
}): Promise<{
  app: AppDeployment
  plan: AppBlueprintUpgradePlan
  upgrade_run: AppBlueprintUpgradeRun
}> {
  const input = ApplyAppBlueprintUpgradeInputSchema.parse(params.input)
  const target = await resolveBlueprintUpgradeTarget(input, params.app.org_id)
  const plan = buildAppBlueprintUpgradePlan({ app: params.app, target })
  if (input.requireNoBlockers && plan.status === 'blocked') {
    throw new AppServiceError('validation_failed', 'Blueprint upgrade is blocked.', 409, {
      details: { blockers: plan.blockers },
    })
  }

  try {
    const compiled = compileAppServiceSpec({
      ...target.spec,
      name: params.app.name,
      slug: params.app.slug,
    })
    const nextManifest = {
      ...compiled.frontendManifest,
      blueprint: {
        id: target.id,
        slug: target.slug,
        version: target.version,
        source: target.source,
      },
      upgrade: {
        applied_at: new Date().toISOString(),
        applied_by: params.userId,
        plan_status: plan.status,
      },
    }

    const { data: appRow, error: updateError } = await supabase
      .from('app_deployments')
      .update({
        blueprint_id: target.id,
        frontend_manifest: nextManifest,
      })
      .eq('id', params.app.id)
      .select(APP_DEPLOYMENT_SELECT)
      .single()

    if (updateError || !appRow) {
      throw updateError ?? new Error('Blueprint upgrade app update returned no row')
    }

    const updatedApp = AppDeploymentSchema.parse(appRow)
    const { data: upgradeRow, error: upgradeError } = await supabase
      .from('app_blueprint_upgrade_runs')
      .insert({
        app_deployment_id: params.app.id,
        org_id: params.app.org_id,
        project_id: params.app.project_id,
        from_blueprint_id: params.app.blueprint_id ?? null,
        to_blueprint_id: target.id,
        target_blueprint_slug: target.slug,
        from_version: plan.current.version,
        to_version: target.version,
        status: plan.status === 'blocked' ? 'blocked' : 'applied',
        plan,
        created_by: params.userId,
        applied_by: params.userId,
        applied_at: new Date().toISOString(),
      })
      .select(APP_BLUEPRINT_UPGRADE_RUN_SELECT)
      .single()

    if (upgradeError || !upgradeRow) {
      throw upgradeError ?? new Error('Blueprint upgrade run insert returned no row')
    }

    const upgradeRun = AppBlueprintUpgradeRunSchema.parse(upgradeRow)
    await recordAppServiceEvent({
      appDeploymentId: updatedApp.id,
      generationRunId: updatedApp.generation_run_id,
      eventType: 'app_blueprint_upgrade_applied',
      message: input.note ?? `Applied blueprint upgrade to ${target.slug}@${target.version}.`,
      payload: {
        upgrade_run_id: upgradeRun.id,
        target_blueprint_slug: target.slug,
        target_blueprint_version: target.version,
        status: plan.status,
        applied_by: params.userId,
      },
    })

    return { app: updatedApp, plan, upgrade_run: upgradeRun }
  } catch (error) {
    if (error instanceof AppServiceError) throw error
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'applyAppBlueprintUpgrade', appDeploymentId: params.app.id },
      tags: { layer: 'app-service', feature: 'blueprint-upgrades' },
    })
    throw new AppServiceError('internal_error', 'Failed to apply blueprint upgrade.', 500)
  }
}
