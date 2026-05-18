/**
 * Relay E2E Lifecycle Tests
 *
 * Tests the complete claim → process → complete lifecycle,
 * simulating how a dedicated runtime would interact with the control plane.
 * Uses mocked DataSink to verify the full flow without network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunPacket, DataSink, CompleteResult, CompleteInboundPayload } from '../runtime/data-sink.js'

// Mock the agent runner
const mockRunOpenClawAgent = vi.fn()
vi.mock('../agent/OpenClawAgent.js', () => ({
  runOpenClawAgent: (...args: unknown[]) => mockRunOpenClawAgent(...args),
}))

// Mock event reporter
vi.mock('../runtime/event-reporter.js', () => ({
  reportEvent: vi.fn(),
}))

// ─── Packet Factory ───

function makePacket(overrides?: Partial<RunPacket>): RunPacket {
  return {
    eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    idempotencyToken: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d:tok',
    channelMeta: {
      channelType: 'telegram',
      channelId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      externalUserId: 'user_tg_1',
      externalChatId: 'chat_tg_1',
    },
    assistantConfig: {
      id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
      name: 'Test Agent',
      systemPrompt: 'You are helpful.',
      modelId: 'openai/gpt-4.1',
      temperature: 0.7,
      maxTokens: 4096,
      enabledTools: [],
      policyConfig: {},
      memoryEnabled: true,
      approvalRequiredTools: [],
    },
    recentMessages: [],
    memoryInjection: [],
    conversationSummary: null,
    userMessage: {
      text: 'Hello',
      externalMessageId: 'ext_1',
      externalUserId: 'user_tg_1',
      messageData: null,
    },
    skills: [],
    plugins: [],
    ...overrides,
  }
}

const CONFIG = {
  DEFAULT_MAX_LLM_CALLS: 15,
  DEFAULT_MAX_TOOL_CALLS: 10,
  DEFAULT_MAX_WALL_TIME_MS: 60_000,
  LUCID_API_BASE_URL: 'http://localhost:3001',
  LUCID_API_KEY: 'test-key',
} as any

describe('Relay E2E Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunOpenClawAgent.mockResolvedValue({
      text: 'Agent response text',
      usage: { promptTokens: 150, completionTokens: 60 },
    })
  })

  // ─── Happy Path ───

  it('claim → process → complete lifecycle succeeds', async () => {
    const { processRelayPacket } = await import('../processors/relay-inbound.js')

    // Simulate claim: DataSink returns packets
    const packets = [makePacket(), makePacket({
      eventId: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80',
      idempotencyToken: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80:tok',
      userMessage: {
        text: 'Second message',
        externalMessageId: 'ext_2',
        externalUserId: 'user_tg_2',
        messageData: null,
      },
    })]

    // Process each packet
    const completeResults: CompleteResult[] = []
    for (const packet of packets) {
      const dataSink: DataSink = {
        reportHeartbeat: vi.fn(),
        reportEvents: vi.fn(),
        submitApproval: vi.fn(),
        pollApprovalResolution: vi.fn(),
        reportHealthScores: vi.fn(),
        reportCosts: vi.fn(),
        claimInboundEvents: vi.fn(),
        completeInboundEvent: vi.fn().mockResolvedValue({
          alreadyApplied: false,
          delivered: true,
          externalMessageId: `ext_out_${packet.eventId}`,
          channelType: 'telegram',
        }),
      }

      await processRelayPacket(packet, dataSink, CONFIG)

      const result = vi.mocked(dataSink.completeInboundEvent!).mock.results[0]?.value
      if (result) completeResults.push(await result)
    }

    expect(completeResults).toHaveLength(2)
    expect(completeResults.every(r => r.delivered)).toBe(true)
    expect(mockRunOpenClawAgent).toHaveBeenCalledTimes(2)
  })

  // ─── Idempotent Replay ───

  it('retrying same packet returns already_applied', async () => {
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const packet = makePacket()

    // First attempt: succeeds
    const dataSink1: DataSink = {
      reportHeartbeat: vi.fn(),
      reportEvents: vi.fn(),
      submitApproval: vi.fn(),
      pollApprovalResolution: vi.fn(),
      reportHealthScores: vi.fn(),
      reportCosts: vi.fn(),
      completeInboundEvent: vi.fn().mockResolvedValue({
        alreadyApplied: false,
        delivered: true,
        externalMessageId: 'ext_out_1',
        channelType: 'telegram',
      }),
    }
    await processRelayPacket(packet, dataSink1, CONFIG)
    expect(dataSink1.completeInboundEvent).toHaveBeenCalledOnce()

    // Second attempt: idempotent
    const dataSink2: DataSink = {
      reportHeartbeat: vi.fn(),
      reportEvents: vi.fn(),
      submitApproval: vi.fn(),
      pollApprovalResolution: vi.fn(),
      reportHealthScores: vi.fn(),
      reportCosts: vi.fn(),
      completeInboundEvent: vi.fn().mockResolvedValue({
        alreadyApplied: true,
        delivered: true,
      }),
    }
    await processRelayPacket(packet, dataSink2, CONFIG)
    expect(dataSink2.completeInboundEvent).toHaveBeenCalledOnce()

    // Verify idempotent path was logged
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('already completed')
    )
    consoleSpy.mockRestore()
  })

  // ─── Delivery Failure + Retry ───

  it('delivery failure is logged but does not fail the flow', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const packet = makePacket()

    const dataSink: DataSink = {
      reportHeartbeat: vi.fn(),
      reportEvents: vi.fn(),
      submitApproval: vi.fn(),
      pollApprovalResolution: vi.fn(),
      reportHealthScores: vi.fn(),
      reportCosts: vi.fn(),
      completeInboundEvent: vi.fn().mockResolvedValue({
        alreadyApplied: false,
        delivered: false,
        deliveryError: 'Telegram: 403 bot was blocked by the user',
      }),
    }

    await processRelayPacket(packet, dataSink, CONFIG)

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('delivery failed')
    )
    consoleSpy.mockRestore()
  })

  // ─── Agent Failure Recovery ───

  it('agent failure completes with a fail-soft response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    mockRunOpenClawAgent.mockRejectedValueOnce(new Error('OOM killed'))

    const packet = makePacket()
    const dataSink: DataSink = {
      reportHeartbeat: vi.fn(),
      reportEvents: vi.fn(),
      submitApproval: vi.fn(),
      pollApprovalResolution: vi.fn(),
      reportHealthScores: vi.fn(),
      reportCosts: vi.fn(),
      completeInboundEvent: vi.fn().mockResolvedValue({
        alreadyApplied: false,
        delivered: true,
        externalMessageId: 'ext-error-1',
        channelType: 'telegram',
      }),
    }

    await processRelayPacket(packet, dataSink, CONFIG)

    expect(dataSink.completeInboundEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: packet.eventId,
        responseText: 'OOM killed',
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
        },
      }),
    )
    consoleSpy.mockRestore()
  })

  // ─── Batch Processing ───

  it('processes multiple packets sequentially', async () => {
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    for (let i = 0; i < 3; i++) {
      const packet = makePacket({
        eventId: `a${i}b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d`,
        userMessage: {
          text: `Message ${i + 1}`,
          externalMessageId: `ext_${i + 1}`,
          externalUserId: `user_${i + 1}`,
          messageData: null,
        },
      })
      const dataSink: DataSink = {
        reportHeartbeat: vi.fn(),
        reportEvents: vi.fn(),
        submitApproval: vi.fn(),
        pollApprovalResolution: vi.fn(),
        reportHealthScores: vi.fn(),
        reportCosts: vi.fn(),
        completeInboundEvent: vi.fn().mockResolvedValue({
          alreadyApplied: false,
          delivered: true,
          channelType: 'telegram',
        }),
      }
      await processRelayPacket(packet, dataSink, CONFIG)
      expect(dataSink.completeInboundEvent).toHaveBeenCalledOnce()
    }

    expect(mockRunOpenClawAgent).toHaveBeenCalledTimes(3)
    consoleSpy.mockRestore()
  })

  // ─── Token Usage Propagation ───

  it('normalizes missing usage to zero usage', async () => {
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    mockRunOpenClawAgent.mockResolvedValue({ text: 'Cached', usage: undefined })

    const packet = makePacket()
    const dataSink: DataSink = {
      reportHeartbeat: vi.fn(),
      reportEvents: vi.fn(),
      submitApproval: vi.fn(),
      pollApprovalResolution: vi.fn(),
      reportHealthScores: vi.fn(),
      reportCosts: vi.fn(),
      completeInboundEvent: vi.fn().mockResolvedValue({
        alreadyApplied: false,
        delivered: true,
      }),
    }

    await processRelayPacket(packet, dataSink, CONFIG)

    const payload = vi.mocked(dataSink.completeInboundEvent!).mock.calls[0][0]
    expect(payload.tokenUsage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    })
  })

  // ─── Per-Channel Type ───

  it.each(['telegram', 'discord', 'whatsapp', 'web'] as const)(
    'processes %s channel type correctly',
    async (channelType) => {
      const { processRelayPacket } = await import('../processors/relay-inbound.js')
      const packet = makePacket({
        channelMeta: {
          channelType,
          channelId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
          externalUserId: `user_${channelType}`,
          externalChatId: `chat_${channelType}`,
        },
      })

      const dataSink: DataSink = {
        reportHeartbeat: vi.fn(),
        reportEvents: vi.fn(),
        submitApproval: vi.fn(),
        pollApprovalResolution: vi.fn(),
        reportHealthScores: vi.fn(),
        reportCosts: vi.fn(),
        completeInboundEvent: vi.fn().mockResolvedValue({
          alreadyApplied: false,
          delivered: true,
          channelType,
        }),
      }

      await processRelayPacket(packet, dataSink, CONFIG)

      expect(dataSink.completeInboundEvent).toHaveBeenCalledOnce()
      const payload = vi.mocked(dataSink.completeInboundEvent!).mock.calls[0][0] as CompleteInboundPayload
      expect(payload.eventId).toBe(packet.eventId)
      expect(payload.responseText).toBe('Agent response text')
    }
  )

  // ─── Event Reporting Consistency ───

  it('always reports run_started before run_finished', async () => {
    const { reportEvent } = await import('../runtime/event-reporter.js')
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const packet = makePacket()
    const dataSink: DataSink = {
      reportHeartbeat: vi.fn(),
      reportEvents: vi.fn(),
      submitApproval: vi.fn(),
      pollApprovalResolution: vi.fn(),
      reportHealthScores: vi.fn(),
      reportCosts: vi.fn(),
      completeInboundEvent: vi.fn().mockResolvedValue({
        alreadyApplied: false,
        delivered: true,
      }),
    }

    await processRelayPacket(packet, dataSink, CONFIG)

    const events = vi.mocked(reportEvent).mock.calls.map((c: any[]) => c[0].eventType)
    const startIdx = events.indexOf('run_started')
    const finishIdx = events.indexOf('run_finished')
    expect(startIdx).toBeGreaterThanOrEqual(0)
    expect(finishIdx).toBeGreaterThan(startIdx)
  })

  it('reports provider-error completion on agent failure', async () => {
    const { reportEvent } = await import('../runtime/event-reporter.js')
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRunOpenClawAgent.mockRejectedValueOnce(new Error('Model unavailable'))

    const packet = makePacket()
    const dataSink: DataSink = {
      reportHeartbeat: vi.fn(),
      reportEvents: vi.fn(),
      submitApproval: vi.fn(),
      pollApprovalResolution: vi.fn(),
      reportHealthScores: vi.fn(),
      reportCosts: vi.fn(),
      reportAIGeneration: vi.fn(),
      completeInboundEvent: vi.fn().mockResolvedValue({
        alreadyApplied: false,
        delivered: true,
        externalMessageId: 'ext-error-2',
        channelType: 'telegram',
      }),
    }

    await processRelayPacket(packet, dataSink, CONFIG)

    const finishedEvents = vi.mocked(reportEvent).mock.calls.filter(
      (c: any[]) => c[0].eventType === 'run_finished'
    )
    expect(finishedEvents).toHaveLength(1)
    expect(dataSink.reportAIGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Model unavailable',
      }),
    )
    consoleSpy.mockRestore()
  })
})
