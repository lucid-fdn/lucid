import 'server-only'

import {
  AppArtifactSchema,
  AppDeploymentSchema,
  type AppArtifact,
  type AppDeployment,
  type AppGenerationRun,
  type AppServiceSpec,
} from '@contracts/app-service'
import { supabase, ErrorService } from '@/lib/db/client'
import { AppServiceError } from './errors'
import { assertManifestArtifactChecksum } from './artifact-integrity-core'
import { compileAppServiceSpec } from './compiler'
import { recordAppServiceEvent } from './events'
import {
  buildAppDeploymentSettingsUpdate,
  buildPauseDeploymentUpdate,
  buildResumeDeploymentUpdate,
  type AppDeploymentResumeStatus,
} from './deployment-settings-core'
import {
  buildRollbackDeploymentUpdate,
  isRollbackArtifactKind,
} from './rollback-core'
import { redactAppServiceMetadata } from './security-redaction'
import { OrgPublicAppPauseInputSchema } from './operations-core'
import {
  appServiceErrorContext,
  recordAppServiceMetric,
  withAppServiceSpan,
} from './observability'
import {
  appServiceGeneratedAppUrlForSlug,
  resolveDefaultAppVisibility,
} from './product-policy-core'
import {
  APP_ARTIFACT_SELECT,
  APP_DEPLOYMENT_SELECT,
} from './projections'

export async function listAppDeployments(params: {
  orgId: string
  projectId?: string
  status?: string
  limit?: number
}): Promise<AppDeployment[]> {
  try {
    let query = supabase
      .from('app_deployments')
      .select(APP_DEPLOYMENT_SELECT)
      .eq('org_id', params.orgId)
      .order('updated_at', { ascending: false })
      .limit(params.limit ?? 100)

    if (params.projectId) query = query.eq('project_id', params.projectId)
    if (params.status) query = query.eq('status', params.status)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((row) => AppDeploymentSchema.parse(row))
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'listAppDeployments', orgId: params.orgId },
      tags: { layer: 'app-service', feature: 'deployments' },
    })
    throw new AppServiceError('internal_error', 'Failed to list app deployments.', 500)
  }
}

export async function getAppDeployment(id: string): Promise<AppDeployment | null> {
  try {
    const { data, error } = await supabase
      .from('app_deployments')
      .select(APP_DEPLOYMENT_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data ? AppDeploymentSchema.parse(data) : null
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'getAppDeployment', id },
      tags: { layer: 'app-service', feature: 'deployments' },
    })
    throw new AppServiceError('internal_error', 'Failed to read app deployment.', 500)
  }
}

export async function createManifestArtifact(params: {
  generationRunId: string
  appDeploymentId: string
  checksum: string
  manifest: Record<string, unknown>
}): Promise<AppArtifact> {
  assertManifestArtifactChecksum({
    checksum: params.checksum,
    manifest: params.manifest,
    fallback: {
      name: typeof params.manifest.name === 'string' ? params.manifest.name : 'Generated App',
      slug: typeof params.manifest.slug === 'string' ? params.manifest.slug : 'generated-app',
    },
  })

  return createAppArtifact({
    generationRunId: params.generationRunId,
    appDeploymentId: params.appDeploymentId,
    kind: 'manifest',
    checksum: params.checksum,
    metadata: { manifest: params.manifest },
  })
}

