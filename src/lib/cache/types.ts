import { CacheKey } from './config';

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  prefix?: string;
  metadata?: Record<string, unknown>;
}

export interface CacheEntry<T = unknown> {
  value: T;
  expires: number;
  metadata?: Record<string, unknown>;
}

export interface CacheProvider {
  get<T>(key: CacheKey): Promise<CacheEntry<T> | null>;
  set<T>(key: CacheKey, value: T, options?: CacheOptions): Promise<void>;
  delete(key: CacheKey): Promise<void>;
  clear(): Promise<void>;
  has(key: CacheKey): Promise<boolean>;
}

export interface CacheService {
  get<T>(key: CacheKey): Promise<T | null>;
  set<T>(key: CacheKey, value: T, options?: CacheOptions): Promise<void>;
  delete(key: CacheKey): Promise<void>;
  clear(): Promise<void>;
  has(key: CacheKey): Promise<boolean>;
  getProvider(): CacheProvider;
} 