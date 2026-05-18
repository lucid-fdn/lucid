import { MONITORING } from './config';
import { CacheKey } from './config';
import { CacheManager } from './client';

interface CacheMetrics {
  hits: number;
  misses: number;
  errors: number;
  lastError?: Error;
  lastErrorTime?: number;
  memoryUsage?: number;
}

class CacheMonitor {
  private static instance: CacheMonitor;
  private metrics: Map<CacheKey, CacheMetrics> = new Map();
  private memoryUsage: number = 0;
  private lastCheck: number = 0;
  private readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    // Start periodic memory checks
    if (typeof window !== 'undefined') {
      setInterval(() => this.checkMemoryUsage(), this.CHECK_INTERVAL);
    }
  }

  static getInstance(): CacheMonitor {
    if (!CacheMonitor.instance) {
      CacheMonitor.instance = new CacheMonitor();
    }
    return CacheMonitor.instance;
  }

  async checkMemoryUsage() {
    const now = Date.now();
    if (now - this.lastCheck < this.CHECK_INTERVAL) return;

    if (typeof window !== 'undefined') {
      const performance = window.performance as Performance & { memory?: { usedJSHeapSize: number } };
      if (performance.memory) {
        this.memoryUsage = performance.memory.usedJSHeapSize;
        
        if (this.memoryUsage > MONITORING.MEMORY_THRESHOLD_MB * 1024 * 1024) {
          await this.handleHighMemoryUsage();
        }
      }
    }
    
    this.lastCheck = now;
  }

  private async handleHighMemoryUsage() {
    console.warn('High memory usage detected, cleaning cache...');
    await CacheManager.cleanupCache();
  }

  trackHit(key: CacheKey) {
    const metrics = this.getMetrics(key);
    metrics.hits++;
  }

  trackMiss(key: CacheKey) {
    const metrics = this.getMetrics(key);
    metrics.misses++;
  }

  trackError(key: CacheKey, error: Error) {
    const metrics = this.getMetrics(key);
    metrics.errors++;
    metrics.lastError = error;
    metrics.lastErrorTime = Date.now();
  }

  private getMetrics(key: CacheKey): CacheMetrics {
    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        hits: 0,
        misses: 0,
        errors: 0,
      });
    }
    return this.metrics.get(key)!;
  }

  getHitRate(key: CacheKey): number {
    const metrics = this.getMetrics(key);
    const total = metrics.hits + metrics.misses;
    return total > 0 ? metrics.hits / total : 0;
  }

  getErrorRate(key: CacheKey): number {
    const metrics = this.getMetrics(key);
    const total = metrics.hits + metrics.misses + metrics.errors;
    return total > 0 ? metrics.errors / total : 0;
  }

  getMemoryUsage(): number {
    return this.memoryUsage;
  }
}

export const cacheMonitor = CacheMonitor.getInstance(); 