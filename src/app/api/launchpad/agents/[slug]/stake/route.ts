import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { resolveAgent, getStakingPool } from '@/lib/db/launchpad'
import { getStakeParams, getWalletStakes } from '@/lib/launchpad/streamflow'
import { FEATURES } from '@/lib/features'
import { ErrorService } from '@/lib/errors/error-service'
import { withCSRF } from '@/lib/auth/csrf'

export const dynamic = 'force-dynamic'

/**
 * POST /api/launchpad/agents/[slug]/stake
 *
 * Returns staking parameters for client-side transaction building.
 * The client uses Streamflow's SDK with their wallet adapter to sign + send.
 *
 * Body: { amount: number, duration: number, wallet_address: string }
 * Response: { stakePool, stakePoolMint, amount, duration, nonce }
 */
export const POST = withCSRF(async (
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) => {
  if (!FEATURES.launchpad || !FEATURES.agentStaking) {
    return NextResponse.json({ error: 'Staking not enabled' }, { status: 404 })
  }

  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slug } = await params
    const body = await req.json()
    const { amount, duration, wallet_address } = body

    if (!amount || !duration || !wallet_address) {
      return NextResponse.json({ error: 'Missing required fields: amount, duration, wallet_address' }, { status: 400 })
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
    }

    if (typeof duration !== 'number' || duration < 86400 || duration > 86400 * 365) {
      return NextResponse.json({ error: 'Duration must be between 1 day (86400) and 1 year (31536000) seconds' }, { status: 400 })
    }

    const agent = await resolveAgent(slug)
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (agent.status !== 'trading') {
      return NextResponse.json({ error: 'Agent is not in trading status' }, { status: 400 })
    }

    if (!agent.token_mint) {
      return NextResponse.json({ error: 'Agent token has not been minted yet' }, { status: 400 })
    }

    const pool = await getStakingPool(agent.id)
    if (!pool) {
      return NextResponse.json({ error: 'No active staking pool for this agent' }, { status: 400 })
    }

    // Get validated stake parameters for client-side transaction building
    const stakeParams = await getStakeParams({
      stakePoolId: pool.streamflow_pool_id,
      tokenMint: agent.token_mint,
      amount,
      durationSeconds: duration,
      stakerWallet: wallet_address,
    })

    return NextResponse.json({
      success: true,
      ...stakeParams,
      // Client uses these with @streamflow/staking SDK:
      // const client = new SolanaStakingClient({ clusterUrl, cluster })
      // await client.stake({ ...stakeParams }, { invoker: walletAdapter })
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/launchpad/agents/[slug]/stake', method: 'POST' },
      tags: { layer: 'api', route: 'launchpad-stake' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

/**
 * GET /api/launchpad/agents/[slug]/stake?wallet=<address>
 *
 * Returns the user's active stakes for this agent.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!FEATURES.launchpad || !FEATURES.agentStaking) {
    return NextResponse.json({ error: 'Staking not enabled' }, { status: 404 })
  }

  try {
    const { slug } = await params
    const wallet = req.nextUrl.searchParams.get('wallet')

    if (!wallet) {
      return NextResponse.json({ error: 'Missing wallet query parameter' }, { status: 400 })
    }

    const agent = await resolveAgent(slug)
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const pool = await getStakingPool(agent.id)
    if (!pool) {
      return NextResponse.json({ stakes: [], poolId: null })
    }

    try {
      const stakes = await getWalletStakes(pool.streamflow_pool_id, wallet)
      return NextResponse.json({
        stakes: stakes ?? [],
        poolId: pool.streamflow_pool_id,
        tokenMint: agent.token_mint,
      })
    } catch {
      // Pool might not exist on-chain yet
      return NextResponse.json({ stakes: [], poolId: pool.streamflow_pool_id })
    }
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/launchpad/agents/[slug]/stake', method: 'GET' },
      tags: { layer: 'api', route: 'launchpad-stake' },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
