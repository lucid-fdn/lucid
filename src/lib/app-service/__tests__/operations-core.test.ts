import { describe, expect, it } from 'vitest'
import type { AppDeployment, AppGenerationRun } from '@contracts/app-service'
import {
  buildGenerationRunRequeueUpdate,
  isPubliclyReachableAppDeployment,
} from '../operations-core'

const app: Pick<AppDeployment, 'status' | 'visibility'> = {
  status: 'active',
  visibility: 'public',
}

const failedRun: Pick<AppGenerationRun, 'status'> = {
  status: 'failed',
}

describe('operations core', () => {
  it('identifies publicly reachable app deployments for org-wide pause', () => {
    expect(isPubliclyReachableAppDeployment(app)).toBe(true)
    expect(isPubliclyReachableAppDeployment({ status: 'preview', visibility: 'unlisted' })).toBe(true)
    expect(isPubliclyReachableAppDeployment({ status: 'paused', visibility: 'public' })).toBe(false)
    expect(isPubliclyReachableAppDeployment({ status: 'active', visibility: 'private' })).toBe(false)
    expect(isPubliclyReachableAppDeployment({ status: 'archived', visibility: 'public' })).toBe(false)
  })

  it('builds a requeue update only for failed generation runs', () => {
    expect(buildGenerationRunRequeueUpdate(failedRun, new Date('2026-04-29T10:00:00.000Z'))).toEqual({
      status: 'queued',
      stage: 'requeued',
      progress: 0,
      error_code: null,
      error_message: null,
      updated_at: '2026-04-29T10:00:00.000Z',
    })

    expect(() => buildGenerationRunRequeueUpdate({ status: 'cancelled' })).toThrow('Only failed')
    expect(() => buildGenerationRunRequeueUpdate({ status: 'succeeded' })).toThrow('Only failed')
  })
})
