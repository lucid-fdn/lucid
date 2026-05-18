/**
 * NullMemory — No-op memory adapter for assistants with memory disabled.
 *
 * Avoids conditional memory logic scattered through inbound.ts.
 * Used when `assistant.memory_enabled = false`.
 *
 * See docs/OPENCLAW_INTEGRATION_SPEC.md §2.4
 */

export interface MemoryAdapter {
  search(assistantId: string, scopedUserId: string, query: string, limit?: number): Promise<string[]>
  store(assistantId: string, scopedUserId: string, content: string): Promise<void>
  compact(assistantId: string, scopedUserId: string): Promise<void>
}

export class NullMemory implements MemoryAdapter {
  async search(): Promise<string[]> {
    return []
  }

  async store(): Promise<void> {
    /* no-op */
  }

  async compact(): Promise<void> {
    /* no-op */
  }
}