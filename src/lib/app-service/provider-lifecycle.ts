import 'server-only'

import { createHash } from 'node:crypto'
import {
  AppExternalDeploymentSchema,
  AppFrontendGenerationSchema,
  AppGenerationRunSchema,
  type AppDeployment,
  type AppArtifact,
  type AppExternalDeployment,
  type AppFrontendGeneration,
  type AppGenerationRun,
} from '@contracts/app-service'
import { supabase, ErrorService } from '@/lib/db/client'
import { APP_RUNTIME_OPENAPI } from './public-api-contract'
import { buildGeneratedCodeSandboxRequest } from './generated-build-validation'
import { buildFrontendBriefFromSpec } from './frontend-brief'
import { createAppArtifact, getAppDeployment } from './deployments'
import { recordAppServiceEvent } from './events'
import { AppServiceError } from './errors'
import { validateGeneratedCodeFiles, type GeneratedCodeFile, type GeneratedCodeValidationResult } from './generated-code-guard'
import {
  V0RestClient,
  type V0DeploymentErrorsResult,
  type V0DeploymentLogEntry,
  type V0DeploymentResult,
  type V0VersionResult,
} from './frontend-providers/v0-client'
import { v0FrontendProvider } from './frontend-providers/v0'
import { v0DeployProvider } from './deploy-providers/v0'
import { vercelSandboxProvider } from './sandbox-providers/vercel'
import type { SandboxValidationResult } from './sandbox-providers/types'
import { redactAppServiceMetadata, redactAppServiceText, redactAppServiceValue } from './security-redaction'
import {
  appServiceErrorContext,
  recordAppServiceMetric,
  withAppServiceSpan,
} from './observability'
import {
  APP_EXTERNAL_DEPLOYMENT_SELECT,
  APP_FRONTEND_GENERATION_SELECT,
  APP_GENERATION_RUN_SELECT,
} from './projections'

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function stableRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function resolveStartedGenerationStatus(result: {
  provider: 'v0' | 'mock'
  previewUrl?: string
  metadata?: Record<string, unknown>
}): AppFrontendGeneration['status'] {
  if (result.provider === 'mock') return 'ready'
  return 'generating'
}

function versionHasCompletedFiles(version: V0VersionResult): boolean {
  return version.status === 'completed' || (!version.status && version.files.length > 0)
}

function deploymentStatusFromV0(deployment: V0DeploymentResult): AppExternalDeployment['status'] {
  const readyState = deployment.readyState?.toUpperCase()
  if (readyState && ['READY', 'SUCCEEDED', 'COMPLETED'].includes(readyState)) return 'ready'
  if (readyState && ['ERROR', 'FAILED'].includes(readyState)) return 'failed'
  if (readyState && ['CANCELED', 'CANCELLED'].includes(readyState)) return 'cancelled'
  if (readyState && ['QUEUED', 'PENDING'].includes(readyState)) return 'queued'
  return deployment.webUrl ? 'ready' : 'building'
}

function serializeGeneratedSource(files: GeneratedCodeFile[]) {
  return files.map((file) => ({
    path: file.path,
    content: file.content,
    locked: file.locked ?? false,
    bytes: Buffer.byteLength(file.content, 'utf8'),
    sha256: contentHash(file.content),
  }))
}

function sourceArchiveMetadata(
  validation: GeneratedCodeValidationResult,
  version: V0VersionResult,
): Record<string, unknown> {
  return {
    provider: 'v0',
    archive_format: 'inline_json_v1',
    provider_version_id: version.id,
    provider_status: version.status ?? null,
    preview_url: version.demoUrl ?? null,
    screenshot_url: version.screenshotUrl ?? null,
    total_bytes: validation.totalBytes,
    file_count: validation.fileCount,
    files: serializeGeneratedSource(validation.files),
  }
}

function limitedLogLines(lines: string[], maxLines = 250, maxChars = 80_000): string[] {
  const tail = lines.slice(-maxLines)
  const result: string[] = []
  let total = 0

  for (const line of tail.reverse()) {
    const redactedLine = redactAppServiceText(line)
    const size = Buffer.byteLength(redactedLine, 'utf8')
    if (total + size > maxChars && result.length > 0) break
    result.push(redactedLine.slice(0, 4_000))
    total += size
  }

  return result.reverse()
}

function hasDeploymentErrors(errors?: V0DeploymentErrorsResult): boolean {
  if (!errors) return false
  return Boolean(errors.error || errors.fullErrorText || errors.errorType || errors.formattedError)
}

function formatDeploymentLogs(logs: V0DeploymentLogEntry[]): string[] {
  return logs.map((log) => {
    const timestamp = log.createdAt ? `${log.createdAt} ` : ''
    const level = log.level ? `${log.level} ` : ''
    const stream = log.type ? `${log.type} ` : ''
    return `${timestamp}${level}${stream}${log.text}`.trim()
  })
}

function assertApprovedRun(run: AppGenerationRun): asserts run is AppGenerationRun & {
  generated_spec: NonNullable<AppGenerationRun['generated_spec']>
  app_deployment_id: string
} {
  if (!run.generated_spec) {
    throw new AppServiceError('setup_required', 'Generation run does not have an app spec yet.', 409)
  }

  if (!run.app_deployment_id) {
    throw new AppServiceError('setup_required', 'Approve the Lucid-hosted preview before launching external providers.', 409)
  }

  if (run.status !== 'succeeded') {
    throw new AppServiceError('validation_failed', 'External provider launch requires a succeeded generation run.', 409, {
      details: { status: run.status },
    })
  }
}

async function readDeploymentOrThrow(id: string): Promise<AppDeployment> {
  const deployment = await getAppDeployment(id)
  if (!deployment) {
    throw new AppServiceError('not_found', 'App deployment was not found.', 404)
  }
  return deployment
}

