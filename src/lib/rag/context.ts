/**
 * RAG — Context Formatting
 *
 * Formats retrieved chunks into system prompt sections.
 * Includes contextual embedding prefix builder.
 */

import { estimateTokens } from '@/lib/ai/context'
import { MAX_RAG_CONTEXT_TOKENS } from './constants'
import type { RAGChunkResult } from './types'

/**
 * Build a context prefix for contextual embedding.
 * Prepended to chunk text before embedding so the vector captures document context.
 *
 * Pattern: "Document: {title} > Section: {heading}\n\n"
 * (Anthropic Contextual Retrieval — 35% fewer retrieval failures)
 */
export function buildContextPrefix(
  documentTitle: string,
  sectionHeading: string | null,
): string {
  let prefix = `Document: ${documentTitle}`
  if (sectionHeading) {
    prefix += ` > Section: ${sectionHeading}`
  }
  return prefix + '\n\n'
}

/**
 * Format RAG chunks into a system prompt section.
 * Respects token budget by truncating if necessary.
 * Includes section headings for better LLM context.
 */
export function formatRAGContext(
  chunks: RAGChunkResult[],
  maxTokens: number = MAX_RAG_CONTEXT_TOKENS,
): string {
  if (chunks.length === 0) return ''

  let tokenCount = 0
  const sections: string[] = []

  const header =
    '## Relevant Knowledge Base Documents\nThe following documents from the knowledge base may help answer the question. Use them as reference.\n'
  tokenCount += estimateTokens(header)

  for (const chunk of chunks) {
    const heading = chunk.sectionHeading
      ? ` > ${chunk.sectionHeading}`
      : ''
    const matchPct = (chunk.similarity * 100).toFixed(0)
    const section = `### ${chunk.documentTitle}${heading} (${matchPct}% match)\n${chunk.content}`
    const sectionTokens = estimateTokens(section)

    if (tokenCount + sectionTokens > maxTokens) break

    sections.push(section)
    tokenCount += sectionTokens
  }

  if (sections.length === 0) return ''

  return header + '\n' + sections.join('\n\n')
}