export async function createAppArtifact(params: {
  generationRunId: string
  appDeploymentId?: string | null
  kind: AppArtifact['kind']
  checksum: string
  metadata?: Record<string, unknown>
  storageUrl?: string | null
}): Promise<AppArtifact> {
  let query = supabase
    .from('app_artifacts')
    .select('version')
    .eq('generation_run_id', params.generationRunId)
    .eq('kind', params.kind)
    .order('version', { ascending: false })
    .limit(1)

  query = params.appDeploymentId
    ? query.eq('app_deployment_id', params.appDeploymentId)
    : query.is('app_deployment_id', null)

  const { data: existing, error: readError } = await query
  if (readError) throw readError

  const version = ((existing?.[0] as { version?: number } | undefined)?.version ?? 0) + 1
  const { data, error } = await supabase
    .from('app_artifacts')
    .insert({
      app_deployment_id: params.appDeploymentId ?? null,
      generation_run_id: params.generationRunId,
      kind: params.kind,
      version,
      checksum: params.checksum,
      storage_url: params.storageUrl ?? null,
      metadata: redactAppServiceMetadata(params.metadata ?? {}),
    })
    .select(APP_ARTIFACT_SELECT)
    .single()

  if (error || !data) {
    throw error ?? new Error('App artifact creation returned no row')
  }

  return AppArtifactSchema.parse(data)
}

export async function getAppArtifact(id: string): Promise<AppArtifact | null> {
  const { data, error } = await supabase
    .from('app_artifacts')
    .select(APP_ARTIFACT_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data ? AppArtifactSchema.parse(data) : null
}

export async function rollbackAppDeploymentToArtifact(params: {
  app: AppDeployment
  artifactId: string
  userId: string
  note?: string
}): Promise<{ app: AppDeployment; artifact: AppArtifact }> {
  try {
    const artifact = await getAppArtifact(params.artifactId)
    if (!artifact) {
      throw new AppServiceError('not_found', 'Rollback artifact was not found.', 404)
    }

    if (!isRollbackArtifactKind(artifact.kind)) {
      throw new AppServiceError('validation_failed', 'Only manifest and source archive artifacts can be rolled back.', 400)
    }

    let update: ReturnType<typeof buildRollbackDeploymentUpdate>
    try {
      update = buildRollbackDeploymentUpdate(params.app, artifact)
    } catch (error) {
      throw new AppServiceError(
        'validation_failed',
        error instanceof Error ? error.message : 'Rollback artifact is invalid.',
        400,
      )
    }
    const { data, error } = await supabase
      .from('app_deployments')
      .update(update)
      .eq('id', params.app.id)
      .select(APP_DEPLOYMENT_SELECT)
      .single()

    if (error || !data) {
      throw error ?? new Error('App deployment rollback returned no row')
    }

    const rolledBackApp = AppDeploymentSchema.parse(data)
    await recordAppServiceEvent({
      appDeploymentId: rolledBackApp.id,
      generationRunId: rolledBackApp.generation_run_id,
      eventType: 'app_deployment_rolled_back',
      message: params.note ?? `Rolled back to ${artifact.kind} artifact v${artifact.version}.`,
      payload: {
        artifact_id: artifact.id,
        artifact_kind: artifact.kind,
        artifact_version: artifact.version,
        previous_artifact_id: params.app.latest_artifact_id,
        previous_status: params.app.status,
        rolled_back_by: params.userId,
        note: params.note ?? null,
      },
    })

    return { app: rolledBackApp, artifact }
  } catch (error) {
    if (error instanceof AppServiceError) throw error

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        operation: 'rollbackAppDeploymentToArtifact',
        appDeploymentId: params.app.id,
        artifactId: params.artifactId,
      },
      tags: { layer: 'app-service', feature: 'deployments' },
    })
    throw new AppServiceError('internal_error', 'Failed to roll back app deployment.', 500)
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: string }).code === '23505'
}

