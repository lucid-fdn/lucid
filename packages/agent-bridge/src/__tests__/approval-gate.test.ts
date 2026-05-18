import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApprovalGate } from '../approval-gate.js'
import { defaultLogger } from '../logger.js'
import type { ApprovalRequest } from '../types.js'

function mockClient() {
  return {
    post: vi.fn().mockResolvedValue({ approvalId: 'approval-1' }),
    get: vi.fn(),
  }
}

function request(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    agentId: 'agent-1',
    toolName: 'dex_swap',
    toolArgs: { amount: 100 },
    runId: 'run-1',
    timeoutMs: 10_000,
    ...overrides,
  }
}

describe('ApprovalGate', () => {
  let client: ReturnType<typeof mockClient>
  let gate: ApprovalGate

  beforeEach(() => {
    vi.useFakeTimers()
    client = mockClient()
    gate = new ApprovalGate(client as never, defaultLogger)
  })

  describe('resolution polling', () => {
    it('returns approved resolution after polling', async () => {
      client.get.mockResolvedValueOnce({ status: 'pending' })
      client.get.mockResolvedValueOnce({ status: 'approved', resolvedAt: '2026-01-01T00:00:00Z' })

      const promise = gate.requestApproval(request())

      await vi.advanceTimersByTimeAsync(2_000)
      await vi.advanceTimersByTimeAsync(2_000)

      const result = await promise
      expect(result.decision).toBe('approved')
      expect(result.resolvedAt).toBe('2026-01-01T00:00:00Z')
    })

    it('returns denied resolution', async () => {
      client.get.mockResolvedValueOnce({ status: 'denied', resolvedAt: '2026-01-01T00:00:00Z' })

      const promise = gate.requestApproval(request())
      await vi.advanceTimersByTimeAsync(2_000)

      const result = await promise
      expect(result.decision).toBe('denied')
    })

    it('returns expired when timeout is reached', async () => {
      client.get.mockResolvedValue({ status: 'pending' })

      const promise = gate.requestApproval(request())

      for (let i = 0; i < 6; i++) {
        await vi.advanceTimersByTimeAsync(2_000)
      }

      const result = await promise
      expect(result.decision).toBe('expired')
    })
  })

  describe('API calls', () => {
    it('submits to correct endpoint with request payload', async () => {
      client.get.mockResolvedValueOnce({ status: 'approved', resolvedAt: 'now' })
      const req = request()

      const promise = gate.requestApproval(req)
      await vi.advanceTimersByTimeAsync(2_000)
      await promise

      expect(client.post).toHaveBeenCalledWith('/api/runtimes/approvals', req)
    })

    it('polls correct endpoint with approval ID', async () => {
      client.get.mockResolvedValueOnce({ status: 'approved', resolvedAt: 'now' })

      const promise = gate.requestApproval(request())
      await vi.advanceTimersByTimeAsync(2_000)
      await promise

      expect(client.get).toHaveBeenCalledWith(
        '/api/runtimes/approvals/pending?approval_id=approval-1',
      )
    })
  })
})
