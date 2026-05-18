import 'server-only'

import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import { planAgentCommerceNativeRails } from '@/lib/agent-commerce/native-rails'
import {
  createAgentCommerceSpendRequest,
  type AgentCommerceActor,
} from '@/lib/agent-commerce/service'
import {
  createBrowserOperatorPurchaseReceipt,
  createBrowserOperatorPurchaseRun,
  getBrowserOperatorAccount,
  getBrowserOperatorPurchasePolicy,
  getBrowserOperatorPurchaseRun,
  listBrowserOperatorMerchantNativeCapabilities,
  listBrowserOperatorProfiles,
  listBrowserOperatorPurchaseCartItems,
  recordBrowserOperatorAuditEvent,
  updateBrowserOperatorPurchaseRun,
} from '@/lib/db/browser-operator'
import {
  evaluateBrowserOperatorPurchasePolicy,
  type BrowserOperatorPurchasePolicyDecision,
} from './purchase-policy'
import type {
  BrowserOperatorPurchaseCartItem,
  BrowserOperatorPurchaseRun,
} from '@contracts/browser-operator'
import type { AgentCommerceMerchantInput } from '@contracts/agent-commerce'
import {
  assertBrowserOperatorCheckoutAdapterExecutable,
  getBrowserOperatorCheckoutAdapter,
} from './checkout-adapters'
import { planBrowserOperatorPurchaseRail } from './purchase-planner'
import { resolveBrowserOperatorProfileAffinity } from './profile-store'

export interface BrowserOperatorPurchaseRunResult {
  purchaseRun: BrowserOperatorPurchaseRun
  policyDecision: BrowserOperatorPurchasePolicyDecision
  commerceSpendRequestId: string | null
}

