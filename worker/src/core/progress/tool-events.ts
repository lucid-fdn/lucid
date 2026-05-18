import type { ToolExecutionEvent } from '../../agent/tool-runtime/types.js'
import { friendlyToolName, resolveCapabilityProgress, sanitizeProgressText } from './labels.js'
import type { ChannelProgressDescriptor } from './types.js'

function readPayloadString(payload: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!payload) return undefined
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

export function mapToolExecutionEventToProgress(event: ToolExecutionEvent): ChannelProgressDescriptor | null {
  const capability = readPayloadString(event.payload, ['capability', 'capabilityId', 'toolCapability'])
  const progressLabel = readPayloadString(event.payload, ['progressLabel', 'label'])
  const progressPhase = readPayloadString(event.payload, ['progressPhase', 'phase'])
  const riskLevel = readPayloadString(event.payload, ['riskLevel'])
  const base = {
    ...resolveCapabilityProgress({ capability, toolName: event.toolName }),
    ...(progressLabel ? { label: sanitizeProgressText(progressLabel) } : {}),
    ...(progressPhase ? { phase: progressPhase as ChannelProgressDescriptor['phase'] } : {}),
    ...(riskLevel ? { riskLevel: riskLevel as ChannelProgressDescriptor['riskLevel'] } : {}),
  }
  const toolName = friendlyToolName(event.toolName)

  switch (event.type) {
    case 'tool_requested':
      return {
        ...base,
        phase: base.phase === 'browser' || base.phase === 'memory' || base.phase === 'fetching' ? base.phase : 'thinking',
        label: base.label === 'Running tool' ? `Preparing ${toolName}` : base.label,
      }
    case 'tool_started':
      return base
    case 'tool_approval_required':
      return {
        phase: 'approval_waiting',
        label: 'Waiting for approval',
        detail: sanitizeProgressText(`Approval required for ${toolName}`),
        capability: base.capability,
        riskLevel: 'high',
        source: base.source ?? 'tool',
      }
    case 'tool_approved':
      return {
        ...base,
        label: `Approved ${toolName}`,
      }
    case 'tool_denied':
      return {
        phase: 'failed',
        label: `Approval denied for ${toolName}`,
        capability: base.capability,
        riskLevel: base.riskLevel,
        source: base.source ?? 'tool',
      }
    case 'tool_expired':
      return {
        phase: 'stalled',
        label: `Approval expired for ${toolName}`,
        capability: base.capability,
        riskLevel: base.riskLevel,
        source: base.source ?? 'tool',
      }
    case 'tool_completed':
      return {
        phase: 'thinking',
        label: 'Reviewing results',
        capability: base.capability,
        riskLevel: base.riskLevel,
        source: base.source ?? 'tool',
      }
    case 'tool_failed':
      return {
        phase: 'failed',
        label: `${toolName} failed`,
        capability: base.capability,
        riskLevel: base.riskLevel,
        source: base.source ?? 'tool',
      }
    case 'tool_blocked_loop':
      return {
        phase: 'stalled',
        label: `Stopped repeated ${toolName} call`,
        capability: base.capability,
        riskLevel: base.riskLevel,
        source: base.source ?? 'tool',
      }
    default:
      return null
  }
}
