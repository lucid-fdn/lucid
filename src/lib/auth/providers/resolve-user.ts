/**
 * Shared user resolution — identity lookup + JIT creation.
 *
 * Used by both LocalAuthProvider and PrivyAuthProvider.
 * Routes all DB access through @/lib/db layer.
 */

import 'server-only'
import { lookupIdentityLink, addIdentityLink } from '@/lib/db'
import { updateLastLogin } from '@/lib/db/users'
import { generateUniqueHandle } from '../handle'
import { ErrorService } from '@/lib/errors/error-service'
import { supabase } from '@/lib/db/client'

export interface UserResolutionInput {
  provider: 'local' | 'privy'
  externalId: string
  email?: string
  avatarUrl?: string
  displayName?: string
}

const IDENTITY_LINK_CACHE_TTL_MS = 60_000
const identityLinkCache = new Map<string, {
  expiresAt: number
  userId: string
}>()

function identityCacheKey(provider: string, externalId: string): string {
  return `${provider}:${externalId}`
}

export async function resolveExistingInternalUserId(
  provider: UserResolutionInput['provider'],
  externalId: string,
): Promise<string | null> {
  const cacheKey = identityCacheKey(provider, externalId)
  const cached = identityLinkCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.userId
  }

  const existingUserId = await lookupIdentityLink(provider, externalId)
  if (!existingUserId) return null

  identityLinkCache.set(cacheKey, {
    expiresAt: Date.now() + IDENTITY_LINK_CACHE_TTL_MS,
    userId: existingUserId,
  })
  updateLastLogin(existingUserId).catch(() => {})
  return existingUserId
}

/**
 * Resolve an external provider identity to an internal user ID.
 * Creates user via JIT (Just-In-Time) if not found.
 */
export async function resolveInternalUserId(
  input: UserResolutionInput
): Promise<string | null> {
  const { provider, externalId, email, avatarUrl, displayName } = input

  // 1. Check identity_links for existing user
  const existingUserId = await resolveExistingInternalUserId(provider, externalId)
  if (existingUserId) {
    return existingUserId
  }

  // 2. JIT create via create_user_atomic RPC
  try {
    const handle = await generateUniqueHandle({
      email: email ? { address: email } : undefined,
    })

    const resolvedDisplayName = displayName ?? (email ? email.split('@')[0] : undefined)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const result = (await (supabase.rpc as Function)('create_user_atomic', {
      p_privy_id: externalId,
      p_handle: handle,
      p_email: email || null,
      p_avatar_url: avatarUrl || null,
      p_first_name: resolvedDisplayName || null,
      p_last_name: null,
      p_provider: provider,
    })) as { data: string | null; error: unknown }

    if (result.error || !result.data) {
      ErrorService.captureException(
        result.error || new Error('create_user_atomic returned null'),
        {
          severity: 'error',
          context: { externalId, provider, operation: 'jit_create' },
          tags: { layer: 'auth', provider },
        }
      )
      return null
    }

    // 3. Insert identity_link
    try {
      await addIdentityLink(result.data, provider, externalId)
    } catch {
      // Non-fatal — link may already exist from a race condition
    }

    identityLinkCache.set(identityCacheKey(provider, externalId), {
      expiresAt: Date.now() + IDENTITY_LINK_CACHE_TTL_MS,
      userId: result.data,
    })

    return result.data
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { externalId, provider, operation: 'jit_create' },
      tags: { layer: 'auth', provider },
    })
    return null
  }
}
