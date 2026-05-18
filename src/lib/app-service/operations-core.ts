import { z } from 'zod'
import type { AppDeployment, AppGenerationRun } from '@contracts/app-service'

export const OrgPublicAppPauseInputSchema = z.object({
  projectId: z.string().uuid().optional(),
  note: z.string().trim().max(2_000).optional(),
  dryRun: z.boolean().default(false),
})

export const RequeueGenerationRunInputSchema = z.object({
  note: z.string().trim().max(2_000).optional(),
})

export type OrgPublicAppPauseInput = z.infer<typeof OrgPublicAppPauseInputSchema>
export type RequeueGenerationRunInput = z.infer<typeof RequeueGenerationRunInputSchema>

export interface GenerationRunRequeueUpdate {
  status: 'queued'
  stage: 'requeued'
  progress: 0
  error_code: null
  error_message: null
  updated_at: string
}

export function isPubliclyReachableAppDeployment(app: Pick<AppDeployment, 'status' | 'visibility'>): boolean {
  return (app.visibility === 'public' || app.visibility === 'unlisted')
    && (app.status === 'active' || app.status === 'preview')
}

export function buildGenerationRunRequeueUpdate(
  run: Pick<AppGenerationRun, 'status'>,
  now = new Date(),
): GenerationRunRequeueUpdate {
  if (run.status !== 'failed') {
    throw new Error('Only failed app generation runs can be requeued.')
  }

  return {
    status: 'queued',
    stage: 'requeued',
    progress: 0,
    error_code: null,
    error_message: null,
    updated_at: now.toISOString(),
  }
}
