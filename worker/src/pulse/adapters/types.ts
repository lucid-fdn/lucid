/**
 * Pulse Redis Adapter — Interface
 *
 * Abstraction layer so Pulse works with any Redis backend:
 *   - UpstashAdapter (@upstash/redis — HTTP, SaaS)
 *   - IoredisAdapter (ioredis — TCP, self-hosted / standard Redis)
 *
 * All Pulse code references this interface, never a concrete Redis client.
 * Pipeline exec() always returns normalized raw values (not tuples).
 */

// ─── Pipeline ──────────────────────────────────────────────────────────────────

export interface IPulsePipeline {
  // Basic
  get(key: string): IPulsePipeline
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): IPulsePipeline
  del(...keys: string[]): IPulsePipeline
  incr(key: string): IPulsePipeline
  expire(key: string, seconds: number): IPulsePipeline

  // Sets
  sadd(key: string, ...members: string[]): IPulsePipeline
  srem(key: string, ...members: string[]): IPulsePipeline

  // Sorted sets
  zcard(key: string): IPulsePipeline

  // Hashes
  hincrby(key: string, field: string, increment: number): IPulsePipeline

  // Lists
  rpush(key: string, ...values: string[]): IPulsePipeline
  ltrim(key: string, start: number, stop: number): IPulsePipeline

  // Streams
  xack(key: string, group: string, ...ids: string[]): IPulsePipeline
  xadd(key: string, id: string, ...fieldsAndValues: string[]): IPulsePipeline

  /**
   * Execute all pipelined commands.
   * Returns normalized raw values: [value1, value2, ...].
   * ioredis adapters must transform [[null, val], ...] tuples.
   * Throws on command errors (never returns Error objects).
   */
  exec(): Promise<unknown[]>
}

// ─── Adapter ───────────────────────────────────────────────────────────────────

export interface PulseRedisPendingSummary {
  pending: number
  minId: string | null
  maxId: string | null
  consumers: Array<{ name: string; pending: number }>
}

export interface PulseRedisGroupInfo {
  name: string
  consumers: number
  pending: number
  lastDeliveredId: string | null
  entriesRead: number | null
  lag: number | null
}

export interface IPulseRedisAdapter {
  // Basic operations
  ping(): Promise<string>
  get(key: string): Promise<string | null>
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<string | null>
  del(...keys: string[]): Promise<number>
  incr(key: string): Promise<number>
  decr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<number>

  // Set operations
  sadd(key: string, ...members: string[]): Promise<number>
  srem(key: string, ...members: string[]): Promise<number>
  smembers(key: string): Promise<string[]>
  scard(key: string): Promise<number>

  // Sorted set operations
  zadd(key: string, opts: { nx?: boolean }, ...items: { score: number; member: string }[]): Promise<number | null>
  zcard(key: string): Promise<number>

  // Hash operations
  hincrby(key: string, field: string, increment: number): Promise<number>
  hgetall(key: string): Promise<Record<string, string> | null>

  // List operations
  rpush(key: string, ...values: string[]): Promise<number>
  ltrim(key: string, start: number, stop: number): Promise<string>

  // Sorted set range operations (for retry drainer)
  zrangebyscore(key: string, min: string | number, max: string | number, opts?: { limit?: { offset: number; count: number } }): Promise<string[]>
  zrem(key: string, ...members: string[]): Promise<number>

  // Stream operations
  xadd(key: string, id: string, fields: Record<string, string>, opts?: { maxlen?: number; approximate?: boolean }): Promise<string>
  xreadgroup(
    group: string,
    consumer: string,
    streams: string[],
    ids: string[],
    opts?: { count?: number; block?: number },
  ): Promise<Array<[string, Array<[string, string[]]>]> | null>
  xack(key: string, group: string, ...ids: string[]): Promise<number>
  xgroupCreate(key: string, group: string, id: string, opts?: { mkstream?: boolean }): Promise<string>
  xlen(key: string): Promise<number>
  xpending?(key: string, group: string): Promise<PulseRedisPendingSummary>
  xinfoGroups?(key: string): Promise<PulseRedisGroupInfo[]>

  // Lua scripting
  eval(script: string, keys: string[], args: string[]): Promise<unknown>

  // Pipeline (returns normalized raw values — see IPulsePipeline)
  pipeline(): IPulsePipeline

  // Lifecycle — TCP clients need graceful disconnect
  quit?(): Promise<void>
}
