/**
 * Upstash Redis Adapter
 *
 * Thin wrapper around @upstash/redis HTTP client.
 * Pipeline results are already raw values — pass-through.
 * Used for SaaS (Upstash Redis REST API).
 *
 * Note: Upstash SDK uses strict discriminated union types for set/zadd opts.
 * Our adapter interface uses a simpler optional-field shape, so we cast
 * through `any` at the boundary. This is safe because the underlying
 * SDK validates at runtime.
 */

import type { Redis } from '@upstash/redis'
import type { IPulseRedisAdapter, IPulsePipeline } from './types.js'

export class UpstashAdapter implements IPulseRedisAdapter {
  private redis: Redis

  constructor(client: Redis) {
    this.redis = client
  }

  // ─── Basic ──────────────────────────────────────────────────────────────────

  async ping(): Promise<string> {
    return this.redis.ping()
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key)
  }

  async set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<string | null> {
    // Upstash SDK expects discriminated union — cast through any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.redis.set(key, value, opts as any)
  }

  async del(...keys: string[]): Promise<number> {
    return this.redis.del(...keys)
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key)
  }

  async decr(key: string): Promise<number> {
    return this.redis.decr(key)
  }

  async expire(key: string, seconds: number): Promise<number> {
    const ok = await this.redis.expire(key, seconds)
    return ok ? 1 : 0
  }

  // ─── Sets ───────────────────────────────────────────────────────────────────

  async sadd(key: string, ...members: string[]): Promise<number> {
    // Upstash SDK expects tuple type — cast through any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.redis.sadd as any)(key, ...members)
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.redis.srem(key, ...members)
  }

  async smembers(key: string): Promise<string[]> {
    return this.redis.smembers(key)
  }

  async scard(key: string): Promise<number> {
    return this.redis.scard(key)
  }

  // ─── Sorted Sets ────────────────────────────────────────────────────────────

  async zadd(key: string, opts: { nx?: boolean }, ...items: { score: number; member: string }[]): Promise<number | null> {
    // Upstash SDK expects strict NX type — cast through any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.redis.zadd as any)(key, opts, ...items)
  }

  async zcard(key: string): Promise<number> {
    return this.redis.zcard(key)
  }

  // ─── Hashes ─────────────────────────────────────────────────────────────────

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return this.redis.hincrby(key, field, increment)
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    const result = await this.redis.hgetall(key) as Record<string, string> | null
    if (!result || Object.keys(result).length === 0) return null
    return result
  }

  // ─── Lists ──────────────────────────────────────────────────────────────────

  async rpush(key: string, ...values: string[]): Promise<number> {
    return this.redis.rpush(key, ...values)
  }

  async ltrim(key: string, start: number, stop: number): Promise<string> {
    return this.redis.ltrim(key, start, stop)
  }

  // ─── Sorted Set Range (for retry drainer) ───────────────────────────────────

  async zrangebyscore(
    _key: string, _min: string | number, _max: string | number,
    _opts?: { limit?: { offset: number; count: number } },
  ): Promise<string[]> {
    throw new Error('Streams/retry not supported on Upstash HTTP adapter — use REDIS_URL with ioredis')
  }

  async zrem(_key: string, ..._members: string[]): Promise<number> {
    throw new Error('Streams/retry not supported on Upstash HTTP adapter — use REDIS_URL with ioredis')
  }

  // ─── Streams (not supported on Upstash HTTP) ──────────────────────────────

  async xadd(
    _key: string, _id: string, _fields: Record<string, string>,
    _opts?: { maxlen?: number; approximate?: boolean },
  ): Promise<string> {
    throw new Error('Streams not supported on Upstash HTTP adapter — use REDIS_URL with ioredis')
  }

  async xreadgroup(
    _group: string, _consumer: string, _streams: string[], _ids: string[],
    _opts?: { count?: number; block?: number },
  ): Promise<Array<[string, Array<[string, string[]]>]> | null> {
    throw new Error('Streams not supported on Upstash HTTP adapter — use REDIS_URL with ioredis')
  }

  async xack(_key: string, _group: string, ..._ids: string[]): Promise<number> {
    throw new Error('Streams not supported on Upstash HTTP adapter — use REDIS_URL with ioredis')
  }

  async xgroupCreate(
    _key: string, _group: string, _id: string, _opts?: { mkstream?: boolean },
  ): Promise<string> {
    throw new Error('Streams not supported on Upstash HTTP adapter — use REDIS_URL with ioredis')
  }

  async xlen(_key: string): Promise<number> {
    throw new Error('Streams not supported on Upstash HTTP adapter — use REDIS_URL with ioredis')
  }

  // ─── Lua ────────────────────────────────────────────────────────────────────

  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    return this.redis.eval(script, keys, args)
  }

  // ─── Pipeline ───────────────────────────────────────────────────────────────

  pipeline(): IPulsePipeline {
    return new UpstashPipelineAdapter(this.redis.pipeline())
  }
}

// ─── Pipeline Adapter ─────────────────────────────────────────────────────────

class UpstashPipelineAdapter implements IPulsePipeline {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private p: any // Upstash Pipeline type is complex — we only call standard methods

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(p: any) {
    this.p = p
  }

  get(key: string) { this.p.get(key); return this }
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }) {
    this.p.set(key, value, opts ?? {}); return this
  }
  del(...keys: string[]) { this.p.del(...keys); return this }
  incr(key: string) { this.p.incr(key); return this }
  expire(key: string, seconds: number) { this.p.expire(key, seconds); return this }
  sadd(key: string, ...members: string[]) { this.p.sadd(key, ...members); return this }
  srem(key: string, ...members: string[]) { this.p.srem(key, ...members); return this }
  zcard(key: string) { this.p.zcard(key); return this }
  hincrby(key: string, field: string, increment: number) { this.p.hincrby(key, field, increment); return this }
  rpush(key: string, ...values: string[]) { this.p.rpush(key, ...values); return this }
  ltrim(key: string, start: number, stop: number) { this.p.ltrim(key, start, stop); return this }

  xack(_key: string, _group: string, ..._ids: string[]): IPulsePipeline {
    throw new Error('Streams not supported on Upstash HTTP adapter — use REDIS_URL with ioredis')
  }

  xadd(_key: string, _id: string, ..._fieldsAndValues: string[]): IPulsePipeline {
    throw new Error('Streams not supported on Upstash HTTP adapter — use REDIS_URL with ioredis')
  }

  async exec(): Promise<unknown[]> {
    return this.p.exec()
  }
}
