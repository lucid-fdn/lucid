import 'server-only'

import { z } from 'zod'
import {
  AppGenerationStatusSchema,
  AppGenerationRunSchema,
  AppServiceSpecSchema,
  type AppDeployment,
  type AppGenerationRun,
  type AppGenerationStatus,
  type AppServiceSpec,
} from '@contracts/app-service'
import { supabase, ErrorService } from '@/lib/db/client'
import { AppServiceError } from './errors'
import { assertGenerationStatusTransition, isTerminalGenerationStatus } from './state-machine'
import { recordAppServiceEvent } from './events'
import { createPreviewDeploymentFromSpec } from './deployments'
import { planAppService, planInputFromGenerationRun } from './planner'
import {
  RequeueGenerationRunInputSchema,
  buildGenerationRunRequeueUpdate,
} from './operations-core'
import { getFirstPlatformBlueprintBySlug } from './platform-blueprints-core'
import {
  appServiceErrorContext,
  recordAppServiceMetric,
  withAppServiceSpan,
} from './observability'
import { APP_GENERATION_RUN_SELECT } from './projections'

export { buildFrontendBriefFromSpec, PUBLIC_APP_RUNTIME_OPENAPI_PATH } from './frontend-brief'

export const CreateAppGenerationRunInputSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  environmentId: z.string().uuid().optional(),
  prompt: z.string().trim().min(1).max(20_000).optional(),
  idempotencyKey: z.string().max(160).optional(),
  blueprintId: z.string().uuid().optional(),
  blueprintSlug: z.string().max(120).regex(/^[a-z0-9-]+$/).optional(),
  input: z.record(z.string(), z.unknown()).default({}),
}).refine((input) => Boolean(input.prompt || input.blueprintSlug), {
  message: 'prompt or blueprintSlug is required.',
  path: ['prompt'],
})

export type CreateAppGenerationRunInput = z.infer<typeof CreateAppGenerationRunInputSchema>

function resolveGenerationPrompt(input: CreateAppGenerationRunInput): string {
  if (input.prompt) return input.prompt
  const blueprint = input.blueprintSlug ? getFirstPlatformBlueprintBySlug(input.blueprintSlug) : null
  if (!blueprint) {
    throw new AppServiceError('validation_failed', 'Unknown App Service platform blueprint.', 400)
  }
  return blueprint.oneClickPrompt
}

function resolveGenerationInput(input: CreateAppGenerationRunInput): Record<string, unknown> {
  if (!input.blueprintSlug) return input.input
  const blueprint = getFirstPlatformBlueprintBySlug(input.blueprintSlug)
  if (!blueprint) {
    throw new AppServiceError('validation_failed', 'Unknown App Service platform blueprint.', 400)
  }
  return {
    ...input.input,
    platformBlueprintSlug: blueprint.slug,
    platformBlueprintVersion: blueprint.version,
    platformBlueprintInputs: input.input,
  }
}

export async function createAppGenerationRun(
  input: CreateAppGenerationRunInput,
  userId: string,
): Promise<AppGenerationRun> {
  return withAppServiceSpan('app_service.generation.create', {
    stage: 'generation',
    operation: 'createAppGenerationRun',
    orgId: input.orgId,
    projectId: input.projectId,
    operatorUserId: userId,
  }, async () => {
    const prompt = resolveGenerationPrompt(input)
    const generationInput = resolveGenerationInput(input)

    try {
      const { data, error } = await supabase
        .from('app_generation_runs')
        .insert({
          org_id: input.orgId,
          project_id: input.projectId,
          environment_id: input.environmentId ?? null,
          created_by: userId,
          prompt,
          status: 'queued',
          input: generationInput,
          selected_blueprint_id: input.blueprintId ?? null,
          idempotency_key: input.idempotencyKey ?? null,
        })
        .select(APP_GENERATION_RUN_SELECT)
        .single()

      if (error || !data) {
        throw error ?? new Error('App generation run creation returned no row')
      }

      const run = AppGenerationRunSchema.parse(data)
      await recordAppServiceEvent({
        generationRunId: run.id,
        eventType: 'generation_run_created',
        message: 'App generation run queued.',
        payload: { project_id: run.project_id, idempotency_key: run.idempotency_key },
      })
      recordAppServiceMetric('generation_run_created', 1, {
        stage: 'generation',
        operation: 'createAppGenerationRun',
        orgId: run.org_id,
        projectId: run.project_id,
        generationRunId: run.id,
      })
      return run
    } catch (error) {
      if (
        input.idempotencyKey
        && typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: string }).code === '23505'
      ) {
        const existing = await getAppGenerationRunByIdempotencyKey(input.orgId, input.idempotencyKey)
        if (existing) return existing
      }

      ErrorService.captureException(error as Error, {
        severity: 'error',
        ...appServiceErrorContext('createAppGenerationRun', {
          stage: 'generation',
          orgId: input.orgId,
          projectId: input.projectId,
          operatorUserId: userId,
        }),
      })
      throw new AppServiceError('internal_error', 'Failed to create app generation run.', 500)
    }
  })
}

