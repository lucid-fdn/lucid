import 'server-only'

import { randomUUID } from 'node:crypto'
import { supabase } from '@/lib/db/client'

const DEFAULT_LOCK_TTL_SECONDS = 300

export class InternalJobLockError extends Error {
  constructor(lockName: string) {
    super(`Failed to acquire internal job lock "${lockName}"`)
    this.name = 'InternalJobLockError'
  }
}

export async function withInternalJobLock<T>(
  lockName: string,
  fn: () => Promise<T>,
  ttlSeconds = DEFAULT_LOCK_TTL_SECONDS,
): Promise<T> {
  const ownerToken = randomUUID()
  const { data, error } = await supabase.rpc('acquire_internal_job_lock', {
    p_lock_name: lockName,
    p_owner_token: ownerToken,
    p_ttl_seconds: ttlSeconds,
  })

  if (error) throw error
  if (data !== true) throw new InternalJobLockError(lockName)

  try {
    return await fn()
  } finally {
    try {
      await supabase.rpc('release_internal_job_lock', {
      p_lock_name: lockName,
      p_owner_token: ownerToken,
      })
    } catch {
      // Best-effort release. TTL ensures stale locks eventually expire.
    }
  }
}
