/**
 * Telegram message chunking.
 *
 * Telegram's sendMessage caps text at 4096 characters. Upstream openclaw ships
 * its own HTML entity-aware splitter (`splitTelegramHtmlChunks` in
 * extensions/telegram/src/format.ts) that's tightly coupled to its markdown→IR
 * pipeline. We send plain/Markdown text (no HTML entities), so we only need a
 * paragraph-preferring splitter under 4000 chars (matching upstream's
 * TELEGRAM_TEXT_CHUNK_LIMIT of 4000 — 96 bytes of headroom for safety).
 *
 * Split preference order:
 *   1. Double-newline (paragraph break)
 *   2. Single newline
 *   3. Sentence boundary (`. ` `! ` `? `)
 *   4. Space
 *   5. Hard split at limit
 *
 * Never emits an empty chunk. Preserves order.
 */

/** Telegram's sendMessage text limit, minus a small headroom. */
export const TELEGRAM_TEXT_CHUNK_LIMIT = 4000

/**
 * Split a message into Telegram-sized chunks, preferring paragraph/newline/
 * sentence breaks over mid-word splits.
 *
 * @param text - The message body (plain or Markdown)
 * @param limit - Max chars per chunk (default 4000)
 * @returns Array of non-empty chunks in original order. Empty input → [].
 */
export function splitTelegramMessage(
  text: string,
  limit: number = TELEGRAM_TEXT_CHUNK_LIMIT,
): string[] {
  if (!text) return []
  const normalized = Math.max(1, Math.floor(limit))
  if (text.length <= normalized) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > normalized) {
    const splitAt = findBestSplit(remaining, normalized)
    const chunk = remaining.slice(0, splitAt).trimEnd()
    if (chunk.length > 0) chunks.push(chunk)
    // Advance past the split; consume a single leading separator if present
    // so we don't emit a chunk that begins with "\n\n".
    remaining = remaining.slice(splitAt).replace(/^(\r?\n){1,2}|^[ \t]+/, '')
  }

  if (remaining.length > 0) {
    const tail = remaining.trimEnd()
    if (tail.length > 0) chunks.push(tail)
  }

  return chunks.length > 0 ? chunks : [text.slice(0, normalized)]
}

/**
 * Find the best split index in `text` at or before `limit`, preferring
 * paragraph → newline → sentence → space → hard cut.
 */
function findBestSplit(text: string, limit: number): number {
  // 1. Paragraph break (double newline)
  const paragraph = text.lastIndexOf('\n\n', limit)
  if (paragraph > limit * 0.5) return paragraph + 2

  // 2. Single newline
  const newline = text.lastIndexOf('\n', limit)
  if (newline > limit * 0.5) return newline + 1

  // 3. Sentence boundary
  for (const sep of ['. ', '! ', '? ']) {
    const idx = text.lastIndexOf(sep, limit)
    if (idx > limit * 0.5) return idx + sep.length
  }

  // 4. Last space before the limit
  const space = text.lastIndexOf(' ', limit)
  if (space > limit * 0.5) return space + 1

  // 5. Hard split — no good break available
  return limit
}
