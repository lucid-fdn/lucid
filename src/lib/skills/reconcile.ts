import 'server-only'

import { upsertMirroredSkills } from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { withInternalJobLock } from '@/lib/locks/internal-job-lock'
import { listMcpgateSkills } from './mcpgate'
import { publishInternalSkillsToMcpgate } from './publish'

export interface SkillReconcileResult {
  mode: 'publish' | 'sync' | 'publish_and_sync'
  publish: {
    discovered: number
    published: number
    skipped: number
  }
  fetched: number
  upserted: number
  skipped?: 'locked'
}

export async function reconcileSkillCatalog(
  mode: SkillReconcileResult['mode'] = 'publish_and_sync',
): Promise<SkillReconcileResult> {
  try {
    return await withInternalJobLock('skills:catalog-reconcile', async () => {
      let publish = { discovered: 0, published: 0, skipped: 0 }
      if (mode === 'publish' || mode === 'publish_and_sync') {
        publish = await publishInternalSkillsToMcpgate()
      }

      let fetched = 0
      let upserted = 0
      if (mode === 'sync' || mode === 'publish_and_sync') {
        const skills = await listMcpgateSkills()
        fetched = skills.length
        upserted = await upsertMirroredSkills(skills)
      }

      return {
        mode,
        publish,
        fetched,
        upserted,
      }
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'InternalJobLockError') {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { mode, lockName: 'skills:catalog-reconcile' },
        tags: { layer: 'cron', job: 'skills-reconcile', state: 'lock-contention' },
      })

      return {
        mode,
        publish: { discovered: 0, published: 0, skipped: 0 },
        fetched: 0,
        upserted: 0,
        skipped: 'locked',
      }
    }

    throw error
  }
}
