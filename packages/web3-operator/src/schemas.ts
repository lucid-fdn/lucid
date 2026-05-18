/**
 * Web3 Operator Tool Schemas — Source of truth for all 12 tool definitions.
 *
 * These schemas are consumed by:
 * - LucidMerged CommandsAllowlist (adds runtime policy: dangerLevel, allowlist)
 * - Any agent framework that wants to use web3-operator tools
 *
 * Includes enrichment metadata (when_to_use, examples, related_tools)
 * for automated tool awareness via buildToolPrompt().
 */

import type { ToolDefinition } from '@lucid-fdn/agent-tools-core'

// ── Read Lane ────────────────────────────────────────────────────────

export const getPriceSchema: ToolDefinition = {
  name: 'get_price',
  description: 'Get real-time token price in USD. Uses Jupiter Price API (Solana) and DexScreener (EVM). Works for any token including new/meme tokens.',
  category: 'read',
  dangerLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      token: {
        type: 'string',
        description: 'Token symbol (e.g. "SOL", "ETH", "BONK") or on-chain address',
      },
      chain: {
        type: 'string',
        description: 'Chain to look up on. Auto-detected from address if omitted.',
        enum: ['solana', 'ethereum', 'base', 'polygon', 'arbitrum'],
      },
    },
    required: ['token'],
  },
  when_to_use: ['user asks "price of X"', 'user asks "how much is X worth"'],
  examples: [{ user: 'what is SOL trading at?', tool_call: { chain: 'solana', address: 'SOL' } }],
  related_tools: ['search_token', 'get_portfolio'],
}

export const searchTokenSchema: ToolDefinition = {
  name: 'search_token',
  description: 'Search for tokens by name, symbol, or address. Returns token info with safety flags. Uses Jupiter (Solana) and DexScreener (EVM).',
  category: 'read',
  dangerLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query — token name, symbol, or address',
      },
      chain: {
        type: 'string',
        description: 'Chain to search on. Omit to search all chains.',
        enum: ['solana', 'ethereum', 'base', 'polygon', 'arbitrum'],
      },
      limit: {
        type: 'number',
        description: 'Max results (default: 5)',
        default: 5,
      },
    },
    required: ['query'],
  },
  when_to_use: ['user mentions a token by name or ticker that needs to be resolved', 'user asks "find token X"'],
  examples: [{ user: 'find the BONK token', tool_call: { query: 'BONK', chain: 'solana' } }],
  related_tools: ['get_price'],
}

export const getPortfolioSchema: ToolDefinition = {
  name: 'get_portfolio',
  description: 'Get full portfolio state with USD valuations for all holdings. Use for portfolio analysis, PnL tracking, and risk assessment.',
  category: 'read',
  dangerLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      address: { type: 'string', description: 'Wallet address' },
      chain: {
        type: 'string',
        description: 'Chain to query. Use "all" for full portfolio view.',
        enum: ['all', 'solana', 'ethereum', 'base', 'polygon', 'arbitrum'],
      },
    },
    required: ['address', 'chain'],
  },
  when_to_use: ['user asks about total holdings/portfolio', 'user asks "what do I own"'],
  examples: [{ user: 'show me my portfolio', tool_call: { address: '...', chain: 'all' } }],
  related_tools: ['wallet_balance', 'get_price', 'portfolio_snapshot'],
}

export const walletHistorySchema: ToolDefinition = {
  name: 'wallet_history',
  description: 'Get on-chain transaction history for a wallet. Call this whenever the user asks about past transactions, recent activity, when a wallet was funded/created, or transaction history. Use mode "history" for recent transactions or "first_transaction" to find the first-ever transaction.',
  category: 'read',
  dangerLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      address: { type: 'string', description: 'Wallet address to get history for' },
      chain: {
        type: 'string',
        description: 'Chain to query',
        enum: ['solana', 'ethereum', 'base', 'polygon', 'arbitrum'],
      },
      limit: { type: 'number', description: 'Maximum number of transactions to return (default: 10, max: 50)', default: 10 },
      mode: {
        type: 'string',
        description: 'Query mode: "history" for recent transactions, "first_transaction" to find wallet genesis',
        enum: ['history', 'first_transaction'],
        default: 'history',
      },
    },
    required: ['address', 'chain'],
  },
  when_to_use: ['user asks about transaction history', 'user asks about recent activity'],
  examples: [{ user: 'show my recent transactions', tool_call: { address: '...', chain: 'solana', mode: 'history' } }],
  related_tools: ['get_portfolio'],
}