async function updateGenerationProviderRefs(
  run: AppGenerationRun,
  refs: Record<string, unknown>,
): Promise<AppGenerationRun> {
  const { data, error } = await supabase
    .from('app_generation_runs')
    .update({
      provider_refs: redactAppServiceMetadata({
        ...run.provider_refs,
        ...refs,
      }),
    })
    .eq('id', run.id)
    .select(APP_GENERATION_RUN_SELECT)
    .single()

  if (error || !data) {
    throw error ?? new Error('Provider refs update returned no row')
  }

  return AppGenerationRunSchema.parse(data)
}

async function updateFrontendGeneration(
  id: string,
  values: Record<string, unknown>,
): Promise<AppFrontendGeneration> {
  const safeValues = redactAppServiceMetadata({
    ...values,
    error_message: typeof values.error_message === 'string'
      ? redactAppServiceText(values.error_message)
      : values.error_message,
  })
  const { data, error } = await supabase
    .from('app_frontend_generations')
    .update(safeValues)
    .eq('id', id)
    .select(APP_FRONTEND_GENERATION_SELECT)
    .single()

  if (error || !data) {
    throw error ?? new Error('Frontend generation update returned no row')
  }

  return AppFrontendGenerationSchema.parse(data)
}

async function updateExternalDeployment(
  id: string,
  values: Record<string, unknown>,
): Promise<AppExternalDeployment> {
  const safeValues = redactAppServiceMetadata({
    ...values,
    error_message: typeof values.error_message === 'string'
      ? redactAppServiceText(values.error_message)
      : values.error_message,
  })
  const { data, error } = await supabase
    .from('app_external_deployments')
    .update(safeValues)
    .eq('id', id)
    .select(APP_EXTERNAL_DEPLOYMENT_SELECT)
    .single()

  if (error || !data) {
    throw error ?? new Error('External deployment update returned no row')
  }

  return AppExternalDeploymentSchema.parse(data)
}

async function readGenerationRun(id: string): Promise<AppGenerationRun | null> {
  const { data, error } = await supabase
    .from('app_generation_runs')
    .select(APP_GENERATION_RUN_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data ? AppGenerationRunSchema.parse(data) : null
}

async function persistValidationReport(params: {
  generation: AppFrontendGeneration
  validation: GeneratedCodeValidationResult
  version: V0VersionResult
}): Promise<AppArtifact> {
  return createAppArtifact({
    generationRunId: params.generation.generation_run_id,
    appDeploymentId: params.generation.app_deployment_id,
    kind: 'eval_report',
    checksum: stableHash({
      provider: 'v0',
      version_id: params.version.id,
      findings: params.validation.findings,
      checksum: params.validation.checksum,
    }),
    metadata: {
      provider: 'v0',
      provider_version_id: params.version.id,
      source_checksum: params.validation.checksum,
      passed: params.validation.passed,
      findings: params.validation.findings,
      total_bytes: params.validation.totalBytes,
      file_count: params.validation.fileCount,
    },
  })
}

async function persistGeneratedSourceArchive(params: {
  generation: AppFrontendGeneration
  validation: GeneratedCodeValidationResult
  version: V0VersionResult
}): Promise<AppArtifact> {
  return createAppArtifact({
    generationRunId: params.generation.generation_run_id,
    appDeploymentId: params.generation.app_deployment_id,
    kind: 'source_archive',
    checksum: params.validation.checksum,
    metadata: sourceArchiveMetadata(params.validation, params.version),
  })
}

async function persistFrontendBuildLogArtifact(params: {
  generation: AppFrontendGeneration
  sandbox: SandboxValidationResult
  sourceChecksum: string
  version: V0VersionResult
}): Promise<AppArtifact> {
  const logs = limitedLogLines(params.sandbox.logs)
  return createAppArtifact({
    generationRunId: params.generation.generation_run_id,
    appDeploymentId: params.generation.app_deployment_id,
    kind: 'build_log',
    checksum: stableHash({
      provider: params.sandbox.provider,
      version_id: params.version.id,
      source_checksum: params.sourceChecksum,
      passed: params.sandbox.passed,
      logs,
    }),
    metadata: {
      provider: params.sandbox.provider,
      phase: 'generated_frontend_build',
      provider_version_id: params.version.id,
      source_checksum: params.sourceChecksum,
      passed: params.sandbox.passed,
      logs,
      metadata: params.sandbox.metadata ?? {},
    },
  })
}

async function persistExternalDeploymentBuildLogArtifact(params: {
  appDeployment: AppDeployment
  externalDeployment: AppExternalDeployment
  logs: V0DeploymentLogEntry[]
  errors?: V0DeploymentErrorsResult
  nextSince?: number
}): Promise<AppArtifact | null> {
  if (!params.appDeployment.generation_run_id) return null

  const formattedLogs = limitedLogLines(formatDeploymentLogs(params.logs))
  const errors = hasDeploymentErrors(params.errors)
    ? redactAppServiceValue(params.errors) as V0DeploymentErrorsResult
    : undefined
  if (formattedLogs.length === 0 && !errors) return null

  return createAppArtifact({
    generationRunId: params.appDeployment.generation_run_id,
    appDeploymentId: params.appDeployment.id,
    kind: 'build_log',
    checksum: stableHash({
      provider: params.externalDeployment.provider,
      external_deployment_id: params.externalDeployment.external_deployment_id,
      logs: formattedLogs,
      errors,
      next_since: params.nextSince,
    }),
    metadata: {
      provider: params.externalDeployment.provider,
      phase: 'external_deployment_logs',
      external_deployment_id: params.externalDeployment.external_deployment_id,
      logs: formattedLogs,
      errors: errors ?? null,
      next_since: params.nextSince ?? null,
    },
  })
}

export async function getLatestFrontendGenerationForRun(runId: string): Promise<AppFrontendGeneration | null> {
  const { data, error } = await supabase
    .from('app_frontend_generations')
    .select(APP_FRONTEND_GENERATION_SELECT)
    .eq('generation_run_id', runId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'getLatestFrontendGenerationForRun', runId },
      tags: { layer: 'app-service', feature: 'provider-lifecycle' },
    })
    throw new AppServiceError('internal_error', 'Failed to read frontend generation state.', 500)
  }

  return data ? AppFrontendGenerationSchema.parse(data) : null
}

