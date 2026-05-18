/**
 * Runtime Module — Barrel exports for dedicated runtime support.
 */

export { createDataSink, RestDataSink } from './data-sink.js'
export type { DataSink, HeartbeatPayload, FeedEvent, ApprovalRequest, ApprovalResolution, HealthScorePayload, CostPayload, NativeChannelStatus, RunPacket, CompleteInboundPayload, CompleteResult } from './data-sink.js'
export { startHeartbeat, stopHeartbeat, sendShutdownHeartbeat } from './heartbeat.js'
export { initEventReporter, reportEvent, flush as flushEvents, stopEventReporter } from './event-reporter.js'
export { requestApproval } from './approval-client.js'
