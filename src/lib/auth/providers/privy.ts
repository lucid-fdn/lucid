/**
 * Privy Auth Provider — wraps existing Privy integration.
 *
 * Active when AUTH_PROVIDER=privy (cloud default).
 */

import 'server-only'
import { PrivyClient } from '@privy-io/server-auth'
import { resolveExistingInternalUserId, resolveInternalUserId } from './resolve-user'
import type { AuthProvider, AuthSession } from '../adapter'

let privyClient: PrivyClient | null = null

function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
    const appSecret = process.env.PRIVY_APP_SECRET
    if (!appId || !appSecret) throw new Error('Privy credentials not configured')
    privyClient = new PrivyClient(appId, appSecret)
  }
  return privyClient
}

export class PrivyAuthProvider implements AuthProvider {
  readonly tokenCookieNames = [
    'lucid-auth-token',
    'privy-token',
    'privy-id-token',
    'privy-refresh-token',
  ]

  async verifyToken(token: string): Promise<AuthSession | null> {
    try {
      const privy = getPrivyClient()
      const claims = await privy.verifyAuthToken(token)
      const privyUserId = claims.userId

      const existingInternalUserId = await resolveExistingInternalUserId('privy', privyUserId)
      if (existingInternalUserId) {
        return {
          userId: existingInternalUserId,
          externalId: privyUserId,
        }
      }

      // Fetch user profile from Privy for avatar/display name
      let email: string | undefined
      let avatarUrl: string | undefined
      let displayName: string | undefined

      try {
        const privyUser = await privy.getUser(privyUserId)
        email = privyUser.email?.address

        avatarUrl =
          (privyUser.discord as Record<string, unknown> | undefined)?.profilePictureUrl as string | undefined ||
          (privyUser.twitter as Record<string, unknown> | undefined)?.profilePictureUrl as string | undefined

        displayName = (privyUser.google as Record<string, unknown> | undefined)?.name as string | undefined
        if (!displayName && email) {
          displayName = email.split('@')[0]
        }
      } catch {
        // Profile fetch failed — proceed with minimal info
      }

      const internalUserId = await resolveInternalUserId({
        provider: 'privy',
        externalId: privyUserId,
        email,
        avatarUrl,
        displayName,
      })

      if (!internalUserId) return null

      return {
        userId: internalUserId,
        externalId: privyUserId,
      }
    } catch {
      return null
    }
  }

  async getExternalId(token: string): Promise<string | null> {
    try {
      const privy = getPrivyClient()
      const claims = await privy.verifyAuthToken(token)
      return claims.userId
    } catch {
      return null
    }
  }
}
