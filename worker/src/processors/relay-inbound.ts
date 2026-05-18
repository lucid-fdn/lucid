/**
 * Relay Inbound Processor
 *
 * Processes a RunPacket from the REST relay (claim-inbound endpoint).
 * Adapts the bounded packet to the existing agent run flow, then
 * calls complete-inbound to persist + deliver.
 */

import type { Config } from '../config.js'
import type { DataSink, RunPacket, CompleteInboundPayload } from '../runtime/data-sink.js'
import { reportEvent } from '../runtime/event-reporter.js'
import crypto from 'node:crypto'
import { getWorkerMediaProviderConfig } from '../ai/media-provider-config.js'
import { getWorkerLlmConfig } from '../ai/lucid-provider-config.js'

async function resolveRelayUserMessage(packet: RunPacket, config: Config): Promise<string> {
  const initialText = typeof packet.userMessage?.text === 'string' ? packet.userMessage.text : ''
  if (packet.channelMeta.channelType !== 'telegram') {
    return initialText
  }

  const messageData =
    packet.userMessage?.messageData && typeof packet.userMessage.messageData === 'object'
      ? packet.userMessage.messageData as Record<string, unknown>
      : null
  const attachments = Array.isArray(messageData?.attachments) ? messageData.attachments : []
  if (attachments.length === 0) {
    return initialText
  }
  const mediaProviderConfig = getWorkerMediaProviderConfig(config)

  const { resolveTelegramInboundAugmentation } = await import('../channels/bridge/telegram/inbound-media.js')
  const augmented = await resolveTelegramInboundAugmentation({
    messageText: initialText,
    messageData,
    botToken: process.env.TELEGRAM_HOSTED_BOT_TOKEN,
    llmBaseUrl: mediaProviderConfig.preferredGatewayBaseUrl,
    llmApiKey: mediaProviderConfig.preferredGatewayApiKey || '',
    llmBaseUrls: mediaProviderConfig.gatewayBaseUrls,
    llmApiKeys: mediaProviderConfig.gatewayApiKeys,
  })
  return augmented.effectiveText
}