export async function getAppGenerationRunByIdempotencyKey(
  orgId: string,
  idempotencyKey: string,
): Promise<AppGenerationRun | null> {
  try {
    const { data, error } = await supabase
      .from('app_generation_runs')
      .select(APP_GENERATION_RUN_SELECT)
      .eq('org_id', orgId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (error) throw error
    return data ? AppGenerationRunSchema.parse(data) : null
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'getAppGenerationRunByIdempotencyKey', orgId },
      tags: { layer: 'app-service', feature: 'generation' },
    })
    throw new AppServiceError('internal_error', 'Failed to read app generation run.', 500)
  }
}

export async function getAppGenerationRun(id: string): Promise<AppGenerationRun | null> {
  try {
    const { data, error } = await supabase
      .from('app_generation_runs')
      .select(APP_GENERATION_RUN_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data ? AppGenerationRunSchema.parse(data) : null
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'getAppGenerationRun', id },
      tags: { layer: 'app-service', feature: 'generation' },
    })
    throw new AppServiceError('internal_error', 'Failed to read app generation run.', 500)
  }
}

export async function transitionAppGenerationRun(params: {
  run: AppGenerationRun
  status: AppGenerationStatus
  stage?: string | null
  progress?: number | null
  errorCode?: string | null
  errorMessage?: string | null
  generatedSpec?: AppServiceSpec | null
  appDeploymentId?: string | null
}): Promise<AppGenerationRun> {
  return withAppServiceSpan('app_service.generation.transition', {
    stage: 'generation',
    operation: 'transitionAppGenerationRun',
    orgId: params.run.org_id,
    projectId: params.run.project_id,
    appDeploymentId: params.appDeploymentId ?? params.run.app_deployment_id,
    generationRunId: params.run.id,
  }, async () => {
    assertGenerationStatusTransition(params.run.status, params.status)

    try {
      const payload: Record<string, unknown> = {
        status: params.status,
        updated_at: new Date().toISOString(),
      }

      if ('stage' in params) payload.stage = params.stage ?? null
      if ('progress' in params) payload.progress = params.progress ?? null
      if ('errorCode' in params) payload.error_code = params.errorCode ?? null
      if ('errorMessage' in params) payload.error_message = params.errorMessage ?? null
      if ('generatedSpec' in params) payload.generated_spec = params.generatedSpec ?? null
      if ('appDeploymentId' in params) payload.app_deployment_id = params.appDeploymentId ?? null

      const { data, error } = await supabase
        .from('app_generation_runs')
        .update(payload)
        .eq('id', params.run.id)
        .select(APP_GENERATION_RUN_SELECT)
        .single()

      if (error || !data) {
        throw error ?? new Error('App generation transition returned no row')
      }

      const updated = AppGenerationRunSchema.parse(data)
      await recordAppServiceEvent({
        generationRunId: updated.id,
        appDeploymentId: updated.app_deployment_id ?? null,
        eventType: 'generation_status_changed',
        severity: params.status === 'failed' ? 'error' : 'info',
        message: `Generation status changed from ${params.run.status} to ${params.status}.`,
        payload: {
          from: params.run.status,
          to: params.status,
          stage: updated.stage,
          progress: updated.progress,
        },
      })
      recordAppServiceMetric('generation_status_transitioned', 1, {
        stage: 'generation',
        operation: 'transitionAppGenerationRun',
        orgId: updated.org_id,
        projectId: updated.project_id,
        appDeploymentId: updated.app_deployment_id,
        generationRunId: updated.id,
      }, {
        from_status: params.run.status,
        to_status: params.status,
        stage: updated.stage,
      })
      return updated
    } catch (error) {
      if (error instanceof AppServiceError) throw error
      ErrorService.captureException(error as Error, {
        severity: 'error',
        ...appServiceErrorContext('transitionAppGenerationRun', {
          stage: 'generation',
          orgId: params.run.org_id,
          projectId: params.run.project_id,
          appDeploymentId: params.appDeploymentId ?? params.run.app_deployment_id,
          generationRunId: params.run.id,
        }, {
          status: params.status,
        }),
      })
      throw new AppServiceError('internal_error', 'Failed to update app generation run.', 500)
    }
  })
}

