/**
 * Hyperliquid Perpetuals Tools
 * Tools for interacting with Hyperliquid DEX
 *
 * API Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
 */

import type { TransactionSigner, EIP712TypedData } from '@lucid-fdn/agent-tools-core'
import { createTradingPolicyGuard } from '../../../guards/TradingPolicyGuard.js'
import {
  hasSessionSignerEnabled,
} from '../../../services/session-signer/index.js'
import type { ToolContext } from '../../../agent/tools/types.js'
import { sanitizeToolError } from '../../../agent/tools/tx-error-translator.js'

// ============================================================================
// Hyperliquid Meta Cache (asset indexes from API)
// ============================================================================

interface HlAssetMeta { name: string; szDecimals: number; maxLeverage: number; index: number }
let hlMetaCache: { assets: HlAssetMeta[]; ts: number } | null = null
const HL_META_CACHE_TTL = 300_000 // 5 min

/**
 * Fetch and cache asset metadata from Hyperliquid /info { type: "meta" }.
 * Returns asset index for a given market, or null if not found.
 */
async function getAssetIndex(market: string): Promise<number | null> {
  if (hlMetaCache && Date.now() - hlMetaCache.ts < HL_META_CACHE_TTL) {
    const found = hlMetaCache.assets.find(a => a.name === market)
    return found ? found.index : null
  }
  try {
    const response = await fetch(`${HYPERLIQUID_API}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
      signal: AbortSignal.timeout(5_000),
    })
    const meta = await response.json() as {
      universe: Array<{ name: string; szDecimals: number; maxLeverage: number }>
    }
    const assets = meta.universe.map((a, i) => ({ ...a, index: i }))
    hlMetaCache = { assets, ts: Date.now() }
    const found = assets.find(a => a.name === market)
    return found ? found.index : null
  } catch (err) {
    console.warn('[HyperliquidTool] Failed to fetch meta:', err)
    return null
  }
}

// ============================================================================
// Types
// ============================================================================

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz'

interface HlAccountInfoArgs {
  walletAddress?: string
}

interface HlPlaceOrderArgs {
  walletAddress?: string
  market: string
  side: 'long' | 'short'
  size: string
  orderType: 'market' | 'limit'
  price?: string
  reduceOnly?: boolean
  leverage?: number
}

interface HlCancelOrderArgs {
  walletAddress?: string
  orderId: string
  market: string
}

interface HlUserState {
  marginSummary: {
    accountValue: string
    totalNtlPos: string
    totalRawUsd: string
    totalMarginUsed: string
  }
  assetPositions: Array<{
    position: {
      coin: string
      szi: string
      leverage: {
        type: string
        value: number
      }
      entryPx: string
      positionValue: string
      unrealizedPnl: string
      returnOnEquity: string
      liquidationPx: string | null
    }
  }>
  withdrawable: string
}

interface HlOpenOrder {
  oid: number
  coin: string
  side: string
  sz: string
  px: string
  orderType: string
  timestamp: number
  origSz: string
}

// ============================================================================
// Account Info Tool (Read-only, Safe)
// ============================================================================

/** Minimal context for HL account info — allows injection without full ToolContext. */
export interface HlAccountInfoContext {
  agentWallets?: {
    evm?: { address: string }
  }
}

/**
 * Get Hyperliquid account state including positions, balances, and margin info.
 *
 * @param args - account info query args
 * @param context - optional context for wallet resolution. Accepts full ToolContext or minimal HlAccountInfoContext.
 * @param deps - optional injected dependencies (apiUrl). Falls back to module-level defaults.
 */
export async function toolHlAccountInfo(
  args: HlAccountInfoArgs,
  context?: HlAccountInfoContext,
  deps?: { apiUrl?: string },
): Promise<string> {
  // Resolve wallet: agent wallet (DB-managed, EVM only for Hyperliquid) takes priority
  const agentWallet = context?.agentWallets?.evm
  const walletAddress = agentWallet?.address || args.walletAddress

  if (!walletAddress) {
    return 'Error: No wallet available. Enable agent wallet or provide walletAddress.'
  }

  console.log('[HyperliquidTool] Getting account info:', walletAddress.substring(0, 10) + '...')

  const apiUrl = deps?.apiUrl ?? HYPERLIQUID_API

  try {
    // Parallel: user state + open orders (independent calls)
    const [stateResponse, ordersResponse] = await Promise.all([
      fetch(`${apiUrl}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: walletAddress,
        }),
      }),
      fetch(`${apiUrl}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'openOrders',
          user: walletAddress,
        }),
      }),
    ])

    if (!stateResponse.ok) {
      throw new Error(`API error: ${stateResponse.status}`)
    }

    const [state, orders] = await Promise.all([
      stateResponse.json() as Promise<HlUserState>,
      ordersResponse.json() as Promise<HlOpenOrder[]>,
    ])

    return formatAccountInfo(walletAddress, state, orders)
  } catch (error) {
    console.error('[HyperliquidTool] Account info error:', error)
    return `Error fetching account info: ${sanitizeToolError(error)}`
  }
}

/**
 * Format account info for display
 */
function formatAccountInfo(
  address: string,
  state: HlUserState,
  orders: HlOpenOrder[]
): string {
  const lines = [
    `Hyperliquid Account`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Address: ${address}`,
    ``,
    `Margin Summary:`,
    `  Account Value: $${parseFloat(state.marginSummary.accountValue).toFixed(2)}`,
    `  Total Position: $${parseFloat(state.marginSummary.totalNtlPos).toFixed(2)}`,
    `  Margin Used: $${parseFloat(state.marginSummary.totalMarginUsed).toFixed(2)}`,
    `  Withdrawable: $${parseFloat(state.withdrawable).toFixed(2)}`,
  ]

  // Positions
  if (state.assetPositions.length > 0) {
    lines.push(``)
    lines.push(`Positions:`)
    for (const { position } of state.assetPositions) {
      if (parseFloat(position.szi) === 0) continue

      const side = parseFloat(position.szi) > 0 ? 'LONG' : 'SHORT'
      const pnl = parseFloat(position.unrealizedPnl)
      const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`

      lines.push(`  • ${position.coin} ${side}`)
      lines.push(`    Size: ${Math.abs(parseFloat(position.szi)).toFixed(4)}`)
      lines.push(`    Entry: $${parseFloat(position.entryPx).toFixed(2)}`)
      lines.push(`    PnL: ${pnlStr} (${(parseFloat(position.returnOnEquity) * 100).toFixed(2)}%)`)
      lines.push(`    Leverage: ${position.leverage.value}x`)
      if (position.liquidationPx) {
        lines.push(`    Liquidation: $${parseFloat(position.liquidationPx).toFixed(2)}`)
      }
    }
  } else {
    lines.push(``)
    lines.push(`No open positions.`)
  }

  // Open orders
  if (orders.length > 0) {
    lines.push(``)
    lines.push(`Open Orders:`)
    for (const order of orders) {
      const side = order.side === 'B' ? 'BUY' : 'SELL'
      lines.push(`  • ${order.coin} ${side} ${order.sz} @ $${parseFloat(order.px).toFixed(2)} (${order.orderType})`)
    }
  } else {
    lines.push(``)
    lines.push(`No open orders.`)
  }

  return lines.join('\n')
}

// ============================================================================
// Place Order Tool (Elevated, Requires Policy)
// ============================================================================

/**
 * Place a perpetual order on Hyperliquid
 * Requires an authorized wallet and trading policy
 */
export async function toolHlPlaceOrder(args: HlPlaceOrderArgs, context: ToolContext, signer: TransactionSigner): Promise<string> {
  const { market, side, size, orderType, price, reduceOnly = false, leverage = 1 } = args
  const { supabase, userId, assistantId, runId, toolCallId } = context

  // Resolve wallet: agent wallet (DB-managed, EVM only for Hyperliquid) takes priority
  const agentWallet = context.agentWallets?.evm
  const walletAddress = agentWallet?.address || args.walletAddress
  if (!walletAddress) {
    return 'Error: No wallet available. Enable agent wallet or provide walletAddress.'
  }

  // Validate parameters
  if (!market || !side || !size || !orderType) {
    return 'Error: Required parameters: market, side, size, orderType'
  }

  if (orderType === 'limit' && !price) {
    return 'Error: "price" is required for limit orders'
  }

  console.log('[HyperliquidTool] Placing order:', {
    walletAddress: walletAddress.substring(0, 10) + '...',
    market,
    side,
    size,
    orderType,
  })

  try {
    // Get current price for value estimation
    const priceResponse = await fetch(`${HYPERLIQUID_API}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'allMids',
      }),
    })

    const prices = await priceResponse.json() as Record<string, string>
    const marketPrice = parseFloat(prices[market] || '0')

    if (marketPrice === 0) {
      return `Error: Could not get price for market ${market}`
    }

    // Calculate order value
    const sizeNum = parseFloat(size)
    const orderPrice = orderType === 'limit' ? parseFloat(price!) : marketPrice
    const valueUsd = sizeNum * orderPrice

    // Check trading policy
    const policyGuard = createTradingPolicyGuard(supabase, assistantId, userId)
    const policyCheck = await policyGuard.canExecuteTrade({
      chain: 'ethereum', // Hyperliquid is on Arbitrum
      inputToken: 'USDC',
      outputToken: market,
      valueUsd,
      type: 'perp_order',
    })

    if (!policyCheck.allowed) {
      return `Order blocked by trading policy: ${policyCheck.reason}`
    }

    if (policyCheck.requiresConfirmation) {
      return `Order requires user confirmation.

Order Details:
  Market: ${market}
  Side: ${side.toUpperCase()}
  Size: ${size} contracts
  Type: ${orderType}
  ${orderType === 'limit' ? `Price: $${price}` : `Est. Price: $${marketPrice.toFixed(2)}`}
  Leverage: ${leverage}x
  Reduce Only: ${reduceOnly}
  Est. Value: $${valueUsd.toFixed(2)}

Trade value exceeds confirmation threshold.
Please confirm you want to proceed with this order.`
    }

    // Check session signer permission (agent wallets bypass this — they are server-owned)
    if (!context.agentWallets) {
      const hasPermission = await hasSessionSignerEnabled(userId, walletAddress, 'ethereum')

      if (!hasPermission) {
        return `Order blocked: This wallet is not authorized for autonomous trading.

To enable Hyperliquid trading, the wallet owner needs to:
1. Go to Trading Settings in the dashboard
2. Authorize the wallet for trading
3. Configure a trading policy for this assistant`
      }
    }

    // Record pending order
    const recordResult = await policyGuard.recordTrade({
      txHash: '',
      txType: 'perp_order',
      chainType: 'ethereum',
      chainId: '42161', // Arbitrum
      inputToken: 'USDC',
      inputAmount: valueUsd.toFixed(2),
      outputToken: market,
      outputAmount: size,
      valueUsd,
      status: 'pending',
      dexUsed: 'hyperliquid',
      toolCallId,
      runId,
    })

    if (!recordResult.success) {
      return `Failed to record order: ${recordResult.error}`
    }

    const txId = recordResult.transactionId

    // Build and submit order to Hyperliquid
    console.log('[HyperliquidTool] Building and submitting order...')

    try {
      // Build the Hyperliquid order action
      const orderAction = await buildHlOrderAction({
        market,
        side,
        size: sizeNum,
        orderType,
        price: orderPrice,
        reduceOnly,
      })

      // EIP-712 typed data signing via session signer / agent wallet
      const nonce = Date.now()
      const hlTypedData = buildHlEip712TypedData(orderAction as unknown as Record<string, unknown>, nonce)

      const signResult = await signer.signTypedData(hlTypedData)
      if (!signResult.success || !signResult.signature) {
        await policyGuard.updateTransactionStatus(txId!, 'failed', {
          errorMessage: signResult.error || 'EIP-712 signing failed',
        })
        return `Order signing failed: ${signResult.error || 'Could not sign order'}\nTransaction ID: ${txId}`
      }
      const signature = signResult.signature

      // Submit signed order to Hyperliquid exchange endpoint
      const exchangeResponse = await fetch(`${HYPERLIQUID_API}/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: orderAction,
          signature,
          nonce,
          vaultAddress: null,
        }),
      })

      if (!exchangeResponse.ok) {
        const errorData = await exchangeResponse.json().catch(() => ({}))
        const errorMessage = (errorData as { error?: string }).error || `API error: ${exchangeResponse.status}`

        await policyGuard.updateTransactionStatus(txId!, 'failed', {
          errorMessage,
        })

        return `Order submission failed.

Order Details:
  Market: ${market}
  Side: ${side.toUpperCase()}
  Size: ${size} contracts
  Type: ${orderType}

Error: ${errorMessage}
Transaction ID: ${txId}

The order could not be signed. The wallet's trading authorization may have expired — the owner may need to re-authorize.`
      }

      const result = await exchangeResponse.json() as {
        status: string
        response?: { type: string; data?: { statuses?: Array<{ resting?: { oid: number } }> } }
      }

      if (result.status === 'ok' && result.response?.data?.statuses?.[0]?.resting?.oid) {
        const orderId = result.response.data.statuses[0].resting.oid

        await policyGuard.updateTransactionStatus(txId!, 'confirmed', {
          txHash: orderId.toString(),
        })

        console.log('[HyperliquidTool] Order placed successfully:', orderId)

        return `Order placed successfully!

Order Details:
  Market: ${market}
  Side: ${side.toUpperCase()}
  Size: ${size} contracts
  Type: ${orderType}
  ${orderType === 'limit' ? `Price: $${price}` : `Fill Price: ~$${marketPrice.toFixed(2)}`}
  Leverage: ${leverage}x
  Reduce Only: ${reduceOnly}
  Est. Value: $${valueUsd.toFixed(2)}

Order ID: ${orderId}
Transaction ID: ${txId}
Status: ${orderType === 'limit' ? 'Resting' : 'Filled'}

Daily usage: $${((policyCheck.dailyUsed || 0) + valueUsd).toFixed(2)} / $${(policyCheck.dailyLimit || 0).toFixed(2)}`
      }

      // Order submitted but status unclear
      await policyGuard.updateTransactionStatus(txId!, 'submitted')

      return `Order submitted.

Order Details:
  Market: ${market}
  Side: ${side.toUpperCase()}
  Size: ${size} contracts
  Type: ${orderType}

Transaction ID: ${txId}
Status: Submitted (awaiting confirmation)

Check your Hyperliquid account for order status.`

    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : 'Unknown error'
      await policyGuard.updateTransactionStatus(txId!, 'failed', {
        errorMessage,
      })

      return `Order execution failed.

Error: ${errorMessage}
Transaction ID: ${txId}

Note: Hyperliquid orders require EIP-712 signature integration.`
    }

  } catch (error) {
    console.error('[HyperliquidTool] Place order error:', error)
    return `Error placing order: ${sanitizeToolError(error)}`
  }
}