export async function updateAppDeploymentSettings(params: {
  app: AppDeployment
  input: unknown
  userId: string
}): Promise<AppDeployment> {
  try {
    const plan = buildAppDeploymentSettingsUpdate(params.app, params.input)
    if (Object.keys(plan.update).length === 0) {
      return params.app
    }

    const { data, error } = await supabase
      .from('app_deployments')
      .update(plan.update)
      .eq('id', params.app.id)
      .select(APP_DEPLOYMENT_SELECT)
      .single()

    if (error || !data) {
      if (isUniqueConstraintError(error)) {
        throw new AppServiceError('validation_failed', 'An app with this slug already exists in the project.', 409)
      }
      throw error ?? new Error('App deployment settings update returned no row')
    }

    const updatedApp = AppDeploymentSchema.parse(data)
    await recordAppServiceEvent({
      appDeploymentId: updatedApp.id,
      generationRunId: updatedApp.generation_run_id,
      eventType: 'app_deployment_settings_updated',
      message: `Updated app settings: ${plan.changedFields.join(', ')}.`,
      payload: {
        changed_fields: plan.changedFields,
        previous: {
          name: params.app.name,
          slug: params.app.slug,
          visibility: params.app.visibility,
        },
        current: {
          name: updatedApp.name,
          slug: updatedApp.slug,
          visibility: updatedApp.visibility,
        },
        updated_by: params.userId,
      },
    })

    return updatedApp
  } catch (error) {
    if (error instanceof AppServiceError) throw error

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'updateAppDeploymentSettings', appDeploymentId: params.app.id },
      tags: { layer: 'app-service', feature: 'deployments' },
    })
    throw new AppServiceError('internal_error', 'Failed to update app deployment settings.', 500)
  }
}

export async function pauseAppDeployment(params: {
  app: AppDeployment
  userId: string
  note?: string
}): Promise<AppDeployment> {
  try {
    const update = buildPauseDeploymentUpdate(params.app)
    if (Object.keys(update).length === 0) {
      return params.app
    }

    const { data, error } = await supabase
      .from('app_deployments')
      .update(update)
      .eq('id', params.app.id)
      .select(APP_DEPLOYMENT_SELECT)
      .single()

    if (error || !data) {
      throw error ?? new Error('App deployment pause returned no row')
    }

    const pausedApp = AppDeploymentSchema.parse(data)
    await recordAppServiceEvent({
      appDeploymentId: pausedApp.id,
      generationRunId: pausedApp.generation_run_id,
      eventType: 'app_deployment_paused',
      severity: 'warning',
      message: params.note ?? 'App deployment paused.',
      payload: {
        previous_status: params.app.status,
        paused_by: params.userId,
        note: params.note ?? null,
      },
    })

    return pausedApp
  } catch (error) {
    if (error instanceof AppServiceError) throw error

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'pauseAppDeployment', appDeploymentId: params.app.id },
      tags: { layer: 'app-service', feature: 'deployments' },
    })
    throw new AppServiceError('internal_error', 'Failed to pause app deployment.', 500)
  }
}

export async function pauseOrgPublicAppDeployments(params: {
  orgId: string
  userId: string
  input?: unknown
}): Promise<{
  dryRun: boolean
  matched: AppDeployment[]
  paused: AppDeployment[]
}> {
  const input = OrgPublicAppPauseInputSchema.parse(params.input ?? {})

  try {
    let query = supabase
      .from('app_deployments')
      .select(APP_DEPLOYMENT_SELECT)
      .eq('org_id', params.orgId)
      .in('visibility', ['public', 'unlisted'])
      .in('status', ['active', 'preview'])
      .order('updated_at', { ascending: false })

    if (input.projectId) query = query.eq('project_id', input.projectId)

    const { data: rows, error: readError } = await query
    if (readError) throw readError

    const matched = (rows ?? []).map((row) => AppDeploymentSchema.parse(row))
    if (input.dryRun || matched.length === 0) {
      return {
        dryRun: input.dryRun,
        matched,
        paused: [],
      }
    }

    const { data, error } = await supabase
      .from('app_deployments')
      .update({ status: 'paused' })
      .in('id', matched.map((app) => app.id))
      .select(APP_DEPLOYMENT_SELECT)

    if (error) throw error

    const paused = (data ?? []).map((row) => AppDeploymentSchema.parse(row))
    for (const app of paused) {
      const previous = matched.find((candidate) => candidate.id === app.id)
      await recordAppServiceEvent({
        appDeploymentId: app.id,
        generationRunId: app.generation_run_id,
        eventType: 'app_deployment_paused',
        severity: 'warning',
        message: input.note ?? 'Public app paused by org-wide emergency action.',
        payload: {
          previous_status: previous?.status ?? null,
          previous_visibility: previous?.visibility ?? null,
          paused_by: params.userId,
          org_wide: true,
          project_id: input.projectId ?? null,
          note: input.note ?? null,
        },
      })
    }

    return {
      dryRun: false,
      matched,
      paused,
    }
  } catch (error) {
    if (error instanceof AppServiceError) throw error

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: {
        operation: 'pauseOrgPublicAppDeployments',
        orgId: params.orgId,
        projectId: input.projectId,
      },
      tags: { layer: 'app-service', feature: 'deployments' },
    })
    throw new AppServiceError('internal_error', 'Failed to pause public app deployments.', 500)
  }
}

