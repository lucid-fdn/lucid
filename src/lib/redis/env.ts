import 'server-only'

export type RedisRestEnv = {
  url: string
  token: string
}

let warnedLegacyPublicRedisEnv = false
const LEGACY_REDIS_REST_URL_ENV = ['NEXT_PUBLIC', 'UPSTASH_REDIS_REST_URL'].join('_')
const LEGACY_REDIS_REST_TOKEN_ENV = ['NEXT_PUBLIC', 'UPSTASH_REDIS_REST_TOKEN'].join('_')

/**
 * Server-side Redis REST credentials.
 *
 * `NEXT_PUBLIC_*` Redis tokens are legacy-only: Next.js may expose those names
 * to browser bundles, so production should use the private `UPSTASH_*` names.
 */
export function getRedisRestEnv(): RedisRestEnv | null {
  const privateUrl = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const privateToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  const legacyUrl = process.env[LEGACY_REDIS_REST_URL_ENV]?.trim()
  const legacyToken = process.env[LEGACY_REDIS_REST_TOKEN_ENV]?.trim()

  const url = privateUrl || legacyUrl
  const token = privateToken || legacyToken
  if (!url || !token) return null

  if ((!privateUrl && legacyUrl) || (!privateToken && legacyToken)) {
    if (!warnedLegacyPublicRedisEnv && process.env.NODE_ENV !== 'test') {
      warnedLegacyPublicRedisEnv = true
      console.warn(
        '[Redis] Using legacy public Upstash server env names. ' +
          'Move Redis credentials to private Upstash server env names.',
      )
    }
  }

  return { url, token }
}
