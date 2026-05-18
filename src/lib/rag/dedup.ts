/**
 * RAG — Chunk Deduplication
 *
 * Removes overlapping/adjacent chunks from retrieval results to prevent
 * wasting the context token budget on near-identical content.
 */

import type { RAGChunkResult } from './types'

/**
 * Deduplicate overlapping/adjacent chunks from the same document.
 *
 * Strategy:
 * - When adjacent chunks (index N and N+1) from the same document both appear,
 *   keep only the higher-scoring one (they share overlap content).
 * - When chunks from the same document have >50% content overlap, skip.
 * - Preserves cross-document diversity.
 */
export function deduplicateChunks(
  chunks: RAGChunkResult[],
  maxResults: number,
): RAGChunkResult[] {
  if (chunks.length <= 1) return chunks.slice(0, maxResults)

  const result: RAGChunkResult[] = []
  const seen = new Set<string>()

  for (const chunk of chunks) {
    if (seen.has(chunk.id)) continue

    const hasAdjacentDuplicate = result.some(
      (existing) =>
        existing.documentId === chunk.documentId &&
        Math.abs(existing.chunkIndex - chunk.chunkIndex) <= 1 &&
        contentOverlap(existing.content, chunk.content) > 0.5,
    )

    if (hasAdjacentDuplicate) continue

    seen.add(chunk.id)
    result.push(chunk)

    if (result.length >= maxResults) break
  }

  return result
}

/**
 * Estimate content overlap ratio between two strings.
 * Uses word-level Jaccard similarity.
 */
function contentOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/))
  const wordsB = new Set(b.toLowerCase().split(/\s+/))
  let intersection = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++
  }
  const union = wordsA.size + wordsB.size - intersection
  return union === 0 ? 0 : intersection / union
}