export async function resumeAppDeployment(params: {
  app: AppDeployment
  userId: string
  note?: string
  status?: AppDeploymentResumeStatus
}): Promise<AppDeployment> {
  try {
    const update = buildResumeDeploymentUpdate(params.app, params.status)
    if (Object.keys(update).length === 0) {
      return params.app
    }

    const { data, error } = await supabase
      .from('app_deployments')
      .update(update)
      .eq('id', params.app.id)
      .select(APP_DEPLOYMENT_SELECT)
      .single()

    if (error || !data) {
      throw error ?? new Error('App deployment resume returned no row')
    }

    const resumedApp = AppDeploymentSchema.parse(data)
    await recordAppServiceEvent({
      appDeploymentId: resumedApp.id,
      generationRunId: resumedApp.generation_run_id,
      eventType: 'app_deployment_resumed',
      message: params.note ?? `App deployment resumed as ${resumedApp.status}.`,
      payload: {
        previous_status: params.app.status,
        target_status: resumedApp.status,
        resumed_by: params.userId,
        note: params.note ?? null,
      },
    })

    return resumedApp
  } catch (error) {
    if (error instanceof AppServiceError) throw error

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'resumeAppDeployment', appDeploymentId: params.app.id },
      tags: { layer: 'app-service', feature: 'deployments' },
    })
    throw new AppServiceError('internal_error', 'Failed to resume app deployment.', 500)
  }
}

export async function launchAppDeployment(params: {
  app: AppDeployment
  userId: string
  visibility?: 'unlisted' | 'public'
  note?: string
}): Promise<AppDeployment> {
  try {
    if (params.app.status === 'archived') {
      throw new AppServiceError('validation_failed', 'Archived app deployments cannot be launched.', 409)
    }
    if (params.app.status === 'failed') {
      throw new AppServiceError('validation_failed', 'Failed app deployments must be repaired before launch.', 409)
    }

    const visibility = params.visibility ?? (params.app.visibility === 'public' ? 'public' : 'unlisted')
    const publicUrl = params.app.public_url ?? appServiceGeneratedAppUrlForSlug(params.app.slug)

    const { data, error } = await supabase
      .from('app_deployments')
      .update({
        status: 'active',
        visibility,
        public_url: publicUrl,
        deployed_at: params.app.deployed_at ?? new Date().toISOString(),
      })
      .eq('id', params.app.id)
      .select(APP_DEPLOYMENT_SELECT)
      .single()

    if (error || !data) {
      throw error ?? new Error('App deployment launch returned no row')
    }

    const launched = AppDeploymentSchema.parse(data)
    await recordAppServiceEvent({
      appDeploymentId: launched.id,
      generationRunId: launched.generation_run_id,
      eventType: 'app_deployment_launched',
      message: params.note ?? `App deployment launched as ${visibility}.`,
      payload: {
        previous_status: params.app.status,
        previous_visibility: params.app.visibility,
        visibility,
        public_url: publicUrl,
        launched_by: params.userId,
        note: params.note ?? null,
      },
    })

    return launched
  } catch (error) {
    if (error instanceof AppServiceError) throw error

    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'launchAppDeployment', appDeploymentId: params.app.id },
      tags: { layer: 'app-service', feature: 'deployments' },
    })
    throw new AppServiceError('internal_error', 'Failed to launch app deployment.', 500)
  }
}

