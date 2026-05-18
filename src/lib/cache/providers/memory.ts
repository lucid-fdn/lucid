import { CacheEntry, CacheOptions, CacheProvider } from '../types'

export class MemoryCacheProvider implements CacheProvider {
  private cache = new Map<string, CacheEntry>()
  private defaultPrefix: string
  private defaultTTL: number

  constructor(defaultPrefix = '', defaultTTL = 300_000) {
    this.defaultPrefix = defaultPrefix
    this.defaultTTL = defaultTTL
  }

  private getKey(key: string, prefix?: string): string {
    const finalPrefix = prefix || this.defaultPrefix
    return finalPrefix ? `${finalPrefix}:${key}` : key
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const cacheKey = this.getKey(key)
    const entry = this.cache.get(cacheKey) as CacheEntry<T> | undefined
    if (!entry) return null
    if (entry.expires < Date.now()) {
      this.cache.delete(cacheKey)
      return null
    }
    return entry
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const ttl = options?.ttl || this.defaultTTL
    this.cache.set(this.getKey(key, options?.prefix), {
      value,
      expires: Date.now() + ttl,
      metadata: options?.metadata,
    })
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(this.getKey(key))
  }

  async clear(): Promise<void> {
    this.cache.clear()
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null
  }
}
