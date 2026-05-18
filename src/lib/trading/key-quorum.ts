/**
 * Key Quorum for High-Value Trades — P1-25
 *
 * Implements multi-signature approval for trades exceeding a configurable
 * USD threshold. When a trade exceeds the quorum threshold, it requires
 * additional authorization before the session signer can execute.
 *
 * Flow:
 * 1. Agent requests trade → policy guard checks value
 * 2. If value > quorum_threshold → trade enters 'pending_approval' status
 * 3. Authorized approvers (org admins) get notified
 * 4. Once quorum is met → trade proceeds via session signer
 * 5. If timeout (15 min) → trade is cancelled
 */

import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { ErrorService } from '@/lib/errors/error-service'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ============================================================================
// Types
// ============================================================================

export interface QuorumConfig {
  /** USD threshold above which quorum is required */
  thresholdUsd: number
  /** Number of approvals required */
  requiredApprovals: number
  /** Timeout in minutes before auto-cancel */
  timeoutMinutes: number
}

export interface QuorumRequest {
  id: string
  transactionId: string
  userId: string
  assistantId: string
  orgId: string
  valueUsd: number
  chainType: string
  description: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  approvals: QuorumApproval[]
  requiredApprovals: number
  createdAt: string
  expiresAt: string
}

export interface QuorumApproval {
  approverId: string
  approverEmail?: string
  decision: 'approve' | 'reject'
  createdAt: string
}

export interface QuorumCheckResult {
  requiresQuorum: boolean
  thresholdUsd: number
  valueUsd: number
  requiredApprovals: number
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_QUORUM_CONFIG: QuorumConfig = {
  thresholdUsd: 500,
  requiredApprovals: 2,
  timeoutMinutes: 15,
}

const QUORUM_REQUEST_SELECT =
  'id, transaction_id, user_id, assistant_id, org_id, value_usd, chain_type, description, status, approvals, required_approvals, created_at, expires_at' as const

// ============================================================================
// Quorum Logic
// ============================================================================

/**
 * Check if a trade requires quorum approval.
 */
export function checkQuorumRequired(
  valueUsd: number,
  config: QuorumConfig = DEFAULT_QUORUM_CONFIG
): QuorumCheckResult {
  return {
    requiresQuorum: valueUsd > config.thresholdUsd,
    thresholdUsd: config.thresholdUsd,
    valueUsd,
    requiredApprovals: config.requiredApprovals,
  }
}

/**
 * Get the quorum config for an organization.
 * Falls back to system defaults if no org-level config exists.
 */
export async function getQuorumConfig(orgId: string): Promise<QuorumConfig> {
  try {
    const supabase = getServiceClient()
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', `quorum_config_${orgId}`)
      .single()

    if (data?.value) {
      const config = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
      return {
        thresholdUsd: config.threshold_usd ?? DEFAULT_QUORUM_CONFIG.thresholdUsd,
        requiredApprovals: config.required_approvals ?? DEFAULT_QUORUM_CONFIG.requiredApprovals,
        timeoutMinutes: config.timeout_minutes ?? DEFAULT_QUORUM_CONFIG.timeoutMinutes,
      }
    }
  } catch {
    // Fall through to defaults
  }

  return DEFAULT_QUORUM_CONFIG
}

/**
 * Create a quorum approval request for a high-value trade.
 */
export async function createQuorumRequest(params: {
  transactionId: string
  userId: string
  assistantId: string
  orgId: string
  valueUsd: number
  chainType: string
  description: string
}): Promise<{ requestId?: string; error?: string }> {
  try {
    const config = await getQuorumConfig(params.orgId)
    const expiresAt = new Date(Date.now() + config.timeoutMinutes * 60_000).toISOString()

    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('quorum_requests')
      .insert({
        transaction_id: params.transactionId,
        user_id: params.userId,
        assistant_id: params.assistantId,
        org_id: params.orgId,
        value_usd: params.valueUsd,
        chain_type: params.chainType,
        description: params.description,
        status: 'pending',
        required_approvals: config.requiredApprovals,
        expires_at: expiresAt,
      })
      .select('id')
      .single()

    if (error) {
      return { error: error.message }
    }

    return { requestId: data.id }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'createQuorumRequest', ...params },
      tags: { layer: 'trading', module: 'key-quorum' },
    })
    return { error: error instanceof Error ? error.message : 'Failed to create quorum request' }
  }
}

