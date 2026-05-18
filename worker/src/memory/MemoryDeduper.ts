/**
 * MemoryDeduper — Prevents duplicate memories using content hashing.
 * 
 * Uses MD5 hash of normalized content (lowercase, trimmed) to detect duplicates.
 * When a duplicate is found:
 * - Update importance to max(existing, new)
 * - Refresh last_accessed_at
 * - Merge metadata
 * 
 * This is handled automatically by the `upsert_memory()` DB function,
 * but this class provides additional client-side deduplication logic.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

interface MemoryCandidate {
  content: string
  category: 'fact' | 'preference' | 'instruction' | 'context'
  importance: number
  confidence: number
}

interface DedupedMemory extends MemoryCandidate {
  isDuplicate: boolean
  existingId?: string
}

export class MemoryDeduper {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Compute content hash for a memory.
   * Same algorithm as DB: md5(lower(trim(content)))
   */
  static computeHash(content: string): string {
    const normalized = content.toLowerCase().trim()
    return crypto.createHash('md5').update(normalized).digest('hex')
  }

  /**
   * Check if memories are duplicates (client-side).
   * Returns true if content hashes match.
   */
  static areDuplicates(content1: string, content2: string): boolean {
    return this.computeHash(content1) === this.computeHash(content2)
  }

  /**
   * Deduplicate a batch of memory candidates against existing memories.
   * 
   * For each candidate:
   * 1. Check if hash exists in DB
   * 2. Mark as duplicate if found
   * 3. Return list with duplicate flags
   */
  async deduplicate(
    assistantId: string,
    candidates: MemoryCandidate[]
  ): Promise<DedupedMemory[]> {
    if (candidates.length === 0) {
      return []
    }

    // Compute hashes for all candidates
    const candidatesWithHashes = candidates.map(c => ({
      ...c,
      hash: MemoryDeduper.computeHash(c.content),
    }))

    // Query DB for existing memories with these hashes
    const hashes = candidatesWithHashes.map(c => c.hash)
    
    const { data: existingMemories } = await this.supabase
      .from('assistant_memory')
      .select('id, content_hash')
      .eq('assistant_id', assistantId)
      .in('content_hash', hashes)

    // Build hash → id map
    const hashToId = new Map<string, string>()
    if (existingMemories) {
      for (const memory of existingMemories) {
        if (memory.content_hash) {
          hashToId.set(memory.content_hash, memory.id)
        }
      }
    }

    // Mark duplicates
    return candidatesWithHashes.map(c => ({
      content: c.content,
      category: c.category,
      importance: c.importance,
      confidence: c.confidence,
      isDuplicate: hashToId.has(c.hash),
      existingId: hashToId.get(c.hash),
    }))
  }

  /**
   * Deduplicate within a batch (client-side only).
   * Removes duplicate candidates before DB check.
   */
  static deduplicateBatch(candidates: MemoryCandidate[]): MemoryCandidate[] {
    const seen = new Set<string>()
    const unique: MemoryCandidate[] = []

    for (const candidate of candidates) {
      const hash = this.computeHash(candidate.content)
      
      if (!seen.has(hash)) {
        seen.add(hash)
        unique.push(candidate)
      } else {
        console.log(`[deduper] Skipping duplicate within batch: "${candidate.content}"`)
      }
    }

    return unique
  }

  /**
   * Filter out low-quality candidates before insertion.
   * 
   * Criteria:
   * - importance >= 0.3
   * - confidence >= 0.5
   * - content length >= 10 chars
   */
  static filterLowQuality(candidates: MemoryCandidate[]): MemoryCandidate[] {
    return candidates.filter(c => {
      if (c.importance < 0.3) {
        console.log(`[deduper] Filtered low importance (${c.importance}): "${c.content}"`)
        return false
      }

      if (c.confidence < 0.5) {
        console.log(`[deduper] Filtered low confidence (${c.confidence}): "${c.content}"`)
        return false
      }

      if (c.content.length < 10) {
        console.log(`[deduper] Filtered too short (${c.content.length} chars): "${c.content}"`)
        return false
      }

      return true
    })
  }
}