export async function createGovernedBrowserOperatorPurchaseRun(input: {
  orgId: string
  projectId?: string | null
  userId?: string | null
  assistantId?: string | null
  opsRunId?: string | null
  browserAccountId?: string | null
  purchasePolicyId: string
  merchant: AgentCommerceMerchantInput
  cartItems: BrowserOperatorPurchaseCartItem[]
  idempotencyKey: string
  purpose: string
  createCommerceSpendRequest?: boolean
  actor?: AgentCommerceActor
}): Promise<BrowserOperatorPurchaseRunResult> {
  const policy = await getBrowserOperatorPurchasePolicy({
    orgId: input.orgId,
    policyId: input.purchasePolicyId,
  })
  if (!policy) {
    throw new AgentCommerceError('not_found', 'Browser Operator purchase policy not found.', 404)
  }
  if (policy.status !== 'active') {
    throw new AgentCommerceError(
      'policy_denied',
      `Purchase policy must be active before it can create purchase runs (current status: ${policy.status}).`,
      409,
    )
  }
  if (policy.project_id && input.projectId && policy.project_id !== input.projectId) {
    throw new AgentCommerceError('policy_denied', 'Purchase policy does not belong to the requested project.', 403)
  }
  if (policy.user_id && input.userId && policy.user_id !== input.userId) {
    throw new AgentCommerceError('policy_denied', 'Purchase policy does not belong to the requesting user.', 403)
  }
  if (policy.browser_account_id && input.browserAccountId && policy.browser_account_id !== input.browserAccountId) {
    throw new AgentCommerceError('policy_denied', 'Purchase policy is pinned to a different browser account.', 403)
  }
  if (policy.browser_account_id && !input.browserAccountId) {
    throw new AgentCommerceError('policy_denied', 'Purchase policy requires its pinned browser account.', 400)
  }

  const policyDecision = evaluateBrowserOperatorPurchasePolicy({
    policy,
    merchant: input.merchant,
    cartItems: input.cartItems,
  })
  const browserAccount = input.browserAccountId
    ? await getBrowserOperatorAccount({ orgId: input.orgId, accountId: input.browserAccountId })
    : null
  const nativeCapabilities = await listBrowserOperatorMerchantNativeCapabilities({
    merchantKey: input.merchant.name?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    limit: 25,
  })
  const profiles = browserAccount
    ? await listBrowserOperatorProfiles({ orgId: input.orgId, browserAccountId: browserAccount.id })
    : []
  const nativeRailPlans = planAgentCommerceNativeRails({
    orgId: input.orgId,
    projectId: input.projectId,
    assistantId: input.assistantId,
    runId: input.opsRunId,
    merchant: input.merchant,
    amount: policyDecision.cartTotal,
    purpose: input.purpose,
    nativeCapabilities,
    credentialRefs: browserAccount?.metadata?.native_credential_refs as Record<string, string | undefined> | undefined,
  })
  const railDecision = planBrowserOperatorPurchaseRail({
    merchant: input.merchant,
    nativeCapabilities,
    nativeRailPlans,
    account: browserAccount,
    profiles,
    checkoutRequested: policyDecision.allowed && policyDecision.approvalState === 'not_required',
  })

  let commerceSpendRequestId: string | null = null
  if (input.createCommerceSpendRequest && policyDecision.cartTotal) {
    const commerce = await createAgentCommerceSpendRequest({
      org_id: input.orgId,
      project_id: input.projectId ?? undefined,
      assistant_id: input.assistantId ?? undefined,
      actor_user_id: input.userId ?? undefined,
      run_id: input.opsRunId ?? undefined,
      merchant: input.merchant,
      amount: policyDecision.cartTotal,
      purpose: input.purpose,
      idempotency_key: `${input.idempotencyKey}:commerce`,
      requested_capabilities: ['spend_request', 'agentic_checkout'],
      metadata: {
        browser_operator: true,
        browser_account_id: input.browserAccountId ?? null,
        purchase_policy_id: input.purchasePolicyId,
        cart_hash: policyDecision.cartHash,
        policy_decision: {
          allowed: policyDecision.allowed,
          approval_state: policyDecision.approvalState,
          reason_codes: policyDecision.reasonCodes,
        },
      },
    }, input.actor ?? { type: 'system' })
    commerceSpendRequestId = commerce.spendRequest.id
  }

  const purchaseRun = await createBrowserOperatorPurchaseRun({
    orgId: input.orgId,
    projectId: input.projectId,
    userId: input.userId,
    assistantId: input.assistantId,
    opsRunId: input.opsRunId,
    browserAccountId: input.browserAccountId,
    purchasePolicyId: input.purchasePolicyId,
    agentCommerceSpendRequestId: commerceSpendRequestId,
    idempotencyKey: input.idempotencyKey,
    merchant: input.merchant,
    status: policyDecision.allowed
      ? policyDecision.approvalState === 'not_required'
        ? 'approved'
        : 'requires_approval'
      : 'blocked',
    cartHash: policyDecision.cartHash,
    cartTotal: policyDecision.cartTotal,
    policyDecision: {
      allowed: policyDecision.allowed,
      approval_state: policyDecision.approvalState,
      reason_codes: policyDecision.reasonCodes,
      evidence: policyDecision.evidence,
    },
    approvalState: policyDecision.approvalState,
    metadata: {
      purpose: input.purpose,
      create_commerce_spend_request: Boolean(input.createCommerceSpendRequest),
      purchase_planner: {
        rail: railDecision.rail,
        executable: railDecision.executable,
        reason: railDecision.reason,
        native_capability_id: railDecision.nativeCapabilityId,
        native_rail_id: railDecision.nativeRailId,
        provider: railDecision.provider,
        fallback_eligible: railDecision.fallbackEligible,
        requires_handoff: railDecision.requiresHandoff,
        checkout_can_auto_execute: railDecision.checkoutCanAutoExecute,
        evidence: railDecision.evidence,
      },
    },
    cartItems: input.cartItems,
  })

  await recordBrowserOperatorAuditEvent({
    orgId: input.orgId,
    browserAccountId: input.browserAccountId,
    purchaseRunId: purchaseRun.id,
    opsRunId: input.opsRunId,
    actorType: input.actor?.type ?? 'system',
    actorId: input.actor?.id ?? null,
    eventType: policyDecision.allowed
      ? 'purchase_policy.allowed'
      : 'purchase_policy.blocked',
    severity: policyDecision.allowed ? 'info' : 'block',
    reason: policyDecision.reasonCodes.join(',') || null,
    result: policyDecision.allowed ? 'allowed' : 'blocked',
    metadata: {
      cart_hash: policyDecision.cartHash,
      approval_state: policyDecision.approvalState,
      commerce_spend_request_id: commerceSpendRequestId,
    },
  })

  return {
    purchaseRun,
    policyDecision,
    commerceSpendRequestId,
  }
}

