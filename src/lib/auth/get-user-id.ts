'use server'

import { getServerSession } from '@/lib/auth/session'

/**
 * Compatibility wrapper around the verified server-session path.
 *
 * Do not decode auth cookies directly here. Provider-specific JWTs must be
 * verified by the configured auth adapter in `getServerSession()`.
 */
export async function getUserId(): Promise<string | null> {
  const session = await getServerSession()
  return session.userId
}

export async function requireUserId(): Promise<string> {
  const userId = await getUserId()
  if (!userId) {
    throw new Error('Authentication required')
  }
  return userId
}

export async function getPrivyId(): Promise<string | null> {
  return getUserId()
}
