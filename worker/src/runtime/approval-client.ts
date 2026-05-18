/**
 * Approval Client — Submits and polls approval requests via DataSink.
 *
 * Used by dedicated runtimes that can't write directly to mc_pending_approvals.
 * Polls the control plane every 2s until the approval is resolved or times out.
 */

import type { DataSink, ApprovalResolution } from './data-sink.js'

const POLL_INTERVAL_MS = 2_000

export async function requestApproval(
  dataSink: DataSink,
  params: {
    agentId: string
    toolName: string
    toolArgs: Record<string, unknown>
    runId: string
    timeoutMs: number
    pollIntervalMs?: number
  },
): Promise<ApprovalResolution> {
  const { pollIntervalMs: requestedPollIntervalMs, ...approvalRequest } = params
  const approvalId = await dataSink.submitApproval(approvalRequest)
  const deadline = Date.now() + params.timeoutMs
  const pollIntervalMs = Number.isFinite(requestedPollIntervalMs)
    ? Math.max(1, Number(requestedPollIntervalMs))
    : POLL_INTERVAL_MS

  while (Date.now() < deadline) {
    const resolution = await dataSink.pollApprovalResolution(approvalId)
    if (resolution) {
      return resolution
    }

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) break
    await new Promise((r) => setTimeout(r, Math.min(pollIntervalMs, remainingMs)))
  }

  // Timed out — return expired
  return {
    decision: 'expired',
    resolvedAt: new Date().toISOString(),
  }
}
