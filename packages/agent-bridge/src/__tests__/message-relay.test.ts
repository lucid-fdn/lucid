import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MessageRelay } from '../message-relay.js'
import type { ApprovalGate } from '../approval-gate.js'
import { defaultLogger } from '../logger.js'
import type { RunPacket, MessageContext, MessageHandler } from '../types.js'

function mockClient() {
  return { post: vi.fn(), get: vi.fn() }
}

function mockReporter() {
  return { report: vi.fn(), start: vi.fn(), stop: vi.fn(), flush: vi.fn() }
}

function makePacket(overrides: Partial<RunPacket> = {}): RunPacket {
  return {
    eventId: 'evt-1',
    idempotencyToken: 'tok-1',
    channelMeta: {
      channelType: 'telegram',
      channelId: 'ch-1',
      externalUserId: 'user-1',
      externalChatId: 'chat-1',
    },
    assistantConfig: {
      id: 'agent-1',
      name: 'Test Agent',
      engine: 'openclaw',
      systemPrompt: null,
      soulContent: null,
      runtimeFlavor: 'c1_managed',
      modelId: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 4096,
      enabledTools: [],
      policyConfig: {},
      memoryEnabled: true,
      approvalRequiredTools: [], orgId: 'org-test-1',
    },
    recentMessages: [],
    memoryInjection: [],
    boardMemories: [],
    conversationSummary: null,
    userMessage: {
      text: 'Hello',
      externalMessageId: 'msg-1',
      externalUserId: 'user-1',
      messageData: null,
    },
    skills: [],
    plugins: [],
    ...overrides,
  }
}

