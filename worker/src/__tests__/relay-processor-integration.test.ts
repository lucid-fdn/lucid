/**
 * Relay Processor Integration Tests
 *
 * Tests processRelayPacket with per-channel metadata, delivery outcomes,
 * token usage propagation, and error classification.
 * Covers: Telegram, Discord, WhatsApp, Web channel types.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunPacket, DataSink, CompleteResult } from '../runtime/data-sink.js'

// Mock agent runner with configurable responses
const mockRunAgent = vi.fn()
vi.mock('../agent/engines/index.js', () => ({
  runAgent: (...args: unknown[]) => mockRunAgent(...args),
}))

// Mock event reporter
const mockReportEvent = vi.fn()
vi.mock('../runtime/event-reporter.js', () => ({
  reportEvent: (...args: unknown[]) => mockReportEvent(...args),
}))

// ─── Fixtures ───

const CHANNEL_TYPES = ['telegram', 'discord', 'whatsapp', 'web'] as const

function createPacket(channelType: string, overrides?: Partial<RunPacket>): RunPacket {
  return {
    eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    idempotencyToken: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d:tok',
    channelMeta: {
      channelType,
      channelId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      externalUserId: `user_${channelType}`,
      externalChatId: `chat_${channelType}`,
      threadId: channelType === 'discord' ? 'thread_ts_123' : undefined,
    },
    assistantConfig: {
      id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
      name: `Test Agent (${channelType})`,
      engine: 'openclaw',
      systemPrompt: 'You are helpful.',
      runtimeFlavor: 'c1_managed',
      modelId: 'openai/gpt-4.1',
      temperature: 0.7,
      maxTokens: 4096,
      enabledTools: [],
      policyConfig: {},
      memoryEnabled: true,
      approvalRequiredTools: [],
    },
    recentMessages: [
      { role: 'user', content: 'Previous message', createdAt: '2026-03-30T00:00:00Z' },
    ],
    memoryInjection: ['User prefers concise answers'],
    conversationSummary: null,
    userMessage: {
      text: 'Hello from ' + channelType,
      externalMessageId: `ext_${channelType}_1`,
      externalUserId: `user_${channelType}`,
      messageData: null,
    },
    skills: [],
    plugins: [],
    ...overrides,
  }
}

function createDataSink(completeResult?: Partial<CompleteResult>): DataSink {
  return {
    reportHeartbeat: vi.fn(),
    reportEvents: vi.fn(),
    submitApproval: vi.fn(),
    pollApprovalResolution: vi.fn(),
    reportHealthScores: vi.fn(),
    reportCosts: vi.fn(),
    reportAIGeneration: vi.fn(),
    claimInboundEvents: vi.fn(),
    completeInboundEvent: vi.fn().mockResolvedValue({
      alreadyApplied: false,
      delivered: true,
      externalMessageId: 'ext_msg_out_1',
      channelType: 'telegram',
      ...completeResult,
    }),
  }
}

const DEFAULT_CONFIG = {
  DEFAULT_MAX_LLM_CALLS: 15,
  DEFAULT_MAX_TOOL_CALLS: 10,
  DEFAULT_MAX_WALL_TIME_MS: 60_000,
  LUCID_API_BASE_URL: 'http://localhost:3001',
  LUCID_API_KEY: 'test-key',
} as any

describe('Relay Processor — Channel Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunAgent.mockResolvedValue({
      text: 'Agent response',
      usage: { promptTokens: 200, completionTokens: 80 },
    })
  })

  // ─── Per-Channel Processing ───

  describe.each(CHANNEL_TYPES)('channel: %s', (channelType) => {
    it(`processes ${channelType} packet end-to-end`, async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const packet = createPacket(channelType)
      const dataSink = createDataSink({ channelType })

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      // Agent was called with correct channel context
      expect(mockRunAgent).toHaveBeenCalledOnce()
      const agentArgs = mockRunAgent.mock.calls[0][0]
      expect(agentArgs.userId).toBe(`user_${channelType}`)
      expect(agentArgs.userMessage).toBe(`Hello from ${channelType}`)

      // Complete was called with response
      expect(dataSink.completeInboundEvent).toHaveBeenCalledOnce()
      const completeArgs = vi.mocked(dataSink.completeInboundEvent!).mock.calls[0][0]
      expect(completeArgs.eventId).toBe(packet.eventId)
      expect(completeArgs.responseText).toBe('Agent response')
    })

    it(`propagates ${channelType} thread context`, async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const threadId = channelType === 'discord' ? 'thread_ts_123' : undefined
      const packet = createPacket(channelType, {
        channelMeta: {
          channelType,
          channelId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
          externalUserId: 'user1',
          externalChatId: 'chat1',
          threadId,
        },
      })
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      expect(dataSink.completeInboundEvent).toHaveBeenCalledOnce()
    })
  })

  // ─── Token Usage Propagation ───

  describe('token usage', () => {
    it('propagates token usage from agent result', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      mockRunAgent.mockResolvedValue({
        text: 'Response with usage',
        usage: { promptTokens: 500, completionTokens: 200 },
      })

      const packet = createPacket('telegram')
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      const payload = vi.mocked(dataSink.completeInboundEvent!).mock.calls[0][0]
      expect(payload.tokenUsage).toEqual({
        inputTokens: 500,
        outputTokens: 200,
        estimatedCostUsd: 0,
      })
    })

    it('normalizes missing usage to zero usage', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      mockRunAgent.mockResolvedValue({
        text: 'Response without usage',
        usage: undefined,
      })

      const packet = createPacket('discord')
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      const payload = vi.mocked(dataSink.completeInboundEvent!).mock.calls[0][0]
      expect(payload.tokenUsage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      })
    })

    it('handles zero token usage', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      mockRunAgent.mockResolvedValue({
        text: 'Cached response',
        usage: { promptTokens: 0, completionTokens: 0 },
      })

      const packet = createPacket('web')
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      const payload = vi.mocked(dataSink.completeInboundEvent!).mock.calls[0][0]
      expect(payload.tokenUsage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      })
    })
  })

  // ─── Response Text Handling ───

  describe('response text', () => {
    it('trims whitespace from response', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      mockRunAgent.mockResolvedValue({
        text: '  Hello world  \n',
        usage: { promptTokens: 10, completionTokens: 5 },
      })

      const packet = createPacket('telegram')
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      const payload = vi.mocked(dataSink.completeInboundEvent!).mock.calls[0][0]
      expect(payload.responseText).toBe('Hello world')
    })

    it('uses fallback text when agent returns empty', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      mockRunAgent.mockResolvedValue({
        text: '',
        usage: { promptTokens: 10, completionTokens: 0 },
      })

      const packet = createPacket('whatsapp')
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      const payload = vi.mocked(dataSink.completeInboundEvent!).mock.calls[0][0]
      expect(payload.responseText).toBe('[No response generated]')
    })

    it('uses fallback text when agent returns null', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      mockRunAgent.mockResolvedValue({
        text: null,
        usage: { promptTokens: 10, completionTokens: 0 },
      })

      const packet = createPacket('discord')
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      const payload = vi.mocked(dataSink.completeInboundEvent!).mock.calls[0][0]
      expect(payload.responseText).toBe('[No response generated]')
    })
  })

  // ─── Delivery Outcomes ───

  describe('delivery outcomes', () => {
    it('handles successful delivery', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const packet = createPacket('telegram')
      const dataSink = createDataSink({ delivered: true })

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      // run_finished event should include delivered=true
      const finishEvent = mockReportEvent.mock.calls.find(
        (c: any[]) => c[0].eventType === 'run_finished'
      )
      expect(finishEvent).toBeTruthy()
      expect(finishEvent![0].payload.delivered).toBe(true)
      consoleSpy.mockRestore()
    })

    it('handles delivery failure with error message', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const packet = createPacket('discord')
      const dataSink = createDataSink({
        delivered: false,
        deliveryError: 'Discord: 403 Missing Permissions',
      })

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('delivery failed')
      )
      consoleSpy.mockRestore()
    })

    it('handles already_applied idempotent response', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const packet = createPacket('web')
      const dataSink = createDataSink({ alreadyApplied: true, delivered: true })

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('already completed')
      )
      consoleSpy.mockRestore()
    })
  })

  // ─── Error Classification ───

  describe('error handling', () => {
    it('completes with a fail-soft response on agent failure', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      mockRunAgent.mockRejectedValueOnce(new Error('Context window exceeded'))

      const packet = createPacket('telegram')
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      expect(dataSink.completeInboundEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: packet.eventId,
          responseText: 'Context window exceeded',
          tokenUsage: {
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostUsd: 0,
          },
        }),
      )
    })

    it('reports failed AI generation receipt on agent failure', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      mockRunAgent.mockRejectedValueOnce(new Error('Rate limited'))

      const packet = createPacket('discord')
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      const finishedEvent = mockReportEvent.mock.calls.find(
        (c: any[]) => c[0].eventType === 'run_finished'
      )
      expect(finishedEvent).toBeTruthy()
      expect(dataSink.reportAIGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Rate limited',
        }),
      )
    })

    it('handles completeInboundEvent network failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const packet = createPacket('discord')
      const dataSink = createDataSink()
      vi.mocked(dataSink.completeInboundEvent!).mockRejectedValueOnce(
        new Error('Network timeout')
      )

      // Should not throw
      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed')
      )
      consoleSpy.mockRestore()
    })

    it('handles DataSink without completeInboundEvent', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const packet = createPacket('telegram')
      const dataSink: DataSink = {
        reportHeartbeat: vi.fn(),
        reportEvents: vi.fn(),
        submitApproval: vi.fn(),
        pollApprovalResolution: vi.fn(),
        reportHealthScores: vi.fn(),
        reportCosts: vi.fn(),
        // No claimInboundEvents or completeInboundEvent
      }

      // Should not throw — catches error internally
      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)
      consoleSpy.mockRestore()
    })
  })

  // ─── Event Reporting ───

  describe('event reporting', () => {
    it('includes source=relay in run_started event', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const packet = createPacket('telegram')
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      const startEvent = mockReportEvent.mock.calls.find(
        (c: any[]) => c[0].eventType === 'run_started'
      )
      expect(startEvent![0].payload.source).toBe('relay')
      expect(startEvent![0].payload.eventId).toBe(packet.eventId)
    })

    it('includes elapsed time and token count in run_finished', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const packet = createPacket('web')
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      const finishEvent = mockReportEvent.mock.calls.find(
        (c: any[]) => c[0].eventType === 'run_finished'
      )
      expect(finishEvent![0].payload.elapsedMs).toBeGreaterThanOrEqual(0)
      expect(finishEvent![0].payload.tokens).toBe(280) // 200 + 80
    })
  })

  // ─── Memory & Context Injection ───

  describe('context injection', () => {
    it('passes memory injection to agent', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const packet = createPacket('telegram', {
        memoryInjection: ['User is a developer', 'Prefers TypeScript'],
      })
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      const agentArgs = mockRunAgent.mock.calls[0][0]
      expect(agentArgs.memories).toEqual(['User is a developer', 'Prefers TypeScript'])
    })

    it('passes recent messages to agent', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const packet = createPacket('discord', {
        recentMessages: [
          { role: 'user', content: 'First', createdAt: '2026-03-30T00:00:00Z' },
          { role: 'assistant', content: 'Second', createdAt: '2026-03-30T00:00:01Z' },
          { role: 'user', content: 'Third', createdAt: '2026-03-30T00:00:02Z' },
        ],
      })
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      const agentArgs = mockRunAgent.mock.calls[0][0]
      expect(agentArgs.messages).toHaveLength(3)
      expect(agentArgs.messages[0].role).toBe('user')
    })

    it('passes assistant config to agent', async () => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const packet = createPacket('discord', {
        assistantConfig: {
          id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
          name: 'Custom Agent',
          systemPrompt: 'You are a trading bot.',
          modelId: 'anthropic/claude-sonnet-4-6',
          temperature: 0.3,
          maxTokens: 8192,
          enabledTools: ['get_price', 'dex_swap'],
          policyConfig: { capabilities: ['execute:swap'] },
          memoryEnabled: false,
          approvalRequiredTools: ['dex_swap'],
        },
      })
      const dataSink = createDataSink()

      await processRelayPacket(packet, dataSink, DEFAULT_CONFIG)

      const agentArgs = mockRunAgent.mock.calls[0][0]
      expect(agentArgs.assistant.name).toBe('Custom Agent')
      expect(agentArgs.assistant.lucid_model).toBe('anthropic/claude-sonnet-4-6')
      expect(agentArgs.assistant.policy_config).toEqual({ capabilities: ['execute:swap'] })
      expect(agentArgs.assistant.approval_required_tools).toEqual(['dex_swap'])
    })
  })
})
