import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { getReceipt, verifyReceipt, getReceiptProof } from '@/lib/ai/receipts'
import { ErrorService } from '@/lib/errors/error-service'
import { insertReceiptEvent } from '@/lib/db/mission-control'

export const dynamic = 'force-dynamic'

/**
 * GET /api/assistants/[id]/receipts?runId=<runId>&action=get|verify|proof
 *
 * Fetch, verify, or get proof for an L2 receipt by run ID.
 *
 * Query params:
 *   runId  — Required. The agent run ID.
 *   action — Optional. One of: get (default), verify, proof.
 */
export async function GET(_req: NextRequest, ctx: unknown) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await (ctx as { params: Promise<{ id: string }> }).params
    const runId = _req.nextUrl.searchParams.get('runId')
    const action = _req.nextUrl.searchParams.get('action') || 'get'

    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 })
    }

    const assistant = await getAssistant(id)
    if (!assistant) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
    }

    if (assistant.org_id) {
      const isMember = await isUserOrgMember(userId, assistant.org_id)
      if (!isMember) {
        return NextResponse.json(
          { error: 'You do not have access to this assistant' },
          { status: 403 },
        )
      }
    }

    switch (action) {
      case 'verify': {
        const verification = await verifyReceipt(runId)

        // Emit feed event on verification (fire-and-forget)
        if (verification && assistant.org_id) {
          insertReceiptEvent({
            agentId: id,
            orgId: assistant.org_id,
            eventType: 'receipt_verified',
            runId,
            payload: {
              valid: verification.valid ?? false,
              hash_valid: verification.hashValid ?? null,
              signature_valid: verification.signatureValid ?? null,
              receipt_hash: (verification as Record<string, unknown>).receiptHash ?? null,
            },
          }).catch(() => {})
        }

        return NextResponse.json({ verification })
      }
      case 'proof': {
        const proof = await getReceiptProof(runId)
        return NextResponse.json({ proof })
      }
      case 'get':
      default: {
        const receipt = await getReceipt(runId)
        return NextResponse.json({ receipt })
      }
    }
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/receipts', method: 'GET' },
      tags: { layer: 'api', route: 'assistants' },
    })
    return NextResponse.json(
      { error: 'Failed to fetch receipt' },
      { status: 500 },
    )
  }
}
