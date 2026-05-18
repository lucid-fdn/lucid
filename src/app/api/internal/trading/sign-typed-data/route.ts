/**
 * Internal Sign Typed Data API — For x402 Protocol
 *
 * Signs EIP-712 typed data using an agent's Privy wallet.
 * Used by the worker to generate x402 payment authorization headers.
 *
 * Confused-deputy protected: derives wallet from assistantId, never trusts
 * worker-supplied wallet IDs directly.
 */

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { verifyInternalAuth } from '@/lib/trading/internal-auth'
import { signAgentWalletTypedData } from '@/lib/session-signers'
import { ErrorService } from '@/lib/errors/error-service'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

interface SignTypedDataRequest {
  assistantId: string
  typedData: Record<string, unknown>
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verify HMAC + replay protection
    const auth = await verifyInternalAuth(request)
    if (!auth.valid || !auth.body) {
      return NextResponse.json(
        { error: auth.error || 'Authentication failed' },
        { status: 401 }
      )
    }

    const body: SignTypedDataRequest = JSON.parse(auth.body)
    const { assistantId, typedData } = body

    if (!assistantId || !typedData) {
      return NextResponse.json(
        { error: 'Missing required fields: assistantId, typedData' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    // 2. Look up active EVM agent wallet (x402 is EVM-only)
    const { data: agentWallet, error: awError } = await supabase
      .from('agent_wallets')
      .select('privy_wallet_id, address')
      .eq('assistant_id', assistantId)
      .eq('chain_type', 'ethereum')
      .eq('status', 'active')
      .single()

    if (awError || !agentWallet) {
      return NextResponse.json(
        { error: 'No active EVM agent wallet' },
        { status: 404 }
      )
    }

    // 3. Sign typed data via Privy
    const result = await signAgentWalletTypedData(
      agentWallet.privy_wallet_id,
      typedData
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Signing failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      signature: result.signature,
      address: agentWallet.address,
    })
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { operation: 'internalSignTypedData' },
      tags: { layer: 'trading-execute' },
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
