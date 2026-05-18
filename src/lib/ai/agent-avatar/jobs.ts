import 'server-only'

import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'
import { isImageGenerationError } from '@/lib/ai/images/errors'
import { generateAgentAvatar } from './generate'
import { getAgentAvatarAssetForOrg, storeAgentAvatarPartialPreview } from './storage'
import type { AgentAvatarAsset, AgentAvatarSpec } from './types'

export type AgentAvatarGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export interface AgentAvatarGenerationJob {
  id: string
  orgId: string
  assistantId?: string | null
  draftId?: string | null
  createdBy?: string | null
  status: AgentAvatarGenerationJobStatus
  spec: AgentAvatarSpec
  assetId?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  lockedBy?: string | null
  nextAttemptAt?: string | null
  progressStage?: string | null
  progressPercent?: number | null
  partialAssets?: Array<{ index: number; url: string; storagePath?: string; createdAt: string }> | null
  attempts: number
  maxAttempts: number
  createdAt: string
  updatedAt: string
  asset?: AgentAvatarAsset | null
}

type JobRow = {
  id: string
  org_id: string
  assistant_id: string | null
  draft_id: string | null
  created_by: string | null
  status: AgentAvatarGenerationJobStatus
  spec: AgentAvatarSpec
  asset_id: string | null
  error_code: string | null
  error_message: string | null
  locked_by?: string | null
  next_attempt_at?: string | null
  progress_stage?: string | null
  progress_percent?: number | null
  partial_assets?: Array<{ index: number; url: string; storagePath?: string; createdAt: string }> | null
  attempts: number
  max_attempts: number
  created_at: string
  updated_at: string
}

const JOB_COLUMNS = 'id, org_id, assistant_id, draft_id, created_by, status, spec, asset_id, error_code, error_message, locked_by, next_attempt_at, progress_stage, progress_percent, partial_assets, attempts, max_attempts, created_at, updated_at'

function hydrateSpec(spec: AgentAvatarSpec): AgentAvatarSpec {
  return {
    ...spec,
    genderPresentation: spec.genderPresentation ?? 'auto',
    pose: spec.pose ?? 'standard-portrait',
  }
}

function mapJob(row: JobRow): AgentAvatarGenerationJob {
  return {
    id: row.id,
    orgId: row.org_id,
    assistantId: row.assistant_id,
    draftId: row.draft_id,
    createdBy: row.created_by,
    status: row.status,
    spec: hydrateSpec(row.spec),
    assetId: row.asset_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    lockedBy: row.locked_by,
    nextAttemptAt: row.next_attempt_at,
    progressStage: row.progress_stage,
    progressPercent: row.progress_percent,
    partialAssets: row.partial_assets,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    asset: null,
  }
}

export function serializeAgentAvatarJob(job: AgentAvatarGenerationJob) {
  return {
    id: job.id,
    status: job.status,
    assetId: job.assetId,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    progressStage: job.progressStage,
    progressPercent: job.progressPercent,
    partialAssets: job.partialAssets ?? [],
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    data: job.asset
      ? {
          id: job.asset.id,
          status: 'succeeded',
          url: job.asset.url,
          provider: job.asset.provider,
          model: job.asset.model,
          width: job.asset.width,
          height: job.asset.height,
          mimeType: job.asset.mimeType,
          genderPresentation: job.asset.genderPresentation ?? (job.asset.metadata.genderPresentation as string | undefined),
          pose: job.asset.pose ?? (job.asset.metadata.pose as string | undefined),
          metadata: {
            ...job.asset.metadata,
            promptVersion: job.asset.promptVersion,
            stylePreset: job.asset.stylePreset,
            angle: job.asset.angle,
            crop: job.asset.crop,
            expression: job.asset.expression,
            background: job.asset.background,
            lighting: job.asset.lighting,
            genderPresentation: job.asset.genderPresentation ?? job.asset.metadata.genderPresentation,
            pose: job.asset.pose ?? job.asset.metadata.pose,
          },
        }
      : null,
  }
}

export async function createAgentAvatarGenerationJob(spec: AgentAvatarSpec): Promise<AgentAvatarGenerationJob> {
  const { data, error } = await supabase
    .from('agent_avatar_generation_jobs')
    .insert({
      org_id: spec.orgId,
      assistant_id: spec.assistantId ?? null,
      draft_id: spec.draftId ?? null,
      created_by: spec.userId,
      status: 'queued',
      spec,
      max_attempts: 2,
      metadata: {
        feature: 'agent-avatar-generation',
        promptVersion: spec.promptVersion,
        stylePreset: spec.stylePreset,
      },
    })
    .select(JOB_COLUMNS)
    .single()

  if (error) throw error
  return mapJob(data as JobRow)
}

