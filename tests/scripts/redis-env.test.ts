import { afterEach, describe, expect, it } from 'vitest'

import { getRedisRestEnv } from '../../worker/src/redis/env'

const ORIGINAL_ENV = {
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  NEXT_PUBLIC_UPSTASH_REDIS_REST_URL: process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL,
  NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN: process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN,
}

describe('redis REST env resolution', () => {
  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  it('prefers private Redis envs', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://private.example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'private-token'
    process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL = 'https://legacy.example.com'
    process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN = 'legacy-token'

    expect(getRedisRestEnv()).toEqual({
      url: 'https://private.example.com',
      token: 'private-token',
    })
  })

  it('preserves mixed private and legacy fallback during migration', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://private.example.com'
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL
    process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN = 'legacy-token'

    expect(getRedisRestEnv()).toEqual({
      url: 'https://private.example.com',
      token: 'legacy-token',
    })
  })
})
