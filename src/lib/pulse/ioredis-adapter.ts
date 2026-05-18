import 'server-only'

import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

type PipelineResultTuple = [Error | null, unknown]

export interface ControlPlanePulsePipeline {
  incr(key: string): ControlPlanePulsePipeline
  expire(key: string, seconds: number): ControlPlanePulsePipeline
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): ControlPlanePulsePipeline
  sadd(key: string, ...members: string[]): ControlPlanePulsePipeline
  srem(key: string, ...members: string[]): ControlPlanePulsePipeline
  hincrby(key: string, field: string, increment: number): ControlPlanePulsePipeline
  exec(): Promise<unknown[]>
}

export interface ControlPlanePulseRedis {
  ping(): Promise<string>
  get(key: string): Promise<string | null>
  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<string | null>
  del(...keys: string[]): Promise<number>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<number>
  sadd(key: string, ...members: string[]): Promise<number>
  srem(key: string, ...members: string[]): Promise<number>
  hincrby(key: string, field: string, increment: number): Promise<number>
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
  eval(script: string, keys: string[], args: string[]): Promise<unknown>
  pipeline(): ControlPlanePulsePipeline
  quit(): Promise<void>
}

class IoredisPipelineAdapter implements ControlPlanePulsePipeline {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly pipelineClient: any) {}

  incr(key: string) {
    this.pipelineClient.incr(key)
    return this
  }

  expire(key: string, seconds: number) {
    this.pipelineClient.expire(key, seconds)
    return this
  }

  set(key: string, value: string, opts?: { nx?: boolean; ex?: number }) {
    const args: Array<string | number> = [key, value]
    if (opts?.ex) args.push('EX', opts.ex)
    if (opts?.nx) args.push('NX')
    this.pipelineClient.set(...args)
    return this
  }

  sadd(key: string, ...members: string[]) {
    this.pipelineClient.sadd(key, ...members)
    return this
  }

  srem(key: string, ...members: string[]) {
    this.pipelineClient.srem(key, ...members)
    return this
  }

  hincrby(key: string, field: string, increment: number) {
    this.pipelineClient.hincrby(key, field, increment)
    return this
  }

  async exec(): Promise<unknown[]> {
    const results = (await this.pipelineClient.exec()) as PipelineResultTuple[] | null
    if (!results) return []
    return results.map(([error, value], index) => {
      if (error) {
        throw new Error(`Pipeline command ${index} failed: ${error.message}`)
      }
      return value
    })
  }
}

export class ControlPlaneIoredisAdapter implements ControlPlanePulseRedis {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly redis: any
  private connected = false

  constructor(url: string) {
    const IoRedis = _require('ioredis')
    const RedisClass = IoRedis.default || IoRedis
    this.redis = new RedisClass(url, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      connectTimeout: 10_000,
      lazyConnect: true,
      keepAlive: 10_000,
      retryStrategy: (times: number) => Math.min(times * 500, 3000),
    })
  }

  async connect(): Promise<void> {
    if (this.connected) return
    await this.redis.connect()
    this.connected = true
  }

  async ping(): Promise<string> {
    return this.redis.ping()
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key)
  }

  async set(key: string, value: string, opts?: { nx?: boolean; ex?: number }): Promise<string | null> {
    const args: Array<string | number> = [key, value]
    if (opts?.ex) args.push('EX', opts.ex)
    if (opts?.nx) args.push('NX')
    return this.redis.set(...args)
  }

  async del(...keys: string[]): Promise<number> {
    return this.redis.del(...keys)
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key)
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.redis.expire(key, seconds)
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.redis.sadd(key, ...members)
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.redis.srem(key, ...members)
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return this.redis.hincrby(key, field, increment)
  }

  async xadd(key: string, id: string, fields: Record<string, string>, opts?: { maxlen?: number; approximate?: boolean }): Promise<string> {
    const args: Array<string | number> = [key]
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
    const args: Array<string | number> = ['GROUP', group, consumer]
    if (opts?.count) args.push('COUNT', opts.count)
    if (opts?.block !== undefined) args.push('BLOCK', opts.block)
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

  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    return this.redis.eval(script, keys.length, ...keys, ...args)
  }

  pipeline(): ControlPlanePulsePipeline {
    return new IoredisPipelineAdapter(this.redis.pipeline())
  }

  async quit(): Promise<void> {
    await this.redis.quit()
    this.connected = false
  }
}