export async function getAgentAvatarGenerationJob(input: {
  jobId: string
  orgId: string
}): Promise<AgentAvatarGenerationJob | null> {
  const { data, error } = await supabase
    .from('agent_avatar_generation_jobs')
    .select(JOB_COLUMNS)
    .eq('id', input.jobId)
    .eq('org_id', input.orgId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const job = mapJob(data as JobRow)
  if (job.assetId) {
    job.asset = await getAgentAvatarAssetForOrg({
      assetId: job.assetId,
      orgId: input.orgId,
      assistantId: job.assistantId ?? undefined,
    })
  }
  return job
}

function errorCode(error: unknown): string {
  if (isImageGenerationError(error)) return error.code
  return 'avatar_generation_failed'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isNonRetryableGenerationError(error: unknown): boolean {
  return isImageGenerationError(error) && [
    'missing_credentials',
    'capability_unavailable',
    'provider_quota_exceeded',
    'invalid_reference_image',
    'invalid_request',
  ].includes(error.code)
}

function nextAttemptAt(attempts: number): string {
  const delayMs = Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 5 * 60_000)
  return new Date(Date.now() + delayMs).toISOString()
}

export async function claimNextAgentAvatarGenerationJobs(input: {
  workerId: string
  limit?: number
  staleAfterSeconds?: number
}): Promise<AgentAvatarGenerationJob[]> {
  const { data, error } = await supabase.rpc('claim_next_agent_avatar_generation_jobs', {
    p_worker_id: input.workerId,
    p_limit: input.limit ?? 1,
    p_stale_after_seconds: input.staleAfterSeconds ?? 900,
  })

  if (error) throw error
  return ((data ?? []) as JobRow[]).map(mapJob)
}

export async function processClaimedAgentAvatarGenerationJob(
  job: AgentAvatarGenerationJob,
): Promise<AgentAvatarGenerationJob> {
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled') {
    return job
  }
  if (job.status !== 'running') {
    throw new Error(`Avatar generation job ${job.id} must be claimed before processing`)
  }

  try {
    await supabase
      .from('agent_avatar_generation_jobs')
      .update({
        progress_stage: 'starting',
        progress_percent: 5,
        partial_assets: [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    let renderProgressPercent = 8
    let sawPartialPreview = false
    let progressUpdateInFlight = false
    const progressTimer = setInterval(() => {
      if (sawPartialPreview || progressUpdateInFlight) return
      progressUpdateInFlight = true
      renderProgressPercent = Math.min(78, renderProgressPercent + 6)
      void supabase
        .from('agent_avatar_generation_jobs')
        .update({
          progress_stage: 'rendering',
          progress_percent: renderProgressPercent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .then(() => {
          progressUpdateInFlight = false
        }, () => {
          progressUpdateInFlight = false
        })
    }, 4000)
    progressTimer.unref?.()

    let asset: AgentAvatarAsset
    try {
      asset = await generateAgentAvatar(job.spec, {
        onProgress: async (event) => {
          if (event.type !== 'partial_image' || !event.b64Json) return
          sawPartialPreview = true
          const index = event.partialImageIndex ?? 0
          const stored = await storeAgentAvatarPartialPreview({
            spec: job.spec,
            jobId: job.id,
            partialImageIndex: index,
            b64Json: event.b64Json,
            mimeType: event.outputFormat === 'png'
              ? 'image/png'
              : event.outputFormat === 'jpeg'
                ? 'image/jpeg'
                : 'image/webp',
          })
          const partial = {
            index,
            url: stored.url,
            storagePath: stored.storagePath,
            createdAt: new Date().toISOString(),
          }
          const currentPartials = job.partialAssets ?? []
          const nextPartials = [
            ...currentPartials.filter((item) => item.index !== index),
            partial,
          ].sort((a, b) => a.index - b.index)
          job.partialAssets = nextPartials
          await supabase
            .from('agent_avatar_generation_jobs')
            .update({
              progress_stage: 'preview',
              progress_percent: Math.min(85, 20 + ((index + 1) * 20)),
              partial_assets: nextPartials,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id)
        },
      })
    } finally {
      clearInterval(progressTimer)
    }
    const { data, error } = await supabase
      .from('agent_avatar_generation_jobs')
      .update({
        status: 'succeeded',
        asset_id: asset.id,
        error_code: null,
        error_message: null,
        locked_by: null,
        locked_at: null,
        next_attempt_at: null,
        progress_stage: 'completed',
        progress_percent: 100,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .select(JOB_COLUMNS)
      .single()

    if (error) throw error
    return { ...mapJob(data as JobRow), asset }
  } catch (error) {
    const code = errorCode(error)
    const message = errorMessage(error)
    const exhausted = job.attempts >= job.maxAttempts || isNonRetryableGenerationError(error)
    const { data, error: updateError } = await supabase
      .from('agent_avatar_generation_jobs')
      .update({
        status: exhausted ? 'failed' : 'queued',
        error_code: code,
        error_message: message,
        locked_by: null,
        locked_at: null,
        next_attempt_at: exhausted ? null : nextAttemptAt(job.attempts),
        progress_stage: exhausted ? 'failed' : 'retrying',
        progress_percent: null,
        failed_at: exhausted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .select(JOB_COLUMNS)
      .single()

    ErrorService.captureException(error as Error, {
      severity: exhausted ? 'error' : 'warning',
      context: { jobId: job.id, assistantId: job.assistantId, orgId: job.orgId },
      tags: { layer: 'ai', feature: 'agent-avatar-generation' },
    })

    if (updateError) throw updateError
    return data ? mapJob(data as JobRow) : {
      ...job,
      status: exhausted ? 'failed' : 'queued',
      errorCode: code,
      errorMessage: message,
      nextAttemptAt: exhausted ? null : nextAttemptAt(job.attempts),
    }
  }
}
