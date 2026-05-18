import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { revokeSessionSigner } from '@/lib/session-signers'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/wallet/session-signer/revoke
 * Revoke session signer permission for a user's wallet
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // 1. Authenticate user
    const userId = await requireUserId()
    
    // 2. Get wallet address from request body
    const body = await request.json()
    const { walletAddress } = body
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 400 }
      )
    }
    
    // 3. Revoke session signer
    const result = await revokeSessionSigner(userId, walletAddress)
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to revoke session signer' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      walletAddress: walletAddress.toLowerCase(),
      message: 'Session signer revoked successfully'
    })
  } catch (error) {
    const _duration = Date.now() - startTime
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/wallet/session-signer/revoke/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { error: 'Failed to revoke session signer' },
      { status: 500 }
    )
  }
}
