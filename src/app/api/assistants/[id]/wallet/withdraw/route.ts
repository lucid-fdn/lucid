import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import { executeAgentWalletTransaction } from '@/lib/session-signers'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { PrivyClient } from '@privy-io/server-auth'

export const dynamic = 'force-dynamic'

const withdrawSchema = z.object({
  chainType: z.enum(['ethereum', 'solana']),
  amount: z.string().min(1),
  token: z.string().default('native'),
})

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

let _privy: PrivyClient | null = null
function getPrivy(): PrivyClient {
  if (!_privy) {
    _privy = new PrivyClient(
      process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      process.env.PRIVY_APP_SECRET!,
    )
  }
  return _privy
}

/**
 * Verify that a withdrawal address belongs to the user's Privy-linked wallets.
 * Prevents withdrawals to addresses that were set before but are no longer linked.
 */
async function verifyAddressOwnedByUser(
  userId: string,
  address: string,
  chainType: string,
): Promise<boolean> {
  try {
    const supabase = getSupabase()
    const { data: link } = await supabase
      .from('identity_links')
      .select('external_id')
      .eq('user_id', userId)
      .eq('provider', 'privy')
      .single()

    if (!link?.external_id) return false

    const privy = getPrivy()
    const privyUser = await privy.getUser(link.external_id as string)
    const accounts = (privyUser as unknown as Record<string, unknown>).linkedAccounts as
      | Array<{ type: string; chainType?: string; address?: string }>
      | undefined

    if (!accounts) return false

    for (const account of accounts) {
      if (account.type !== 'wallet' || !account.address) continue
      const accountChain = account.chainType || 'ethereum'
      if (accountChain === chainType) {
        if (chainType === 'ethereum') {
          if (account.address.toLowerCase() === address.toLowerCase()) return true
        } else {
          if (account.address === address) return true
        }
      }
    }

    return false
  } catch {
    // If Privy is unreachable, fail closed — deny the withdrawal
    return false
  }
}

/**
 * Known ERC20 token addresses (checksummed) per chain.
 * Maps token symbol (uppercase) to { address, decimals }.
 * Only the most common stablecoins/tokens are included.
 */
const ERC20_TOKENS: Record<string, Record<string, { address: string; decimals: number }>> = {
  // Ethereum Mainnet (chainId 1)
  '1': {
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    DAI: { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
    WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
  },
  // Base (chainId 8453)
  '8453': {
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    DAI: { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
    WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  },
  // Arbitrum One (chainId 42161)
  '42161': {
    USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    'USDC.e': { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6 },
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    DAI: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
  },
}

/**
 * Convert a human-readable amount string to the smallest unit (wei, etc.)
 * using string-based math to avoid floating point precision issues.
 *
 * Examples:
 *   parseUnits("1.5", 18) => "1500000000000000000"
 *   parseUnits("0.1", 6)  => "100000"
 */
function parseUnits(amount: string, decimals: number): string {
  const [intPart, fracPart = ''] = amount.split('.')
  const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals)
  const raw = intPart + paddedFrac
  // Strip leading zeros but keep at least one digit
  const stripped = raw.replace(/^0+/, '') || '0'
  return stripped
}

/**
 * Encode an ERC20 transfer(address, uint256) call.
 * Returns the hex-encoded calldata.
 */
function encodeERC20Transfer(to: string, amountRaw: string): string {
  // transfer(address,uint256) selector = 0xa9059cbb
  const selector = 'a9059cbb'
  // Pad address to 32 bytes (remove 0x prefix, left-pad to 64 hex chars)
  const addressParam = to.toLowerCase().replace('0x', '').padStart(64, '0')
  // Convert amount to hex and left-pad to 64 hex chars
  const amountHex = BigInt(amountRaw).toString(16).padStart(64, '0')
  return '0x' + selector + addressParam + amountHex
}

// POST: Execute a withdrawal from the agent wallet
export const POST = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await (ctx as { params: Promise<{ id: string }> }).params
    const body = await req.json()
    const { chainType, amount, token } = withdrawSchema.parse(body)

    // Validate amount is a positive number
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 },
      )
    }

    const assistant = await getAssistant(id)
    if (!assistant) {
      return NextResponse.json(
        { error: 'Assistant not found' },
        { status: 404 },
      )
    }

    if (!assistant.org_id) {
      return NextResponse.json(
        { error: 'Assistant has no organization' },
        { status: 400 },
      )
    }

    const isMember = await isUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 },
      )
    }

    // Look up the active agent wallet for this chain
    const supabase = getSupabase()
    const { data: wallet, error: walletErr } = await supabase
      .from('agent_wallets')
      .select('id, assistant_id, chain_type, status, address, privy_wallet_id, withdrawal_address, created_at, updated_at')
      .eq('assistant_id', id)
      .eq('chain_type', chainType)
      .eq('status', 'active')
      .single()

    if (walletErr || !wallet) {
      return NextResponse.json(
        { error: 'No active wallet found for this chain' },
        { status: 404 },
      )
    }

    const withdrawalAddress = wallet.withdrawal_address as string | null
    if (!withdrawalAddress) {
      return NextResponse.json(
        { error: 'Set a withdrawal address first' },
        { status: 400 },
      )
    }

    // Re-verify withdrawal address belongs to the user's Privy-linked wallets
    const isVerified = await verifyAddressOwnedByUser(userId, withdrawalAddress, chainType)
    if (!isVerified) {
      return NextResponse.json(
        { error: 'Withdrawal address is no longer linked to your Privy account' },
        { status: 403 },
      )
    }

    const privyWalletId = wallet.privy_wallet_id as string

    // Build and execute the transaction
    if (chainType === 'solana') {
      // Solana withdrawals require building a serialized transaction
      // which needs the Solana web3.js library. Return a clear error for now.
      return NextResponse.json(
        { error: 'Solana withdrawals are not yet supported. Please use an EVM chain.' },
        { status: 400 },
      )
    }

    // EVM transaction
    const tokenUpper = token.toUpperCase()
    const chainId = '1' // Default to Ethereum Mainnet

    if (tokenUpper === 'NATIVE' || tokenUpper === 'ETH') {
      // Native ETH transfer
      const valueWei = parseUnits(amount, 18)

      const result = await executeAgentWalletTransaction(
        privyWalletId,
        wallet.address as string,
        {
          chainType: 'ethereum',
          chainId,
          to: withdrawalAddress,
          value: valueWei,
        }
      )

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Transaction failed' },
          { status: 500 },
        )
      }

      return NextResponse.json({ success: true, txHash: result.txHash })
    }

    // ERC20 token transfer
    const chainTokens = ERC20_TOKENS[chainId]
    const tokenInfo = chainTokens?.[tokenUpper]

    if (!tokenInfo) {
      return NextResponse.json(
        { error: `Unsupported token "${token}" on chain ${chainId}. Supported: ${chainTokens ? Object.keys(chainTokens).join(', ') : 'none'}` },
        { status: 400 },
      )
    }

    const amountRaw = parseUnits(amount, tokenInfo.decimals)
    const calldata = encodeERC20Transfer(withdrawalAddress, amountRaw)

    const result = await executeAgentWalletTransaction(
      privyWalletId,
      wallet.address as string,
      {
        chainType: 'ethereum',
        chainId,
        to: tokenInfo.address,
        data: calldata,
        value: '0',
      }
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Transaction failed' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, txHash: result.txHash })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/wallet/withdraw', method: 'POST' },
      tags: { layer: 'api' },
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
})