export const getQuote0xSchema: ToolDefinition = {
  name: 'get_quote_0x',
  description: 'Get an EVM swap quote from 0x Protocol (aggregates Uniswap, SushiSwap, Curve, Balancer, etc.). Use to compare routes before swapping on EVM chains.',
  category: 'read',
  dangerLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      sellToken: { type: 'string', description: 'Token to sell (symbol like "USDC" or contract address)' },
      buyToken: { type: 'string', description: 'Token to buy (symbol like "ETH" or contract address)' },
      sellAmount: { type: 'string', description: 'Amount to sell in human-readable units (e.g. "100" for 100 USDC)' },
      chain: { type: 'string', description: 'EVM chain to swap on', enum: ['ethereum', 'base', 'polygon', 'arbitrum'] },
      takerAddress: { type: 'string', description: 'Wallet address executing the swap (for accurate gas estimates)' },
      slippageBps: { type: 'number', description: 'Max slippage in basis points (default: 100 = 1%)' },
    },
    required: ['sellToken', 'buyToken', 'sellAmount', 'chain'],
  },
  when_to_use: ['need a swap quote on EVM chains via 0x/1inch aggregator'],
  examples: [{ user: 'quote for swapping 1 ETH to USDC on Ethereum', tool_call: { chain: 'ethereum', fromToken: 'ETH', toToken: 'USDC', amount: '1' } }],
  related_tools: ['dex_swap', 'get_price'],
}

// ── Reason Lane ──────────────────────────────────────────────────────

export const riskCheckSchema: ToolDefinition = {
  name: 'risk_check',
  description: 'Evaluate risk before a trade. Checks token safety, concentration, slippage, daily limits. Always call this before executing a swap or order.',
  category: 'reason',
  dangerLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      outputToken: { type: 'string', description: 'Token being purchased (symbol or address)' },
      inputToken: { type: 'string', description: 'Token being sold (symbol or address)' },
      amountUsd: { type: 'number', description: 'Trade amount in USD' },
      chain: { type: 'string', description: 'Chain for the trade', enum: ['solana', 'ethereum', 'base', 'polygon', 'arbitrum'] },
      priceImpactBps: { type: 'number', description: 'Price impact in basis points (from a quote)' },
    },
    required: ['outputToken', 'inputToken', 'amountUsd', 'chain'],
  },
  when_to_use: ['before any trade/swap/transfer to assess safety', 'user asks "is this safe"'],
  related_tools: ['dex_get_quote', 'dex_swap', 'wallet_transfer'],
}

export const portfolioSnapshotSchema: ToolDefinition = {
  name: 'portfolio_snapshot',
  description: 'Save a snapshot of current portfolio state for PnL tracking. Use at competition start, daily checkpoints, or before major trades.',
  category: 'reason',
  dangerLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'Label for the snapshot (e.g. "competition_start", "daily_checkpoint")' },
    },
    required: [],
  },
  when_to_use: ['user wants to save current portfolio state for later comparison'],
  related_tools: ['get_portfolio', 'get_pnl'],
}

export const getPnlSchema: ToolDefinition = {
  name: 'get_pnl',
  description: 'Calculate profit/loss since a portfolio snapshot. Shows total PnL, per-asset breakdown, best/worst performers.',
  category: 'reason',
  dangerLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      snapshotLabel: { type: 'string', description: 'Label of the snapshot to compare against (e.g. "competition_start")' },
    },
    required: [],
  },
  when_to_use: ['user asks about profit/loss', 'user asks "how am I doing"'],
  related_tools: ['portfolio_snapshot', 'get_portfolio'],
}

// ── Action Lane (simulation-first) ───────────────────────────────────

export const limitOrderSchema: ToolDefinition = {
  name: 'limit_order',
  description: 'Create a limit order on Solana via Jupiter. Produces an execution plan — does not execute until confirmed. Simulation-first: shows expected outcome and risks before execution.',
  category: 'act',
  dangerLevel: 'elevated',
  parameters: {
    type: 'object',
    properties: {
      inputToken: { type: 'string', description: 'Token to sell (symbol or mint address)' },
      outputToken: { type: 'string', description: 'Token to buy (symbol or mint address)' },
      amount: { type: 'string', description: 'Amount to sell (in token units)' },
      limitPrice: { type: 'string', description: 'Limit price in USD — execute when output token reaches this price' },
      expirySecs: { type: 'number', description: 'Expiry in seconds (default: 7 days)' },
    },
    required: ['inputToken', 'outputToken', 'amount', 'limitPrice'],
  },
  when_to_use: ['user wants to place a limit order', 'user wants to buy/sell at a specific price'],
  related_tools: ['get_price', 'risk_check'],
  requires_confirmation: true,
}

