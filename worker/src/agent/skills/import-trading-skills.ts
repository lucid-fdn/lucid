#!/usr/bin/env tsx
/**
 * Import external trading skills + seed MCPGate trading plugins.
 *
 * Phase 1: Import 3 trading SKILL.md files into skill_catalog (as approved)
 *   - bankr (BankrBot — crypto trading + DeFi + Polymarket, 5 chains)
 *   - bankr-signals (on-chain verified trading signals on Base)
 *   - solana-copy-trader (whale copy trading via Helius + Jupiter)
 *
 * Phase 2: Seed 4 MCPGate plugins into plugin_catalog
 *   - helius-mcp (60+ Solana tools)
 *   - chainstack-evm (EVM blockchain reads)
 *   - debridge-mcp (cross-chain swap + bridge)
 *   - binance-mcp (CEX trading)
 *
 * Usage:
 *   npx tsx worker/src/agent/skills/import-trading-skills.ts [--dry-run]
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { sanitizeContent, validateFrontmatter, scanForPromptInjection, deriveSlug } from './sanitize.js'
import yaml from 'js-yaml'

const dryRun = process.argv.includes('--dry-run')

// ── YAML frontmatter parser ─────────────────────────────────────────────
function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: raw }
  try {
    const parsed = yaml.load(match[1])
    const frontmatter = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      ? parsed as Record<string, unknown>
      : {}
    return { frontmatter, body: match[2] }
  } catch {
    return { frontmatter: {}, body: raw }
  }
}

// ── Phase 1: Trading Skills ──────────────────────────────────────────────

interface SkillSource {
  slug: string
  filePath: string
  source: string
  sourcePath: string
}

const TRADING_SKILLS: SkillSource[] = [
  {
    slug: 'bankr',
    filePath: 'C:/tmp/bankr-SKILL.md',
    source: 'bankrbot',
    sourcePath: 'BankrBot/openclaw-skills/bankr/SKILL.md',
  },
  {
    slug: 'bankr-signals',
    filePath: 'C:/tmp/bankr-signals-SKILL.md',
    source: 'bankrbot',
    sourcePath: 'BankrBot/openclaw-skills/bankr-signals/SKILL.md',
  },
  {
    slug: 'solana-copy-trader',
    filePath: 'C:/tmp/solana-copy-trader-SKILL.md',
    source: 'community',
    sourcePath: 'openclaw/skills/solana-copy-trader/SKILL.md',
  },
]

// ── Phase 2: MCPGate Plugin Seeds ────────────────────────────────────────

interface PluginSeed {
  slug: string
  name: string
  description: string
  version: string
  author: string
  category: string
  source: 'mcpgate'
  mcpgate_server_id: string
  tool_manifest: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  risk_level: 'read' | 'write' | 'destructive'
  verified: boolean
  is_published: boolean
}

const MCPGATE_PLUGINS: PluginSeed[] = [
  {
    slug: 'helius-mcp',
    name: 'Helius',
    description: 'Helius Solana infrastructure: balances, token portfolios, NFT assets, parsed transactions, network status, webhooks, streaming, and sender-enabled transfers.',
    version: '1.0.0',
    author: 'Helius',
    category: 'blockchain',
    source: 'mcpgate',
    mcpgate_server_id: 'builtin:helius',
    tool_manifest: [
      { name: 'getBalance', description: 'Get native SOL balance for a wallet.', parameters: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] } },
      { name: 'getTokenBalances', description: 'Get SPL token balances for a wallet with metadata and prices.', parameters: { type: 'object', properties: { ownerAddress: { type: 'string' } }, required: ['ownerAddress'] } },
      { name: 'parseTransactions', description: 'Parse one or more Solana transactions into human-readable format.', parameters: { type: 'object', properties: { signatures: { type: 'array', items: { type: 'string' } }, showRaw: { type: 'boolean' } }, required: ['signatures'] } },
      { name: 'getTransactionHistory', description: 'Get transaction history for a wallet.', parameters: { type: 'object', properties: { address: { type: 'string' }, limit: { type: 'number' } }, required: ['address'] } },
      { name: 'getAssetsByOwner', description: 'Get NFTs and digital assets owned by a wallet.', parameters: { type: 'object', properties: { ownerAddress: { type: 'string' }, page: { type: 'number' } }, required: ['ownerAddress'] } },
      { name: 'getNetworkStatus', description: 'Get current Solana network status including epoch, TPS, supply, and block height.', parameters: { type: 'object', properties: {} } },
      { name: 'createWebhook', description: 'Create a Helius webhook for account or transaction notifications.', parameters: { type: 'object', properties: { webhookURL: { type: 'string' }, transactionTypes: { type: 'array', items: { type: 'string' } }, accountAddresses: { type: 'array', items: { type: 'string' } } }, required: ['webhookURL'] } },
      { name: 'transferSol', description: 'Transfer native SOL using Helius Sender.', parameters: { type: 'object', properties: { to: { type: 'string' }, amount: { type: 'number' }, sendMax: { type: 'boolean' } }, required: ['to'] } },
    ],
    risk_level: 'write',
    verified: true,
    is_published: true,
  },
  {
    slug: 'moralis-mcp',
    name: 'Moralis',
    description: 'Moralis blockchain intelligence: token metadata, wallet net worth, DeFi positions, wallet activity, discovery analytics, and cross-chain EVM plus Solana market data.',
    version: '1.0.0',
    author: 'Moralis',
    category: 'blockchain',
    source: 'mcpgate',
    mcpgate_server_id: 'builtin:moralis',
    tool_manifest: [
      { name: 'evm_gettokenmetadata', description: 'Get ERC-20 token metadata and logos.', parameters: { type: 'object', properties: { chain: { type: 'string' }, addresses: { type: 'array', items: { type: 'string' } } }, required: ['addresses'] } },
      { name: 'evm_getwalletnetworth', description: 'Calculate the total net worth of a wallet in USD.', parameters: { type: 'object', properties: { address: { type: 'string' }, chains: { type: 'array', items: { type: 'string' } } }, required: ['address'] } },
      { name: 'evm_getdefipositionssummary', description: 'Get a concise overview of a wallet’s DeFi positions.', parameters: { type: 'object', properties: { address: { type: 'string' }, chain: { type: 'string' } }, required: ['address'] } },
      { name: 'evm_getwalletactivechains', description: 'List the blockchain networks a wallet is active on.', parameters: { type: 'object', properties: { address: { type: 'string' }, chains: { type: 'array', items: { type: 'string' } } }, required: ['address'] } },
      { name: 'evm_gettopcryptocurrenciesbymarketcap', description: 'Get top cryptocurrencies by market cap.', parameters: { type: 'object', properties: {} } },
      { name: 'evm_gettopgainerstokens', description: 'Identify tokens with the highest price increases over a period.', parameters: { type: 'object', properties: { chain: { type: 'string' }, timeframe: { type: 'string' } } } },
      { name: 'evm_gettokenscore', description: 'Retrieve a score and detailed metrics for a specific token.', parameters: { type: 'object', properties: { chain: { type: 'string' }, tokenAddress: { type: 'string' } }, required: ['chain', 'tokenAddress'] } },
      { name: 'evm_getwalletprofitability', description: 'Get profit and loss breakdown by token for a wallet.', parameters: { type: 'object', properties: { address: { type: 'string' }, days: { type: 'number' }, chain: { type: 'string' } }, required: ['address'] } },
      { name: 'solana_getportfolio', description: 'Get all native and token balances for a Solana address.', parameters: { type: 'object', properties: { network: { type: 'string' }, address: { type: 'string' } }, required: ['network', 'address'] } },
      { name: 'solana_gettokenprice', description: 'Get the token price for a Solana mint.', parameters: { type: 'object', properties: { network: { type: 'string' }, address: { type: 'string' } }, required: ['network', 'address'] } },
    ],
    risk_level: 'read',
    verified: true,
    is_published: true,
  },
  {
    slug: 'chainstack-evm',
    name: 'EVM Explorer',
    description: 'EVM blockchain access: eth_call, transaction tracing, contract storage reads, account balances. Supports Ethereum, Base, Arbitrum, Polygon, BSC, Sonic. Powered by Chainstack.',
    version: '1.0.0',
    author: 'Chainstack',
    category: 'blockchain',
    source: 'mcpgate',
    mcpgate_server_id: 'builtin:etherscan',
    tool_manifest: [
      { name: 'eth_call', description: 'Execute a read-only smart contract call', parameters: { type: 'object', properties: { to: { type: 'string' }, data: { type: 'string' }, chain: { type: 'string' } }, required: ['to', 'data'] } },
      { name: 'eth_getBalance', description: 'Get ETH balance of an address', parameters: { type: 'object', properties: { address: { type: 'string' }, chain: { type: 'string' } }, required: ['address'] } },
      { name: 'eth_getTransactionByHash', description: 'Get transaction details by hash', parameters: { type: 'object', properties: { txHash: { type: 'string' }, chain: { type: 'string' } }, required: ['txHash'] } },
      { name: 'debug_traceTransaction', description: 'Trace a transaction execution step by step', parameters: { type: 'object', properties: { txHash: { type: 'string' }, chain: { type: 'string' } }, required: ['txHash'] } },
      { name: 'eth_getStorageAt', description: 'Read raw contract storage slot', parameters: { type: 'object', properties: { address: { type: 'string' }, slot: { type: 'string' }, chain: { type: 'string' } }, required: ['address', 'slot'] } },
    ],
    risk_level: 'read',
    verified: true,
    is_published: true,
  },
  {
    slug: 'debridge-mcp',
    name: 'Cross-Chain Bridge',
    description: 'Cross-chain swap + bridge in one flow. Supports Solana + EVM (Ethereum, Arbitrum, Base). Non-custodial — generates tx payloads, user signs. Powered by deBridge.',
    version: '1.0.0',
    author: 'deBridge',
    category: 'blockchain',
    source: 'mcpgate',
    mcpgate_server_id: 'builtin:wormhole',
    tool_manifest: [
      { name: 'getQuote', description: 'Get cross-chain swap/bridge quote with estimated output and fees', parameters: { type: 'object', properties: { srcChain: { type: 'string' }, dstChain: { type: 'string' }, srcToken: { type: 'string' }, dstToken: { type: 'string' }, amount: { type: 'string' } }, required: ['srcChain', 'dstChain', 'srcToken', 'dstToken', 'amount'] } },
      { name: 'createTransaction', description: 'Create a cross-chain transaction payload for signing', parameters: { type: 'object', properties: { quoteId: { type: 'string' }, senderAddress: { type: 'string' }, receiverAddress: { type: 'string' } }, required: ['quoteId', 'senderAddress', 'receiverAddress'] } },
      { name: 'getTransactionStatus', description: 'Check status of a cross-chain transaction', parameters: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] } },
      { name: 'getSupportedChains', description: 'List all supported chains and tokens', parameters: { type: 'object', properties: {} } },
    ],
    risk_level: 'write',
    verified: true,
    is_published: true,
  },
  {
    slug: 'binance-mcp',
    name: 'Binance',
    description: 'Binance market data and exchange operations via MCPGate. Public market-data tools work out of the box; authenticated account and trading tools require Binance API credentials.',
    version: '1.0.0',
    author: 'Binance',
    category: 'exchange',
    source: 'mcpgate',
    mcpgate_server_id: 'builtin:binance-mcp',
    tool_manifest: [
      { name: 'binance_get_price', description: 'Get the current price for a Binance trading pair. Returns symbol and price.', parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
      { name: 'binance_get_ticker', description: 'Get 24-hour rolling ticker statistics for a Binance trading pair.', parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
      { name: 'binance_list_symbols', description: 'Get Binance exchange information including trading pairs and filters.', parameters: { type: 'object', properties: { symbol: { type: 'string' }, symbols: { type: 'string' } } } },
      { name: 'binance_get_orderbook', description: 'Get the order book for a Binance trading pair.', parameters: { type: 'object', properties: { symbol: { type: 'string' }, limit: { type: 'number' } }, required: ['symbol'] } },
      { name: 'binance_get_klines', description: 'Get candlestick/OHLCV data for a Binance trading pair.', parameters: { type: 'object', properties: { symbol: { type: 'string' }, interval: { type: 'string' }, limit: { type: 'number' } }, required: ['symbol', 'interval'] } },
      { name: 'binance_get_trades', description: 'Get recent trades for a Binance trading pair.', parameters: { type: 'object', properties: { symbol: { type: 'string' }, limit: { type: 'number' } }, required: ['symbol'] } },
      { name: 'binance_get_account', description: 'Get Binance account information including balances and permissions. Requires Binance credentials.', parameters: { type: 'object', properties: {} } },
      { name: 'binance_create_order', description: 'Place a new order on Binance. Requires Binance credentials.', parameters: { type: 'object', properties: { symbol: { type: 'string' }, side: { type: 'string' }, type: { type: 'string' }, quantity: { type: 'string' }, price: { type: 'string' } }, required: ['symbol', 'side', 'type', 'quantity'] } },
      { name: 'binance_cancel_order', description: 'Cancel an existing Binance order. Requires Binance credentials.', parameters: { type: 'object', properties: { symbol: { type: 'string' }, orderId: { type: 'string' }, origClientOrderId: { type: 'string' } }, required: ['symbol'] } },
    ],
    risk_level: 'destructive',
    verified: true,
    is_published: true,
  },
  {
    slug: 'jupiter-dex',
    name: 'Solana DEX',
    description: 'Solana DEX trading: swap quotes, token prices, route optimization, limit orders, market data. Powered by Jupiter.',
    version: '1.0.0',
    author: 'Jupiter',
    category: 'defi',
    source: 'mcpgate',
    mcpgate_server_id: 'builtin:jupiter',
    tool_manifest: [
      { name: 'jupiter_get_quote', description: 'Get a swap quote from the Jupiter aggregator on Solana. Returns the best route and expected output amount.', parameters: { type: 'object', properties: { inputMint: { type: 'string' }, outputMint: { type: 'string' }, amount: { type: 'string' }, slippageBps: { type: 'number' }, onlyDirectRoutes: { type: 'boolean' }, asLegacyTransaction: { type: 'boolean' }, maxAccounts: { type: 'number' } }, required: ['inputMint', 'outputMint', 'amount'] } },
      { name: 'jupiter_get_swap', description: 'Build a swap transaction from a Jupiter quote. Returns a serialised transaction ready to sign.', parameters: { type: 'object', properties: { quoteResponse: { type: 'object' }, userPublicKey: { type: 'string' }, wrapAndUnwrapSol: { type: 'boolean' }, feeAccount: { type: 'string' }, asLegacyTransaction: { type: 'boolean' }, destinationTokenAccount: { type: 'string' } }, required: ['quoteResponse', 'userPublicKey'] } },
      { name: 'jupiter_list_tokens', description: 'List all supported tokens on Jupiter. Returns token metadata including mint addresses, symbols, and decimals.', parameters: { type: 'object', properties: {} } },
      { name: 'jupiter_get_token_info', description: 'Get detailed info for a specific token on Jupiter by mint address.', parameters: { type: 'object', properties: { mint: { type: 'string' } }, required: ['mint'] } },
      { name: 'jupiter_get_price', description: 'Get current USD price for one or more tokens from Jupiter Price API.', parameters: { type: 'object', properties: { ids: { type: 'string' }, vsToken: { type: 'string' } }, required: ['ids'] } },
      { name: 'jupiter_get_indexed_route_map', description: 'Get the Jupiter indexed route map showing which tokens can be swapped to which.', parameters: { type: 'object', properties: {} } },
      { name: 'jupiter_get_program_id_to_label', description: 'Map Solana program IDs to human-readable DEX labels used by Jupiter.', parameters: { type: 'object', properties: {} } },
      { name: 'jupiter_list_markets', description: 'List available markets (liquidity pools) for a given token on Jupiter.', parameters: { type: 'object', properties: { inputMint: { type: 'string' }, outputMint: { type: 'string' } }, required: ['inputMint'] } },
      { name: 'jupiter_get_token_price_history', description: 'Get historical price data for a token from Jupiter. Returns OHLCV-style price points.', parameters: { type: 'object', properties: { id: { type: 'string' }, vsToken: { type: 'string' }, type: { type: 'string', enum: ['1m', '5m', '15m', '1H', '4H', '1D', '1W'] } }, required: ['id'] } },
      { name: 'jupiter_get_limit_orders', description: 'Get open limit orders for a given wallet address on Jupiter.', parameters: { type: 'object', properties: { owner: { type: 'string' }, inputMint: { type: 'string' }, outputMint: { type: 'string' } }, required: ['owner'] } },
    ],
    risk_level: 'write',
    verified: true,
    is_published: true,
  },
  {
    slug: 'alchemy-multichain',
    name: 'Multi-Chain Explorer',
    description: 'Multi-chain blockchain access: balances, transactions, NFTs, token transfers, contract calls, gas estimation. Supports Ethereum, Polygon, Arbitrum, Base, Optimism. Powered by Alchemy.',
    version: '1.0.0',
    author: 'Alchemy',
    category: 'blockchain',
    source: 'mcpgate',
    mcpgate_server_id: 'builtin:alchemy',
    tool_manifest: [
      { name: 'alchemy_get_balance', description: 'Get the ETH balance of an address. Returns balance in hex-encoded wei.', parameters: { type: 'object', properties: { address: { type: 'string' }, block: { type: 'string' } }, required: ['address'] } },
      { name: 'alchemy_get_block', description: 'Get block information by block number. Returns full block data including transactions.', parameters: { type: 'object', properties: { block_number: { type: 'string' }, full_transactions: { type: 'boolean' } }, required: ['block_number'] } },
      { name: 'alchemy_get_transaction_receipt', description: 'Get the receipt of a transaction by its hash. Returns status, gas used, logs, and contract address.', parameters: { type: 'object', properties: { tx_hash: { type: 'string' } }, required: ['tx_hash'] } },
      { name: 'alchemy_get_logs', description: 'Get event logs matching a filter. Can filter by address, topics, and block range.', parameters: { type: 'object', properties: { address: { type: 'string' }, topics: { type: 'array' }, fromBlock: { type: 'string' }, toBlock: { type: 'string' } } } },
      { name: 'alchemy_call_contract', description: 'Execute a read-only contract call (eth_call). Read data from smart contracts without sending a transaction.', parameters: { type: 'object', properties: { to: { type: 'string' }, data: { type: 'string' }, from: { type: 'string' }, block: { type: 'string' } }, required: ['to', 'data'] } },
      { name: 'alchemy_estimate_gas', description: 'Estimate the gas required for a transaction. Returns the estimated gas amount in hex.', parameters: { type: 'object', properties: { to: { type: 'string' }, from: { type: 'string' }, data: { type: 'string' }, value: { type: 'string' } }, required: ['to'] } },
      { name: 'alchemy_get_token_balances', description: 'Get ERC-20 token balances for an address.', parameters: { type: 'object', properties: { address: { type: 'string' }, contractAddresses: { type: 'array', items: { type: 'string' } } }, required: ['address'] } },
      { name: 'alchemy_get_nfts_for_owner', description: 'Get all NFTs owned by an address. Returns NFT metadata, token IDs, and collection info.', parameters: { type: 'object', properties: { owner: { type: 'string' }, pageKey: { type: 'string' }, pageSize: { type: 'number' }, contractAddresses: { type: 'array', items: { type: 'string' } } }, required: ['owner'] } },
      { name: 'alchemy_get_nft_metadata', description: 'Get metadata for a specific NFT including name, description, image URL, and attributes.', parameters: { type: 'object', properties: { contractAddress: { type: 'string' }, tokenId: { type: 'string' }, tokenType: { type: 'string', enum: ['ERC721', 'ERC1155'] } }, required: ['contractAddress', 'tokenId'] } },
      { name: 'alchemy_get_asset_transfers', description: 'Get historical asset transfers (ETH, ERC-20, ERC-721, ERC-1155) for an address.', parameters: { type: 'object', properties: { fromAddress: { type: 'string' }, toAddress: { type: 'string' }, fromBlock: { type: 'string' }, toBlock: { type: 'string' }, category: { type: 'array', items: { type: 'string' } }, maxCount: { type: 'number' }, pageKey: { type: 'string' }, order: { type: 'string', enum: ['asc', 'desc'] } }, required: ['category'] } },
      { name: 'alchemy_get_token_metadata', description: 'Get metadata for an ERC-20 token including name, symbol, decimals, and logo URL.', parameters: { type: 'object', properties: { contractAddress: { type: 'string' } }, required: ['contractAddress'] } },
      { name: 'alchemy_get_floor_price', description: 'Get the floor price of an NFT collection from major marketplaces.', parameters: { type: 'object', properties: { contractAddress: { type: 'string' } }, required: ['contractAddress'] } },
      { name: 'alchemy_get_owners_for_nft', description: 'Get the current owners of a specific NFT.', parameters: { type: 'object', properties: { contractAddress: { type: 'string' }, tokenId: { type: 'string' } }, required: ['contractAddress', 'tokenId'] } },
      { name: 'alchemy_get_contracts_for_owner', description: 'Get all NFT contracts/collections owned by an address.', parameters: { type: 'object', properties: { owner: { type: 'string' }, pageKey: { type: 'string' }, pageSize: { type: 'number' } }, required: ['owner'] } },
      { name: 'alchemy_get_transactions', description: 'Get all transaction receipts for a given block.', parameters: { type: 'object', properties: { blockNumber: { type: 'string' }, blockHash: { type: 'string' } } } },
    ],
    risk_level: 'read',
    verified: true,
    is_published: true,
  },
]

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  // Connect to Supabase
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('[trading] ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Phase 1: Skills ──────────────────────────────────────────────────
  console.log('=== PHASE 1: Trading Skills ===\n')

  for (const skill of TRADING_SKILLS) {
    if (!fs.existsSync(skill.filePath)) {
      console.log(`  SKIP: ${skill.slug} — file not found at ${skill.filePath}`)
      continue
    }

    const rawContent = fs.readFileSync(skill.filePath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter(rawContent)

    const validation = validateFrontmatter(frontmatter)
    if (!validation.valid) {
      console.log(`  SKIP: ${skill.slug} — ${validation.error}`)
      continue
    }

    const sanitizedContent = sanitizeContent(body)
    const injectionWarnings = scanForPromptInjection(sanitizedContent)
    const allWarnings = [...validation.warnings, ...injectionWarnings]
    const contentHash = createHash('sha256').update(rawContent).digest('hex')

    if (dryRun) {
      const flags = allWarnings.length > 0 ? ` [${allWarnings.length} warnings]` : ''
      console.log(`  ${skill.slug} (${sanitizedContent.length} chars)${flags}`)
      if (injectionWarnings.length > 0) {
        for (const w of injectionWarnings) {
          console.log(`    ⚠ ${w.severity}: ${w.pattern} (line ${w.line})`)
        }
      }
      continue
    }

    // Check for existing
    const { data: existing } = await supabase
      .from('skill_catalog')
      .select('id, content_hash')
      .eq('slug', skill.slug)
      .single()

    if (existing && existing.content_hash === contentHash) {
      console.log(`  UNCHANGED: ${skill.slug}`)
      continue
    }

    const row = {
      slug: skill.slug,
      name: frontmatter.name as string,
      description: (frontmatter.description as string) || '',
      raw_content: rawContent,
      sanitized_content: sanitizedContent,
      frontmatter,
      source: skill.source,
      source_path: skill.sourcePath,
      source_commit: null,
      content_hash: contentHash,
      status: 'approved', // Pre-approved — we audited these
      content_chars: sanitizedContent.length,
      import_warnings: allWarnings.length > 0 ? allWarnings : null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('skill_catalog')
      .upsert(row, { onConflict: 'slug' })

    if (error) {
      console.error(`  FAIL: ${skill.slug} — ${error.message}`)
    } else {
      console.log(`  OK: ${skill.slug} (${existing ? 'updated' : 'new'}, ${sanitizedContent.length} chars)`)
    }
  }

  // ── Phase 2: MCPGate Plugins ─────────────────────────────────────────
  console.log('\n=== PHASE 2: MCPGate Plugins ===\n')

  for (const plugin of MCPGATE_PLUGINS) {
    if (dryRun) {
      console.log(`  ${plugin.slug} — ${plugin.name} (${plugin.tool_manifest.length} tools, ${plugin.risk_level})`)
      continue
    }

    const { data: existing } = await supabase
      .from('plugin_catalog')
      .select('id')
      .eq('slug', plugin.slug)
      .single()

    if (existing) {
      console.log(`  EXISTS: ${plugin.slug}`)
      continue
    }

    const { error } = await supabase
      .from('plugin_catalog')
      .insert({
        slug: plugin.slug,
        name: plugin.name,
        description: plugin.description,
        version: plugin.version,
        author: plugin.author,
        category: plugin.category,
        tool_manifest: plugin.tool_manifest,
        source: plugin.source,
        mcpgate_server_id: plugin.mcpgate_server_id,
        risk_level: plugin.risk_level,
        verified: plugin.verified,
        is_published: plugin.is_published,
        max_tools: plugin.tool_manifest.length,
      })

    if (error) {
      console.error(`  FAIL: ${plugin.slug} — ${error.message}`)
    } else {
      console.log(`  OK: ${plugin.slug} (${plugin.tool_manifest.length} tools)`)
    }
  }

  console.log('\n=== DONE ===')
}

main().catch(err => {
  console.error('[trading] Fatal error:', err)
  process.exit(1)
})
