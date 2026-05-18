/**
 * Agent Bridge — Approval Gate
 *
 * Submit approval requests for elevated tool calls and poll until resolved.
 * Used by the MessageContext in full mode.
 *
 * Poll interval: 2s. Default timeout: 5 minutes (overridden per-request).
 * Returns 'expired' if the owner doesn't respond within the timeout.
 */

import type { RestClient } from './http-client.js'
import type { ApprovalRequest, ApprovalResolution, BridgeLogger } from './types.js'

const POLL_INTERVAL_MS = 2_000
const DEFAULT_TIMEOUT_MS = 300_000 // 5 minutes

export class ApprovalGate {
  constructor(
    private readonly client: RestClient,
    private readonly logger: BridgeLogger,
  ) {}

  /**
   * Submit an approval request and block until resolved or timeout.
   *
   * @returns Resolution with decision: 'approved' | 'denied' | 'expired'.
   */
  async requestApproval(request: ApprovalRequest): Promise<ApprovalResolution> {
    const { approvalId } = await this.client.post<{ approvalId: string }>(
      '/api/runtimes/approvals',
      request,
    )

    const timeoutMs = request.timeoutMs || DEFAULT_TIMEOUT_MS
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS)

      const resolution = await this.pollResolution(approvalId)
      if (resolution) return resolution
    }

    this.logger.warn(`Approval ${approvalId} timed out after ${timeoutMs}ms`)
    return { decision: 'expired', resolvedAt: new Date().toISOString() }
  }

  private async pollResolution(approvalId: string): Promise<ApprovalResolution | null> {
    const data = await this.client.get<{ status: string; resolvedAt?: string }>(
      `/api/runtimes/approvals/pending?approval_id=${approvalId}`,
    )
    if (data.status === 'pending') return null
    return {
      decision: data.status as ApprovalResolution['decision'],
      resolvedAt: data.resolvedAt || new Date().toISOString(),
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