export async function createPreviewDeploymentFromSpec(params: {
  run: AppGenerationRun
  spec: AppServiceSpec
  userId: string
  visibility?: 'private' | 'unlisted' | 'public'
}): Promise<{ deployment: AppDeployment; artifact: AppArtifact }> {
  return withAppServiceSpan('app_service.deploy.preview', {
    stage: 'deploy',
    operation: 'createPreviewDeploymentFromSpec',
    orgId: params.run.org_id,
    projectId: params.run.project_id,
    generationRunId: params.run.id,
    operatorUserId: params.userId,
    slug: params.spec.slug,
  }, async () => {
    try {
      const plan = compileAppServiceSpec(params.spec)
      const { data, error } = await supabase
        .from('app_deployments')
        .insert({
          org_id: params.run.org_id,
          project_id: params.run.project_id,
          environment_id: params.run.environment_id ?? null,
          blueprint_id: params.run.selected_blueprint_id ?? null,
          generation_run_id: params.run.id,
          name: plan.name,
          slug: plan.slug,
          status: 'preview',
          visibility: resolveDefaultAppVisibility(params.visibility),
          frontend_strategy: plan.frontendStrategy,
          frontend_manifest: plan.frontendManifest,
          preview_url: appServiceGeneratedAppUrlForSlug(plan.slug),
          assistant_ids: plan.assistantIds,
          crew_id: plan.crewId,
          dag_ids: plan.dagIds,
          template_deployment_ids: plan.templateDeploymentIds,
          deployment_target: plan.deploymentTarget,
          created_by: params.userId,
        })
        .select(APP_DEPLOYMENT_SELECT)
        .single()

      if (error || !data) {
        throw error ?? new Error('App deployment creation returned no row')
      }

      const deployment = AppDeploymentSchema.parse(data)
      const artifact = await createManifestArtifact({
        generationRunId: params.run.id,
        appDeploymentId: deployment.id,
        checksum: plan.checksum,
        manifest: plan.frontendManifest,
      })

      await supabase
        .from('app_deployments')
        .update({ latest_artifact_id: artifact.id })
        .eq('id', deployment.id)

      await recordAppServiceEvent({
        appDeploymentId: deployment.id,
        generationRunId: params.run.id,
        eventType: 'preview_deployment_created',
        message: 'Manifest preview deployment created.',
        payload: { slug: deployment.slug, checksum: artifact.checksum },
      })
      recordAppServiceMetric('preview_deployment_created', 1, {
        stage: 'deploy',
        operation: 'createPreviewDeploymentFromSpec',
        orgId: deployment.org_id,
        projectId: deployment.project_id,
        appDeploymentId: deployment.id,
        generationRunId: params.run.id,
        operatorUserId: params.userId,
        slug: deployment.slug,
      }, {
        frontend_strategy: deployment.frontend_strategy,
        deployment_target: deployment.deployment_target,
        visibility: deployment.visibility,
      })

      return {
        deployment: { ...deployment, latest_artifact_id: artifact.id },
        artifact,
      }
    } catch (error) {
      ErrorService.captureException(error as Error, {
        severity: 'error',
        ...appServiceErrorContext('createPreviewDeploymentFromSpec', {
          stage: 'deploy',
          orgId: params.run.org_id,
          projectId: params.run.project_id,
          generationRunId: params.run.id,
          operatorUserId: params.userId,
          slug: params.spec.slug,
        }),
      })
      throw new AppServiceError('internal_error', 'Failed to create app preview deployment.', 500)
    }
  })
}
