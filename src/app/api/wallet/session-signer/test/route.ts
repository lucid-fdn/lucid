import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { ErrorService } from '@/lib/errors/error-service'
import {
  hasSessionSignerEnabled,
  executeAutonomousTransaction,
  getUserSessionSigners
} from '@/lib/session-signers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/wallet/session-signer/test
 * Test endpoint to verify session signer functionality
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const userId = await requireUserId()
    
    // 2. Get request body
    const body = await request.json()
    const { walletAddress, testTransaction } = body
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress required' },
        { status: 400 }
      )
    }
    
    // 3. Check if session signer is enabled
    const isEnabled = await hasSessionSignerEnabled(userId, walletAddress)
    
    if (!isEnabled) {
      return NextResponse.json({
        success: false,
        step: 'permission_check',
        message: 'Session signer not enabled for this wallet. Please enable it in Settings → Account first.',
        enabled: false
      })
    }
    
    // 4. Get all session signers for this user
    const userSigners = await getUserSessionSigners(userId)
    
    // 5. Test signing a dummy transaction (if provided)
    let signResult = null
    if (testTransaction) {
      signResult = await executeAutonomousTransaction(
        userId,
        walletAddress,
        testTransaction
      )

    }
    
    // 6. Return test results
    return NextResponse.json({
      success: true,
      test_results: {
        user_id: userId,
        wallet_address: walletAddress,
        permission_check: {
          enabled: isEnabled,
          status: '✅ PASS'
        },
        user_signers: {
          count: userSigners.length,
          signers: userSigners.map(s => ({
            wallet: s.wallet_address,
            enabled: s.enabled,
            enabled_at: s.enabled_at,
            revoked_at: s.revoked_at
          })),
          status: '✅ PASS'
        },
        ...(testTransaction && {
          transaction_signing: {
            success: signResult?.success,
            has_tx_hash: !!signResult?.txHash,
            tx_hash_preview: signResult?.txHash?.substring(0, 20) + '...',
            error: signResult?.error,
            status: signResult?.success ? '✅ PASS' : '❌ FAIL'
          }
        })
      },
      message: 'All tests passed! Session signer is working correctly.'
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/wallet/session-signer/test/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json(
      { 
        error: 'Test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}
