/**
 * Linear Agent Client — Unit Tests.
 *
 * Verifies that the LinearAgentClient wraps GraphQL mutations correctly,
 * uses fire-and-forget semantics (catch + warn, never throw), and passes
 * the right payload shapes to the Nango proxy.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LinearAgentClient } from '../adapters/linear/agent-client.js'

// ─── Nango mock ────────────────────────────────────────────────────────────

const mockNangoPost = vi.fn()

vi.mock('../../agent/oauth-tools/nango-client.js', () => ({
  getNangoClient: () => ({
    post: mockNangoPost,
  }),
}))

describe('LinearAgentClient', () => {
  let client: LinearAgentClient

  beforeEach(() => {
    mockNangoPost.mockReset()
    mockNangoPost.mockResolvedValue({ data: { data: { agentActivityCreate: { success: true } } } })
    client = new LinearAgentClient('conn-agent-1', 'linear-agent')
  })

  describe('emitThought', () => {
    it('sends a thought activity with correct GraphQL shape', async () => {
      await client.emitThought('session-1', 'Analyzing issue...')

      expect(mockNangoPost).toHaveBeenCalledOnce()
      const call = mockNangoPost.mock.calls[0][0]
      expect(call.connectionId).toBe('conn-agent-1')
      expect(call.providerConfigKey).toBe('linear-agent')
      expect(call.endpoint).toBe('/graphql')
      const vars = call.data.variables.input
      expect(vars.agentSessionId).toBe('session-1')
      expect(vars.content.type).toBe('thought')
      expect(vars.content.content).toBe('Analyzing issue...')
      expect(vars.ephemeral).toBe(true)
    })

    it('respects ephemeral=false', async () => {
      await client.emitThought('session-1', 'Permanent thought', false)

      const vars = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(vars.ephemeral).toBe(false)
    })
  })

  describe('emitAction', () => {
    it('sends an action activity with name, input, and result', async () => {
      await client.emitAction('session-1', 'search_code', '{"query":"bug"}', 'Found 3 results')

      const vars = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(vars.content.type).toBe('action')
      expect(vars.content.name).toBe('search_code')
      expect(vars.content.input).toBe('{"query":"bug"}')
      expect(vars.content.result).toBe('Found 3 results')
    })

    it('omits input and result when not provided', async () => {
      await client.emitAction('session-1', 'ping')

      const vars = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(vars.content.name).toBe('ping')
      expect(vars.content.input).toBeUndefined()
      expect(vars.content.result).toBeUndefined()
    })
  })

  describe('emitElicitation', () => {
    it('sends a non-ephemeral elicitation activity', async () => {
      await client.emitElicitation('session-1', 'Can you clarify the requirements?')

      const vars = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(vars.content.type).toBe('elicitation')
      expect(vars.ephemeral).toBe(false)
    })
  })

  describe('emitResponse', () => {
    it('sends a non-ephemeral response activity', async () => {
      await client.emitResponse('session-1', 'Here is the fix...')

      const vars = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(vars.content.type).toBe('response')
      expect(vars.content.content).toBe('Here is the fix...')
      expect(vars.ephemeral).toBe(false)
    })
  })

  describe('emitError', () => {
    it('sends a non-ephemeral error activity with errorCode', async () => {
      await client.emitError('session-1', 'Failed to process', 'RATE_LIMIT')

      const vars = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(vars.content.type).toBe('error')
      expect(vars.content.content).toBe('Failed to process')
      expect(vars.content.errorCode).toBe('RATE_LIMIT')
      expect(vars.ephemeral).toBe(false)
    })

    it('omits errorCode when not provided', async () => {
      await client.emitError('session-1', 'Something went wrong')

      const vars = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(vars.content.errorCode).toBeUndefined()
    })
  })

  describe('publishPlan', () => {
    it('sends a session update with plan steps', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { agentSessionUpdate: { success: true } } },
      })

      await client.publishPlan('session-1', [
        { title: 'Analyze', status: 'completed' },
        { title: 'Fix', description: 'Apply patch', status: 'in_progress' },
      ])

      const vars = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(vars.id).toBe('session-1')
      expect(vars.plan).toHaveLength(2)
      expect(vars.plan[0].title).toBe('Analyze')
      expect(vars.plan[1].description).toBe('Apply patch')
    })
  })

  describe('setExternalUrl', () => {
    it('sends a session update with external URL', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { agentSessionUpdate: { success: true } } },
      })

      await client.setExternalUrl('session-1', 'View in Lucid', 'https://lucid.app/run/123')

      const vars = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(vars.id).toBe('session-1')
      expect(vars.externalUrls).toEqual([
        { label: 'View in Lucid', url: 'https://lucid.app/run/123' },
      ])
    })
  })

  describe('updateSessionStatus', () => {
    it('sends a session update with status', async () => {
      mockNangoPost.mockResolvedValueOnce({
        data: { data: { agentSessionUpdate: { success: true } } },
      })

      await client.updateSessionStatus('session-1', 'completed')

      const vars = mockNangoPost.mock.calls[0][0].data.variables.input
      expect(vars.id).toBe('session-1')
      expect(vars.status).toBe('completed')
    })
  })

  describe('fire-and-forget error handling', () => {
    it('catches and warns on activity creation failure', async () => {
      mockNangoPost.mockRejectedValueOnce(new Error('Network timeout'))
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await client.emitThought('session-1', 'test')

      expect(warnSpy).toHaveBeenCalledWith(
        '[LinearAgentClient] Failed to create activity:',
        expect.objectContaining({
          contentType: 'thought',
          error: 'Network timeout',
          sessionId: 'session-1',
        }),
      )
      warnSpy.mockRestore()
    })

    it('catches and warns on session update failure', async () => {
      mockNangoPost.mockRejectedValueOnce(new Error('Auth expired'))
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await client.updateSessionStatus('session-1', 'completed')

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[LinearAgentClient] Failed to update session'),
        'Auth expired',
      )
      warnSpy.mockRestore()
    })

    it('handles null Nango client gracefully', async () => {
      // Override the mock to return null
      const mod = await import('../../agent/oauth-tools/nango-client.js')
      const originalFn = mod.getNangoClient
      vi.spyOn(mod, 'getNangoClient').mockReturnValueOnce(null as never)

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await client.emitThought('session-1', 'test')

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Nango client not configured'),
      )
      warnSpy.mockRestore()
    })
  })
})
