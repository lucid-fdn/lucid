export type RedisRestEnv = {
  url: string
  token: string
}

let warnedLegacyPublicRedisEnv = false
const LEGACY_REDIS_REST_URL_ENV = ['NEXT_PUBLIC', 'UPSTASH_REDIS_REST_URL'].join('_')
const LEGACY_REDIS_REST_TOKEN_ENV = ['NEXT_PUBLIC', 'UPSTASH_REDIS_REST_TOKEN'].join('_')

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
        '[worker:redis] Safe configuration warning: using legacy NEXT_PUBLIC_UPSTASH_REDIS_REST_* envs. ' +
          'Move Redis credentials to UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
      )
    }
  }

  return { url, token }
}
