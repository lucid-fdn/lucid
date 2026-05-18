import { Redis } from '@upstash/redis';
import { CacheProvider, CacheEntry, CacheOptions } from '../types';

export class RedisCacheProvider implements CacheProvider {
  private redis: Redis | null;
  private defaultPrefix: string;
  private defaultTTL: number;
  private enabled: boolean;

  constructor(
    url: string,
    token: string,
    defaultPrefix: string = '',
    defaultTTL: number = 300000 // 5 minutes
  ) {
    // Check if Redis config is provided
    this.enabled = !!(url && token);
    
    if (this.enabled) {
      try {
        this.redis = new Redis({ url, token });
      } catch (error) {
        console.warn('[Redis] Failed to initialize Redis client:', error);
        this.redis = null;
        this.enabled = false;
      }
    } else {
      this.redis = null;
    }
    
    this.defaultPrefix = defaultPrefix;
    this.defaultTTL = defaultTTL;
  }

  private getKey(key: string, prefix?: string): string {
    const finalPrefix = prefix || this.defaultPrefix;
    return finalPrefix ? `${finalPrefix}:${key}` : key;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    if (!this.enabled || !this.redis) return null;
    
    try {
      const data = await this.redis.get<CacheEntry<T>>(this.getKey(key));
      if (!data) return null;

      // Check if entry is expired
      if (data.expires < Date.now()) {
        await this.delete(key);
        return null;
      }

      return data;
    } catch (error) {
      console.warn('[Redis] Get failed:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    if (!this.enabled || !this.redis) return;
    
    try {
      const ttl = options?.ttl || this.defaultTTL;
      const entry: CacheEntry<T> = {
        value,
        expires: Date.now() + ttl,
        metadata: options?.metadata
      };

      await this.redis.set(this.getKey(key, options?.prefix), entry, {
        ex: Math.ceil(ttl / 1000) // Convert to seconds
      });
    } catch (error) {
      console.warn('[Redis] Set failed:', error);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.enabled || !this.redis) return;
    
    try {
      await this.redis.del(this.getKey(key));
    } catch (error) {
      console.warn('[Redis] Delete failed:', error);
    }
  }

  async clear(): Promise<void> {
    if (!this.enabled || !this.redis) return;
    
    try {
      const keys = await this.redis.keys(`${this.defaultPrefix}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.warn('[Redis] Clear failed:', error);
    }
  }

  async has(key: string): Promise<boolean> {
    if (!this.enabled || !this.redis) return false;
    
    try {
      return await this.redis.exists(this.getKey(key)) === 1;
    } catch (error) {
      console.warn('[Redis] Has failed:', error);
      return false;
    }
  }

  // Redis-specific methods
  async publish(channel: string, message: string): Promise<void> {
    if (!this.enabled || !this.redis) return;
    
    try {
      await this.redis.publish(channel, message);
    } catch (error) {
      console.warn('[Redis] Publish failed:', error);
    }
  }
}