export const dcaCreateSchema: ToolDefinition = {
  name: 'dca_create',
  description: 'Set up Dollar-Cost Averaging on Solana via Jupiter DCA. Splits a total amount into recurring orders at fixed intervals. Simulation-first: shows schedule, expected output, and risks.',
  category: 'act',
  dangerLevel: 'elevated',
  parameters: {
    type: 'object',
    properties: {
      inputToken: { type: 'string', description: 'Token to sell (what you spend)' },
      outputToken: { type: 'string', description: 'Token to buy (what you accumulate)' },
      totalAmount: { type: 'string', description: 'Total amount to invest (in input token units)' },
      numberOfOrders: { type: 'number', description: 'Number of orders to split into' },
      intervalSecs: { type: 'number', description: 'Seconds between orders (3600=hourly, 86400=daily)' },
      minOutputPerOrder: { type: 'string', description: 'Minimum output per order (slippage protection)' },
    },
    required: ['inputToken', 'outputToken', 'totalAmount', 'numberOfOrders', 'intervalSecs'],
  },
  when_to_use: ['user wants to set up dollar-cost averaging', 'user wants to auto-buy periodically'],
  related_tools: ['get_price'],
  requires_confirmation: true,
}

export const stopLossSchema: ToolDefinition = {
  name: 'stop_loss',
  description: 'Set a stop-loss trigger. Monitors token price via scheduled checks and sells when price drops to the trigger level. Uses cron scheduling + swap execution.',
  category: 'act',
  dangerLevel: 'elevated',
  parameters: {
    type: 'object',
    properties: {
      token: { type: 'string', description: 'Token to monitor and sell if triggered' },
      amount: { type: 'string', description: 'Amount to sell when triggered' },
      triggerPrice: { type: 'string', description: 'Trigger price in USD — sell when price drops to or below this' },
      outputToken: { type: 'string', description: 'What to sell into (default: USDC)', default: 'USDC' },
      checkIntervalMinutes: { type: 'number', description: 'How often to check price (default: 5 minutes)', default: 5 },
      expiryHours: { type: 'number', description: 'How long the stop loss stays active (default: 168 = 7 days)', default: 168 },
    },
    required: ['token', 'amount', 'triggerPrice'],
  },
  when_to_use: ['user wants to set a stop-loss order', 'user wants automatic sell if price drops'],
  related_tools: ['get_price', 'risk_check'],
  requires_confirmation: true,
}

export const bridgeSchema: ToolDefinition = {
  name: 'bridge',
  description: 'Bridge tokens across chains via DeBridge DLN (mirrors GOAT SDK). Supports Ethereum, Base, Polygon, Arbitrum, Solana. Returns an execution plan with quote, fees, and tx data — does NOT execute.',
  category: 'act',
  dangerLevel: 'elevated',
  parameters: {
    type: 'object',
    properties: {
      fromToken: { type: 'string', description: 'Token contract/mint address on source chain' },
      toToken: { type: 'string', description: 'Token contract/mint on destination (default: same symbol)' },
      fromChain: { type: 'string', description: 'Source chain', enum: ['ethereum', 'base', 'polygon', 'arbitrum', 'solana'] },
      toChain: { type: 'string', description: 'Destination chain', enum: ['ethereum', 'base', 'polygon', 'arbitrum', 'solana'] },
      amount: { type: 'string', description: 'Amount in human-readable units' },
      fromAddress: { type: 'string', description: 'Sender wallet address' },
      toAddress: { type: 'string', description: 'Receiver address on destination chain (default: same as sender)' },
      slippage: { type: 'number', description: 'Slippage tolerance as decimal (default: 0.005 = 0.5%)', default: 0.005 },
    },
    required: ['fromToken', 'fromChain', 'toChain', 'amount', 'fromAddress'],
  },
  when_to_use: ['user wants to bridge/move tokens between chains'],
  related_tools: ['get_portfolio', 'wallet_balance'],
  requires_confirmation: true,
}

// ── All Schemas ──────────────────────────────────────────────────────

/** All 12 web3-operator tool schemas, keyed by tool name */
export const WEB3_OPERATOR_SCHEMAS: Record<string, ToolDefinition> = {
  get_price: getPriceSchema,
  search_token: searchTokenSchema,
  get_portfolio: getPortfolioSchema,
  wallet_history: walletHistorySchema,
  get_quote_0x: getQuote0xSchema,
  risk_check: riskCheckSchema,
  portfolio_snapshot: portfolioSnapshotSchema,
  get_pnl: getPnlSchema,
  limit_order: limitOrderSchema,
  dca_create: dcaCreateSchema,
  stop_loss: stopLossSchema,
  bridge: bridgeSchema,
}