export async function getLatestExternalDeployment(appDeploymentId: string): Promise<AppExternalDeployment | null> {
  const { data, error } = await supabase
    .from('app_external_deployments')
    .select(APP_EXTERNAL_DEPLOYMENT_SELECT)
    .eq('app_deployment_id', appDeploymentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { operation: 'getLatestExternalDeployment', appDeploymentId },
      tags: { layer: 'app-service', feature: 'provider-lifecycle' },
    })
    throw new AppServiceError('internal_error', 'Failed to read external deployment state.', 500)
  }

  return data ? AppExternalDeploymentSchema.parse(data) : null
}

export async function launchV0FrontendForRun(params: {
  run: AppGenerationRun
  idempotencyKey?: string
}): Promise<{
  frontendGeneration: AppFrontendGeneration
  run: AppGenerationRun
}> {
  return withAppServiceSpan('app_service.provider.v0.frontend.launch', {
    stage: 'provider.v0',
    operation: 'launchV0FrontendForRun',
    orgId: params.run.org_id,
    projectId: params.run.project_id,
    appDeploymentId: params.run.app_deployment_id,
    generationRunId: params.run.id,
    provider: 'v0',
  }, async () => {
  assertApprovedRun(params.run)
  const deployment = await readDeploymentOrThrow(params.run.app_deployment_id)
  const brief = buildFrontendBriefFromSpec(params.run.generated_spec)
  const providerSafeBrief = {
    ...brief,
    public_api_contract: APP_RUNTIME_OPENAPI,
  }
  const promptHash = stableHash(providerSafeBrief)

  const { data, error } = await supabase
    .from('app_frontend_generations')
    .insert({
      generation_run_id: params.run.id,
      app_deployment_id: deployment.id,
      provider: process.env.APP_SERVICE_PROVIDER_MODE === 'mock' ? 'mock' : 'v0',
      status: 'generating',
      prompt_hash: promptHash,
      brief: providerSafeBrief,
    })
    .select(APP_FRONTEND_GENERATION_SELECT)
    .single()

  if (error || !data) {
    throw error ?? new Error('Frontend generation creation returned no row')
  }

  const generation = AppFrontendGenerationSchema.parse(data)

  try {
    const result = await v0FrontendProvider.startGeneration({
      generationRunId: params.run.id,
      appDeploymentId: deployment.id,
      brief: providerSafeBrief,
      idempotencyKey: params.idempotencyKey,
    })
    const startedStatus = resolveStartedGenerationStatus(result)

    const frontendGeneration = await updateFrontendGeneration(generation.id, {
      provider: result.provider,
      status: startedStatus,
      provider_project_id: result.providerProjectId ?? null,
      provider_chat_id: result.providerChatId ?? null,
      provider_version_id: result.providerVersionId ?? null,
      provider_deployment_id: result.providerDeploymentId ?? null,
      preview_url: result.previewUrl ?? null,
      web_url: result.webUrl ?? null,
      result: result.metadata ?? {},
      error_code: null,
      error_message: null,
    })

    await supabase
      .from('app_deployments')
      .update({
        frontend_strategy: 'generated_code',
        preview_url: result.previewUrl ?? deployment.preview_url,
      })
      .eq('id', deployment.id)

    const updatedRun = await updateGenerationProviderRefs(params.run, {
      v0: {
        frontend_generation_id: frontendGeneration.id,
        project_id: frontendGeneration.provider_project_id,
        chat_id: frontendGeneration.provider_chat_id,
        version_id: frontendGeneration.provider_version_id,
        preview_url: frontendGeneration.preview_url,
        web_url: frontendGeneration.web_url,
      },
    })

    await recordAppServiceEvent({
      appDeploymentId: deployment.id,
      generationRunId: params.run.id,
      eventType: startedStatus === 'ready' ? 'v0_frontend_generation_ready' : 'v0_frontend_generation_started',
      provider: result.provider,
      externalId: result.providerChatId,
      message: startedStatus === 'ready' ? 'v0 frontend generation is ready.' : 'v0 frontend generation started.',
      payload: {
        frontend_generation_id: frontendGeneration.id,
        provider_project_id: result.providerProjectId,
        provider_version_id: result.providerVersionId,
        preview_url: result.previewUrl,
      },
    })
    recordAppServiceMetric('v0_frontend_generation_started', 1, {
      stage: 'provider.v0',
      operation: 'launchV0FrontendForRun',
      orgId: params.run.org_id,
      projectId: params.run.project_id,
      appDeploymentId: deployment.id,
      generationRunId: params.run.id,
      frontendGenerationId: frontendGeneration.id,
      provider: result.provider,
      slug: deployment.slug,
    }, {
      status: startedStatus,
      has_preview_url: Boolean(frontendGeneration.preview_url),
      has_web_url: Boolean(frontendGeneration.web_url),
    })

    return { frontendGeneration, run: updatedRun }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown v0 generation error'
    await updateFrontendGeneration(generation.id, {
      status: 'failed',
      error_code: error instanceof AppServiceError ? error.code : 'provider_unavailable',
      error_message: message,
    }).catch(() => undefined)

    await recordAppServiceEvent({
      appDeploymentId: deployment.id,
      generationRunId: params.run.id,
      eventType: 'v0_frontend_generation_failed',
      severity: 'error',
      provider: 'v0',
      message,
    }).catch(() => undefined)
    ErrorService.captureException(error as Error, {
      severity: 'error',
      ...appServiceErrorContext('launchV0FrontendForRun', {
        stage: 'provider.v0',
        orgId: params.run.org_id,
        projectId: params.run.project_id,
        appDeploymentId: deployment.id,
        generationRunId: params.run.id,
        frontendGenerationId: generation.id,
        provider: 'v0',
        slug: deployment.slug,
      }),
    })
    recordAppServiceMetric('v0_frontend_generation_failed', 1, {
      stage: 'provider.v0',
      operation: 'launchV0FrontendForRun',
      orgId: params.run.org_id,
      projectId: params.run.project_id,
      appDeploymentId: deployment.id,
      generationRunId: params.run.id,
      frontendGenerationId: generation.id,
      provider: 'v0',
      slug: deployment.slug,
    })

    throw error
  }
  })
}

