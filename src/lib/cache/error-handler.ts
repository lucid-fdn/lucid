import { CacheKey } from './config';
import { cacheMonitor } from './monitoring';
import { CacheManager } from './client';

export class CacheErrorHandler {
  static async handleError(key: CacheKey, error: Error) {
    // Log error
    console.error(`Cache error for ${key}:`, error);

    // Track error rate
    cacheMonitor.trackError(key, error);

    // Handle specific error types
    if (error instanceof TypeError && error.message.includes('NetworkError')) {
      await this.handleNetworkError(key);
    } else if (error instanceof Error && error.message.includes('QuotaExceededError')) {
      await this.handleQuotaExceeded(key);
    }
  }

  private static async handleNetworkError(key: CacheKey) {
    // For network errors, we might want to:
    // 1. Retry the operation
    // 2. Use stale data if available
    // 3. Show appropriate UI feedback
    console.warn(`Network error occurred for cache key: ${key}`);
  }

  private static async handleQuotaExceeded(key: CacheKey) {
    // When quota is exceeded, clean up the cache
    console.warn(`Cache quota exceeded for key: ${key}, cleaning up...`);
    await CacheManager.cleanupCache();
  }
} 