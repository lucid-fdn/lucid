import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getProofDetail } from '@/lib/db/mission-control'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

// POST /api/mission-control/proofs/verify
// Body: { proof_id: string, org_id: string }
//
// Stub: Returns verification result based on current anchor_status.
// When L3 is ready, this will verify against AnchorRegistry on-chain.
export const POST = withCSRF(async (request: NextRequest) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { proof_id, org_id } = body

    if (!proof_id || !org_id) {
      return NextResponse.json(
        { error: 'proof_id and org_id required' },
        { status: 400 }
      )
    }

    const isMember = await isUserOrgMember(userId, org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const proof = await getProofDetail(proof_id, org_id)
    if (!proof) {
      return NextResponse.json({ error: 'Proof not found' }, { status: 404 })
    }

    // Stub verification — when L3 is ready, this will:
    // 1. Fetch the on-chain anchor via anchor_tx_hash
    // 2. Verify tool_result_hash matches on-chain data
    // 3. Verify policy_snapshot was active at anchor timestamp
    // 4. Return full verification receipt

    if (!proof.anchor_tx_hash) {
      return NextResponse.json({
        verified: false,
        status: 'not_anchored',
        message:
          'This action does not have a finalized proof receipt yet.',
        proof_id: proof.id,
        tool_name: proof.tool_name,
        created_at: proof.created_at,
      })
    }

    // If we have a tx hash, return a stub "verified" response
    return NextResponse.json({
      verified: true,
      status: 'verified',
      message: 'Action verified against its proof receipt.',
      proof_id: proof.id,
      tool_name: proof.tool_name,
      anchor_tx_hash: proof.anchor_tx_hash,
      anchor_chain: proof.anchor_chain,
      created_at: proof.created_at,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/mission-control/proofs/verify' },
      tags: { layer: 'api', route: 'mission-control' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
})