export async function launchV0DeploymentForRun(params: {
  run: AppGenerationRun
  environment?: 'preview' | 'production'
  approval?: {
    approvedBy: string
    note?: string | null
  }
}): Promise<{
  externalDeployment: AppExternalDeployment
  run: AppGenerationRun
}> {
  return withAppServiceSpan('app_service.provider.vercel.deploy.launch', {
    stage: 'provider.vercel',
    operation: 'launchV0DeploymentForRun',
    orgId: params.run.org_id,
    projectId: params.run.project_id,
    appDeploymentId: params.run.app_deployment_id,
    generationRunId: params.run.id,
    provider: 'v0',
  }, async () => {
  assertApprovedRun(params.run)
  const deployment = await readDeploymentOrThrow(params.run.app_deployment_id)
  const frontendGeneration = await getLatestFrontendGenerationForRun(params.run.id)

  if (!frontendGeneration || frontendGeneration.status !== 'ready') {
    throw new AppServiceError('setup_required', 'Generate a ready v0 frontend before launching a Vercel deployment.', 409)
  }

  const { data, error } = await supabase
    .from('app_external_deployments')
    .insert({
      app_deployment_id: deployment.id,
      provider: 'v0',
      external_project_id: frontendGeneration.provider_project_id,
      status: 'building',
      metadata: {
        frontend_generation_id: frontendGeneration.id,
        environment: params.environment ?? 'preview',
        external_deployment_approval: {
          required: true,
          approved_by: params.approval?.approvedBy ?? null,
          approved_at: new Date().toISOString(),
          note: params.approval?.note ?? null,
        },
      },
    })
    .select(APP_EXTERNAL_DEPLOYMENT_SELECT)
    .single()

  if (error || !data) {
    throw error ?? new Error('External deployment creation returned no row')
  }

  const externalDeployment = AppExternalDeploymentSchema.parse(data)

  try {
    const deployResult = await v0DeployProvider.deploy({
      appDeploymentId: deployment.id,
      target: 'vercel',
      environment: params.environment ?? 'preview',
      providerProjectId: frontendGeneration.provider_project_id ?? undefined,
      providerChatId: frontendGeneration.provider_chat_id ?? undefined,
      providerVersionId: frontendGeneration.provider_version_id ?? undefined,
      metadata: {
        frontend_generation_id: frontendGeneration.id,
      },
    })

    const { data: updatedExternalDeployment, error: updateError } = await supabase
      .from('app_external_deployments')
      .update({
        external_deployment_id: deployResult.externalDeploymentId ?? null,
        external_url: deployResult.url ?? null,
        status: deployResult.status === 'failed' ? 'failed' : 'building',
        metadata: {
          ...externalDeployment.metadata,
          ...(deployResult.metadata ?? {}),
        },
      })
      .eq('id', externalDeployment.id)
      .select(APP_EXTERNAL_DEPLOYMENT_SELECT)
      .single()

    if (updateError || !updatedExternalDeployment) {
      throw updateError ?? new Error('External deployment update returned no row')
    }

    await supabase
      .from('app_deployments')
      .update({
        deployment_target: 'vercel',
        status: params.environment === 'production' ? 'active' : 'preview',
        preview_url: params.environment === 'production' ? deployment.preview_url : deployResult.url ?? deployment.preview_url,
        public_url: params.environment === 'production' ? deployResult.url ?? deployment.public_url : deployment.public_url,
        deployed_at: new Date().toISOString(),
      })
      .eq('id', deployment.id)

    const parsedExternalDeployment = AppExternalDeploymentSchema.parse(updatedExternalDeployment)
    const updatedRun = await updateGenerationProviderRefs(params.run, {
      v0_deployment: {
        external_deployment_row_id: parsedExternalDeployment.id,
        provider_deployment_id: parsedExternalDeployment.external_deployment_id,
        url: parsedExternalDeployment.external_url,
        environment: params.environment ?? 'preview',
      },
    })

    await recordAppServiceEvent({
      appDeploymentId: deployment.id,
      generationRunId: params.run.id,
      eventType: deployResult.status === 'failed' ? 'v0_vercel_deployment_failed' : 'v0_vercel_deployment_started',
      severity: deployResult.status === 'failed' ? 'error' : 'info',
      provider: deployResult.provider,
      externalId: deployResult.externalDeploymentId,
      message: deployResult.status === 'failed' ? 'v0/Vercel deployment failed.' : 'v0/Vercel deployment started.',
      payload: {
        external_deployment_id: parsedExternalDeployment.id,
        url: deployResult.url,
        environment: params.environment ?? 'preview',
        external_deployment_approval: {
          required: true,
          approved_by: params.approval?.approvedBy ?? null,
          note: params.approval?.note ?? null,
        },
      },
    })
    recordAppServiceMetric(
      deployResult.status === 'failed' ? 'v0_vercel_deployment_failed' : 'v0_vercel_deployment_started',
      1,
      {
        stage: 'provider.vercel',
        operation: 'launchV0DeploymentForRun',
        orgId: params.run.org_id,
        projectId: params.run.project_id,
        appDeploymentId: deployment.id,
        generationRunId: params.run.id,
        frontendGenerationId: frontendGeneration.id,
        externalDeploymentId: parsedExternalDeployment.id,
        provider: deployResult.provider,
        slug: deployment.slug,
      },
      {
        environment: params.environment ?? 'preview',
        status: deployResult.status,
        has_url: Boolean(deployResult.url),
      },
    )

    return { externalDeployment: parsedExternalDeployment, run: updatedRun }
  } catch (error) {
    const message = redactAppServiceText(error instanceof Error ? error.message : 'Unknown v0 deployment error')
    await supabase
      .from('app_external_deployments')
      .update({
        status: 'failed',
        metadata: {
          ...externalDeployment.metadata,
          error_code: error instanceof AppServiceError ? error.code : 'provider_unavailable',
          error_message: message,
        },
      })
      .eq('id', externalDeployment.id)

    await recordAppServiceEvent({
      appDeploymentId: deployment.id,
      generationRunId: params.run.id,
      eventType: 'v0_vercel_deployment_failed',
      severity: 'error',
      provider: 'v0',
      message,
    }).catch(() => undefined)
    ErrorService.captureException(error as Error, {
      severity: 'error',
      ...appServiceErrorContext('launchV0DeploymentForRun', {
        stage: 'provider.vercel',
        orgId: params.run.org_id,
        projectId: params.run.project_id,
        appDeploymentId: deployment.id,
        generationRunId: params.run.id,
        frontendGenerationId: frontendGeneration.id,
        externalDeploymentId: externalDeployment.id,
        provider: 'v0',
        slug: deployment.slug,
      }, {
        environment: params.environment ?? 'preview',
      }),
    })
    recordAppServiceMetric('v0_vercel_deployment_failed', 1, {
      stage: 'provider.vercel',
      operation: 'launchV0DeploymentForRun',
      orgId: params.run.org_id,
      projectId: params.run.project_id,
      appDeploymentId: deployment.id,
      generationRunId: params.run.id,
      frontendGenerationId: frontendGeneration.id,
      externalDeploymentId: externalDeployment.id,
      provider: 'v0',
      slug: deployment.slug,
    }, {
      environment: params.environment ?? 'preview',
    })

    throw error
  }
  })
}

