import { CacheService, CacheProvider, CacheOptions } from './types';
import { RedisCacheProvider } from './providers/redis';
import { MemoryCacheProvider } from './providers/memory';
import { TTL, CacheKey, CACHE_ENABLED } from './config';
import { getRedisRestEnv } from '@/lib/redis/env';

export class CacheServiceImpl implements CacheService {
  private provider: CacheProvider;

  constructor(provider: CacheProvider) {
    this.provider = provider;
  }

  async get<T>(key: CacheKey): Promise<T | null> {
    if (!CACHE_ENABLED) {
      return null;
    }
    const entry = await this.provider.get<T>(key);
    return entry?.value || null;
  }

  async set<T>(key: CacheKey, value: T, options?: CacheOptions): Promise<void> {
    if (!CACHE_ENABLED) {
      return;
    }
    await this.provider.set(key, value, options);
  }

  async delete(key: CacheKey): Promise<void> {
    if (!CACHE_ENABLED) {
      return;
    }
    await this.provider.delete(key);
  }

  async clear(): Promise<void> {
    if (!CACHE_ENABLED) {
      return;
    }
    await this.provider.clear();
  }

  async has(key: CacheKey): Promise<boolean> {
    if (!CACHE_ENABLED) {
      return false;
    }
    return this.provider.has(key);
  }

  getProvider(): CacheProvider {
    return this.provider;
  }
}

// Create singleton instances for different cache types
const redisEnv = getRedisRestEnv();

if (!redisEnv) {
  if (process.env.CACHE_CONFIG_LOGS === 'true') {
    console.warn('[CacheService] Redis configuration missing. Using in-memory cache for this process.');
  }
}

function createCacheProvider(prefix: string, ttl: number): CacheProvider {
  if (redisEnv) {
    return new RedisCacheProvider(redisEnv.url, redisEnv.token, prefix, ttl)
  }
  return new MemoryCacheProvider(prefix, ttl)
}

// Auth cache instance
export const authCache = new CacheServiceImpl(
  createCacheProvider('auth', TTL.AUTH)
);

// Image generation cache instance
export const imageCache = new CacheServiceImpl(
  createCacheProvider('image', TTL.IMAGE)
);

// Rate limiting cache instance
export const rateLimitCache = new CacheServiceImpl(
  createCacheProvider('rate_limit', TTL.RATE_LIMIT)
);

// Chat message cache instance
export const chatCache = new CacheServiceImpl(
  createCacheProvider('chat', TTL.CHAT)
);

// Node library cache instance (1 hour TTL)
export const nodeCache = new CacheServiceImpl(
  createCacheProvider('nodes', 3600)
);