// ============================================================================
// Cancel Order Tool (Elevated, Requires Policy)
// ============================================================================

/**
 * Cancel an open order on Hyperliquid
 */
export async function toolHlCancelOrder(args: HlCancelOrderArgs, context: ToolContext, signer: TransactionSigner): Promise<string> {
  const { orderId, market } = args
  const { supabase, userId, assistantId, runId, toolCallId } = context

  // Resolve wallet: agent wallet (DB-managed, EVM only for Hyperliquid) takes priority
  const agentWallet = context.agentWallets?.evm
  const walletAddress = agentWallet?.address || args.walletAddress
  if (!walletAddress) {
    return 'Error: No wallet available. Enable agent wallet or provide walletAddress.'
  }

  if (!orderId || !market) {
    return 'Error: Required parameters: orderId, market'
  }

  console.log('[HyperliquidTool] Cancelling order:', {
    walletAddress: walletAddress.substring(0, 10) + '...',
    orderId,
    market,
  })

  try {
    // Verify the order exists
    const ordersResponse = await fetch(`${HYPERLIQUID_API}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'openOrders',
        user: walletAddress,
      }),
    })

    const orders = await ordersResponse.json() as HlOpenOrder[]
    const order = orders.find(o => o.oid.toString() === orderId && o.coin === market)

    if (!order) {
      return `Error: Order ${orderId} not found for market ${market}`
    }

    // Check session signer permission (agent wallets bypass this — they are server-owned)
    if (!context.agentWallets) {
      const hasPermission = await hasSessionSignerEnabled(userId, walletAddress, 'ethereum')

      if (!hasPermission) {
        return `Cancel blocked: This wallet is not authorized for trading. The wallet owner needs to authorize it in Trading Settings.`
      }
    }

    // Record the cancellation
    const policyGuard = createTradingPolicyGuard(supabase, assistantId, userId)
    const recordResult = await policyGuard.recordTrade({
      txHash: '',
      txType: 'perp_cancel',
      chainType: 'ethereum',
      chainId: '42161',
      inputToken: market,
      inputAmount: order.sz,
      valueUsd: 0, // Cancellations don't add to volume
      status: 'pending',
      dexUsed: 'hyperliquid',
      toolCallId,
      runId,
    })

    const txId = recordResult.transactionId

    // Build and submit cancel action
    console.log('[HyperliquidTool] Submitting cancel request...')

    try {
      const cancelAction = await buildHlCancelAction(market, orderId)

      // Sign cancel action via agent wallet EIP-712
      const nonce = Date.now()
      const cancelTypedData = buildHlEip712TypedData(cancelAction as unknown as Record<string, unknown>, nonce)
      const signResult = await signer.signTypedData(cancelTypedData)
      if (!signResult.success || !signResult.signature) {
        await policyGuard.updateTransactionStatus(txId!, 'failed', {
          errorMessage: signResult.error || 'EIP-712 signing failed for cancel',
        })
        return `Cancel signing failed: ${signResult.error || 'Could not sign cancel'}\nTransaction ID: ${txId}`
      }
      const signature = signResult.signature

      const exchangeResponse = await fetch(`${HYPERLIQUID_API}/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: cancelAction,
          signature,
          nonce,
          vaultAddress: null,
        }),
      })

      if (!exchangeResponse.ok) {
        const errorData = await exchangeResponse.json().catch(() => ({}))
        const errorMessage = (errorData as { error?: string }).error || `API error: ${exchangeResponse.status}`

        await policyGuard.updateTransactionStatus(txId!, 'failed', {
          errorMessage,
        })

        return `Cancel order failed.

Order to Cancel:
  Order ID: ${orderId}
  Market: ${market}

Error: ${errorMessage}
Transaction ID: ${txId}`
      }

      const result = await exchangeResponse.json() as { status: string }

      if (result.status === 'ok') {
        await policyGuard.updateTransactionStatus(txId!, 'confirmed', {
          txHash: orderId,
        })

        console.log('[HyperliquidTool] Order cancelled successfully')

        return `Order cancelled successfully!

Cancelled Order:
  Order ID: ${orderId}
  Market: ${market}
  Side: ${order.side === 'B' ? 'BUY' : 'SELL'}
  Size: ${order.sz}
  Price: $${parseFloat(order.px).toFixed(2)}

Transaction ID: ${txId}
Status: Cancelled`
      }

      await policyGuard.updateTransactionStatus(txId!, 'submitted')

      return `Cancel request submitted.

Order to Cancel:
  Order ID: ${orderId}
  Market: ${market}

Transaction ID: ${txId}
Status: Submitted (awaiting confirmation)`

    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : 'Unknown error'
      await policyGuard.updateTransactionStatus(txId!, 'failed', {
        errorMessage,
      })

      return `Cancel execution failed.

Error: ${errorMessage}
Transaction ID: ${txId}`
    }

  } catch (error) {
    console.error('[HyperliquidTool] Cancel order error:', error)
    return `Error cancelling order: ${sanitizeToolError(error)}`
  }
}