export interface AppServiceProviderSyncResult {
  frontend_generations_synced: number
  external_deployments_synced: number
  artifacts_created: number
  failed: number
  skipped: boolean
}

interface ProviderSyncCounters {
  frontend_generations_synced: number
  external_deployments_synced: number
  artifacts_created: number
  failed: number
}

function emptyProviderSyncCounters(): ProviderSyncCounters {
  return {
    frontend_generations_synced: 0,
    external_deployments_synced: 0,
    artifacts_created: 0,
    failed: 0,
  }
}

function addProviderSyncCounters(
  target: ProviderSyncCounters,
  source: ProviderSyncCounters,
): void {
  target.frontend_generations_synced += source.frontend_generations_synced
  target.external_deployments_synced += source.external_deployments_synced
  target.artifacts_created += source.artifacts_created
  target.failed += source.failed
}

function isRetryableProviderError(error: unknown): boolean {
  return error instanceof AppServiceError && error.retryable
}

async function failFrontendGeneration(params: {
  generation: AppFrontendGeneration
  errorCode: string
  message: string
  result?: Record<string, unknown>
}): Promise<void> {
  await updateFrontendGeneration(params.generation.id, {
    status: 'failed',
    error_code: params.errorCode,
    error_message: params.message,
    result: {
      ...params.generation.result,
      ...(params.result ?? {}),
    },
  }).catch(() => undefined)

  await recordAppServiceEvent({
    appDeploymentId: params.generation.app_deployment_id,
    generationRunId: params.generation.generation_run_id,
    eventType: 'v0_frontend_generation_failed',
    severity: 'error',
    provider: params.generation.provider,
    externalId: params.generation.provider_chat_id,
      message: redactAppServiceText(params.message),
  }).catch(() => undefined)
}