export async function processAppGenerationRun(run: AppGenerationRun): Promise<AppGenerationRun> {
  return withAppServiceSpan('app_service.generation.process_run', {
    stage: 'generation',
    operation: 'processAppGenerationRun',
    orgId: run.org_id,
    projectId: run.project_id,
    appDeploymentId: run.app_deployment_id,
    generationRunId: run.id,
  }, async () => {
    if (isTerminalGenerationStatus(run.status)) {
      return run
    }

    let current = run
    if (current.status === 'queued') {
      current = await transitionAppGenerationRun({
        run: current,
        status: 'planning',
        stage: 'planner',
        progress: 10,
      })
    }

    if (current.status !== 'planning') {
      throw new AppServiceError(
        'validation_failed',
        `Generation run cannot be planned from status "${current.status}".`,
        409,
        { details: { status: current.status } },
      )
    }

    const plannerResult = await planAppService(planInputFromGenerationRun(current))
    await recordAppServiceEvent({
      generationRunId: current.id,
      eventType: 'planner_completed',
      message: 'App service planner produced a service specification.',
      payload: {
        reasoning: plannerResult.reasoning,
        assumptions: plannerResult.assumptions,
        risks: plannerResult.risks,
        recommended_next_steps: plannerResult.recommended_next_steps,
      },
    })
    recordAppServiceMetric('generation_spec_generated', 1, {
      stage: 'generation',
      operation: 'processAppGenerationRun',
      orgId: current.org_id,
      projectId: current.project_id,
      generationRunId: current.id,
      slug: plannerResult.spec.slug,
    })

    return transitionAppGenerationRun({
      run: current,
      status: 'awaiting_input',
      stage: 'review_required',
      progress: 35,
      generatedSpec: plannerResult.spec,
    })
  })
}

export async function processQueuedAppGenerationRuns(params?: {
  orgId?: string
  limit?: number
}): Promise<{
  processed: number
  failed: number
  runs: AppGenerationRun[]
}> {
  return withAppServiceSpan('app_service.generation.process_queue', {
    stage: 'generation',
    operation: 'processQueuedAppGenerationRuns',
    orgId: params?.orgId,
  }, async () => {
    const limit = Math.min(Math.max(params?.limit ?? 3, 1), 20)
    let query = supabase
      .from('app_generation_runs')
      .select(APP_GENERATION_RUN_SELECT)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(limit)

    if (params?.orgId) query = query.eq('org_id', params.orgId)

    const { data, error } = await query
    if (error) {
      ErrorService.captureException(error as Error, {
        severity: 'error',
        ...appServiceErrorContext('processQueuedAppGenerationRuns', {
          stage: 'generation',
          orgId: params?.orgId,
        }, {
          limit,
        }),
      })
      throw new AppServiceError('internal_error', 'Failed to claim queued app generation runs.', 500)
    }

    const results: AppGenerationRun[] = []
    let failed = 0

    for (const row of data ?? []) {
      const candidate = AppGenerationRunSchema.parse(row)

      const { data: claimedRow, error: claimError } = await supabase
        .from('app_generation_runs')
        .update({
          status: 'planning',
          stage: 'planner',
          progress: 10,
          updated_at: new Date().toISOString(),
        })
          .eq('id', candidate.id)
          .eq('status', 'queued')
          .select(APP_GENERATION_RUN_SELECT)
        .maybeSingle()

      if (claimError) {
        failed++
        await recordAppServiceEvent({
          generationRunId: candidate.id,
          eventType: 'planner_claim_failed',
          severity: 'error',
          message: claimError.message,
        })
        continue
      }

      if (!claimedRow) continue

      try {
        const claimed = AppGenerationRunSchema.parse(claimedRow)
        await recordAppServiceEvent({
          generationRunId: claimed.id,
          eventType: 'generation_status_changed',
          message: 'Generation status changed from queued to planning.',
          payload: { from: 'queued', to: 'planning', stage: 'planner', progress: 10 },
        })
        results.push(await processAppGenerationRun(claimed))
      } catch (error) {
        failed++
        const message = error instanceof Error ? error.message : 'Unknown planner error'
        await transitionAppGenerationRun({
          run: AppGenerationRunSchema.parse(claimedRow),
          status: 'failed',
          stage: 'planner_failed',
          errorCode: error instanceof AppServiceError ? error.code : 'internal_error',
          errorMessage: message,
        }).catch(() => undefined)
      }
    }

    recordAppServiceMetric('generation_queue_processed', results.length, {
      stage: 'generation',
      operation: 'processQueuedAppGenerationRuns',
      orgId: params?.orgId,
    }, {
      failed,
      limit,
    })

    return {
      processed: results.length,
      failed,
      runs: results,
    }
  })
}