export async function executeAutonomousBrowserOperatorPurchase(input: {
  orgId: string
  purchaseRunId: string
  actor?: AgentCommerceActor
}): Promise<{
  purchaseRun: BrowserOperatorPurchaseRun
  receiptId: string
}> {
  const purchaseRun = await getBrowserOperatorPurchaseRun({
    orgId: input.orgId,
    purchaseRunId: input.purchaseRunId,
  })
  if (!purchaseRun) throw new AgentCommerceError('not_found', 'Browser Operator purchase run not found.', 404)
  if (!purchaseRun.browser_account_id) {
    throw new AgentCommerceError('policy_denied', 'Purchase run is not attached to a connected browser account.', 400)
  }
  if (purchaseRun.approval_state !== 'not_required' && purchaseRun.approval_state !== 'approved') {
    throw new AgentCommerceError('policy_denied', 'Checkout requires human approval before execution.', 409)
  }
  if (!['approved', 'checkout_attempted'].includes(purchaseRun.status)) {
    throw new AgentCommerceError('invalid_state_transition', `Cannot execute checkout from status ${purchaseRun.status}.`, 409)
  }

  const account = await getBrowserOperatorAccount({
    orgId: input.orgId,
    accountId: purchaseRun.browser_account_id,
  })
  if (!account) throw new AgentCommerceError('not_found', 'Browser Operator account not found.', 404)
  if (account.auth_state !== 'connected') {
    throw new AgentCommerceError('policy_denied', 'Merchant account must be connected before autonomous checkout.', 409)
  }
  const profiles = await listBrowserOperatorProfiles({
    orgId: input.orgId,
    browserAccountId: account.id,
  })
  const profileAffinity = resolveBrowserOperatorProfileAffinity({ account, profiles })
  if (!profileAffinity.usable) {
    throw new AgentCommerceError(
      'policy_denied',
      `Merchant browser profile is not usable (${profileAffinity.reason}). Reconnect before autonomous checkout.`,
      409,
    )
  }

  const cartItems = await listBrowserOperatorPurchaseCartItems({ purchaseRunId: purchaseRun.id })
  const adapter = getBrowserOperatorCheckoutAdapter({ account, purchaseRun, cartItems })
  assertBrowserOperatorCheckoutAdapterExecutable(adapter, { account, purchaseRun, cartItems })

  const attempted = await updateBrowserOperatorPurchaseRun({
    orgId: input.orgId,
    purchaseRunId: purchaseRun.id,
    patch: {
      status: 'checkout_attempted',
      metadata: {
        ...(purchaseRun.metadata ?? {}),
        checkout_attempted_at: new Date().toISOString(),
        provider_affinity: {
          provider: profileAffinity.provider,
          reason: profileAffinity.reason,
          profile_ref: profileAffinity.profileRef ?? null,
          context_ref: profileAffinity.contextRef ?? null,
        },
      },
    },
  })

  try {
    const checkoutResult = await adapter.execute({ account, purchaseRun: attempted, cartItems })
    const receipt = await createBrowserOperatorPurchaseReceipt({
      org_id: input.orgId,
      user_id: purchaseRun.user_id,
      browser_account_id: account.id,
      purchase_run_id: purchaseRun.id,
      provider: account.provider,
      ...checkoutResult,
    })
    const completed = await updateBrowserOperatorPurchaseRun({
      orgId: input.orgId,
      purchaseRunId: purchaseRun.id,
      patch: {
        status: 'completed',
        receipt_ref: receipt.id,
        metadata: {
          ...(attempted.metadata ?? {}),
          checkout_adapter: adapter.id,
          completed_at: receipt.purchased_at ?? new Date().toISOString(),
          receipt_url: receipt.receipt_url ?? null,
        },
      },
    })

    await recordBrowserOperatorAuditEvent({
      orgId: input.orgId,
      browserAccountId: account.id,
      purchaseRunId: purchaseRun.id,
      opsRunId: purchaseRun.ops_run_id,
      actorType: input.actor?.type ?? 'system',
      actorId: input.actor?.id ?? null,
      eventType: 'purchase_checkout.completed',
      result: 'completed',
      metadata: {
        receipt_id: receipt.id,
        receipt_url: receipt.receipt_url ?? null,
      },
    })

    return { purchaseRun: completed, receiptId: receipt.id }
  } catch (error) {
    const failed = await updateBrowserOperatorPurchaseRun({
      orgId: input.orgId,
      purchaseRunId: purchaseRun.id,
      patch: {
        status: 'failed',
        failure_reason: error instanceof Error ? error.message : 'Checkout adapter failed.',
        metadata: {
          ...(attempted.metadata ?? {}),
          checkout_failed_at: new Date().toISOString(),
        },
      },
    })
    await recordBrowserOperatorAuditEvent({
      orgId: input.orgId,
      browserAccountId: account.id,
      purchaseRunId: purchaseRun.id,
      opsRunId: purchaseRun.ops_run_id,
      actorType: input.actor?.type ?? 'system',
      actorId: input.actor?.id ?? null,
      eventType: 'purchase_checkout.failed',
      severity: 'error',
      result: 'failed',
      reason: failed.failure_reason ?? null,
    })
    throw error
  }
}