async function syncFrontendGenerationRow(
  generation: AppFrontendGeneration,
  client: V0RestClient,
): Promise<ProviderSyncCounters> {
  return withAppServiceSpan('app_service.provider.v0.frontend.sync', {
    stage: 'provider.v0',
    operation: 'syncFrontendGenerationRow',
    appDeploymentId: generation.app_deployment_id,
    generationRunId: generation.generation_run_id,
    frontendGenerationId: generation.id,
    provider: generation.provider,
  }, async () => {
  const counters = emptyProviderSyncCounters()
  counters.frontend_generations_synced = 1

  if (generation.provider !== 'v0') return counters

  if (!generation.provider_chat_id) {
    await failFrontendGeneration({
      generation,
      errorCode: 'provider_unavailable',
      message: 'v0 frontend generation is missing a provider chat id.',
    })
    counters.failed = 1
    return counters
  }

  let versionId = generation.provider_version_id ?? undefined

  if (!versionId) {
    const chat = await client.getChat(generation.provider_chat_id)
    versionId = chat.latestVersion?.id
    await updateFrontendGeneration(generation.id, {
      provider_project_id: chat.projectId ?? generation.provider_project_id ?? null,
      provider_version_id: versionId ?? null,
      preview_url: chat.latestVersion?.demoUrl ?? generation.preview_url ?? null,
      web_url: chat.webUrl ?? generation.web_url ?? null,
      result: {
        ...generation.result,
        provider_chat: {
          id: chat.id,
          latest_version_id: versionId ?? null,
          latest_version_status: chat.latestVersion?.status ?? null,
        },
      },
    })
  }

  if (!versionId) return counters

  const version = await client.getVersion({
    chatId: generation.provider_chat_id,
    versionId,
    includeDefaultFiles: true,
  })
  const providerVersionResult = {
    id: version.id,
    status: version.status ?? null,
    demo_url: version.demoUrl ?? null,
    screenshot_url: version.screenshotUrl ?? null,
    file_count: version.files.length,
  }

  if (version.status === 'failed') {
    await failFrontendGeneration({
      generation,
      errorCode: 'provider_unavailable',
      message: 'v0 reported the frontend version failed.',
      result: { provider_version: providerVersionResult },
    })
    counters.failed = 1
    return counters
  }

  if (version.status === 'pending' || !versionHasCompletedFiles(version)) {
    await updateFrontendGeneration(generation.id, {
      status: 'generating',
      provider_version_id: version.id,
      preview_url: version.demoUrl ?? generation.preview_url ?? null,
      result: {
        ...generation.result,
        provider_version: providerVersionResult,
      },
    })
    return counters
  }

  const validation = withAppServiceSpan('app_service.eval.generated_code_guard', {
    stage: 'eval',
    operation: 'validateGeneratedCodeFiles',
    appDeploymentId: generation.app_deployment_id,
    generationRunId: generation.generation_run_id,
    frontendGenerationId: generation.id,
    provider: 'v0',
  }, () => validateGeneratedCodeFiles(version.files, { requirePackageJson: true }), {
    file_count: version.files.length,
  })
  const evalArtifact = await persistValidationReport({ generation, validation, version })
  counters.artifacts_created += 1

  if (!validation.passed) {
    await failFrontendGeneration({
      generation,
      errorCode: 'validation_failed',
      message: 'Generated frontend failed Lucid source guard validation.',
      result: {
        provider_version: providerVersionResult,
        eval_report_artifact_id: evalArtifact.id,
        validation: {
          passed: false,
          findings: validation.findings,
          total_bytes: validation.totalBytes,
          file_count: validation.fileCount,
        },
      },
    })
    counters.failed = 1
    return counters
  }

  const sandbox = await withAppServiceSpan('app_service.sandbox.generated_frontend_build', {
    stage: 'sandbox',
    operation: 'validateGeneratedFrontendBuild',
    appDeploymentId: generation.app_deployment_id,
    generationRunId: generation.generation_run_id,
    frontendGenerationId: generation.id,
    provider: 'vercel-sandbox',
  }, () => vercelSandboxProvider.validate(buildGeneratedCodeSandboxRequest(validation.files)), {
    file_count: validation.fileCount,
    total_bytes: validation.totalBytes,
  })
  const buildLogArtifact = await persistFrontendBuildLogArtifact({
    generation,
    sandbox,
    sourceChecksum: validation.checksum,
    version,
  })
  counters.artifacts_created += 1

  if (!sandbox.passed) {
    await failFrontendGeneration({
      generation,
      errorCode: 'validation_failed',
      message: 'Generated frontend failed sandbox build validation.',
      result: {
        provider_version: providerVersionResult,
        eval_report_artifact_id: evalArtifact.id,
        build_log_artifact_id: buildLogArtifact.id,
        validation: {
          passed: true,
          findings: validation.findings,
          checksum: validation.checksum,
          total_bytes: validation.totalBytes,
          file_count: validation.fileCount,
        },
        sandbox: {
          provider: sandbox.provider,
          passed: false,
          build_log_artifact_id: buildLogArtifact.id,
          metadata: sandbox.metadata ?? {},
        },
      },
    })
    counters.failed = 1
    return counters
  }

  const sourceArtifact = await persistGeneratedSourceArchive({ generation, validation, version })
  counters.artifacts_created += 1

  const updatedGeneration = await updateFrontendGeneration(generation.id, {
    status: 'ready',
    provider_version_id: version.id,
    preview_url: version.demoUrl ?? generation.preview_url ?? null,
    result: {
      ...generation.result,
      provider_version: providerVersionResult,
      source_artifact_id: sourceArtifact.id,
      eval_report_artifact_id: evalArtifact.id,
      build_log_artifact_id: buildLogArtifact.id,
      validation: {
        passed: true,
        findings: validation.findings,
        checksum: validation.checksum,
        total_bytes: validation.totalBytes,
        file_count: validation.fileCount,
      },
      sandbox: {
        provider: sandbox.provider,
        passed: true,
        build_log_artifact_id: buildLogArtifact.id,
        metadata: sandbox.metadata ?? {},
      },
    },
    error_code: null,
    error_message: null,
  })

  if (updatedGeneration.app_deployment_id) {
    await supabase
      .from('app_deployments')
      .update({
        frontend_strategy: 'generated_code',
        preview_url: version.demoUrl ?? null,
        latest_artifact_id: sourceArtifact.id,
      })
      .eq('id', updatedGeneration.app_deployment_id)
  }

  const run = await readGenerationRun(updatedGeneration.generation_run_id)
  if (run) {
    await updateGenerationProviderRefs(run, {
      v0: {
        ...stableRecord(run.provider_refs.v0),
        frontend_generation_id: updatedGeneration.id,
        project_id: updatedGeneration.provider_project_id,
        chat_id: updatedGeneration.provider_chat_id,
        version_id: version.id,
        preview_url: updatedGeneration.preview_url,
        web_url: updatedGeneration.web_url,
        source_artifact_id: sourceArtifact.id,
        eval_report_artifact_id: evalArtifact.id,
        build_log_artifact_id: buildLogArtifact.id,
      },
    })
  }

  await recordAppServiceEvent({
    appDeploymentId: updatedGeneration.app_deployment_id,
    generationRunId: updatedGeneration.generation_run_id,
    eventType: 'v0_frontend_source_validated',
    provider: 'v0',
    externalId: updatedGeneration.provider_chat_id,
    message: 'v0 frontend source was downloaded, validated, and stored.',
    payload: {
      provider_version_id: version.id,
      source_artifact_id: sourceArtifact.id,
      eval_report_artifact_id: evalArtifact.id,
      build_log_artifact_id: buildLogArtifact.id,
      checksum: sourceArtifact.checksum,
      file_count: validation.fileCount,
      total_bytes: validation.totalBytes,
    },
  })
  recordAppServiceMetric('v0_frontend_source_validated', 1, {
    stage: 'provider.v0',
    operation: 'syncFrontendGenerationRow',
    appDeploymentId: updatedGeneration.app_deployment_id,
    generationRunId: updatedGeneration.generation_run_id,
    frontendGenerationId: updatedGeneration.id,
    provider: 'v0',
  }, {
    artifact_count: counters.artifacts_created,
    file_count: validation.fileCount,
    total_bytes: validation.totalBytes,
  })

  return counters
  })
}

