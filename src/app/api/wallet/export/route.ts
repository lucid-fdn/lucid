import { NextRequest, NextResponse } from 'next/server'
import { PrivyClient } from '@privy-io/server-auth'
import { requireUserId } from '@/lib/auth/session'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/wallet/export
 * Server-side wallet export (backup for client-side failures)
 * 
 * This endpoint handles wallet exports that can't be done client-side,
 * such as wallets created via server-side Privy API.
 */
export async function POST(req: NextRequest) {
  try {
    // Require authentication
    const userId = await requireUserId()
    
    const { address } = await req.json()
    
    if (!address) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }
    
    // Initialize Privy server client
    const privy = new PrivyClient(
      process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      process.env.PRIVY_APP_SECRET!
    )
    
    try {
      // Get user from Privy
      const privyUser = await privy.getUserById(userId)
      
      if (!privyUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }
      
      // Find the wallet
      const wallet = privyUser.linkedAccounts?.find(
        (acc: { type: string; address?: string }) => acc.type === 'wallet' && acc.address?.toLowerCase() === address.toLowerCase()
      )
      
      if (!wallet) {
        return NextResponse.json(
          { error: 'Wallet not found' },
          { status: 404 }
        )
      }
      
      // Check if it's an embedded wallet
      const walletRecord = wallet as unknown as { walletClientType?: string }
      if (walletRecord.walletClientType !== 'privy') {
        return NextResponse.json(
          { error: 'Only embedded wallets can be exported' },
          { status: 400 }
        )
      }
      
      // Note: Privy's server-side SDK may not support wallet export
      // This is intentional - most wallets should be exported client-side
      // Server-side export is a security risk and not recommended
      
      return NextResponse.json({
        success: false,
        error: 'Server-side wallet export is not supported for security reasons. Please use the browser export feature.',
        clientSideOnly: true
      }, { status: 400 })
      
    } catch (privyError: unknown) {
      ErrorService.captureException(privyError, {
      severity: 'error',
      context: {
        endpoint: '/wallet/export/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
      
      // Check for specific Privy errors
      const privyMessage = privyError instanceof Error ? privyError.message : undefined
      if (privyMessage?.includes('client-side')) {
        return NextResponse.json(
          {
            error: 'This wallet was created client-side and can only be exported from the browser',
            clientSideOnly: true
          },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: privyMessage || 'Failed to export wallet' },
        { status: 500 }
      )
    }
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/wallet/export/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