describe('MessageRelay', () => {
  let client: ReturnType<typeof mockClient>
  let reporter: ReturnType<typeof mockReporter>
  let handler: ReturnType<typeof vi.fn>
  let toolExecutionHandler: ReturnType<typeof vi.fn>
  let relay: MessageRelay

  beforeEach(() => {
    vi.useFakeTimers()
    client = mockClient()
    reporter = mockReporter()
    handler = vi.fn().mockResolvedValue({
      responseText: 'Hello back!',
      tokenUsage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
    })
    toolExecutionHandler = vi.fn().mockResolvedValue({
      status: 'completed',
      output: 'tool ok',
    })
  })

  afterEach(() => {
    relay?.stop()
    vi.useRealTimers()
  })

  function createRelay(
    h: MessageHandler = handler as unknown as MessageHandler,
    toolHandler: typeof toolExecutionHandler | undefined = undefined,
  ): MessageRelay {
    relay = new MessageRelay(
      client as never,
      reporter as never,
      {} as ApprovalGate,
      h,
      toolHandler as never,
      defaultLogger,
      { intervalMs: 5_000, claimWaitMs: 15_000 },
    )
    return relay
  }

  describe('claim and process', () => {
    it('claims and dispatches packets to handler', async () => {
      const packet = makePacket()
      client.post
        .mockResolvedValueOnce({ packets: [packet] })
        .mockResolvedValueOnce({ alreadyApplied: false, delivered: true })
        .mockResolvedValue(undefined)

      createRelay()
      relay.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(packet, expect.objectContaining({
        reportEvent: expect.any(Function),
        requestApproval: expect.any(Function),
        reportCost: expect.any(Function),
        reportAIGeneration: expect.any(Function),
        executeTool: undefined,
      }))
    })

    it('injects structured tool execution when configured', async () => {
      const packet = makePacket()
      const toolHandler = vi.fn(async (_packet: RunPacket, ctx: MessageContext) => {
        const result = await ctx.executeTool?.({
          toolName: 'price_lookup',
          toolArgs: { symbol: 'BTC' },
        })
        return { responseText: result?.output ?? 'missing tool result' }
      })

      client.post
        .mockResolvedValueOnce({ packets: [packet] })
        .mockResolvedValueOnce({ alreadyApplied: false, delivered: true })
        .mockResolvedValue(undefined)

      createRelay(toolHandler as never, toolExecutionHandler)
      relay.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(toolExecutionHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          toolName: 'price_lookup',
          toolArgs: { symbol: 'BTC' },
        }),
      )
    })

    it('sends complete-inbound with response', async () => {
      client.post
        .mockResolvedValueOnce({ packets: [makePacket()] })
        .mockResolvedValueOnce({ alreadyApplied: false, delivered: true })
        .mockResolvedValue(undefined)

      createRelay()
      relay.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(client.post).toHaveBeenCalledWith(
        '/api/runtimes/messages/complete-inbound',
        expect.objectContaining({
          eventId: 'evt-1',
          responseText: 'Hello back!',
        }),
      )
    })

    it('reports AI generation receipt with the same run id as complete-inbound', async () => {
      client.post
        .mockResolvedValueOnce({ packets: [makePacket()] })
        .mockResolvedValueOnce({ alreadyApplied: false, delivered: true })
        .mockResolvedValue(undefined)

      createRelay()
      relay.start()
      await vi.advanceTimersByTimeAsync(0)

      const completeCall = client.post.mock.calls.find(
        (c: unknown[]) => c[0] === '/api/runtimes/messages/complete-inbound',
      )
      const receiptCall = client.post.mock.calls.find(
        (c: unknown[]) => c[0] === '/api/runtimes/ai-generation-events',
      )

      expect(receiptCall).toBeDefined()
      expect(receiptCall?.[1]).toEqual(expect.objectContaining({
        agentId: 'agent-1',
        runId: completeCall?.[1].runId,
        feature: 'agent-run',
        modality: 'agent-run',
        model: 'gpt-4o',
        usage: expect.objectContaining({
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        }),
      }))
    })

    it('handles empty claim (no packets)', async () => {
      client.post.mockResolvedValueOnce({ packets: [] })

      createRelay()
      relay.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('event emission', () => {
    it('emits run_started and run_finished events', async () => {
      client.post
        .mockResolvedValueOnce({ packets: [makePacket()] })
        .mockResolvedValueOnce({ alreadyApplied: false, delivered: true })
        .mockResolvedValue(undefined)

      createRelay()
      relay.start()
      await vi.advanceTimersByTimeAsync(0)

      const eventTypes = reporter.report.mock.calls.map(
        (c: unknown[]) => (c[0] as { eventType: string }).eventType,
      )
      expect(eventTypes).toContain('run_started')
      expect(eventTypes).toContain('run_finished')
    })

    it('emits error event on handler failure', async () => {
      client.post.mockResolvedValueOnce({ packets: [makePacket()] })

      const failHandler = vi.fn().mockRejectedValue(new Error('Agent crashed'))
      createRelay(failHandler)
      relay.start()
      await vi.advanceTimersByTimeAsync(0)

      const errorEvents = reporter.report.mock.calls.filter(
        (c: unknown[]) => (c[0] as { eventType: string }).eventType === 'error',
      )
      expect(errorEvents).toHaveLength(1)
    })
  })

  describe('backoff and lifecycle', () => {
    it('backs off on consecutive failures', async () => {
      client.post.mockRejectedValue(new Error('Network'))

      createRelay()
      relay.start()

      await vi.advanceTimersByTimeAsync(0) // first fail
      await vi.advanceTimersByTimeAsync(1_000) // backoff 1s
      await vi.advanceTimersByTimeAsync(2_000) // backoff 2s

      expect(client.post.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('stops polling after stop()', async () => {
      client.post.mockResolvedValue({ packets: [] })

      createRelay()
      relay.start()
      await vi.advanceTimersByTimeAsync(0)

      const callCount = client.post.mock.calls.length
      relay.stop()

      await vi.advanceTimersByTimeAsync(30_000)
      expect(client.post.mock.calls.length).toBe(callCount)
    })

    it('uses idle interval after a successful empty long-poll', async () => {
      client.post.mockResolvedValue({ packets: [] })

      createRelay()
      relay.start()

      await vi.advanceTimersByTimeAsync(0)
      expect(client.post).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(4_999)
      expect(client.post).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(client.post).toHaveBeenCalledTimes(2)
    })
  })
})