/**
 * Submit an approval or rejection for a quorum request.
 */
export async function submitQuorumDecision(params: {
  requestId: string
  approverId: string
  decision: 'approve' | 'reject'
}): Promise<{ status: 'approved' | 'rejected' | 'pending'; error?: string }> {
  try {
    const supabase = getServiceClient()

    // Get the request
    const { data: request, error: fetchError } = await supabase
      .from('quorum_requests')
      .select(QUORUM_REQUEST_SELECT)
      .eq('id', params.requestId)
      .single()

    if (fetchError || !request) {
      return { status: 'pending', error: 'Quorum request not found' }
    }

    if (request.status !== 'pending') {
      return { status: request.status, error: `Request already ${request.status}` }
    }

    // Check if expired
    if (new Date(request.expires_at) < new Date()) {
      await supabase
        .from('quorum_requests')
        .update({ status: 'expired' })
        .eq('id', params.requestId)
      return { status: 'rejected', error: 'Quorum request expired' }
    }

    // Record the decision
    const existingApprovals = (request.approvals as QuorumApproval[]) || []

    // Prevent duplicate votes
    if (existingApprovals.some((a) => a.approverId === params.approverId)) {
      return { status: 'pending', error: 'Already submitted decision' }
    }

    const newApproval: QuorumApproval = {
      approverId: params.approverId,
      decision: params.decision,
      createdAt: new Date().toISOString(),
    }

    const updatedApprovals = [...existingApprovals, newApproval]

    // If rejection, immediately reject
    if (params.decision === 'reject') {
      await supabase
        .from('quorum_requests')
        .update({
          status: 'rejected',
          approvals: updatedApprovals,
        })
        .eq('id', params.requestId)

      // Also update the trading transaction
      await supabase
        .from('trading_transactions')
        .update({ status: 'cancelled', error_message: 'Rejected by quorum' })
        .eq('id', request.transaction_id)

      return { status: 'rejected' }
    }

    // Count approvals
    const approvalCount = updatedApprovals.filter((a) => a.decision === 'approve').length

    if (approvalCount >= request.required_approvals) {
      // Quorum met — approve
      await supabase
        .from('quorum_requests')
        .update({
          status: 'approved',
          approvals: updatedApprovals,
        })
        .eq('id', params.requestId)

      // Update the trading transaction to proceed
      await supabase
        .from('trading_transactions')
        .update({ status: 'pending' })
        .eq('id', request.transaction_id)

      return { status: 'approved' }
    }

    // Still pending
    await supabase
      .from('quorum_requests')
      .update({ approvals: updatedApprovals })
      .eq('id', params.requestId)

    return { status: 'pending' }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'submitQuorumDecision', ...params },
      tags: { layer: 'trading', module: 'key-quorum' },
    })
    return { status: 'pending', error: error instanceof Error ? error.message : 'Decision failed' }
  }
}

/**
 * Get a quorum request by ID.
 */
export async function getQuorumRequest(
  requestId: string
): Promise<{ request?: QuorumRequest; error?: string }> {
  try {
    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('quorum_requests')
      .select(QUORUM_REQUEST_SELECT)
      .eq('id', requestId)
      .single()

    if (error || !data) {
      return { error: error?.message || 'Not found' }
    }

    return {
      request: {
        id: data.id,
        transactionId: data.transaction_id,
        userId: data.user_id,
        assistantId: data.assistant_id,
        orgId: data.org_id,
        valueUsd: data.value_usd,
        chainType: data.chain_type,
        description: data.description,
        status: data.status,
        approvals: (data.approvals as QuorumApproval[]) || [],
        requiredApprovals: data.required_approvals,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
      },
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to get request' }
  }
}

/**
 * Expire all timed-out quorum requests (called by cron/poller).
 */
export async function expireStaleQuorumRequests(): Promise<number> {
  try {
    const supabase = getServiceClient()

    const { data } = await supabase
      .from('quorum_requests')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .select('id, transaction_id')

    if (data && data.length > 0) {
      // Cancel associated transactions
      const txIds = data.map((r: { id: string; transaction_id: string }) => r.transaction_id)
      await supabase
        .from('trading_transactions')
        .update({ status: 'cancelled', error_message: 'Quorum approval timeout' })
        .in('id', txIds)
    }

    return data?.length ?? 0
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { operation: 'expireStaleQuorumRequests' },
      tags: { layer: 'trading', module: 'key-quorum' },
    })
    return 0
  }
}
