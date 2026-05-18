import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { enableSessionSigner, type ChainType } from '@/lib/session-signers'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/wallet/session-signer/enable
 * Enable session signer for a user's wallet
 * Should be called AFTER user approves adding session signer on frontend
 *
 * Body:
 * - walletAddress: string (required)
 * - chainType: 'ethereum' | 'solana' (optional, defaults to 'ethereum')
 * - chainId: string (optional, e.g., '1', '137', 'mainnet-beta')
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const userId = await requireUserId()

    // 2. Get parameters from request body
    const body = await request.json()
    const { walletAddress, chainType = 'ethereum', chainId } = body

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 400 }
      )
    }

    // Validate chainType
    if (chainType !== 'ethereum' && chainType !== 'solana') {
      return NextResponse.json(
        { error: 'Invalid chainType. Must be "ethereum" or "solana"' },
        { status: 400 }
      )
    }

    // 3. Enable session signer
    const result = await enableSessionSigner(
      userId,
      walletAddress,
      chainType as ChainType,
      chainId
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to enable session signer' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      walletAddress: walletAddress.toLowerCase(),
      chainType,
      chainId: chainId || null,
      message: 'Session signer enabled successfully'
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/wallet/session-signer/enable/route.ts',
        method: 'POST'
      },
      tags: {
        layer: 'api',
        route: 'session-signer-enable'
      }
    })
    return NextResponse.json(
      { error: 'Failed to enable session signer' },
      { status: 500 }
    )
  }
}
