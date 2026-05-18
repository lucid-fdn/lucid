/**
 * @lucid/agent-bridge
 *
 * Bring Your Own Agent SDK — connect any agent framework to Lucid Mission Control.
 * Implements the client side of the dedicated runtime phone-home protocol
 * (heartbeat, events, approvals, costs, C1 relay).
 *
 * Usage:
 *   import { LucidBridge } from '@lucid/agent-bridge'
 *   import type { BridgeConfig, RunPacket, MessageResponse } from '@lucid/agent-bridge'
 *
 *   const bridge = new LucidBridge({
 *     runtimeId: process.env.LUCID_RUNTIME_ID!,
 *     runtimeKey: process.env.LUCID_RUNTIME_KEY!,
 *     controlPlaneUrl: process.env.LUCID_CONTROL_PLANE_URL!,
 *     mode: 'observe',
 *   })
 *   await bridge.start()
 */

// Classes
export { LucidBridge, BridgeConfigError } from './bridge.js'

// SDK types
export type {
  BridgeConfig,
  BridgeLogger,
  MessageContext,
  MessageHandler,
  MessageResponse,
  RunResult,
  RuntimeManagementCommandAck,
  RuntimeManagementCommandAckStatus,
  RuntimeManagementCommandHandler,
  ToolExecutionHandler,
  ToolExecutionRequest,
  ToolExecutionResult,
} from './types.js'

// Wire types (shared with control plane — worker re-exports these)
export type {
  HeartbeatPayload,
  HeartbeatResponse,
  RuntimeManagementCommand,
  FeedEvent,
  ApprovalRequest,
  ApprovalResolution,
  HealthScorePayload,
  CostPayload,
  AIGenerationFeature,
  AIGenerationModality,
  AIGenerationReceiptPayload,
  AIGenerationReceiptUsage,
  AIGenerationReceiptProvider,
  NativeChannelStatus,
  RunPacket,
  CompleteInboundPayload,
  CompleteResult,
  StepRunPacket,
  CompleteStepPayload,
  FailStepPayload,
  RenewStepLeaseResult,
} from './types.js'
