/**
 * ioredis Redis Adapter
 *
 * Wraps standard Redis TCP client (ioredis) into IPulseRedisAdapter.
 * Handles key differences from Upstash:
 *   - Pipeline results: [[null, val], ...] → [val, ...] (normalized)
 *   - zadd: positional args with NX flag
 *   - set: positional args with EX/NX flags
 *   - eval: requires key count as second arg
 *   - hgetall: returns {} for missing keys (normalized to null)
 *
 * Used for self-hosted (docker-compose redis:6379) and any standard Redis.
 */

import { createRequire } from 'module'
import type { IPulseRedisAdapter, IPulsePipeline, PulseRedisGroupInfo, PulseRedisPendingSummary } from './types.js'

// createRequire is the ESM-safe way to load CommonJS modules (ioredis ships CJS).
// Plain `require()` is not available in NodeNext/ESM modules.
const _require = createRequire(import.meta.url)

export class IoredisAdapter implements IPulseRedisAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private redis: any
  private connected = false

  constructor(opts: { url: string }) {
    const IoRedis = _require('ioredis')
    const RedisClass = IoRedis.default || IoRedis
    this.redis = new RedisClass(opts.url, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      connectTimeout: 10000,
      lazyConnect: true,
      // TCP keepalive prevents Railway/cloud proxies from closing idle connections.
      // Value is in milliseconds (ioredis passes to socket.setKeepAlive(true, ms)).
      // 10s interval is well below typical idle-timeout thresholds (30-60s).
      keepAlive: 10_000,
      // ioredis auto-reconnect: back off linearly up to 3s, then stay there.
      retryStrategy: (times: number) => Math.min(times * 500, 3000),
    })
  }

  /** @internal Create adapter wrapping an existing client (for testing) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static _fromClient(client: any): IoredisAdapter {
    const adapter = Object.create(IoredisAdapter.prototype) as IoredisAdapter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(adapter as any).redis = client
    ;(adapter as any).connected = false
    return adapter
  }

  async connect(): Promise<void> {
    if (this.connected) return
    await this.redis.connect()
    this.connected = true
  }

  // ─── Basic ──────────────────────────────────────────────────────────────────

  async ping(): Promise<string> {
    return this.redis.ping()
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key)
  }

  async set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<string | null> {
    // ioredis set: key, value, [EX, seconds], [NX]
    const args: (string | number)[] = [key, value]
    if (opts?.ex) { args.push('EX', opts.ex) }
    if (opts?.nx) { args.push('NX') }
    return this.redis.set(...args)
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
    return this.redis.expire(key, seconds)
  }

  // ─── Sets ───────────────────────────────────────────────────────────────────

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.redis.sadd(key, ...members)
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
    // ioredis zadd: key [NX] score member [score member ...]
    const args: (string | number)[] = []
    if (opts.nx) args.push('NX')
    for (const item of items) {
      args.push(item.score, item.member)
    }
    return this.redis.zadd(key, ...args)
  }

  async zcard(key: string): Promise<number> {
    return this.redis.zcard(key)
  }

  // ─── Hashes ─────────────────────────────────────────────────────────────────

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return this.redis.hincrby(key, field, increment)
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    const result = await this.redis.hgetall(key)
    // ioredis returns {} for missing keys — normalize to null
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

  // ─── Sorted Set Range ──────────────────────────────────────────────────────

  async zrangebyscore(key: string, min: string | number, max: string | number, opts?: { limit?: { offset: number; count: number } }): Promise<string[]> {
    const args: (string | number)[] = [key, min, max]
    if (opts?.limit) {
      args.push('LIMIT', opts.limit.offset, opts.limit.count)
    }
    return this.redis.zrangebyscore(...args)
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    return this.redis.zrem(key, ...members)
  }

  // ─── Streams ──────────────────────────────────────────────────────────────

  async xadd(key: string, id: string, fields: Record<string, string>, opts?: { maxlen?: number; approximate?: boolean }): Promise<string> {
    // ioredis xadd: key [MAXLEN [~] count] id field value [field value ...]
    const args: (string | number)[] = [key]
    if (opts?.maxlen) {
      args.push('MAXLEN')
      if (opts.approximate) args.push('~')
      args.push(opts.maxlen)
    }
    args.push(id)
    for (const [field, value] of Object.entries(fields)) {
      args.push(field, value)
    }
    return this.redis.xadd(...args)
  }

  async xreadgroup(
    group: string,
    consumer: string,
    streams: string[],
    ids: string[],
    opts?: { count?: number; block?: number },
  ): Promise<Array<[string, Array<[string, string[]]>]> | null> {
    // ioredis xreadgroup: GROUP group consumer [COUNT n] [BLOCK ms] STREAMS key [key ...] id [id ...]
    const args: (string | number)[] = ['GROUP', group, consumer]
    if (opts?.count) { args.push('COUNT', opts.count) }
    if (opts?.block !== undefined) { args.push('BLOCK', opts.block) }
    args.push('STREAMS', ...streams, ...ids)
    return this.redis.xreadgroup(...args)
  }

  async xack(key: string, group: string, ...ids: string[]): Promise<number> {
    return this.redis.xack(key, group, ...ids)
  }

  async xgroupCreate(key: string, group: string, id: string, opts?: { mkstream?: boolean }): Promise<string> {
    const args: string[] = [key, group, id]
    if (opts?.mkstream) args.push('MKSTREAM')
    return this.redis.xgroup('CREATE', ...args)
  }

  async xlen(key: string): Promise<number> {
    return this.redis.xlen(key)
  }

  async xpending(key: string, group: string): Promise<PulseRedisPendingSummary> {
    const raw = await this.redis.xpending(key, group)
    if (!Array.isArray(raw)) {
      return { pending: 0, minId: null, maxId: null, consumers: [] }
    }

    const consumersRaw = Array.isArray(raw[3]) ? raw[3] : []
    const consumers = consumersRaw.map((entry: unknown) => {
      if (Array.isArray(entry)) {
        return { name: String(entry[0] ?? ''), pending: Number(entry[1] ?? 0) || 0 }
      }
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>
        return { name: String(record.name ?? record.consumer ?? ''), pending: Number(record.pending ?? 0) || 0 }
      }
      return { name: '', pending: 0 }
    }).filter((entry) => entry.name)

    return {
      pending: Number(raw[0] ?? 0) || 0,
      minId: raw[1] ? String(raw[1]) : null,
      maxId: raw[2] ? String(raw[2]) : null,
      consumers,
    }
  }

  async xinfoGroups(key: string): Promise<PulseRedisGroupInfo[]> {
    const raw = await this.redis.xinfo('GROUPS', key)
    if (!Array.isArray(raw)) return []

    return raw.map((groupRaw: unknown) => {
      const record = Array.isArray(groupRaw)
        ? this.normalizeInfoPairs(groupRaw)
        : (groupRaw && typeof groupRaw === 'object' ? groupRaw as Record<string, unknown> : {})

      return {
        name: String(record.name ?? ''),
        consumers: Number(record.consumers ?? 0) || 0,
        pending: Number(record.pending ?? 0) || 0,
        lastDeliveredId: record['last-delivered-id'] ? String(record['last-delivered-id']) : null,
        entriesRead: record['entries-read'] === null || record['entries-read'] === undefined
          ? null
          : Number(record['entries-read']) || 0,
        lag: record.lag === null || record.lag === undefined ? null : Number(record.lag) || 0,
      }
    }).filter((group) => group.name)
  }

  private normalizeInfoPairs(values: unknown[]): Record<string, unknown> {
    const record: Record<string, unknown> = {}
    for (let i = 0; i < values.length; i += 2) {
      record[String(values[i])] = values[i + 1]
    }
    return record
  }

  // ─── Lua ────────────────────────────────────────────────────────────────────

  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    // ioredis eval: script, numkeys, ...keys, ...args
    return this.redis.eval(script, keys.length, ...keys, ...args)
  }

  // ─── Pipeline ───────────────────────────────────────────────────────────────

  pipeline(): IPulsePipeline {
    return new IoredisPipelineAdapter(this.redis.pipeline())
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async quit(): Promise<void> {
    try {
      await this.redis.quit()
    } catch {
      // TCP client may fail if never connected or already disconnected
    }
    this.connected = false
  }
}

// ─── Pipeline Adapter ─────────────────────────────────────────────────────────

/** @internal Exported for testing */
export class IoredisPipelineAdapter implements IPulsePipeline {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private p: any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(p: any) {
    this.p = p
  }

  get(key: string) { this.p.get(key); return this }
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }) {
    const args: (string | number)[] = [key, value]
    if (opts?.ex) { args.push('EX', opts.ex) }
    if (opts?.nx) { args.push('NX') }
    this.p.set(...args)
    return this
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
  xack(key: string, group: string, ...ids: string[]) { this.p.xack(key, group, ...ids); return this }
  xadd(key: string, id: string, ...fieldsAndValues: string[]) { this.p.xadd(key, id, ...fieldsAndValues); return this }

  async exec(): Promise<unknown[]> {
    const results = await this.p.exec()
    if (!results) return []

    // Normalize ioredis tuples: [[err, val], [err, val], ...] → [val, val, ...]
    // Throw on first command error (Pulse consumers assume raw values)
    return results.map((tuple: [Error | null, unknown], i: number) => {
      const [err, val] = tuple
      if (err) {
        throw new Error(`Pipeline command ${i} failed: ${err.message}`)
      }
      return val
    })
  }
}
