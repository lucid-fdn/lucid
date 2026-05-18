import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getAssistant, isUserOrgMember } from '@/lib/db'
import {
  enableAgentWallet,
  disableAgentWallet,
  getAgentWallets,
  updateAgentWalletPolicy,
} from '@/lib/agent-wallets'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { PrivyClient } from '@privy-io/server-auth'

export const dynamic = 'force-dynamic'

const walletActionSchema = z.object({
  action: z.enum(['enable', 'disable']),
})

const updateWithdrawalSchema = z.object({
  withdrawalAddressEvm: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM address').optional(),
  withdrawalAddressSolana: z.string().min(32).max(44).optional(),
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

interface UserPrivyWallets {
  /** Primary embedded wallet addresses (first found) */
  evm: string | null
  solana: string | null
  /** All Privy-linked wallet addresses (embedded + connected) — used for validation */
  allEvmAddresses: string[]
  allSolanaAddresses: string[]
}

/**
 * Look up ALL of the user's Privy wallet addresses (embedded + connected).
 * Returns primary addresses + full address lists for validation.
 */
async function getUserPrivyWallets(userId: string): Promise<UserPrivyWallets> {
  const empty: UserPrivyWallets = { evm: null, solana: null, allEvmAddresses: [], allSolanaAddresses: [] }
  try {
    const supabase = getSupabase()
    const { data: link } = await supabase
      .from('identity_links')
      .select('external_id')
      .eq('user_id', userId)
      .eq('provider', 'privy')
      .single()

    if (!link?.external_id) return empty

    const privy = getPrivy()
    const privyUser = await privy.getUser(link.external_id as string)

    const result: UserPrivyWallets = { evm: null, solana: null, allEvmAddresses: [], allSolanaAddresses: [] }

    const accounts = (privyUser as unknown as Record<string, unknown>).linkedAccounts as
      | Array<{ type: string; chainType?: string; address?: string }>
      | undefined

    if (accounts) {
      for (const account of accounts) {
        if (account.type === 'wallet' && account.address) {
          if (!account.chainType || account.chainType === 'ethereum') {
            result.allEvmAddresses.push(account.address.toLowerCase())
            if (!result.evm) result.evm = account.address
          } else if (account.chainType === 'solana') {
            result.allSolanaAddresses.push(account.address)
            if (!result.solana) result.solana = account.address
          }
        }
      }
    }

    return result
  } catch {
    return empty
  }
}

// GET: Retrieve agent wallets for this assistant
export async function GET(req: NextRequest, ctx: unknown) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await (ctx as { params: Promise<{ id: string }> }).params
    const assistant = await getAssistant(id)
    if (!assistant) {
      return NextResponse.json(
        { error: 'Assistant not found' },
        { status: 404 },
      )
    }

    if (assistant.org_id) {
      const isMember = await isUserOrgMember(userId, assistant.org_id)
      if (!isMember) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 },
        )
      }
    }

    const [wallets, userWallets] = await Promise.all([
      getAgentWallets(id),
      getUserPrivyWallets(userId),
    ])
    return NextResponse.json({
      wallet_enabled: assistant.wallet_enabled ?? false,
      wallets,
      userEmbeddedWallets: { evm: userWallets.evm, solana: userWallets.solana },
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/wallet', method: 'GET' },
      tags: { layer: 'api' },
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

// PATCH: Update withdrawal address(es)
export const PATCH = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await (ctx as { params: Promise<{ id: string }> }).params
    const body = await req.json()
    const { withdrawalAddressEvm, withdrawalAddressSolana } =
      updateWithdrawalSchema.parse(body)

    if (!withdrawalAddressEvm && !withdrawalAddressSolana) {
      return NextResponse.json(
        { error: 'At least one withdrawal address is required' },
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

    // Verify addresses belong to the user's Privy-linked wallets
    const userWallets = await getUserPrivyWallets(userId)

    if (withdrawalAddressEvm) {
      const isOwned = userWallets.allEvmAddresses.includes(
        withdrawalAddressEvm.toLowerCase()
      )
      if (!isOwned) {
        return NextResponse.json(
          { error: 'EVM address is not linked to your account. Only Privy-verified wallets are allowed.' },
          { status: 403 },
        )
      }
    }

    if (withdrawalAddressSolana) {
      const isOwned = userWallets.allSolanaAddresses.includes(
        withdrawalAddressSolana
      )
      if (!isOwned) {
        return NextResponse.json(
          { error: 'Solana address is not linked to your account. Only Privy-verified wallets are allowed.' },
          { status: 403 },
        )
      }
    }

    const supabase = getSupabase()

    if (withdrawalAddressEvm) {
      await supabase
        .from('agent_wallets')
        .update({
          withdrawal_address: withdrawalAddressEvm,
          updated_at: new Date().toISOString(),
        })
        .eq('assistant_id', id)
        .eq('chain_type', 'ethereum')
        .eq('status', 'active')
    }

    if (withdrawalAddressSolana) {
      await supabase
        .from('agent_wallets')
        .update({
          withdrawal_address: withdrawalAddressSolana,
          updated_at: new Date().toISOString(),
        })
        .eq('assistant_id', id)
        .eq('chain_type', 'solana')
        .eq('status', 'active')
    }

    // Rebuild Privy policy to include the new withdrawal address in allowlist
    if (withdrawalAddressEvm) {
      await updateAgentWalletPolicy(id).catch(() => {
        // Non-fatal — withdrawal still works, Privy policy just won't include the new address
      })
    }

    const wallets = await getAgentWallets(id)
    return NextResponse.json({ success: true, wallets })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/wallet', method: 'PATCH' },
      tags: { layer: 'api' },
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
})

// POST: Enable or disable agent wallet
export const POST = withCSRF(async (req: NextRequest, ctx: unknown) => {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await (ctx as { params: Promise<{ id: string }> }).params
    const body = await req.json()
    const { action } = walletActionSchema.parse(body)

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

    if (action === 'enable') {
      // Auto-resolve withdrawal addresses from user's Privy wallets
      const userWallets = await getUserPrivyWallets(userId)
      const resolvedEvm = userWallets.evm || undefined
      const resolvedSolana = userWallets.solana || undefined

      const result = await enableAgentWallet({
        assistantId: id,
        orgId: assistant.org_id,
        withdrawalAddressEvm: resolvedEvm,
        withdrawalAddressSolana: resolvedSolana,
      })

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 })
      }

      return NextResponse.json({
        wallet_enabled: true,
        evm: result.evm,
        solana: result.solana,
      })
    } else {
      const result = await disableAgentWallet(id)

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 })
      }

      return NextResponse.json({ wallet_enabled: false })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 },
      )
    }
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/wallet', method: 'POST' },
      tags: { layer: 'api' },
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
})
