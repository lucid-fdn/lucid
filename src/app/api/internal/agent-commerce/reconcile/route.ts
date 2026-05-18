/**
 * GET /api/internal/agent-commerce/reconcile
 *
 * Cron-safe reconciliation endpoint for stale Agent Commerce approvals,
 * stuck credential issuance, expired machine challenges, and provider webhook
 * mismatches.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  agentCommerceErrorResponse,
  agentCommerceOk,
  agentCommerceRequestId,
  guardAgentCommerceSurface,
} from '@/lib/agent-commerce/api'
import { runAgentCommerceReconciliation } from '@/lib/agent-commerce/reconciliation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  orgId: z.string().uuid().optional(),
})

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false

  const authHeader = request.headers.get('authorization')
  const querySecret = request.nextUrl.searchParams.get('secret')

  return authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret
}

export async function GET(request: NextRequest) {
  const guard = guardAgentCommerceSurface('wallets', request)
  if (guard) return guard
  const requestId = agentCommerceRequestId(request)

  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized or CRON_SECRET not configured', request_id: requestId },
      { status: 401, headers: { 'x-request-id': requestId } },
    )
  }

  try {
    const query = querySchema.parse({
      orgId: request.nextUrl.searchParams.get('org_id') ?? request.nextUrl.searchParams.get('orgId') ?? undefined,
    })
    const result = await runAgentCommerceReconciliation({
      orgId: query.orgId,
      actor: { type: 'system', requestId },
    })
    return agentCommerceOk({ reconciliation: result }, requestId)
  } catch (error) {
    return agentCommerceErrorResponse(error, requestId)
  }
}
