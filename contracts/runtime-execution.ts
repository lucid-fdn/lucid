/**
 * Runtime execution context contract.
 *
 * Pure shared contract for control plane, worker, dedicated runtimes, bridge
 * packets, and tests. This describes where/how a run executes; it does not
 * perform compatibility checks or load runtime state.
 */

import { z } from 'zod'
import {
  AGENT_ENGINES,
  CHANNEL_OWNERSHIPS,
  DEDICATED_TRANSPORT_MODES,
  EXECUTION_ORIGINS,
  RUNTIME_BRIDGE_MODES,
  RUNTIME_FLAVORS,
  RUNTIME_PROTOCOLS,
  SUPPORT_LEVELS,
  type AgentEngine,
  type ChannelOwnership,
  type DedicatedTransportMode,
  type ExecutionOrigin,
  type RuntimeBridgeMode,
  type RuntimeExecutionContext as CompatRuntimeExecutionContext,
  type RuntimeExecutionContextSource as CompatRuntimeExecutionContextSource,
  type RuntimeFlavor,
  type RuntimeProtocol,
  type SupportLevel,
} from '@lucid/runtime-compat'

export {
  AGENT_ENGINES,
  CHANNEL_OWNERSHIPS,
  DEDICATED_TRANSPORT_MODES,
  EXECUTION_ORIGINS,
  RUNTIME_BRIDGE_MODES,
  RUNTIME_FLAVORS,
  RUNTIME_PROTOCOLS,
  SUPPORT_LEVELS,
}

export type {
  AgentEngine,
  ChannelOwnership,
  DedicatedTransportMode,
  ExecutionOrigin,
  RuntimeBridgeMode,
  CompatRuntimeExecutionContext,
  CompatRuntimeExecutionContextSource,
  RuntimeFlavor,
  RuntimeProtocol,
  SupportLevel,
}

export const AgentEngineSchema = z.enum(AGENT_ENGINES)
export const RuntimeFlavorSchema = z.enum(RUNTIME_FLAVORS)
export const ChannelOwnershipSchema = z.enum(CHANNEL_OWNERSHIPS)
export const RuntimeProtocolSchema = z.enum(RUNTIME_PROTOCOLS)
export const DedicatedTransportModeSchema = z.enum(DEDICATED_TRANSPORT_MODES)
export const RuntimeBridgeModeSchema = z.enum(RUNTIME_BRIDGE_MODES)
export const ExecutionOriginSchema = z.enum(EXECUTION_ORIGINS)
export const SupportLevelSchema = z.enum(SUPPORT_LEVELS)

const RuntimeFlavorSupportMapSchema = z.object({
  shared: SupportLevelSchema.optional(),
  c1_managed: SupportLevelSchema.optional(),
  c2a_autonomous: SupportLevelSchema.optional(),
})

const ChannelOwnershipSupportMapSchema = z.object({
  lucid_relay: SupportLevelSchema.optional(),
  runtime_native: SupportLevelSchema.optional(),
})

const DedicatedTransportSupportMapSchema = z.object({
  relay: SupportLevelSchema.optional(),
  native_pulse: SupportLevelSchema.optional(),
})

const RuntimeBridgeModeSupportMapSchema = z.object({
  none: SupportLevelSchema.optional(),
  observe: SupportLevelSchema.optional(),
  full: SupportLevelSchema.optional(),
})

export const RuntimeExecutionContextSchema = z.object({
  engine: AgentEngineSchema,
  runtimeFlavor: RuntimeFlavorSchema,
  channelOwnership: ChannelOwnershipSchema,
  runtimeProtocol: RuntimeProtocolSchema,
  dedicatedTransportMode: DedicatedTransportModeSchema.nullable(),
  bridgeMode: RuntimeBridgeModeSchema,
  runtimeId: z.string().uuid().nullable(),
  runtimeGeneration: z.number().int().nonnegative().nullable(),
  executionOrigin: ExecutionOriginSchema,
})

export type RuntimeExecutionContext = CompatRuntimeExecutionContext

export const RuntimeExecutionContextSourceSchema = z.object({
  assistantId: z.string().uuid(),
  assistantEngine: AgentEngineSchema.nullable().optional(),
  assistantRuntimeFlavor: RuntimeFlavorSchema.nullable().optional(),
  runtimeId: z.string().uuid().nullable().optional(),
  runtimeEngine: AgentEngineSchema.nullable().optional(),
  runtimeFlavor: RuntimeFlavorSchema.nullable().optional(),
  channelOwnership: ChannelOwnershipSchema.nullable().optional(),
  runtimeProtocol: RuntimeProtocolSchema.nullable().optional(),
  dedicatedTransportMode: DedicatedTransportModeSchema.nullable().optional(),
  bridgeMode: RuntimeBridgeModeSchema.nullable().optional(),
  runtimeGeneration: z.number().int().nonnegative().nullable().optional(),
  executionOrigin: ExecutionOriginSchema,
})

export type RuntimeExecutionContextSource = CompatRuntimeExecutionContextSource

export const AgentRunEnvelopeSchema = z.object({
  context: RuntimeExecutionContextSchema,
  assistantId: z.string().uuid(),
  conversationId: z.string().uuid().nullable(),
  runId: z.string().uuid().nullable(),
  input: z.unknown(),
  assistantConfig: z.record(z.string(), z.unknown()),
})

export type AgentRunEnvelope = z.infer<typeof AgentRunEnvelopeSchema>

export const EngineCapabilityProfileSchema = z.object({
  engine: AgentEngineSchema,
  runtimeProtocol: RuntimeProtocolSchema,
  runtimeFlavors: RuntimeFlavorSupportMapSchema,
  channelOwnership: ChannelOwnershipSupportMapSchema,
  channelOwnershipByFlavor: z.object({
    shared: ChannelOwnershipSupportMapSchema.optional(),
    c1_managed: ChannelOwnershipSupportMapSchema.optional(),
    c2a_autonomous: ChannelOwnershipSupportMapSchema.optional(),
  }).optional(),
  dedicatedTransportModesByFlavor: z.object({
    shared: DedicatedTransportSupportMapSchema.optional(),
    c1_managed: DedicatedTransportSupportMapSchema.optional(),
    c2a_autonomous: DedicatedTransportSupportMapSchema.optional(),
  }).optional(),
  bridgeModes: RuntimeBridgeModeSupportMapSchema,
  toolRuntime: SupportLevelSchema,
  approvals: SupportLevelSchema,
  usageAccounting: SupportLevelSchema,
  nativeMutations: RuntimeFlavorSupportMapSchema,
  engineHome: RuntimeFlavorSupportMapSchema,
  migrationSources: z.array(z.string()),
  notes: z.array(z.string()).optional(),
})

export type EngineCapabilityProfile = z.infer<typeof EngineCapabilityProfileSchema>
