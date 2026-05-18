import { Redis } from '@upstash/redis';
import { getRedisRestEnv } from '@/lib/redis/env'

function createRedisClient(): Redis | null {
  const redisEnv = getRedisRestEnv()
  return redisEnv ? new Redis(redisEnv) : null
}

const redis = createRedisClient()

export interface CacheEntry {
  did: string;
  expires: number;
  tokenHash: string;
}

export class RedisCache {
  private readonly prefix: string;
  private readonly defaultTTL: number;
  private readonly fallback = new Map<string, CacheEntry>();

  constructor(prefix: string = 'auth:', defaultTTL: number = 300) {
    this.prefix = prefix;
    this.defaultTTL = defaultTTL;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<CacheEntry | null> {
    const fullKey = this.getKey(key);
    const data = redis
      ? await redis.get<CacheEntry>(fullKey)
      : this.fallback.get(fullKey) ?? null;
    if (!data) return null;

    // Check if entry is expired
    if (data.expires < Date.now()) {
      await this.delete(key);
      return null;
    }

    return data;
  }

  async set(key: string, value: CacheEntry, ttl?: number): Promise<void> {
    const fullKey = this.getKey(key);
    const finalTTL = ttl || this.defaultTTL;
    this.fallback.set(fullKey, value);
    if (redis) {
      await redis.set(fullKey, value, {
        ex: Math.max(1, Math.ceil(finalTTL / 1000)), // Convert to seconds
      });
    }
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key);
    this.fallback.delete(fullKey);
    if (redis) {
      await redis.del(fullKey);
    }
  }

  async clear(): Promise<void> {
    for (const key of this.fallback.keys()) {
      if (key.startsWith(this.prefix)) this.fallback.delete(key);
    }
    if (!redis) return;
    const keys = await redis.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  async has(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);
    if (this.fallback.has(fullKey)) return true;
    return redis ? await redis.exists(fullKey) === 1 : false;
  }

  // Publish logout event
  async publishLogout(token: string): Promise<void> {
    if (redis) {
      await redis.publish('auth:logout', token);
    }
  }
}

// Export a singleton instance
export const authCache = new RedisCache();
