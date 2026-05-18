import { describe, it, expect, vi, beforeEach } from 'vitest'
import { controlActionSchema } from '../schemas'
import type { ControlAction } from '../types'

// Mock server-only
vi.mock('server-only', () => ({}))

// ── Supabase chainable mock ──────────────────────────────────────────
// Each query returns a fresh chain. Behavior set via queryResults queue.

const queryResults: Array<{ data: unknown; error: unknown }> = []

function createChain() {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.select = vi.fn(self)
  chain.insert = vi.fn(self)
  chain.update = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.single = vi.fn(() => {
    const result = queryResults.shift()
    return Promise.resolve(result ?? { data: null, error: null })
  })
  // insert without .select().single() — returns directly
  chain.then = vi.fn((onFulfill: (v: unknown) => void, onReject?: (e: unknown) => void) => {
    const result = queryResults.shift()
    if (result) return Promise.resolve(result).then(onFulfill, onReject)
    return Promise.resolve({ data: null, error: null }).then(onFulfill, onReject)
  })
  return chain
}

const insertResults: Array<{ error: unknown }> = []

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: vi.fn(() => {
      const chain = createChain()
      // Override insert to check insertResults queue first
      chain.insert = vi.fn(() => {
        const insertResult = insertResults.shift() ?? { error: null }
        // Return a thenable that also supports .select().single() chaining
        const result = {
          ...insertResult,
          then: (onFulfill: (v: unknown) => void, onReject?: (e: unknown) => void) =>
            Promise.resolve(insertResult).then(onFulfill, onReject),
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve(insertResult)),
          })),
        }
        return result
      })
      return chain
    }),
  },
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

vi.mock('@/lib/realtime/broadcast', () => ({
  publishRuntimeWake: vi.fn().mockResolvedValue(undefined),
}))

describe('Agent Nudging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryResults.length = 0
    insertResults.length = 0
  })

  describe('Schema', () => {
    it('accepts nudge as a valid control action', () => {
      expect(controlActionSchema.safeParse('nudge').success).toBe(true)
    })

    it('accepts all original control actions', () => {
      const actions: ControlAction[] = ['pause', 'resume', 'kill', 'escalate', 'nudge']
      for (const action of actions) {
        expect(controlActionSchema.safeParse(action).success).toBe(true)
      }
    })

    it('rejects invalid action', () => {
      expect(controlActionSchema.safeParse('invalid').success).toBe(false)
    })
  })

  describe('ControlAction type', () => {
    it('includes nudge in the union', () => {
      const action: ControlAction = 'nudge'
      expect(action).toBe('nudge')
    })
  })

  describe('nudgeAgent', () => {
    it('returns error when agent not found', async () => {
      // Agent query returns not found
      queryResults.push({ data: null, error: { message: 'not found' } })

      const { nudgeAgent } = await import('@/lib/db/mission-control')
      const result = await nudgeAgent('agent-1', 'org-1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Agent not found')
    })

    it('returns error when agent is paused', async () => {
      // Agent found but paused
      queryResults.push({
        data: { id: 'agent-1', name: 'Test', mc_status: 'paused', runtime_id: null },
        error: null,
      })

      const { nudgeAgent } = await import('@/lib/db/mission-control')
      const result = await nudgeAgent('agent-1', 'org-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('paused')
    })

    it('uses default nudge message when none provided', async () => {
      // Agent found active
      queryResults.push({
        data: { id: 'agent-1', name: 'Test', mc_status: 'active', runtime_id: null },
        error: null,
      })
      // Channel found
      queryResults.push({ data: { id: 'channel-1' }, error: null })
      // Event insert OK
      insertResults.push({ error: null })
      // Audit insert OK (fire-and-forget)
      insertResults.push({ error: null })

      const { nudgeAgent } = await import('@/lib/db/mission-control')
      const result = await nudgeAgent('agent-1', 'org-1')

      expect(result.success).toBe(true)
    })

    it('returns error when agent is paused even with custom message', async () => {
      queryResults.push({
        data: { id: 'agent-1', name: 'Test', mc_status: 'paused', runtime_id: null },
        error: null,
      })

      const { nudgeAgent } = await import('@/lib/db/mission-control')
      const result = await nudgeAgent('agent-1', 'org-1', 'Custom message')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Resume')
    })

    it('fires broadcast wake when runtime_id is present', async () => {
      queryResults.push({
        data: { id: 'agent-1', name: 'Test', mc_status: 'active', runtime_id: 'rt-123' },
        error: null,
      })
      queryResults.push({ data: { id: 'channel-1' }, error: null })
      insertResults.push({ error: null })
      insertResults.push({ error: null })

      const { nudgeAgent } = await import('@/lib/db/mission-control')
      await nudgeAgent('agent-1', 'org-1')

      // Dynamic import + .then() — give microtasks time to resolve
      await new Promise((r) => setTimeout(r, 50))
      await vi.dynamicImportSettled?.() // vitest helper if available

      const { publishRuntimeWake } = await import('@/lib/realtime/broadcast')
      expect(publishRuntimeWake).toHaveBeenCalledWith('rt-123', 'inbound')
    })
  })
})
