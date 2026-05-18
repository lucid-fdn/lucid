/**
 * RAG — Markdown-Aware Chunking
 *
 * Splits documents into chunks that respect markdown structure:
 *   - Splits on headings (##, ###, etc.)
 *   - Keeps code blocks intact (never splits mid-block)
 *   - Paragraph-based splitting within sections
 *   - Overlap between chunks for context continuity
 *   - Carries section heading metadata per chunk
 */

import { CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS } from './constants'
import type { MarkdownChunk } from './types'

/**
 * Split markdown text into chunks that respect document structure.
 *
 * Strategy:
 * 1. Parse into sections by headings (##, ###, etc.)
 * 2. Keep code blocks intact (never split mid-block)
 * 3. Within sections, split on paragraph boundaries with overlap
 * 4. Carry parent heading as metadata per chunk
 */
export function chunkMarkdown(
  text: string,
  chunkSize: number = CHUNK_SIZE_CHARS,
  overlap: number = CHUNK_OVERLAP_CHARS,
): MarkdownChunk[] {
  if (!text || text.trim().length === 0) return []

  const chunks: MarkdownChunk[] = []
  let chunkIndex = 0

  const sections = splitByHeadings(text)

  for (const section of sections) {
    const heading = section.heading

    // If section fits in one chunk, keep it together
    if (section.content.length <= chunkSize) {
      if (section.content.trim().length > 0) {
        chunks.push({
          text: section.content.trim(),
          index: chunkIndex++,
          sectionHeading: heading,
          metadata: heading ? { section: heading } : {},
        })
      }
      continue
    }

    // Section too large — split by paragraphs, preserving code blocks
    const blocks = splitPreservingCodeBlocks(section.content)

    let currentChunk = ''

    for (const block of blocks) {
      const trimmedBlock = block.trim()
      if (!trimmedBlock) continue

      // Single block exceeds chunk size — add it as-is
      if (trimmedBlock.length > chunkSize && currentChunk.trim().length === 0) {
        chunks.push({
          text: trimmedBlock,
          index: chunkIndex++,
          sectionHeading: heading,
          metadata: heading ? { section: heading } : {},
        })
        continue
      }

      const combined = currentChunk
        ? currentChunk + '\n\n' + trimmedBlock
        : trimmedBlock

      if (combined.length > chunkSize) {
        if (currentChunk.trim().length > 0) {
          chunks.push({
            text: currentChunk.trim(),
            index: chunkIndex++,
            sectionHeading: heading,
            metadata: heading ? { section: heading } : {},
          })
          const overlapText = currentChunk.slice(-overlap)
          currentChunk = overlapText + '\n\n' + trimmedBlock
        } else {
          currentChunk = trimmedBlock
        }
      } else {
        currentChunk = combined
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex++,
        sectionHeading: heading,
        metadata: heading ? { section: heading } : {},
      })
    }
  }

  return chunks
}

/**
 * Legacy chunking function — delegates to chunkMarkdown.
 * Kept for backward compatibility with existing callers.
 */
export function chunkText(
  text: string,
  chunkSize: number = CHUNK_SIZE_CHARS,
  overlap: number = CHUNK_OVERLAP_CHARS,
): Array<{ text: string; index: number; metadata: Record<string, unknown> }> {
  return chunkMarkdown(text, chunkSize, overlap).map((c) => ({
    text: c.text,
    index: c.index,
    metadata: { ...c.metadata, sectionHeading: c.sectionHeading },
  }))
}

// ── Internal helpers ─────────────────────────────────────────────────

/** Split text into sections by markdown headings */
function splitByHeadings(
  text: string,
): Array<{ heading: string | null; content: string }> {
  const lines = text.split('\n')
  const sections: Array<{ heading: string | null; content: string }> = []
  let currentHeading: string | null = null
  let currentLines: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)

    if (headingMatch) {
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join('\n'),
        })
      }
      currentHeading = headingMatch[2].trim()
      currentLines = [line]
    } else {
      currentLines.push(line)
    }
  }

  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentLines.join('\n'),
    })
  }

  return sections
}

/**
 * Split text into blocks while keeping code blocks (``` ... ```) intact.
 */
function splitPreservingCodeBlocks(text: string): string[] {
  const blocks: string[] = []
  const codeBlockRegex = /```[\s\S]*?```/g
  let lastIndex = 0

  for (const match of text.matchAll(codeBlockRegex)) {
    const matchStart = match.index!
    const matchEnd = matchStart + match[0].length

    if (matchStart > lastIndex) {
      const before = text.slice(lastIndex, matchStart)
      const paragraphs = before.split(/\n\n+/).filter((p) => p.trim())
      blocks.push(...paragraphs)
    }

    blocks.push(match[0])
    lastIndex = matchEnd
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex)
    const paragraphs = remaining.split(/\n\n+/).filter((p) => p.trim())
    blocks.push(...paragraphs)
  }

  return blocks
}
