/**
 * RateLimiter — Protects against API rate limits using Bottleneck.
 * 
 * Implements token bucket algorithm with:
 * - Concurrent request limits
 * - Per-second/per-minute rate limits
 * - Automatic retries with exponential backoff
 * 
 * Usage:
 * - Lucid-L2 API: 100 requests/minute, 10 concurrent
 * - Telegram API: 30 messages/second, 1 message/chat/second
 * - WhatsApp Cloud API: 80 messages/second
 */

// @ts-ignore Module resolution differs between local and Docker
import Bottleneck from 'bottleneck'

interface RateLimiterConfig {
  name: string
  maxConcurrent?: number // Max concurrent requests
  minTime?: number // Min time between requests (ms)
  reservoir?: number // Token bucket size
  reservoirRefreshAmount?: number // Tokens to add on refresh
  reservoirRefreshInterval?: number // Refresh interval (ms)
  retries?: number // Max retries on rate limit
}

export class RateLimiter {
  private limiter: Bottleneck
  private name: string

  constructor(config: RateLimiterConfig) {
    this.name = config.name

    this.limiter = new Bottleneck({
      maxConcurrent: config.maxConcurrent ?? 10,
      minTime: config.minTime ?? 0,
      reservoir: config.reservoir,
      reservoirRefreshAmount: config.reservoirRefreshAmount,
      reservoirRefreshInterval: config.reservoirRefreshInterval,
      
      // Retry configuration
      retryOptions: {
        maxRetries: config.retries ?? 3,
        minDelay: 1000, // Start with 1s delay
        maxDelay: 60000, // Max 60s delay
        exponentialBackoff: true,
      },

      // Track failures
      trackDoneStatus: true,
    })

    // Logging
    this.limiter.on('failed', (error: any, jobInfo: any) => {
      console.warn(`[rate-limit:${this.name}] Job failed (retry ${jobInfo.retryCount}):`, error)
    })

    this.limiter.on('retry', (error: any, jobInfo: any) => {
      console.log(`[rate-limit:${this.name}] Retrying job (attempt ${jobInfo.retryCount + 1})`)
    })

    this.limiter.on('dropped', (dropped: any) => {
      console.error(`[rate-limit:${this.name}] Job dropped:`, dropped)
    })
  }

  /**
   * Schedule a function to run with rate limiting.
   */
  async schedule<T>(fn: () => Promise<T>, priority?: number): Promise<T> {
    return this.limiter.schedule({ priority }, fn)
  }

  /**
   * Wrap a function with rate limiting (returns a rate-limited version).
   */
  wrap<T extends (...args: any[]) => Promise<any>>(fn: T): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
    return this.limiter.wrap(fn)
  }

  /**
   * Get current state of the rate limiter.
   */
  counts(): {
    queued: number
    running: number
    done: number
  } {
    return {
      queued: this.limiter.counts().QUEUED,
      running: this.limiter.counts().RUNNING,
      done: this.limiter.counts().DONE ?? 0,
    }
  }

  /**
   * Check if limiter is currently throttled.
   */
  isThrottled(): boolean {
    const counts = this.limiter.counts()
    const maxConcurrent = (this.limiter as any)._maxConcurrent ?? 10
    return counts.RUNNING >= maxConcurrent
  }

  /**
   * Clear all queued jobs.
   */
  clearQueue(): void {
    this.limiter.stop({ dropWaitingJobs: true })
  }

  /**
   * Disconnect and cleanup.
   */
  async disconnect(): Promise<void> {
    await this.limiter.stop({ dropWaitingJobs: false })
  }
}

/**
 * Pre-configured rate limiters for common services.
 */

export const RateLimiters = {
  /**
   * Lucid-L2 API rate limiter.
   * Limits: 100 requests/minute, 10 concurrent.
   */
  lucidL2(): RateLimiter {
    return new RateLimiter({
      name: 'lucid-l2',
      maxConcurrent: 10,
      reservoir: 100,
      reservoirRefreshAmount: 100,
      reservoirRefreshInterval: 60 * 1000, // 1 minute
      retries: 3,
    })
  },

  /**
   * Telegram Bot API rate limiter.
   * Limits: 30 messages/second globally, 1 message/chat/second.
   */
  telegram(): RateLimiter {
    return new RateLimiter({
      name: 'telegram',
      maxConcurrent: 30,
      minTime: 33, // ~30 requests/second (1000ms / 30)
      retries: 3,
    })
  },

  /**
   * WhatsApp Cloud API rate limiter.
   * Limits: 80 messages/second, 20 concurrent.
   */
  whatsapp(): RateLimiter {
    return new RateLimiter({
      name: 'whatsapp',
      maxConcurrent: 20,
      minTime: 12, // ~80 requests/second (1000ms / 80)
      retries: 3,
    })
  },

  /**
   * OpenAI API rate limiter.
   * Limits: Varies by tier, conservative defaults.
   */
  openai(): RateLimiter {
    return new RateLimiter({
      name: 'openai',
      maxConcurrent: 5,
      reservoir: 500, // TPM (tokens per minute) - adjust based on tier
      reservoirRefreshAmount: 500,
      reservoirRefreshInterval: 60 * 1000,
      retries: 3,
    })
  },

  /**
   * Generic API rate limiter with custom config.
   */
  custom(config: RateLimiterConfig): RateLimiter {
    return new RateLimiter(config)
  },
}

/**
 * Global rate limiter instances (singleton pattern).
 * Import and use these instead of creating new instances.
 */

let lucidL2Instance: RateLimiter | null = null
let telegramInstance: RateLimiter | null = null
let whatsappInstance: RateLimiter | null = null
let openaiInstance: RateLimiter | null = null

export function getLucidL2RateLimiter(): RateLimiter {
  if (!lucidL2Instance) {
    lucidL2Instance = RateLimiters.lucidL2()
  }
  return lucidL2Instance
}

export function getTelegramRateLimiter(): RateLimiter {
  if (!telegramInstance) {
    telegramInstance = RateLimiters.telegram()
  }
  return telegramInstance
}

export function getWhatsAppRateLimiter(): RateLimiter {
  if (!whatsappInstance) {
    whatsappInstance = RateLimiters.whatsapp()
  }
  return whatsappInstance
}

export function getOpenAIRateLimiter(): RateLimiter {
  if (!openaiInstance) {
    openaiInstance = RateLimiters.openai()
  }
  return openaiInstance
}

/**
 * Cleanup all rate limiters on shutdown.
 */
export async function disconnectAllRateLimiters(): Promise<void> {
  await Promise.all([
    lucidL2Instance?.disconnect(),
    telegramInstance?.disconnect(),
    whatsappInstance?.disconnect(),
    openaiInstance?.disconnect(),
  ])
}