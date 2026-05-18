import {
  createInboundTraceId,
  createOutboundTraceId,
  type CanonicalChannelType,
} from '../contracts/index.js'
import { getLifecycleTraceContext, type LifecycleTraceContext } from '../lifecycle/message-lifecycle.js'

export interface MessageTrace {
  traceId: string
  lifecycle: LifecycleTraceContext
}

export interface MessageTraceFields {
  traceId: string
  spanId: string
  lifecycleStage?: string
  channelType?: CanonicalChannelType
  inboundEventId?: string
  outboundEventId?: string
}

export function createInboundMessageTrace(
  channelType: CanonicalChannelType,
  inboundEventId: string,
): MessageTrace {
  const traceId = createInboundTraceId(channelType, inboundEventId)
  return {
    traceId,
    lifecycle: getLifecycleTraceContext(traceId),
  }
}

export function createOutboundMessageTrace(
  channelType: CanonicalChannelType,
  outboundEventId: string,
): MessageTrace {
  const traceId = createOutboundTraceId(channelType, outboundEventId)
  return {
    traceId,
    lifecycle: getLifecycleTraceContext(traceId),
  }
}

export function getInboundMessageTraceFields(
  channelType: CanonicalChannelType,
  inboundEventId: string,
  lifecycleStage?: string,
): MessageTraceFields {
  const trace = createInboundMessageTrace(channelType, inboundEventId)
  return {
    traceId: trace.traceId,
    spanId: trace.lifecycle.spanId,
    lifecycleStage,
    channelType,
    inboundEventId,
  }
}

export function getOutboundMessageTraceFields(
  channelType: CanonicalChannelType,
  outboundEventId: string,
  lifecycleStage?: string,
): MessageTraceFields {
  const trace = createOutboundMessageTrace(channelType, outboundEventId)
  return {
    traceId: trace.traceId,
    spanId: trace.lifecycle.spanId,
    lifecycleStage,
    channelType,
    outboundEventId,
  }
}