async function fetchV0DeploymentDiagnostics(params: {
  client: V0RestClient
  appDeployment: AppDeployment
  externalDeployment: AppExternalDeployment
  status: AppExternalDeployment['status']
}): Promise<{
  metadata: Record<string, unknown>
  artifact: AppArtifact | null
}> {
  const metadata: Record<string, unknown> = {}
  const deploymentId = params.externalDeployment.external_deployment_id
  if (!deploymentId) return { metadata, artifact: null }

  let logs: V0DeploymentLogEntry[] = []
  let nextSince: number | undefined
  let errors: V0DeploymentErrorsResult | undefined

  try {
    const existingLogs = stableRecord(params.externalDeployment.metadata.provider_logs)
    const since = typeof existingLogs.next_since === 'number' ? existingLogs.next_since : undefined
    const result = await params.client.findDeploymentLogs({ deploymentId, since })
    logs = result.logs
    nextSince = result.nextSince
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'warning',
      context: { operation: 'findV0DeploymentLogs', externalDeploymentId: params.externalDeployment.id },
      tags: { layer: 'app-service', feature: 'provider-lifecycle' },
    })
    metadata.provider_logs = {
        fetch_error: redactAppServiceText(error instanceof Error ? error.message : 'Unknown v0 deployment log fetch error'),
      fetched_at: new Date().toISOString(),
    }
  }

  if (params.status === 'failed' || params.status === 'cancelled') {
    try {
      errors = await params.client.findDeploymentErrors(deploymentId)
    } catch (error) {
      ErrorService.captureException(error as Error, {
        severity: 'warning',
        context: { operation: 'findV0DeploymentErrors', externalDeploymentId: params.externalDeployment.id },
        tags: { layer: 'app-service', feature: 'provider-lifecycle' },
      })
      metadata.provider_errors = {
        fetch_error: redactAppServiceText(error instanceof Error ? error.message : 'Unknown v0 deployment error fetch error'),
        fetched_at: new Date().toISOString(),
      }
    }
  }

  const artifact = await persistExternalDeploymentBuildLogArtifact({
    appDeployment: params.appDeployment,
    externalDeployment: params.externalDeployment,
    logs,
    errors,
    nextSince,
  })

  metadata.provider_logs = {
    ...stableRecord(metadata.provider_logs),
    fetched_at: new Date().toISOString(),
    count: logs.length,
    next_since: nextSince ?? stableRecord(params.externalDeployment.metadata.provider_logs).next_since ?? null,
    artifact_id: artifact?.id ?? stableRecord(params.externalDeployment.metadata.provider_logs).artifact_id ?? null,
    last_log_id: logs.at(-1)?.id ?? stableRecord(params.externalDeployment.metadata.provider_logs).last_log_id ?? null,
  }

  if (errors || metadata.provider_errors) {
    metadata.provider_errors = {
      ...stableRecord(metadata.provider_errors),
      ...redactAppServiceMetadata((errors ?? {}) as Record<string, unknown>),
      fetched_at: new Date().toISOString(),
    }
  }

  return { metadata, artifact }
}

async function syncExternalDeploymentRow(
  externalDeployment: AppExternalDeployment,
  client: V0RestClient,
): Promise<ProviderSyncCounters> {
  return withAppServiceSpan('app_service.provider.vercel.deployment.sync', {
    stage: 'provider.vercel',
    operation: 'syncExternalDeploymentRow',
    appDeploymentId: externalDeployment.app_deployment_id,
    externalDeploymentId: externalDeployment.id,
    provider: externalDeployment.provider,
  }, async () => {
  const counters = emptyProviderSyncCounters()
  counters.external_deployments_synced = 1

  if (externalDeployment.provider !== 'v0') return counters

  if (!externalDeployment.external_deployment_id) {
    counters.failed = 1
    await updateExternalDeployment(externalDeployment.id, {
      status: 'failed',
      metadata: {
        ...externalDeployment.metadata,
        error_code: 'provider_unavailable',
        error_message: 'External deployment is missing a provider deployment id.',
      },
    }).catch(() => undefined)
    return counters
  }

  const deployment = await client.getDeployment(externalDeployment.external_deployment_id)
  const status = deploymentStatusFromV0(deployment)
  const appDeployment = await readDeploymentOrThrow(externalDeployment.app_deployment_id)
  const environment = externalDeployment.metadata.environment === 'production' ? 'production' : 'preview'
  const diagnostics = await fetchV0DeploymentDiagnostics({
    client,
    appDeployment,
    externalDeployment,
    status,
  })
  if (diagnostics.artifact) counters.artifacts_created += 1

  const metadata: Record<string, unknown> = {
    ...externalDeployment.metadata,
    provider_deployment: {
      id: deployment.id,
      project_id: deployment.projectId ?? null,
      chat_id: deployment.chatId ?? null,
      version_id: deployment.versionId ?? null,
      ready_state: deployment.readyState ?? null,
      api_url: deployment.apiUrl ?? null,
      inspector_url: deployment.inspectorUrl ?? null,
      web_url: deployment.webUrl ?? null,
    },
    ...diagnostics.metadata,
  }

  let receiptArtifact: AppArtifact | null = null
  if (
    status === 'ready'
    && appDeployment.generation_run_id
    && typeof metadata.deployment_receipt_artifact_id !== 'string'
  ) {
    receiptArtifact = await createAppArtifact({
      generationRunId: appDeployment.generation_run_id,
      appDeploymentId: appDeployment.id,
      kind: 'deployment_receipt',
      checksum: stableHash({ provider: 'v0', deployment }),
      metadata: {
        provider: 'v0',
        environment,
        provider_deployment_id: deployment.id,
        external_url: deployment.webUrl ?? null,
        build_log_artifact_id: diagnostics.artifact?.id ?? null,
        deployment,
      },
    })
    counters.artifacts_created += 1
  }

  const updatedExternalDeployment = await updateExternalDeployment(externalDeployment.id, {
    status,
    external_project_id: deployment.projectId ?? externalDeployment.external_project_id ?? null,
    external_deployment_id: deployment.id,
    external_url: deployment.webUrl ?? externalDeployment.external_url ?? null,
    metadata: {
      ...metadata,
      deployment_receipt_artifact_id: receiptArtifact?.id ?? metadata.deployment_receipt_artifact_id ?? null,
      build_log_artifact_id: diagnostics.artifact?.id ?? metadata.build_log_artifact_id ?? null,
    },
  })

  if (status === 'ready') {
    await supabase
      .from('app_deployments')
      .update({
        deployment_target: 'vercel',
        status: environment === 'production' ? 'active' : 'preview',
        preview_url: environment === 'production'
          ? appDeployment.preview_url
          : updatedExternalDeployment.external_url ?? appDeployment.preview_url,
        public_url: environment === 'production'
          ? updatedExternalDeployment.external_url ?? appDeployment.public_url
          : appDeployment.public_url,
        deployed_at: new Date().toISOString(),
      })
      .eq('id', appDeployment.id)

    await recordAppServiceEvent({
      appDeploymentId: appDeployment.id,
      generationRunId: appDeployment.generation_run_id,
      eventType: 'v0_vercel_deployment_ready',
      provider: 'v0',
      externalId: deployment.id,
      message: 'v0/Vercel deployment is ready.',
      payload: {
        external_deployment_id: updatedExternalDeployment.id,
        deployment_receipt_artifact_id: receiptArtifact?.id ?? null,
        build_log_artifact_id: diagnostics.artifact?.id ?? null,
        url: updatedExternalDeployment.external_url,
        environment,
      },
    })
  }

  if (status === 'failed' || status === 'cancelled') {
    counters.failed = 1
    await recordAppServiceEvent({
      appDeploymentId: appDeployment.id,
      generationRunId: appDeployment.generation_run_id,
      eventType: 'v0_vercel_deployment_failed',
      severity: 'error',
      provider: 'v0',
      externalId: deployment.id,
      message: `v0/Vercel deployment ${status}.`,
      payload: {
        provider_deployment: deployment,
        build_log_artifact_id: diagnostics.artifact?.id ?? null,
        provider_errors: metadata.provider_errors ?? null,
      },
    })
  }

  recordAppServiceMetric('v0_vercel_deployment_synced', 1, {
    stage: 'provider.vercel',
    operation: 'syncExternalDeploymentRow',
    orgId: appDeployment.org_id,
    projectId: appDeployment.project_id,
    appDeploymentId: appDeployment.id,
    generationRunId: appDeployment.generation_run_id,
    externalDeploymentId: updatedExternalDeployment.id,
    provider: 'v0',
    slug: appDeployment.slug,
  }, {
    status,
    environment,
    artifacts_created: counters.artifacts_created,
  })

  return counters
  })
}

