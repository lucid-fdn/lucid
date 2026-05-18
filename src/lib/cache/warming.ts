import { CACHE_WARMING } from './config';
import { CacheKey } from './config';
import { cacheMonitor } from './monitoring';

interface WarmupTask {
  key: CacheKey;
  queryFn: () => Promise<unknown>;
  priority: 'high' | 'medium' | 'low';
}

class CacheWarmer {
  private static instance: CacheWarmer;
  private tasks: Map<CacheKey, WarmupTask>;
  private isWarming: boolean = false;
  private periodicInterval?: NodeJS.Timeout;

  private constructor() {
    this.tasks = new Map();
    if (CACHE_WARMING.ENABLED) {
      this.startPeriodicWarming();
    }
  }

  static getInstance(): CacheWarmer {
    if (!CacheWarmer.instance) {
      CacheWarmer.instance = new CacheWarmer();
    }
    return CacheWarmer.instance;
  }

  registerTask(task: WarmupTask): void {
    this.tasks.set(task.key, task);
  }

  async warmCache(keys?: CacheKey[]): Promise<void> {
    if (this.isWarming) return;
    this.isWarming = true;

    try {
      const tasksToRun = keys
        ? keys.map(key => this.tasks.get(key)).filter(Boolean) as WarmupTask[]
        : Array.from(this.tasks.values());

      // Sort by priority
      tasksToRun.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      // Run tasks in parallel with priority-based concurrency
      const highPriorityTasks = tasksToRun.filter(t => t.priority === 'high');
      const mediumPriorityTasks = tasksToRun.filter(t => t.priority === 'medium');
      const lowPriorityTasks = tasksToRun.filter(t => t.priority === 'low');

      await Promise.all([
        this.runTasks(highPriorityTasks, 5), // Run 5 high priority tasks concurrently
        this.runTasks(mediumPriorityTasks, 3), // Run 3 medium priority tasks concurrently
        this.runTasks(lowPriorityTasks, 1), // Run 1 low priority task at a time
      ]);
    } catch (error) {
      console.error('Error during cache warming:', error);
      cacheMonitor.trackError('cache_warming', error as Error);
    } finally {
      this.isWarming = false;
    }
  }

  private async runTasks(tasks: WarmupTask[], concurrency: number): Promise<void> {
    const chunks = this.chunkArray(tasks, concurrency);
    
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async task => {
          try {
            await task.queryFn();
            cacheMonitor.trackHit(task.key);
          } catch (error) {
            cacheMonitor.trackError(task.key, error as Error);
          }
        })
      );
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private startPeriodicWarming(): void {
    if (this.periodicInterval) {
      clearInterval(this.periodicInterval);
    }

    this.periodicInterval = setInterval(() => {
      const keysToWarm = CACHE_WARMING.PERIODIC_KEYS.filter(key => 
        this.tasks.has(key as CacheKey)
      );
      
      if (keysToWarm.length > 0) {
        this.warmCache(keysToWarm as CacheKey[]);
      }
    }, CACHE_WARMING.PERIODIC_INTERVAL);
    this.periodicInterval.unref?.();
  }

  stopPeriodicWarming(): void {
    if (this.periodicInterval) {
      clearInterval(this.periodicInterval);
      this.periodicInterval = undefined;
    }
  }
}

export const cacheWarmer = CacheWarmer.getInstance();
