/**
 * Agent Bridge — Smoke Tests
 *
 * Fast contract verification: exports exist, types compile, instances construct,
 * config validation catches bad input, wire type shapes match protocol.
 *
 * No timers, no mocks, no async — these catch wiring drift immediately.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  LucidBridge,
  BridgeConfigError,
} from '../index.js'
import type {
  BridgeConfig,
  BridgeLogger,
  MessageContext,
  MessageHandler,
  MessageResponse,
  RunResult,
  HeartbeatPayload,
  FeedEvent,
  ApprovalRequest,
  ApprovalResolution,
  HealthScorePayload,
  CostPayload,
  NativeChannelStatus,
  RunPacket,
  CompleteInboundPayload,
  CompleteResult,
} from '../index.js'
import { BridgeError, RestClient } from '../http-client.js'
import { OfflineBuffer } from '../offline-buffer.js'
import { HeartbeatManager } from '../heartbeat.js'
import { EventReporter } from '../event-reporter.js'
import { ApprovalGate } from '../approval-gate.js'
import { MessageRelay } from '../message-relay.js'
import { defaultLogger } from '../logger.js'
import { getCpuPercent, getRamPercent, getUptimeSeconds } from '../metrics-collector.js'

// =============================================================================
// Barrel Exports
// =============================================================================

describe('barrel exports', () => {
  it('exports LucidBridge class', () => {
    expect(LucidBridge).toBeDefined()
    expect(typeof LucidBridge).toBe('function')
  })

  it('exports BridgeConfigError class', () => {
    expect(BridgeConfigError).toBeDefined()
    const err = new BridgeConfigError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('BridgeConfigError')
  })

  it('re-exports all SDK types without runtime errors', () => {
    // Type-level verification — if this compiles, exports are wired correctly
    const _config: BridgeConfig = {
      runtimeId: 'r',
      runtimeKey: 'k',
      controlPlaneUrl: 'https://example.com',
    }
    const _logger: BridgeLogger = defaultLogger
    const _response: MessageResponse = { responseText: 'ok' }
    const _result: RunResult = { responseText: 'ok', durationMs: 100 }
    expect(_config).toBeDefined()
    expect(_logger).toBeDefined()
    expect(_response).toBeDefined()
    expect(_result).toBeDefined()
  })
})

// =============================================================================
// Internal Module Exports
// =============================================================================

describe('internal module exports', () => {
  it('RestClient and BridgeError are importable', () => {
    expect(RestClient).toBeDefined()
    expect(BridgeError).toBeDefined()
  })

  it('OfflineBuffer is importable', () => {
    expect(OfflineBuffer).toBeDefined()
  })

  it('HeartbeatManager is importable', () => {
    expect(HeartbeatManager).toBeDefined()
  })

  it('EventReporter is importable', () => {
    expect(EventReporter).toBeDefined()
  })

  it('ApprovalGate is importable', () => {
    expect(ApprovalGate).toBeDefined()
  })

  it('MessageRelay is importable', () => {
    expect(MessageRelay).toBeDefined()
  })

  it('defaultLogger has required methods', () => {
    expect(typeof defaultLogger.info).toBe('function')
    expect(typeof defaultLogger.warn).toBe('function')
    expect(typeof defaultLogger.error).toBe('function')
  })

  it('metrics functions return numbers', () => {
    expect(typeof getCpuPercent()).toBe('number')
    expect(typeof getRamPercent()).toBe('number')
    expect(typeof getUptimeSeconds()).toBe('number')
  })
})

// =============================================================================
// Wire Type Shapes
// =============================================================================

describe('wire type shapes', () => {
  it('HeartbeatPayload has all required fields', () => {
    const payload: HeartbeatPayload = {
      runtimeId: 'rt-1',
      generation: 1,
      engine: 'openclaw',
      runtimeProtocol: 'lucid-runtime-v2',
      engineVersion: 'agent-bridge/0.1.0',
      runtimeVersion: 'agent-bridge/0.1.0',
      cpuPercent: 50,
      ramPercent: 60,
      diskPercent: 0,
      pendingEvents: 0,
      deadLetters: 0,
      openclawVersion: 'agent-bridge/0.1.0',
      agentCount: 1,
      uptimeSeconds: 3600,
    }
    expect(payload.runtimeId).toBe('rt-1')
    expect(payload.generation).toBe(1)
  })

  it('HeartbeatPayload supports optional status and nativeChannels', () => {
    const payload: HeartbeatPayload = {
      runtimeId: 'rt-1',
      generation: 1,
      engine: 'openclaw',
      runtimeProtocol: 'lucid-runtime-v2',
      engineVersion: 'test',
      runtimeVersion: 'test',
      cpuPercent: 0,
      ramPercent: 0,
      diskPercent: 0,
      pendingEvents: 0,
      deadLetters: 0,
      openclawVersion: 'test',
      agentCount: 0,
      uptimeSeconds: 0,
      status: 'shutdown',
      nativeChannels: [
        { channelType: 'telegram', accountId: 'bot-1', status: 'connected' },
      ],
    }
    expect(payload.status).toBe('shutdown')
    expect(payload.nativeChannels).toHaveLength(1)
  })

  it('FeedEvent covers all event types', () => {
    const eventTypes: FeedEvent['eventType'][] = [
      'tool_call', 'tool_result', 'native_mutation_candidate', 'error', 'message_received',
      'message_sent', 'run_started', 'run_finished',
      'channel_connected', 'channel_disconnected', 'channel_deactivated',
    ]
    for (const eventType of eventTypes) {
      const event: FeedEvent = { eventType, severity: 'info', payload: {} }
      expect(event.eventType).toBe(eventType)
    }
  })

  it('FeedEvent supports all severity levels', () => {
    const severities: FeedEvent['severity'][] = ['info', 'warning', 'error', 'critical']
    for (const severity of severities) {
      const event: FeedEvent = { eventType: 'tool_call', severity, payload: {} }
      expect(event.severity).toBe(severity)
    }
  })

  it('ApprovalRequest has all required fields', () => {
    const req: ApprovalRequest = {
      agentId: 'a-1',
      toolName: 'dex_swap',
      toolArgs: { amount: 100 },
      runId: 'run-1',
      timeoutMs: 300_000,
    }
    expect(req.toolName).toBe('dex_swap')
    expect(req.timeoutMs).toBe(300_000)
  })

  it('ApprovalResolution covers all decisions', () => {
    const decisions: ApprovalResolution['decision'][] = ['approved', 'denied', 'expired']
    for (const decision of decisions) {
      const res: ApprovalResolution = { decision, resolvedAt: new Date().toISOString() }
      expect(res.decision).toBe(decision)
    }
  })

  it('RunPacket has complete assistant config', () => {
    const packet: RunPacket = {
      eventId: 'e-1',
      idempotencyToken: 'tok-1',
      channelMeta: {
        channelType: 'telegram',
        channelId: 'ch-1',
        externalUserId: 'u-1',
        externalChatId: 'c-1',
      },
      assistantConfig: {
        id: 'a-1',
        name: 'Agent',
        engine: 'openclaw',
        systemPrompt: 'Be helpful',
        soulContent: null,
        runtimeFlavor: 'c1_managed',
        modelId: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 4096,
        enabledTools: ['web_search'],
        policyConfig: { capabilities: ['execute:swap'] },
        memoryEnabled: true,
        approvalRequiredTools: ['dex_swap'], orgId: 'org-test-1',
      },
      recentMessages: [{ role: 'user', content: 'hi', createdAt: '2026-01-01T00:00:00Z' }],
      memoryInjection: ['User prefers dark mode'],
      boardMemories: [],
      conversationSummary: 'Previous discussion about trading',
      userMessage: {
        text: 'What is the price of SOL?',
        externalMessageId: 'msg-1',
        externalUserId: 'u-1',
        messageData: null,
      },
      skills: [{ slug: 'web3-tools', content: 'Use get_price for...' }],
      plugins: [{
        slug: 'lucid-seo',
        tools: [{ name: 'research_keywords', description: 'SEO research', parameters: {} }],
      }],
    }
    expect(packet.assistantConfig.enabledTools).toContain('web_search')
    expect(packet.skills).toHaveLength(1)
    expect(packet.plugins).toHaveLength(1)
  })

  it('CompleteInboundPayload has required fields', () => {
    const payload: CompleteInboundPayload = {
      eventId: 'e-1',
      runId: 'run-1',
      responseText: 'Here is the answer',
      outputArtifacts: [{ toolName: 'search', result: 'found' }],
      tokenUsage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
    }
    expect(payload.responseText).toBe('Here is the answer')
  })

  it('CompleteResult covers success and idempotent cases', () => {
    const success: CompleteResult = {
      alreadyApplied: false,
      delivered: true,
      externalMessageId: 'ext-1',
      channelType: 'telegram',
    }
    expect(success.delivered).toBe(true)

    const idempotent: CompleteResult = {
      alreadyApplied: true,
      delivered: true,
    }
    expect(idempotent.alreadyApplied).toBe(true)

    const failed: CompleteResult = {
      alreadyApplied: false,
      delivered: false,
      deliveryError: 'Bot blocked by user',
    }
    expect(failed.deliveryError).toBeDefined()
  })

  it('CostPayload has token accounting fields', () => {
    const cost: CostPayload = {
      agentId: 'a-1',
      runId: 'run-1',
      inputTokens: 150,
      outputTokens: 60,
      estimatedCostUsd: 0.003,
    }
    expect(cost.inputTokens + cost.outputTokens).toBe(210)
  })

  it('HealthScorePayload has multi-dimension support', () => {
    const score: HealthScorePayload = {
      agentId: 'a-1',
      overallScore: 85,
      dimensions: {
        latency: 90,
        errorRate: 100,
        memoryHealth: 75,
        toolReliability: 80,
        satisfaction: 85,
        costEfficiency: 70,
      },
    }
    expect(Object.keys(score.dimensions)).toHaveLength(6)
  })

  it('NativeChannelStatus covers all statuses', () => {
    const statuses: NativeChannelStatus['status'][] = [
      'connected', 'reconnecting', 'error', 'stopped',
    ]
    for (const status of statuses) {
      const ch: NativeChannelStatus = {
        channelType: 'telegram',
        accountId: 'bot-1',
        status,
      }
      expect(ch.status).toBe(status)
    }
  })
})

// =============================================================================
// BridgeError Classification
// =============================================================================

describe('BridgeError classification', () => {
  it('classifies 4xx as permanent', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      const err = new BridgeError('test', '/api/test', status, '')
      expect(err.isTransient).toBe(false)
    }
  })

  it('classifies 429 as transient', () => {
    const err = new BridgeError('test', '/api/test', 429, '')
    expect(err.isTransient).toBe(true)
  })

  it('classifies 5xx as transient', () => {
    for (const status of [500, 502, 503, 504]) {
      const err = new BridgeError('test', '/api/test', status, '')
      expect(err.isTransient).toBe(true)
    }
  })

  it('classifies network errors (status 0) as transient', () => {
    const err = new BridgeError('ECONNREFUSED', '/api/test', 0, '')
    expect(err.isTransient).toBe(true)
  })

  it('preserves retryAfterMs from 429', () => {
    const err = new BridgeError('test', '/api/test', 429, '', 5000)
    expect(err.retryAfterMs).toBe(5000)
  })

  it('has the correct name property', () => {
    const err = new BridgeError('test', '/api/test', 500, '')
    expect(err.name).toBe('BridgeError')
    expect(err).toBeInstanceOf(Error)
  })
})

// =============================================================================
// Config Validation (sync — no start() needed)
// =============================================================================

describe('config validation', () => {
  const mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)

  it('constructs with minimal required config', () => {
    const bridge = new LucidBridge({
      runtimeId: 'rt-1',
      runtimeKey: 'key-1',
      controlPlaneUrl: 'https://lucid.test',
    })
    expect(bridge).toBeInstanceOf(LucidBridge)
    expect(bridge.isRunning).toBe(false)
  })

  it('constructs with full config', () => {
    const bridge = new LucidBridge({
      runtimeId: 'rt-1',
      runtimeKey: 'key-1',
      controlPlaneUrl: 'https://lucid.test',
      mode: 'observe',
      generation: 3,
      heartbeatIntervalMs: 60_000,
      eventFlushIntervalMs: 10_000,
      messagePollIntervalMs: 10_000,
      offlineBufferCapacity: 5_000,
      logger: defaultLogger,
    })
    expect(bridge).toBeInstanceOf(LucidBridge)
  })

  it('diagnostics return defaults before start', () => {
    const bridge = new LucidBridge({
      runtimeId: 'rt-1',
      runtimeKey: 'key-1',
      controlPlaneUrl: 'https://lucid.test',
    })
    expect(bridge.isRunning).toBe(false)
    expect(bridge.pendingEvents).toBe(0)
    expect(bridge.offlineBufferDepth).toBe(0)
  })

  it('accepts onMessage handler before start', () => {
    const bridge = new LucidBridge({
      runtimeId: 'rt-1',
      runtimeKey: 'key-1',
      controlPlaneUrl: 'https://lucid.test',
    })
    // Should not throw
    bridge.onMessage(async () => ({ responseText: 'ok' }))
  })
})

// =============================================================================
// OfflineBuffer Construction
// =============================================================================

describe('OfflineBuffer construction', () => {
  it('constructs with given capacity', () => {
    const buf = new OfflineBuffer(100)
    expect(buf.depth).toBe(0)
    expect(buf.droppedCount).toBe(0)
  })

  it('flush on empty returns empty array', () => {
    const buf = new OfflineBuffer(10)
    expect(buf.flush()).toEqual([])
  })
})

// =============================================================================
// Metrics Collector
// =============================================================================

describe('metrics collector', () => {
  it('getCpuPercent returns 0-100', () => {
    const cpu = getCpuPercent()
    expect(cpu).toBeGreaterThanOrEqual(0)
    expect(cpu).toBeLessThanOrEqual(100)
  })

  it('getRamPercent returns 0-100', () => {
    const ram = getRamPercent()
    expect(ram).toBeGreaterThanOrEqual(0)
    expect(ram).toBeLessThanOrEqual(100)
  })

  it('getUptimeSeconds returns non-negative integer', () => {
    const uptime = getUptimeSeconds()
    expect(uptime).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(uptime)).toBe(true)
  })
})
