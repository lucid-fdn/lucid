/**
 * Board Memory DB layer tests (mock Supabase).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only to allow importing in test environment
vi.mock('server-only', () => ({}))

// Mock the client module
const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
  ErrorService: {
    captureException: vi.fn(),
  },
}))

describe('board-memory DB layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getBoardMemories', () => {
    it('returns board memories for an org', async () => {
      const { getBoardMemories } = await import('../board-memory')

      const mockData = [
        {
          id: 'mem-1',
          org_id: 'org-1',
          content: 'Always verify trades',
          category: 'policy',
          importance: 0.9,
          source: 'operator',
          source_agent_id: null,
          created_by: 'user-1',
          is_archived: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        not: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await getBoardMemories('org-1')

      expect(mockFrom).toHaveBeenCalledWith('org_board_memory')
      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('Always verify trades')
      expect(result[0].category).toBe('policy')
    })

    it('returns empty array on error', async () => {
      const { getBoardMemories } = await import('../board-memory')

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        not: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await getBoardMemories('org-1')
      expect(result).toEqual([])
    })
  })

  describe('createBoardMemory', () => {
    it('creates a board memory entry', async () => {
      const { createBoardMemory } = await import('../board-memory')

      const mockResult = {
        id: 'mem-new',
        org_id: 'org-1',
        content: 'New insight',
        category: 'insight',
        importance: 0.7,
        source: 'operator',
        source_agent_id: null,
        created_by: 'user-1',
        is_archived: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }

      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockResult, error: null }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await createBoardMemory('org-1', 'user-1', { content: 'New insight' })

      expect(result).not.toBeNull()
      expect(result?.content).toBe('New insight')
    })

    it('returns null on duplicate (23505)', async () => {
      const { createBoardMemory } = await import('../board-memory')

      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await createBoardMemory('org-1', 'user-1', { content: 'Duplicate' })
      expect(result).toBeNull()
    })
  })

  describe('deleteBoardMemory', () => {
    it('deletes a board memory entry', async () => {
      const { deleteBoardMemory } = await import('../board-memory')

      const chain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }
      // Second .eq() call is the final one — resolves the promise
      chain.eq.mockImplementation(function (this: typeof chain) {
        if (chain.eq.mock.calls.length >= 2) {
          return Promise.resolve({ error: null })
        }
        return this
      })
      mockFrom.mockReturnValue(chain)

      const result = await deleteBoardMemory('org-1', 'mem-1')
      expect(result).toBe(true)
    })
  })
})
