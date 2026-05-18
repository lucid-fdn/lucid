import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth/session'
import { hasSessionSignerEnabled, getUserSessionSigners, type ChainType, SUPPORTED_CHAINS } from '@/lib/session-signers'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/wallet/session-signer/status
 * Check if user has session signer enabled for a wallet
 *
 * Query params:
 * - address: string (required) - wallet address to check
 * - chainType: 'ethereum' | 'solana' (optional) - if provided, check specific chain
 *
 * If no chainType is provided, returns status for all chains for this wallet
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const userId = await requireUserId()

    // 2. Get parameters
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('address')
    const chainType = searchParams.get('chainType') as ChainType | null

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 400 }
      )
    }

    // 3. Check status
    if (chainType) {
      // Check specific chain
      if (chainType !== 'ethereum' && chainType !== 'solana') {
        return NextResponse.json(
          { error: 'Invalid chainType. Must be "ethereum" or "solana"' },
          { status: 400 }
        )
      }

      const enabled = await hasSessionSignerEnabled(userId, walletAddress, chainType)

      return NextResponse.json({
        enabled,
        walletAddress: walletAddress.toLowerCase(),
        chainType,
        supportedChains: SUPPORTED_CHAINS,
      })
    }

    // Get all session signers for this user
    const signers = await getUserSessionSigners(userId)

    // Filter to this wallet
    const walletSigners = signers.filter(
      s => s.wallet_address.toLowerCase() === walletAddress.toLowerCase()
    )

    // Build status per chain
    const chainStatus: Record<string, { enabled: boolean; chainId: string | null; enabledAt: string | null }> = {}
    for (const signer of walletSigners) {
      if (signer.enabled && !signer.revoked_at) {
        chainStatus[signer.chain_type] = {
          enabled: true,
          chainId: signer.chain_id,
          enabledAt: signer.enabled_at,
        }
      }
    }

    return NextResponse.json({
      walletAddress: walletAddress.toLowerCase(),
      chainStatus,
      enabledChains: Object.keys(chainStatus),
      supportedChains: SUPPORTED_CHAINS,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/wallet/session-signer/status/route.ts',
        method: 'GET'
      },
      tags: {
        layer: 'api',
        route: 'session-signer-status'
      }
    })
    return NextResponse.json(
      { error: 'Failed to check session signer status' },
      { status: 500 }
    )
  }
}
