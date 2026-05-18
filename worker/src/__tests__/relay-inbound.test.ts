/**
 * Phase 1b: Relay inbound processor tests
 *
 * Tests the processRelayPacket function which adapts RunPackets
 * from the REST relay to the existing agent run flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunPacket, DataSink, CompleteResult } from '../runtime/data-sink.js'
import type { OpenClawAgentParams } from '../agent/OpenClawAgent.js'

const mockRunAgent = vi.fn()
vi.mock('../agent/engines/index.js', () => ({
  runAgent: (...args: unknown[]) => mockRunAgent(...args),
}))

const mockResolveTelegramInboundAugmentation = vi.fn()
vi.mock('../channels/bridge/telegram/inbound-media.js', () => ({
  resolveTelegramInboundAugmentation: (...args: unknown[]) =>
    mockResolveTelegramInboundAugmentation(...args),
}))

// Mock event reporter
vi.mock('../runtime/event-reporter.js', () => ({
  reportEvent: vi.fn(),
}))

function createMockPacket(overrides?: Partial<RunPacket>): RunPacket {
  return {
    eventId: '11111111-1111-1111-1111-111111111111',
    idempotencyToken: '11111111-1111-1111-1111-111111111111:token',
    channelMeta: {
      channelType: 'telegram',
      channelId: '22222222-2222-2222-2222-222222222222',
      externalUserId: 'user123',
      externalChatId: 'chat456',
    },
    assistantConfig: {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Test Agent',
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
      orgId: 'org-test-1',
    },
    recentMessages: [
      { role: 'user', content: 'Hi', createdAt: '2026-03-30T00:00:00Z' },
      { role: 'assistant', content: 'Hello!', createdAt: '2026-03-30T00:00:01Z' },
    ],
    memoryInjection: ['User likes coffee'],
    conversationSummary: null,
    userMessage: {
      text: 'What is my balance?',
      externalMessageId: 'msg_123',
      externalUserId: 'user123',
      messageData: null,
    },
    skills: [],
    plugins: [],
    ...overrides,
  }
}

function createMockDataSink(completeResult?: Partial<CompleteResult>): DataSink {
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
      externalMessageId: 'ext_msg_1',
      channelType: 'telegram',
      ...completeResult,
    }),
  }
}

function summarizeEngineRunRequest(args: OpenClawAgentParams) {
  return {
    assistant: {
      id: args.assistant.id,
      name: args.assistant.name,
      engine: args.assistant.engine,
      runtime_flavor: args.assistant.runtime_flavor ?? null,
      system_prompt: args.assistant.system_prompt,
      soul_content: args.assistant.soul_content ?? null,
      lucid_model: args.assistant.lucid_model,
      temperature: args.assistant.temperature,
      max_tokens: args.assistant.max_tokens,
      memory_enabled: args.assistant.memory_enabled,
      org_id: args.assistant.org_id,
      policy_config: args.assistant.policy_config,
      approval_required_tools: args.assistant.approval_required_tools,
    },
    conversationId: args.conversationId,
    channelId: args.channelId,
    userId: args.userId,
    userMessage: args.userMessage,
    messages: args.messages,
    memories: args.memories,
    boardMemories: args.boardMemories ?? [],
    llmConfig: args.llmConfig,
    budget: args.budget,
  }
}

describe('processRelayPacket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunAgent.mockResolvedValue({
      text: 'Hello from agent',
      usage: { promptTokens: 100, completionTokens: 50 },
    })
    mockResolveTelegramInboundAugmentation.mockImplementation(async ({ messageText }: { messageText: string }) => ({
      effectiveText: messageText,
      images: [],
    }))
  })

  it('processes a packet and calls completeInboundEvent', async () => {
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const packet = createMockPacket({
      _pulse: {
        runId: '11111111-1111-1111-1111-111111111111:1',
        leaseToken: 'relay-runtime-1',
        agentId: '33333333-3333-3333-3333-333333333333',
      },
    })
    const dataSink = createMockDataSink()
    const config = { DEFAULT_MAX_LLM_CALLS: 15, DEFAULT_MAX_TOOL_CALLS: 10, DEFAULT_MAX_WALL_TIME_MS: 60000, LUCID_API_BASE_URL: 'http://localhost:3001', LUCID_API_KEY: 'test' } as any

    await processRelayPacket(packet, dataSink, config)

    expect(dataSink.completeInboundEvent).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(dataSink.completeInboundEvent!).mock.calls[0][0]
    expect(callArgs.eventId).toBe(packet.eventId)
    expect(callArgs.runId).toBe(packet._pulse!.runId)
    expect(callArgs.responseText).toBe('Hello from agent')
    expect(callArgs.resolvedUserMessageText).toBe('What is my balance?')
    expect(callArgs.tokenUsage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0, // Estimated on control plane
    })
    expect(dataSink.reportAIGeneration).toHaveBeenCalledWith(expect.objectContaining({
      agentId: packet.assistantConfig.id,
      runId: packet._pulse!.runId,
      feature: 'agent-run',
      modality: 'agent-run',
      usage: expect.objectContaining({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      }),
    }))
  })

  it('handles idempotent completion gracefully', async () => {
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const packet = createMockPacket()
    const dataSink = createMockDataSink({ alreadyApplied: true, delivered: true })
    const config = { DEFAULT_MAX_LLM_CALLS: 15, DEFAULT_MAX_TOOL_CALLS: 10, DEFAULT_MAX_WALL_TIME_MS: 60000, LUCID_API_BASE_URL: 'http://localhost:3001', LUCID_API_KEY: 'test' } as any

    // Should not throw
    await processRelayPacket(packet, dataSink, config)

    expect(dataSink.completeInboundEvent).toHaveBeenCalledOnce()
  })

  it('logs warning when delivery fails but does not throw', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const packet = createMockPacket()
    const dataSink = createMockDataSink({
      delivered: false,
      deliveryError: 'Telegram: 403 Forbidden',
    })
    const config = { DEFAULT_MAX_LLM_CALLS: 15, DEFAULT_MAX_TOOL_CALLS: 10, DEFAULT_MAX_WALL_TIME_MS: 60000, LUCID_API_BASE_URL: 'http://localhost:3001', LUCID_API_KEY: 'test' } as any

    await processRelayPacket(packet, dataSink, config)

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('delivery failed')
    )
    consoleSpy.mockRestore()
  })

  it('reports run_started and run_finished events', async () => {
    const { reportEvent } = await import('../runtime/event-reporter.js')
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const packet = createMockPacket()
    const dataSink = createMockDataSink()
    const config = { DEFAULT_MAX_LLM_CALLS: 15, DEFAULT_MAX_TOOL_CALLS: 10, DEFAULT_MAX_WALL_TIME_MS: 60000, LUCID_API_BASE_URL: 'http://localhost:3001', LUCID_API_KEY: 'test' } as any

    await processRelayPacket(packet, dataSink, config)

    const events = vi.mocked(reportEvent).mock.calls
    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events[0][0].eventType).toBe('run_started')
    expect(events[events.length - 1][0].eventType).toBe('run_finished')
  })

  it('preserves engine and runtime flavor from the packet', async () => {
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const packet = createMockPacket({
      _pulse: {
        runId: 'pulse-run-preserve-engine',
        leaseToken: 'lease-preserve-engine',
        agentId: '33333333-3333-3333-3333-333333333333',
      },
      assistantConfig: {
        ...createMockPacket().assistantConfig,
        engine: 'hermes',
        runtimeFlavor: 'c1_managed',
      },
    })
    const dataSink = createMockDataSink()
    const config = { DEFAULT_MAX_LLM_CALLS: 15, DEFAULT_MAX_TOOL_CALLS: 10, DEFAULT_MAX_WALL_TIME_MS: 60000, LUCID_API_BASE_URL: 'http://localhost:3001', LUCID_API_KEY: 'test' } as any

    await processRelayPacket(packet, dataSink, config)

    expect(mockRunAgent).toHaveBeenCalledOnce()
    const args = mockRunAgent.mock.calls[0][0]
    expect(args.runId).toBe(packet._pulse!.runId)
    expect(args.assistant.engine).toBe('hermes')
    expect(args.assistant.runtime_flavor).toBe('c1_managed')
  })

  it('hands OpenClaw and Hermes the same normalized run request after routing', async () => {
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const basePacket = createMockPacket({
      channelMeta: {
        channelType: 'discord',
        channelId: 'discord-channel-1',
        externalUserId: 'discord-user-1',
        externalChatId: 'discord-chat-1',
      },
      recentMessages: [
        { role: 'system', content: 'System context', createdAt: '2026-03-30T00:00:00Z' },
        { role: 'user', content: 'Original question', createdAt: '2026-03-30T00:00:01Z' },
      ],
      memoryInjection: ['Memory A', 'Memory B'],
      boardMemories: ['Board memory'],
      assistantConfig: {
        ...createMockPacket().assistantConfig,
        runtimeFlavor: 'c1_managed',
        approvalRequiredTools: ['wallet.send'],
      },
      userMessage: {
        text: 'sales summarize the last thread',
        externalMessageId: 'discord_msg_1',
        externalUserId: 'discord-user-1',
        messageData: { raw: true },
      },
    })
    const openClawPacket = {
      ...basePacket,
      assistantConfig: {
        ...basePacket.assistantConfig,
        engine: 'openclaw' as const,
      },
    }
    const hermesPacket = {
      ...basePacket,
      assistantConfig: {
        ...basePacket.assistantConfig,
        engine: 'hermes' as const,
      },
    }
    const config = {
      DEFAULT_MAX_LLM_CALLS: 15,
      DEFAULT_MAX_TOOL_CALLS: 10,
      DEFAULT_MAX_WALL_TIME_MS: 60000,
      LUCID_API_BASE_URL: 'http://localhost:3001',
      LUCID_API_KEY: 'test',
    } as any

    await processRelayPacket(openClawPacket, createMockDataSink(), config)
    await processRelayPacket(hermesPacket, createMockDataSink(), config)

    expect(mockRunAgent).toHaveBeenCalledTimes(2)
    const openClawArgs = summarizeEngineRunRequest(mockRunAgent.mock.calls[0][0] as OpenClawAgentParams)
    const hermesArgs = summarizeEngineRunRequest(mockRunAgent.mock.calls[1][0] as OpenClawAgentParams)

    expect(openClawArgs).toEqual({
      ...hermesArgs,
      assistant: {
        ...hermesArgs.assistant,
        engine: 'openclaw',
      },
    })
    expect(hermesArgs.assistant.engine).toBe('hermes')
    expect(openClawArgs.userMessage).toBe('sales summarize the last thread')
    expect(hermesArgs.userMessage).toBe('sales summarize the last thread')
  })

  it('completes relay events with a fail-soft response when the agent run fails', async () => {
    mockRunAgent.mockRejectedValueOnce(new Error('LLM timeout'))

    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const packet = createMockPacket()
    const dataSink = createMockDataSink()
    const config = { DEFAULT_MAX_LLM_CALLS: 15, DEFAULT_MAX_TOOL_CALLS: 10, DEFAULT_MAX_WALL_TIME_MS: 60000, LUCID_API_BASE_URL: 'http://localhost:3001', LUCID_API_KEY: 'test' } as any

    // Should not throw — the worker executor normalizes engine failures into a
    // provider-error result so relay delivery remains idempotent.
    await processRelayPacket(packet, dataSink, config)

    expect(dataSink.completeInboundEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: packet.eventId,
        responseText: 'LLM timeout',
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
        },
      }),
    )
    expect(dataSink.reportAIGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'LLM timeout',
      }),
    )
  })

  it('augments telegram relay packets with audio attachments before the run', async () => {
    const { processRelayPacket } = await import('../processors/relay-inbound.js')
    const packet = createMockPacket({
      userMessage: {
        text: '',
        externalMessageId: 'msg_voice',
        externalUserId: 'user123',
        messageData: {
          attachments: [{ kind: 'voice', file_id: 'voice-file-1', mime_type: 'audio/ogg' }],
        },
      },
    })
    const dataSink = createMockDataSink()
    const config = {
      DEFAULT_MAX_LLM_CALLS: 15,
      DEFAULT_MAX_TOOL_CALLS: 10,
      DEFAULT_MAX_WALL_TIME_MS: 60000,
      LUCID_API_BASE_URL: 'https://trustgate-api-production.up.railway.app',
      LUCID_API_KEY: 'lucid-test-key',
    } as any
    process.env.TELEGRAM_HOSTED_BOT_TOKEN = 'telegram-hosted-token'
    process.env.MCPGATE_API_KEY = 'mcpgate-key'
    process.env.TRUSTGATE_BASE_URL = 'https://trustgate-api-production.up.railway.app'

    mockResolveTelegramInboundAugmentation.mockResolvedValueOnce({
      effectiveText: 'Voice note transcript:\nCan you speak in English, please?',
      images: [],
    })

    await processRelayPacket(packet, dataSink, config)

    expect(mockResolveTelegramInboundAugmentation).toHaveBeenCalledOnce()
    expect(mockRunAgent).toHaveBeenCalledOnce()
    const args = mockRunAgent.mock.calls[0][0]
    expect(args.userMessage).toContain('Voice note transcript:')
    expect(args.userMessage).toContain('Can you speak in English, please?')
    const completeArgs = vi.mocked(dataSink.completeInboundEvent!).mock.calls[0][0]
    expect(completeArgs.resolvedUserMessageText).toContain('Voice note transcript:')
  })
})