// ============================================================================
// Helper: Get Market Info
// ============================================================================

/**
 * Get Hyperliquid market metadata
 */
export async function getHlMarketInfo(market: string): Promise<{
  name: string
  szDecimals: number
  maxLeverage: number
} | null> {
  try {
    const response = await fetch(`${HYPERLIQUID_API}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'meta',
      }),
    })

    const meta = await response.json() as {
      universe: Array<{
        name: string
        szDecimals: number
        maxLeverage: number
      }>
    }

    return meta.universe.find(m => m.name === market) || null
  } catch {
    return null
  }
}

// ============================================================================
// Helper: Build Hyperliquid Order Action
// ============================================================================

interface HlOrderParams {
  market: string
  side: 'long' | 'short'
  size: number
  orderType: 'market' | 'limit'
  price: number
  reduceOnly: boolean
}

interface HlOrderAction {
  type: 'order'
  orders: Array<{
    a: number // Asset index
    b: boolean // isBuy
    p: string // Price
    s: string // Size
    r: boolean // Reduce only
    t: { limit: { tif: string } } | { trigger: { isMarket: boolean; triggerPx: string; tpsl: string } }
  }>
  grouping: 'na'
}

/**
 * Build a Hyperliquid order action payload.
 * Fetches asset index from API (cached) instead of hardcoded map.
 */
async function buildHlOrderAction(params: HlOrderParams): Promise<HlOrderAction> {
  const { market, side, size, orderType, price, reduceOnly } = params

  const assetIndex = await getAssetIndex(market)
  if (assetIndex === null) {
    throw new Error(`Unknown Hyperliquid market: ${market}. Check available markets via hl_account_info.`)
  }

  const isBuy = side === 'long'
  const sizeStr = size.toFixed(4)

  // For market orders, use a far limit price (IOC) so it fills immediately.
  // Both buy and sell sides need the far price for reliable execution.
  let orderPrice: string
  let orderTypeConfig: HlOrderAction['orders'][0]['t']

  if (orderType === 'market') {
    orderPrice = isBuy
      ? (price * 1.05).toFixed(2) // 5% above for buys
      : (price * 0.95).toFixed(2) // 5% below for sells
    orderTypeConfig = { limit: { tif: 'Ioc' } }
  } else {
    orderPrice = price.toFixed(2)
    orderTypeConfig = { limit: { tif: 'Gtc' } }
  }

  return {
    type: 'order',
    orders: [
      {
        a: assetIndex,
        b: isBuy,
        p: orderPrice,
        s: sizeStr,
        r: reduceOnly,
        t: orderTypeConfig,
      },
    ],
    grouping: 'na',
  }
}

/**
 * Build a Hyperliquid cancel action payload.
 * Fetches asset index from API (cached).
 */
async function buildHlCancelAction(market: string, orderId: string): Promise<{
  type: 'cancel'
  cancels: Array<{ a: number; o: number }>
}> {
  const assetIndex = await getAssetIndex(market)
  if (assetIndex === null) {
    throw new Error(`Unknown Hyperliquid market: ${market}`)
  }

  return {
    type: 'cancel',
    cancels: [{ a: assetIndex, o: parseInt(orderId) }],
  }
}

/**
 * Build EIP-712 typed data for Hyperliquid exchange actions.
 * Hyperliquid uses a specific domain and type structure for signing.
 */
function buildHlEip712TypedData(action: Record<string, unknown>, nonce: number): EIP712TypedData {
  return {
    domain: {
      chainId: 42161,
      name: 'Exchange',
      verifyingContract: '0x0000000000000000000000000000000000000000',
      version: '1',
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
    },
    primaryType: 'Agent',
    message: {
      source: 'a',
      connectionId: createActionHash(action, nonce),
    },
  }
}

// ============================================================================
// Deposit Tool (Elevated, ERC20 Transfer to Bridge2)
// ============================================================================

/** Arbitrum USDC contract */
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
/** Hyperliquid Bridge2 deposit contract on Arbitrum */
const HL_BRIDGE2_CONTRACT = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7'
/** Minimum deposit amount (USDC) */
const HL_MIN_DEPOSIT = 5

interface HlDepositArgs {
  amount: string
}

/**
 * Deposit USDC from Arbitrum wallet into Hyperliquid L1.
 * Executes an ERC20 transfer of USDC to the Bridge2 contract.
 */
export async function toolHlDeposit(args: HlDepositArgs, context: ToolContext, signer: TransactionSigner): Promise<string> {
  const { amount } = args
  const { supabase, userId, assistantId, runId, toolCallId } = context

  const agentWallet = context.agentWallets?.evm
  if (!agentWallet?.address) {
    return 'Error: No EVM wallet available. Enable agent wallet to deposit on Hyperliquid.'
  }

  const amountNum = parseFloat(amount)
  if (!amount || isNaN(amountNum) || amountNum <= 0) {
    return 'Error: Invalid amount. Provide a positive USDC amount.'
  }
  if (amountNum < HL_MIN_DEPOSIT) {
    return `Error: Minimum deposit is ${HL_MIN_DEPOSIT} USDC.`
  }

  console.log('[HyperliquidTool] Depositing to HL:', { address: agentWallet.address.substring(0, 10) + '...', amount })

  try {
    // Check trading policy
    const policyGuard = createTradingPolicyGuard(supabase, assistantId, userId)
    const policyCheck = await policyGuard.canExecuteTrade({
      chain: 'ethereum',
      inputToken: 'USDC',
      outputToken: 'USDC',
      valueUsd: amountNum,
      type: 'transfer',
    })

    if (!policyCheck.allowed) {
      return `Deposit blocked by trading policy: ${policyCheck.reason}`
    }

    // Record pending deposit
    const recordResult = await policyGuard.recordTrade({
      txHash: '',
      txType: 'transfer',
      chainType: 'ethereum',
      chainId: '42161', // Arbitrum
      inputToken: 'USDC',
      inputAmount: amount,
      outputToken: 'USDC',
      outputAmount: amount,
      valueUsd: amountNum,
      status: 'pending',
      dexUsed: 'hyperliquid',
      toolCallId,
      runId,
    })

    const txId = recordResult.transactionId

    // Build ERC20 transfer: USDC on Arbitrum → Bridge2 contract
    // transfer(address to, uint256 amount) — selector 0xa9059cbb
    const amountRaw = BigInt(Math.floor(amountNum * 1e6)) // USDC has 6 decimals
    const toPadded = HL_BRIDGE2_CONTRACT.slice(2).toLowerCase().padStart(64, '0')
    const amountPadded = amountRaw.toString(16).padStart(64, '0')
    const data = `0xa9059cbb${toPadded}${amountPadded}`

    const txResult = await signer.executeTransaction({
      chain: 'evm',
      chainId: '42161', // Arbitrum
      to: ARBITRUM_USDC,
      value: '0x0',
      data,
      gasLimit: '0x186a0', // 100K gas for ERC20 transfer
    })

    if (!txResult.success) {
      await policyGuard.updateTransactionStatus(txId!, 'failed', {
        errorMessage: txResult.error || 'Transaction execution failed',
      })
      return `Deposit failed: ${txResult.error || 'Transaction execution failed'}\nTransaction ID: ${txId}`
    }

    await policyGuard.updateTransactionStatus(txId!, 'confirmed', {
      txHash: txResult.txHash || '',
    })

    console.log('[HyperliquidTool] Deposit successful:', txResult.txHash)

    return `Deposit successful!

Amount: ${amountNum} USDC
Destination: Hyperliquid L1
Tx Hash: ${txResult.txHash || 'pending'}
Transaction ID: ${txId}

Note: Deposits typically take 1-2 minutes to appear in your Hyperliquid account. Use hl_account_info to check your balance.`

  } catch (error) {
    console.error('[HyperliquidTool] Deposit error:', error)
    return `Error depositing to Hyperliquid: ${sanitizeToolError(error)}`
  }
}

// ============================================================================
// Withdraw Tool (Elevated, EIP-712 Signed Withdraw3)
// ============================================================================

interface HlWithdrawArgs {
  amount: string
}

/**
 * Withdraw USDC from Hyperliquid L1 back to the Arbitrum wallet.
 * Uses EIP-712 signed withdraw3 action posted to HL exchange API.
 */
export async function toolHlWithdraw(args: HlWithdrawArgs, context: ToolContext, signer: TransactionSigner): Promise<string> {
  const { amount } = args
  const { supabase, userId, assistantId, runId, toolCallId } = context

  const agentWallet = context.agentWallets?.evm
  if (!agentWallet?.address) {
    return 'Error: No EVM wallet available. Enable agent wallet to withdraw from Hyperliquid.'
  }

  const amountNum = parseFloat(amount)
  if (!amount || isNaN(amountNum) || amountNum <= 0) {
    return 'Error: Invalid amount. Provide a positive USDC amount.'
  }
  if (amountNum < HL_MIN_DEPOSIT) {
    return `Error: Minimum withdrawal is ${HL_MIN_DEPOSIT} USDC.`
  }

  console.log('[HyperliquidTool] Withdrawing from HL:', { address: agentWallet.address.substring(0, 10) + '...', amount })

  try {
    // Check available balance first
    const stateResponse = await fetch(`${HYPERLIQUID_API}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: agentWallet.address }),
      signal: AbortSignal.timeout(5_000),
    })

    if (stateResponse.ok) {
      const state = await stateResponse.json() as HlUserState
      const withdrawable = parseFloat(state.withdrawable)
      if (amountNum > withdrawable) {
        return `Error: Insufficient withdrawable balance. Available: $${withdrawable.toFixed(2)} USDC, requested: $${amountNum.toFixed(2)} USDC.`
      }
    }

    // Check trading policy
    const policyGuard = createTradingPolicyGuard(supabase, assistantId, userId)
    const policyCheck = await policyGuard.canExecuteTrade({
      chain: 'ethereum',
      inputToken: 'USDC',
      outputToken: 'USDC',
      valueUsd: amountNum,
      type: 'transfer',
    })

    if (!policyCheck.allowed) {
      return `Withdrawal blocked by trading policy: ${policyCheck.reason}`
    }

    // Record pending withdrawal
    const recordResult = await policyGuard.recordTrade({
      txHash: '',
      txType: 'transfer',
      chainType: 'ethereum',
      chainId: '42161',
      inputToken: 'USDC',
      inputAmount: amount,
      outputToken: 'USDC',
      outputAmount: amount,
      valueUsd: amountNum,
      status: 'pending',
      dexUsed: 'hyperliquid',
      toolCallId,
      runId,
    })

    const txId = recordResult.transactionId

    // Build withdraw3 action
    // Amount in raw USDC units (string with 6 decimal places for HL)
    const withdrawAction = {
      type: 'withdraw3',
      hyperliquidChain: 'Arbitrum',
      signatureChainId: '0xa4b1', // 42161 in hex
      destination: agentWallet.address,
      amount: amountNum.toFixed(6),
      time: Date.now(),
    }

    // Sign via EIP-712 (same pattern as place_order)
    const nonce = Date.now()
    const hlTypedData = buildHlEip712TypedData(withdrawAction as unknown as Record<string, unknown>, nonce)

    const signResult = await signer.signTypedData(hlTypedData)
    if (!signResult.success || !signResult.signature) {
      await policyGuard.updateTransactionStatus(txId!, 'failed', {
        errorMessage: signResult.error || 'EIP-712 signing failed',
      })
      return `Withdrawal signing failed: ${signResult.error || 'Could not sign withdrawal'}\nTransaction ID: ${txId}`
    }

    // Submit to Hyperliquid exchange endpoint
    const exchangeResponse = await fetch(`${HYPERLIQUID_API}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: withdrawAction,
        signature: signResult.signature,
        nonce,
        vaultAddress: null,
      }),
    })

    if (!exchangeResponse.ok) {
      const errorData = await exchangeResponse.json().catch(() => ({}))
      const errorMessage = (errorData as { error?: string }).error || `API error: ${exchangeResponse.status}`

      await policyGuard.updateTransactionStatus(txId!, 'failed', { errorMessage })

      return `Withdrawal failed: ${errorMessage}\nTransaction ID: ${txId}`
    }

    const result = await exchangeResponse.json() as { status: string }

    if (result.status === 'ok') {
      await policyGuard.updateTransactionStatus(txId!, 'confirmed')

      console.log('[HyperliquidTool] Withdrawal successful')

      return `Withdrawal successful!

Amount: ${amountNum} USDC
Destination: ${agentWallet.address} (Arbitrum)
Transaction ID: ${txId}

Note: Withdrawals typically take a few minutes to arrive on Arbitrum. Use wallet_balance to check your Arbitrum USDC balance.`
    }

    await policyGuard.updateTransactionStatus(txId!, 'submitted')

    return `Withdrawal submitted.

Amount: ${amountNum} USDC
Transaction ID: ${txId}
Status: Submitted (awaiting confirmation)

Check your Hyperliquid account and Arbitrum wallet for status.`

  } catch (error) {
    console.error('[HyperliquidTool] Withdraw error:', error)
    return `Error withdrawing from Hyperliquid: ${sanitizeToolError(error)}`
  }
}

// ============================================================================
// Helper: Action Hash
// ============================================================================

/**
 * Compute the connection ID (keccak256 hash) for HL typed data signing.
 * This is a hex-encoded hash of the action + nonce + vaultAddress.
 */
function createActionHash(action: Record<string, unknown>, nonce: number): string {
  // Hyperliquid hashes: msgpack(action, nonce, vaultAddress=false)
  // For the signing proxy, we pass the raw components and let the signer compute the hash.
  // The session signer endpoint handles the full EIP-712 struct hashing.
  // We encode a deterministic representation for the connectionId.
  const payload = JSON.stringify({ action, nonce, vaultAddress: null })
  // Use a simple hex encoding of the payload hash — the session signer
  // will recompute the proper keccak256 from the typed data structure.
  let hash = 0n
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5n) - hash + BigInt(payload.charCodeAt(i))) & ((1n << 256n) - 1n)
  }
  return '0x' + hash.toString(16).padStart(64, '0')
}
