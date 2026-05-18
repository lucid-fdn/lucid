/**
 * Board Memory Loader — loads org-level shared knowledge for agent injection.
 *
 * Shared by inbound.ts, agentStream.ts, and relay-inbound.ts.
 * Non-fatal: returns empty array on any failure.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

interface BoardMemoryRow {
  content: string
  category: string
  importance: number
}

/** Max aggregate chars for all board memories injected into system prompt */
const MAX_TOTAL_CHARS = 8_000

/**
 * Format a board memory row into a prefixed string.
 * Shared between loadBoardMemories and relay packet builder.
 * Strips XML closing tags that could break the <org_knowledge> delimiter.
 */
export function formatBoardMemory(m: { category: string; content: string }): string {
  // Prevent stored content from breaking XML wrapper
  const safeContent = m.content.replace(/<\/org_knowledge>/gi, '')
  return `[${m.category}] ${safeContent}`
}

/**
 * Load board memories for an org via the `get_board_memories` RPC.
 * Returns formatted strings like `[policy] Always verify trades`.
 * Applies an aggregate size cap (8K chars) to prevent prompt bloat.
 */
export async function loadBoardMemories(
  supabase: SupabaseClient,
  orgId: string,
  limit = 10,
): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('get_board_memories', {
      p_org_id: orgId,
      p_limit: limit,
    })

    if (error) {
      console.warn('[board-memory] RPC failed:', error.message)
      return []
    }

    if (!data || !Array.isArray(data)) return []

    // Format and enforce aggregate size cap
    const result: string[] = []
    let totalChars = 0
    for (const m of data as BoardMemoryRow[]) {
      const formatted = formatBoardMemory(m)
      if (totalChars + formatted.length > MAX_TOTAL_CHARS) break
      result.push(formatted)
      totalChars += formatted.length
    }
    return result
  } catch (err) {
    // Non-fatal — continue without board memories
    console.warn('[board-memory] Failed to load:', err instanceof Error ? err.message : err)
    return []
  }
}
