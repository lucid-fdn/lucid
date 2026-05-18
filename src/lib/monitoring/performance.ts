interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetric> = new Map();
  private pageLoadTimes: Map<string, number> = new Map();
  private cacheStats: { hits: number; misses: number } = { hits: 0, misses: 0 };

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startMetric(name: string, metadata?: Record<string, unknown>) {
    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata,
    };
    this.metrics.set(name, metric);
  }

  endMetric(name: string, metadata?: Record<string, unknown>) {
    const metric = this.metrics.get(name);
    if (metric) {
      metric.endTime = performance.now();
      metric.duration = metric.endTime - metric.startTime;
      if (metadata) {
        metric.metadata = { ...metric.metadata, ...metadata };
      }
      this.logMetric(metric);
      this.metrics.delete(name);
    }
  }

  private logMetric(metric: PerformanceMetric) {
    if (metric.duration && metric.duration > 100) { // Only log slow operations (>100ms)
      console.log(`[Performance] ${metric.name}: ${metric.duration.toFixed(2)}ms`, metric.metadata);
    }
  }

  trackPageLoad(pageName: string) {
    const startTime = performance.now();
    this.pageLoadTimes.set(pageName, startTime);
  }

  endPageLoad(pageName: string) {
    const startTime = this.pageLoadTimes.get(pageName);
    if (startTime) {
      const duration = performance.now() - startTime;
      console.log(`[Performance] Page Load: ${pageName} took ${duration.toFixed(2)}ms`);
      this.pageLoadTimes.delete(pageName);
    }
  }

  trackCacheAccess(hit: boolean) {
    if (hit) {
      this.cacheStats.hits++;
    } else {
      this.cacheStats.misses++;
    }

    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = this.cacheStats.hits / total;

    if (total % 100 === 0) { // Log every 100 cache accesses
      console.log(`[Performance] Cache Stats: ${(hitRate * 100).toFixed(1)}% hit rate (${this.cacheStats.hits}/${total})`);
    }
  }

  getCacheStats() {
    return { ...this.cacheStats };
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance(); 