export async function requeueFailedAppGenerationRun(params: {
  run: AppGenerationRun
  userId: string
  input?: unknown
}): Promise<AppGenerationRun> {
  const input = RequeueGenerationRunInputSchema.parse(params.input ?? {})

  return withAppServiceSpan('app_service.generation.requeue', {
    stage: 'generation',
    operation: 'requeueFailedAppGenerationRun',
    orgId: params.run.org_id,
    projectId: params.run.project_id,
    appDeploymentId: params.run.app_deployment_id,
    generationRunId: params.run.id,
    operatorUserId: params.userId,
  }, async () => {
    try {
      let update: ReturnType<typeof buildGenerationRunRequeueUpdate>
      try {
        update = buildGenerationRunRequeueUpdate(params.run)
      } catch (error) {
        throw new AppServiceError(
          'validation_failed',
          error instanceof Error ? error.message : 'Generation run cannot be requeued.',
          409,
        )
      }

      const { data, error } = await supabase
        .from('app_generation_runs')
        .update(update)
        .eq('id', params.run.id)
        .eq('status', 'failed')
        .select(APP_GENERATION_RUN_SELECT)
        .single()

      if (error || !data) {
        throw error ?? new Error('App generation requeue returned no row')
      }

      const requeued = AppGenerationRunSchema.parse(data)
      await recordAppServiceEvent({
        generationRunId: requeued.id,
        appDeploymentId: requeued.app_deployment_id ?? null,
        eventType: 'generation_run_requeued',
        severity: 'warning',
        message: input.note ?? 'Failed generation run requeued.',
        payload: {
          previous_status: params.run.status,
          previous_stage: params.run.stage ?? null,
          previous_error_code: params.run.error_code ?? null,
          requeued_by: params.userId,
          note: input.note ?? null,
        },
      })
      recordAppServiceMetric('generation_run_requeued', 1, {
        stage: 'generation',
        operation: 'requeueFailedAppGenerationRun',
        orgId: requeued.org_id,
        projectId: requeued.project_id,
        appDeploymentId: requeued.app_deployment_id,
        generationRunId: requeued.id,
        operatorUserId: params.userId,
      })

      return requeued
    } catch (error) {
      if (error instanceof AppServiceError) throw error

      ErrorService.captureException(error as Error, {
        severity: 'error',
        ...appServiceErrorContext('requeueFailedAppGenerationRun', {
          stage: 'generation',
          orgId: params.run.org_id,
          projectId: params.run.project_id,
          appDeploymentId: params.run.app_deployment_id,
          generationRunId: params.run.id,
          operatorUserId: params.userId,
        }),
      })
      throw new AppServiceError('internal_error', 'Failed to requeue app generation run.', 500)
    }
  })
}

export async function cancelAppGenerationRun(run: AppGenerationRun): Promise<AppGenerationRun> {
  if (isTerminalGenerationStatus(run.status)) {
    throw new AppServiceError(
      'validation_failed',
      `Generation run is already ${run.status}.`,
      409,
      { details: { status: run.status } },
    )
  }

  return transitionAppGenerationRun({
    run,
    status: 'cancelled',
    stage: 'cancelled',
    progress: run.progress ?? null,
  })
}

