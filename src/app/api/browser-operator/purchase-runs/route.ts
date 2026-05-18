import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { BrowserOperatorPurchaseCartItemSchema } from '@contracts/browser-operator'
import { AgentCommerceMerchantSchema } from '@contracts/agent-commerce'
import { withCSRF } from '@/lib/auth/csrf'
import { getUserId } from '@/lib/auth/server-utils'
import { AgentCommerceError } from '@/lib/agent-commerce/errors'
import { normalizeIdempotencyKey } from '@/lib/agent-commerce/idempotency'
import { requireAgentCommerceOrgMembership } from '@/lib/agent-commerce/operator-auth'
import {
  browserOperatorErrorResponse,
  browserOperatorOk,
  browserOperatorRequestId,
} from '@/lib/browser-operator/api'
import {
  createGovernedBrowserOperatorPurchaseRun,
  executeAutonomousBrowserOperatorPurchase,
} from '@/lib/browser-operator/purchase-runs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const createPurchaseRunSchema = z.object({
  org_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  assistant_id: z.string().uuid().optional(),
  ops_run_id: z.string().uuid().optional(),
  browser_account_id: z.string().uuid().optional(),
  purchase_policy_id: z.string().uuid(),
  merchant: AgentCommerceMerchantSchema,
  cart_items: z.array(BrowserOperatorPurchaseCartItemSchema).min(1).max(200),
  idempotency_key: z.string().min(8).max(255).optional(),
  purpose: z.string().min(1).max(2000),
  create_commerce_spend_request: z.boolean().default(false),
  execute_if_allowed: z.boolean().default(false),
})

export const POST = withCSRF(async (request: NextRequest) => {
  const requestId = browserOperatorRequestId(request)
  try {
    const userId = await getUserId()
    if (!userId) throw new AgentCommerceError('unauthorized', 'Authentication required.', 401)
    const body = createPurchaseRunSchema.parse(await request.json())
    await requireAgentCommerceOrgMembership(userId, body.org_id)
    const rawIdempotencyKey = request.headers.get('idempotency-key') ?? body.idempotency_key
    if (!rawIdempotencyKey) {
      throw new AgentCommerceError(
        'idempotency_required',
        'Browser Operator purchase runs require an idempotency key.',
        400,
      )
    }
    const idempotencyKey = normalizeIdempotencyKey(
      rawIdempotencyKey,
    )

    const result = await createGovernedBrowserOperatorPurchaseRun({
      orgId: body.org_id,
      projectId: body.project_id,
      userId,
      assistantId: body.assistant_id,
      opsRunId: body.ops_run_id,
      browserAccountId: body.browser_account_id,
      purchasePolicyId: body.purchase_policy_id,
      merchant: body.merchant,
      cartItems: body.cart_items,
      idempotencyKey,
      purpose: body.purpose,
      createCommerceSpendRequest: body.create_commerce_spend_request,
      actor: {
        type: 'user',
        id: userId,
        requestId,
      },
    })

    const executed = body.execute_if_allowed && result.policyDecision.approvalState === 'not_required'
      ? await executeAutonomousBrowserOperatorPurchase({
          orgId: body.org_id,
          purchaseRunId: result.purchaseRun.id,
          actor: {
            type: 'user',
            id: userId,
            requestId,
          },
        })
      : null

    return browserOperatorOk({
      purchase_run: result.purchaseRun,
      policy_decision: result.policyDecision,
      commerce_spend_request_id: result.commerceSpendRequestId,
      executed_purchase_run: executed?.purchaseRun ?? null,
      receipt_id: executed?.receiptId ?? null,
    }, requestId, { status: 201 })
  } catch (error) {
    return browserOperatorErrorResponse(error, requestId)
  }
}) as (request: NextRequest) => Promise<NextResponse | Response>