export async function processRelayPacket(
  packet: RunPacket,
  dataSink: DataSink,
  config: Config,
): Promise<void> {
  const controlPlaneRunId = packet._pulse?.runId ?? crypto.randomUUID()
  const pulseRunId = packet._pulse?.runId ?? null
  const startMs = Date.now()
  const logCtx = `[relay] event=${packet.eventId} agent=${packet.assistantConfig.id}`

  reportEvent({
    agentId: packet.assistantConfig.id,
    eventType: 'run_started',
    severity: 'info',
    payload: { runId: controlPlaneRunId, pulseRunId, source: 'relay', eventId: packet.eventId },
  })

  try {
    // 1. Run agent loop
    const { defaultWorkerRunExecutor } = await import('../core/runtime/worker-run-executor.js')
    const runStartMs = Date.now()
    const userMessage = await resolveRelayUserMessage(packet, config)

    const result = await defaultWorkerRunExecutor.execute({
      assistant: {
        id: packet.assistantConfig.id,
        name: packet.assistantConfig.name,
        engine: packet.assistantConfig.engine ?? 'openclaw',
        runtime_flavor: packet.assistantConfig.runtimeFlavor ?? 'shared',
        system_prompt: packet.assistantConfig.systemPrompt,
        soul_content: packet.assistantConfig.soulContent ?? null,
        lucid_model: packet.assistantConfig.modelId,
        temperature: packet.assistantConfig.temperature,
        max_tokens: packet.assistantConfig.maxTokens,
        memory_enabled: packet.assistantConfig.memoryEnabled,
        memory_window_size: 20,
        org_id: packet.assistantConfig.orgId,
        policy_config: packet.assistantConfig.policyConfig,
        passport_id: null,
        wallet_enabled: false,
        agent_wallets: [],
        approval_required_tools: packet.assistantConfig.approvalRequiredTools,
      },
      conversationId: `relay-${packet.eventId}`,
      messages: packet.recentMessages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      memories: packet.memoryInjection,
      boardMemories: packet.boardMemories ?? [],
      userMessage,
      budget: {
        maxLlmCalls: config.DEFAULT_MAX_LLM_CALLS,
        maxToolCalls: config.DEFAULT_MAX_TOOL_CALLS,
        maxWallTimeMs: config.DEFAULT_MAX_WALL_TIME_MS,
      },
      runId: controlPlaneRunId,
      userId: packet.channelMeta.externalUserId,
      llmConfig: getWorkerLlmConfig(config),
      channelId: packet.channelMeta.channelId,
    })

    const responseText = result.text?.trim() || ''
    const runElapsedMs = Date.now() - runStartMs

    // 2. Complete via relay (persists + delivers synchronously on control plane)
    if (!dataSink.completeInboundEvent) {
      throw new Error('DataSink does not support completeInboundEvent')
    }

    const completePayload: CompleteInboundPayload = {
      eventId: packet.eventId,
      runId: controlPlaneRunId,
      responseText: responseText || '[No response generated]',
      resolvedUserMessageText: userMessage,
      tokenUsage: result.usage ? {
        inputTokens: result.usage.promptTokens || 0,
        outputTokens: result.usage.completionTokens || 0,
        estimatedCostUsd: 0, // Estimated on control plane
      } : undefined,
    }

    const completeStartMs = Date.now()
    const completeResult = await dataSink.completeInboundEvent(completePayload)
    const completeElapsedMs = Date.now() - completeStartMs
    const elapsedMs = Date.now() - startMs

    if (completeResult.alreadyApplied) {
      console.log(`${logCtx} already completed (idempotent skip)`)
    } else if (!completeResult.delivered && completeResult.deliveryError) {
      console.warn(`${logCtx} completed but delivery failed: ${completeResult.deliveryError}`)
    }

    reportEvent({
      agentId: packet.assistantConfig.id,
      eventType: 'run_finished',
      severity: 'info',
      payload: {
        runId: controlPlaneRunId,
        pulseRunId,
        source: 'relay',
        eventId: packet.eventId,
        elapsedMs,
        runElapsedMs,
        completeElapsedMs,
        delivered: completeResult.delivered,
        tokens: result.usage.totalTokens,
      },
    })

    await dataSink.reportAIGeneration?.({
      agentId: packet.assistantConfig.id,
      runId: controlPlaneRunId,
      userId: packet.channelMeta.externalUserId,
      feature: 'agent-run',
      modality: 'agent-run',
      prompt: userMessage,
      success: !result.providerError,
      model: result.diagnostics?.model ?? packet.assistantConfig.modelId,
      provider: 'trustgate',
      usage: result.usage ? {
        inputTokens: result.usage.promptTokens || 0,
        outputTokens: result.usage.completionTokens || 0,
        totalTokens: result.usage.totalTokens,
      } : undefined,
      receipt: {
        provider: 'trustgate',
        model: result.diagnostics?.model ?? packet.assistantConfig.modelId,
        latencyMs: runElapsedMs,
        requestId: controlPlaneRunId,
        metadata: {
          mode: 'relay',
          eventId: packet.eventId,
          channelType: packet.channelMeta.channelType,
          channelId: packet.channelMeta.channelId,
          toolCallCount: result.toolCallsUsed,
          steps: result.steps,
          delivered: completeResult.delivered,
          alreadyApplied: completeResult.alreadyApplied,
          hasProviderError: result.providerError,
        },
      },
      ...(result.providerError ? { error: result.text } : {}),
    })

    console.log(
      `${logCtx} processed (${elapsedMs}ms total, ${runElapsedMs}ms run, ${completeElapsedMs}ms complete, delivered=${completeResult.delivered})`,
    )
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`${logCtx} failed: ${errorMsg}`)

    reportEvent({
      agentId: packet.assistantConfig.id,
      eventType: 'error',
      severity: 'error',
      payload: { runId: controlPlaneRunId, pulseRunId, source: 'relay', eventId: packet.eventId, error: errorMsg },
    })

    await dataSink.reportAIGeneration?.({
      agentId: packet.assistantConfig.id,
      runId: controlPlaneRunId,
      userId: packet.channelMeta.externalUserId,
      feature: 'agent-run',
      modality: 'agent-run',
      prompt: packet.userMessage?.text || 'relay inbound run',
      success: false,
      model: packet.assistantConfig.modelId,
      provider: 'trustgate',
      receipt: {
        provider: 'trustgate',
        latencyMs: Date.now() - startMs,
        requestId: controlPlaneRunId,
        metadata: {
          mode: 'relay',
          eventId: packet.eventId,
          channelType: packet.channelMeta.channelType,
          channelId: packet.channelMeta.channelId,
        },
      },
      error: errorMsg,
    })

    // Don't rethrow — event will expire and be re-claimed after lease timeout
  }
}