export async function setAppGenerationRunSpec(
  run: AppGenerationRun,
  spec: AppServiceSpec,
): Promise<AppGenerationRun> {
  const parsed = AppServiceSpecSchema.parse(spec)
  return transitionAppGenerationRun({
    run,
    status: run.status === 'queued' ? 'planning' : run.status,
    stage: 'spec_ready',
    progress: Math.max(run.progress ?? 0, 25),
    generatedSpec: parsed,
  })
}

async function advanceThroughApprovalStatuses(
  run: AppGenerationRun,
  spec: AppServiceSpec,
): Promise<AppGenerationRun> {
  let current = run

  if (current.status === 'queued') {
    current = await transitionAppGenerationRun({
      run: current,
      status: 'planning',
      stage: 'spec_ready',
      progress: 25,
      generatedSpec: spec,
    })
  } else if (!current.generated_spec) {
    current = await transitionAppGenerationRun({
      run: current,
      status: current.status,
      stage: 'spec_ready',
      progress: Math.max(current.progress ?? 0, 25),
      generatedSpec: spec,
    })
  }

  if (current.status === 'planning' || current.status === 'awaiting_input') {
    current = await transitionAppGenerationRun({
      run: current,
      status: 'generating',
      stage: 'manifest_compiler',
      progress: 45,
      generatedSpec: spec,
    })
  }

  if (current.status === 'generating') {
    current = await transitionAppGenerationRun({
      run: current,
      status: 'building',
      stage: 'manifest_build',
      progress: 65,
      generatedSpec: spec,
    })
  }

  if (current.status === 'building') {
    current = await transitionAppGenerationRun({
      run: current,
      status: 'evaluating',
      stage: 'launch_readiness',
      progress: 80,
      generatedSpec: spec,
    })
  }

  return current
}

export async function approveAppGenerationRun(params: {
  run: AppGenerationRun
  spec?: AppServiceSpec
  userId: string
  visibility?: 'private' | 'unlisted' | 'public'
}): Promise<{ run: AppGenerationRun; deployment: AppDeployment }> {
  return withAppServiceSpan('app_service.generation.approve', {
    stage: 'deploy',
    operation: 'approveAppGenerationRun',
    orgId: params.run.org_id,
    projectId: params.run.project_id,
    appDeploymentId: params.run.app_deployment_id,
    generationRunId: params.run.id,
    operatorUserId: params.userId,
  }, async () => {
    const spec = AppServiceSpecSchema.parse(params.spec ?? params.run.generated_spec)

    if (isTerminalGenerationStatus(params.run.status)) {
      throw new AppServiceError(
        'validation_failed',
        `Cannot approve a ${params.run.status} generation run.`,
        409,
        { details: { status: params.run.status } },
      )
    }

    const readyRun = await advanceThroughApprovalStatuses(params.run, spec)
    const { deployment } = await createPreviewDeploymentFromSpec({
      run: { ...readyRun, generated_spec: spec },
      spec,
      userId: params.userId,
      visibility: params.visibility,
    })

    const succeededRun = await transitionAppGenerationRun({
      run: readyRun,
      status: 'succeeded',
      stage: 'preview_ready',
      progress: 100,
      generatedSpec: spec,
      appDeploymentId: deployment.id,
    })

    recordAppServiceMetric('generation_preview_deployed', 1, {
      stage: 'deploy',
      operation: 'approveAppGenerationRun',
      orgId: succeededRun.org_id,
      projectId: succeededRun.project_id,
      appDeploymentId: deployment.id,
      generationRunId: succeededRun.id,
      operatorUserId: params.userId,
      slug: deployment.slug,
    }, {
      visibility: deployment.visibility,
      deployment_target: deployment.deployment_target,
    })

    return { run: succeededRun, deployment }
  })
}

export const UpdateAppGenerationRunStatusSchema = z.object({
  status: AppGenerationStatusSchema,
  stage: z.string().max(120).optional(),
  progress: z.number().min(0).max(100).optional(),
  errorCode: z.string().max(120).optional(),
  errorMessage: z.string().max(2_000).optional(),
})
