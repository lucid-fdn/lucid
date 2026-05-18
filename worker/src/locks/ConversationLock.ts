/**
 * ConversationLock — Prevents race conditions when processing concurrent messages.
 * 
 * Uses Supabase advisory locks (pg_advisory_lock) to ensure only one worker
 * processes a conversation at a time. Prevents issues like:
 * - Duplicate messages sent
 * - Out-of-order message processing
 * - Conflicting memory extraction
 * 
 * Advisory locks are session-scoped and automatically released on disconnect.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export class ConversationLock {
  private activeLocks = new Set<string>()

  constructor(private supabase: SupabaseClient) {}

  /**
   * Acquire a lock for a conversation.
   * Returns true if lock acquired, false if already locked by another worker.
   */
  async acquire(conversationId: string, timeoutMs: number = 5000): Promise<boolean> {
    // Convert UUID to integer for advisory lock (hash the UUID)
    const lockId = this.hashToInt(conversationId)

    try {
      // Try to acquire lock (non-blocking)
      const { data, error } = await this.supabase.rpc('pg_try_advisory_lock', {
        lock_id: lockId,
      })

      if (error) {
        console.error('[lock] Failed to acquire lock:', error)
        return false
      }

      if (data === true) {
        this.activeLocks.add(conversationId)
        console.log(`[lock] ✅ Acquired lock for conversation ${conversationId}`)
        return true
      }

      // Lock is held by another worker - wait with timeout
      console.log(`[lock] ⏳ Waiting for lock on conversation ${conversationId}`)

      const acquired = await this.waitForLock(lockId, timeoutMs)

      if (acquired) {
        this.activeLocks.add(conversationId)
        console.log(`[lock] ✅ Acquired lock for conversation ${conversationId} after wait`)
      } else {
        console.warn(`[lock] ⏰ Timeout waiting for lock on conversation ${conversationId}`)
      }

      return acquired
    } catch (error) {
      console.error('[lock] Lock acquisition error:', error)
      return false
    }
  }

  /**
   * Release a lock for a conversation.
   */
  async release(conversationId: string): Promise<void> {
    if (!this.activeLocks.has(conversationId)) {
      return // Not locked by this instance
    }

    const lockId = this.hashToInt(conversationId)

    try {
      await this.supabase.rpc('pg_advisory_unlock', {
        lock_id: lockId,
      })

      this.activeLocks.delete(conversationId)
      console.log(`[lock] 🔓 Released lock for conversation ${conversationId}`)
    } catch (error) {
      console.error('[lock] Lock release error:', error)
    }
  }

  /**
   * Execute a function with automatic lock acquisition and release.
   */
  async withLock<T>(
    conversationId: string,
    fn: () => Promise<T>,
    timeoutMs: number = 5000
  ): Promise<T | null> {
    const acquired = await this.acquire(conversationId, timeoutMs)

    if (!acquired) {
      console.warn(`[lock] Failed to acquire lock for conversation ${conversationId}`)
      return null
    }

    try {
      return await fn()
    } finally {
      await this.release(conversationId)
    }
  }

  /**
   * Release all active locks (cleanup on shutdown).
   */
  async releaseAll(): Promise<void> {
    const promises = Array.from(this.activeLocks).map((conversationId) =>
      this.release(conversationId)
    )

    await Promise.all(promises)
  }

  /**
   * Wait for lock with timeout (polling strategy).
   */
  private async waitForLock(lockId: number, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now()
    const pollInterval = 100 // Check every 100ms

    while (Date.now() - startTime < timeoutMs) {
      // Try to acquire lock
      const { data, error } = await this.supabase.rpc('pg_try_advisory_lock', {
        lock_id: lockId,
      })

      if (error) {
        console.error('[lock] Error during wait:', error)
        return false
      }

      if (data === true) {
        return true
      }

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    return false // Timeout
  }

  /**
   * Hash UUID to 32-bit integer for advisory lock.
   * Uses simple hash function (FNV-1a variant).
   */
  private hashToInt(uuid: string): number {
    let hash = 2166136261 // FNV offset basis

    for (let i = 0; i < uuid.length; i++) {
      hash ^= uuid.charCodeAt(i)
      hash = Math.imul(hash, 16777619) // FNV prime
    }

    // Convert to signed 32-bit integer
    return hash | 0
  }
}

/**
 * Helper functions to add to Supabase (run once in SQL editor):
 * 
 * CREATE OR REPLACE FUNCTION pg_try_advisory_lock(lock_id INTEGER)
 * RETURNS BOOLEAN AS $$
 * BEGIN
 *   RETURN pg_try_advisory_lock(lock_id::BIGINT);
 * END;
 * $$ LANGUAGE plpgsql;
 * 
 * CREATE OR REPLACE FUNCTION pg_advisory_unlock(lock_id INTEGER)
 * RETURNS BOOLEAN AS $$
 * BEGIN
 *   RETURN pg_advisory_unlock(lock_id::BIGINT);
 * END;
 * $$ LANGUAGE plpgsql;
 * 
 * GRANT EXECUTE ON FUNCTION pg_try_advisory_lock TO service_role;
 * GRANT EXECUTE ON FUNCTION pg_advisory_unlock TO service_role;
 */