export async function syncAppServiceProviders(params: {
  limit?: number
} = {}): Promise<AppServiceProviderSyncResult> {
  return withAppServiceSpan('app_service.provider.sync', {
    stage: 'provider.sync',
    operation: 'syncAppServiceProviders',
  }, async () => {
    const limit = Math.max(1, Math.min(params.limit ?? 25, 100))
    const totals = emptyProviderSyncCounters()

    const { data: frontendRows, error: frontendError } = await supabase
      .from('app_frontend_generations')
      .select(APP_FRONTEND_GENERATION_SELECT)
      .eq('provider', 'v0')
      .in('status', ['queued', 'generating'])
      .order('updated_at', { ascending: true })
      .limit(limit)

    if (frontendError) throw frontendError

    const { data: externalRows, error: externalError } = await supabase
      .from('app_external_deployments')
      .select(APP_EXTERNAL_DEPLOYMENT_SELECT)
      .eq('provider', 'v0')
      .in('status', ['queued', 'building'])
      .order('updated_at', { ascending: true })
      .limit(limit)

    if (externalError) throw externalError

    if ((frontendRows?.length ?? 0) === 0 && (externalRows?.length ?? 0) === 0) {
      recordAppServiceMetric('provider_sync_skipped', 1, {
        stage: 'provider.sync',
        operation: 'syncAppServiceProviders',
      }, {
        limit,
      })
      return {
        ...totals,
        skipped: true,
      }
    }

    const client = new V0RestClient()

    for (const row of frontendRows ?? []) {
      const generation = AppFrontendGenerationSchema.parse(row)
      try {
        addProviderSyncCounters(totals, await syncFrontendGenerationRow(generation, client))
      } catch (error) {
        ErrorService.captureException(error as Error, {
          severity: isRetryableProviderError(error) ? 'warning' : 'error',
          ...appServiceErrorContext('syncFrontendGenerationRow', {
            stage: 'provider.sync',
            appDeploymentId: generation.app_deployment_id,
            generationRunId: generation.generation_run_id,
            frontendGenerationId: generation.id,
            provider: generation.provider,
          }),
        })

        if (!isRetryableProviderError(error)) {
          await failFrontendGeneration({
            generation,
            errorCode: error instanceof AppServiceError ? error.code : 'provider_unavailable',
            message: error instanceof Error ? error.message : 'Unknown v0 sync error',
          })
          totals.failed += 1
        }
      }
    }

    for (const row of externalRows ?? []) {
      const externalDeployment = AppExternalDeploymentSchema.parse(row)
      try {
        addProviderSyncCounters(totals, await syncExternalDeploymentRow(externalDeployment, client))
      } catch (error) {
        ErrorService.captureException(error as Error, {
          severity: isRetryableProviderError(error) ? 'warning' : 'error',
          ...appServiceErrorContext('syncExternalDeploymentRow', {
            stage: 'provider.sync',
            appDeploymentId: externalDeployment.app_deployment_id,
            externalDeploymentId: externalDeployment.id,
            provider: externalDeployment.provider,
          }),
        })

        if (!isRetryableProviderError(error)) {
          await updateExternalDeployment(externalDeployment.id, {
            status: 'failed',
            metadata: {
              ...externalDeployment.metadata,
              error_code: error instanceof AppServiceError ? error.code : 'provider_unavailable',
              error_message: redactAppServiceText(error instanceof Error ? error.message : 'Unknown v0 deployment sync error'),
            },
          }).catch(() => undefined)
          totals.failed += 1
        }
      }
    }

    recordAppServiceMetric('provider_sync_completed', 1, {
      stage: 'provider.sync',
      operation: 'syncAppServiceProviders',
    }, {
      ...totals,
      limit,
      frontend_rows: frontendRows?.length ?? 0,
      external_rows: externalRows?.length ?? 0,
    })

    return {
      ...totals,
      skipped: false,
    }
  })
}
