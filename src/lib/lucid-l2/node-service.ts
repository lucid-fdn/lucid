/**
 * Node Service Layer
 * 
 * Centralized service for all node-related operations.
 * Follows the Service Layer Pattern used by Netflix, Airbnb, Uber.
 * 
 * Benefits:
 * - Single source of truth for node operations
 * - Request-level caching with React cache()
 * - Easy to test in isolation
 * - Easy to swap implementations (e.g., add Redis)
 * - Consistent data shape everywhere
 */

import { cache } from 'react'
import { getLucidL2Client } from './client'

// ============================================================================
// DEMO CRYPTO CONNECTORS - REMOVE WHEN READY FOR PRODUCTION
// ============================================================================
const DEMO_CRYPTO_NODES: LucidNode[] = [
  {
    name: 'nodes-base.hyperliquid',
    displayName: 'Hyperliquid',
    description: 'Trade perpetuals and spot on Hyperliquid DEX. Access order books, place trades, and manage positions.',
    version: 1,
    group: ['input'],
    category: 'Input',
    iconUrl: '/logos/icon/hyperliquid.png',
    usableAsTool: true,
    popularityScore: 85,
    tags: ['scope:integration', 'node:type=action', 'category:web3', 'category:defi', 'provider:hyperliquid', 'api:rest'],
    properties: [
      {
        name: 'resource',
        type: 'options',
        options: [
          { name: 'Order', value: 'order' },
          { name: 'Position', value: 'position' },
          { name: 'Market Data', value: 'marketData' },
        ],
      },
      {
        name: 'operation',
        type: 'options',
        displayOptions: { show: { resource: ['order'] } },
        options: [
          { name: 'Place Limit Order', value: 'placeLimitOrder', action: 'Place a limit order' },
          { name: 'Place Market Order', value: 'placeMarketOrder', action: 'Place a market order' },
          { name: 'Cancel Order', value: 'cancelOrder', action: 'Cancel an order' },
          { name: 'Get Order Status', value: 'getOrderStatus', action: 'Get order status' },
        ],
      },
      {
        name: 'walletAddress',
        displayName: 'Wallet Address',
        type: 'string',
        required: true,
        placeholder: '0x...',
        description: 'Your Ethereum wallet address',
      },
      {
        name: 'symbol',
        displayName: 'Trading Pair',
        type: 'options',
        required: true,
        options: [
          { name: 'BTC-USD', value: 'BTC-USD' },
          { name: 'ETH-USD', value: 'ETH-USD' },
          { name: 'SOL-USD', value: 'SOL-USD' },
          { name: 'ARB-USD', value: 'ARB-USD' },
        ],
      },
      {
        name: 'size',
        displayName: 'Order Size',
        type: 'number',
        required: true,
        placeholder: '0.1',
        description: 'Size in base currency',
      },
      {
        name: 'price',
        displayName: 'Price',
        type: 'number',
        placeholder: '50000',
        description: 'Limit price (optional for market orders)',
      },
    ],
  },
  {
    name: 'nodes-base.polymarket',
    displayName: 'Polymarket',
    description: 'Trade on prediction markets. Create markets, place bets, and monitor outcomes on the largest decentralized prediction market.',
    version: 1,
    group: ['input'],
    category: 'Input',
    iconUrl: '/logos/icon/polymarket.png',
    usableAsTool: true,
    popularityScore: 78,
    tags: ['scope:integration', 'node:type=action', 'category:web3', 'category:prediction-market', 'provider:polymarket', 'api:rest'],
    properties: [
      {
        name: 'resource',
        type: 'options',
        options: [
          { name: 'Market', value: 'market' },
          { name: 'Order', value: 'order' },
          { name: 'Position', value: 'position' },
        ],
      },
      {
        name: 'operation',
        type: 'options',
        displayOptions: { show: { resource: ['market'] } },
        options: [
          { name: 'Get Market Info', value: 'getMarket', action: 'Get market information' },
          { name: 'Search Markets', value: 'searchMarkets', action: 'Search for markets' },
          { name: 'Get Market Prices', value: 'getPrices', action: 'Get current prices' },
        ],
      },
      {
        name: 'operation',
        type: 'options',
        displayOptions: { show: { resource: ['order'] } },
        options: [
          { name: 'Place Order', value: 'placeOrder', action: 'Place a bet' },
          { name: 'Cancel Order', value: 'cancelOrder', action: 'Cancel an order' },
          { name: 'Get Order Book', value: 'getOrderBook', action: 'Get order book' },
        ],
      },
      {
        name: 'walletAddress',
        displayName: 'Wallet Address',
        type: 'string',
        required: true,
        placeholder: '0x...',
        description: 'Your Polygon wallet address',
      },
      {
        name: 'marketId',
        displayName: 'Market ID',
        type: 'string',
        required: true,
        placeholder: 'Enter market ID or slug',
        description: 'The prediction market to trade on',
      },
      {
        name: 'outcome',
        displayName: 'Outcome',
        type: 'options',
        required: true,
        options: [
          { name: 'Yes', value: 'yes' },
          { name: 'No', value: 'no' },
        ],
      },
      {
        name: 'amount',
        displayName: 'Bet Amount (USDC)',
        type: 'number',
        required: true,
        placeholder: '100',
        description: 'Amount in USDC to bet',
      },
    ],
  },
  {
    name: 'nodes-base.solana',
    displayName: 'Solana',
    description: 'Interact with the Solana blockchain. Send transactions, query accounts, interact with programs, and monitor on-chain activity.',
    version: 1,
    group: ['input'],
    category: 'Input',
    iconUrl: '/logos/icon/solana.svg',
    usableAsTool: true,
    popularityScore: 92,
    tags: ['scope:integration', 'node:type=action', 'category:web3', 'category:blockchain', 'provider:solana', 'api:rpc'],
    properties: [
      {
        name: 'resource',
        type: 'options',
        options: [
          { name: 'Transaction', value: 'transaction' },
          { name: 'Account', value: 'account' },
          { name: 'Token', value: 'token' },
          { name: 'NFT', value: 'nft' },
        ],
      },
      {
        name: 'operation',
        type: 'options',
        displayOptions: { show: { resource: ['transaction'] } },
        options: [
          { name: 'Send SOL', value: 'sendSol', action: 'Send SOL to address' },
          { name: 'Send Token', value: 'sendToken', action: 'Send SPL token' },
          { name: 'Get Transaction', value: 'getTransaction', action: 'Get transaction details' },
        ],
      },
      {
        name: 'operation',
        type: 'options',
        displayOptions: { show: { resource: ['account'] } },
        options: [
          { name: 'Get Balance', value: 'getBalance', action: 'Get SOL balance' },
          { name: 'Get Token Balances', value: 'getTokenBalances', action: 'Get all token balances' },
          { name: 'Get Account Info', value: 'getAccountInfo', action: 'Get account information' },
        ],
      },
      {
        name: 'network',
        displayName: 'Network',
        type: 'options',
        required: true,
        default: 'mainnet',
        options: [
          { name: 'Mainnet Beta', value: 'mainnet' },
          { name: 'Devnet', value: 'devnet' },
          { name: 'Testnet', value: 'testnet' },
        ],
      },
      {
        name: 'walletAddress',
        displayName: 'Wallet Address',
        type: 'string',
        required: true,
        placeholder: 'Your Solana wallet address',
        description: 'Base58-encoded public key',
      },
      {
        name: 'recipientAddress',
        displayName: 'Recipient Address',
        type: 'string',
        placeholder: 'Recipient\'s Solana address',
        description: 'Where to send the transaction',
      },
      {
        name: 'amount',
        displayName: 'Amount',
        type: 'number',
        placeholder: '0.1',
        description: 'Amount in SOL or token units',
      },
      {
        name: 'tokenMint',
        displayName: 'Token Mint Address',
        type: 'string',
        placeholder: 'Token mint address',
        description: 'SPL token mint address (for token operations)',
      },
    ],
  },
  {
    name: 'nodes-base.pumpfun',
    displayName: 'Pump.fun',
    description: 'Launch and trade memecoins on Solana. Create tokens, manage liquidity, and track trading activity.',
    version: 1,
    group: ['input'],
    category: 'Input',
    iconUrl: '/logos/icon/pumpfun.png',
    usableAsTool: true,
    popularityScore: 88,
    tags: ['scope:integration', 'node:type=action', 'category:web3', 'category:defi', 'category:memecoin', 'provider:pumpfun', 'api:rest'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Token', value: 'token' },
        { name: 'Trade', value: 'trade' },
        { name: 'Market', value: 'market' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['token'] }}, options: [
        { name: 'Launch Token', value: 'launch', action: 'Launch new token' },
        { name: 'Get Token Info', value: 'getInfo', action: 'Get token details' }
      ]},
      { name: 'walletAddress', displayName: 'Wallet Address', type: 'string', required: true, placeholder: 'Solana address' }
    ],
  },
  {
    name: 'nodes-base.metamask',
    displayName: 'MetaMask',
    description: 'Connect to MetaMask wallet. Send transactions, sign messages, and interact with Ethereum dApps.',
    version: 1,
    group: ['input'],
    category: 'Input',
    iconUrl: '/logos/icon/metamask.png',
    usableAsTool: true,
    popularityScore: 95,
    tags: ['scope:integration', 'node:type=action', 'category:web3', 'category:wallet', 'provider:metamask', 'api:web3'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Account', value: 'account' },
        { name: 'Transaction', value: 'transaction' },
        { name: 'Signature', value: 'signature' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['transaction'] }}, options: [
        { name: 'Send Transaction', value: 'send', action: 'Send transaction' },
        { name: 'Get Balance', value: 'getBalance', action: 'Get wallet balance' }
      ]},
      { name: 'network', displayName: 'Network', type: 'options', required: true, options: [
        { name: 'Ethereum Mainnet', value: 'mainnet' },
        { name: 'Polygon', value: 'polygon' },
        { name: 'Arbitrum', value: 'arbitrum' }
      ]}
    ],
  },
  {
    name: 'nodes-base.phantom',
    displayName: 'Phantom Wallet',
    description: 'Connect to Phantom wallet. Manage Solana assets, sign transactions, and interact with Solana dApps.',
    version: 1,
    group: ['input'],
    category: 'Input',
    iconUrl: '/logos/icon/phantom.png',
    usableAsTool: true,
    popularityScore: 90,
    tags: ['scope:integration', 'node:type=action', 'category:web3', 'category:wallet', 'provider:phantom', 'api:web3'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Account', value: 'account' },
        { name: 'Transaction', value: 'transaction' },
        { name: 'NFT', value: 'nft' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['transaction'] }}, options: [
        { name: 'Send SOL', value: 'sendSol', action: 'Send SOL' },
        { name: 'Send Token', value: 'sendToken', action: 'Send SPL token' }
      ]},
      { name: 'walletAddress', displayName: 'Wallet Address', type: 'string', required: true, placeholder: 'Phantom wallet address' }
    ],
  },
  {
    name: 'nodes-base.jupiter',
    displayName: 'Jupiter',
    description: 'Solana DEX aggregator. Get best swap rates, execute trades, and access liquidity across Solana DeFi.',
    version: 1,
    group: ['input'],
    category: 'Input',
    iconUrl: '/logos/icon/jupiter.png',
    usableAsTool: true,
    popularityScore: 89,
    tags: ['scope:integration', 'node:type=action', 'category:web3', 'category:defi', 'category:dex-aggregator', 'provider:jupiter', 'api:rest'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Swap', value: 'swap' },
        { name: 'Quote', value: 'quote' },
        { name: 'Price', value: 'price' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['swap'] }}, options: [
        { name: 'Execute Swap', value: 'swap', action: 'Execute token swap' },
        { name: 'Get Quote', value: 'quote', action: 'Get swap quote' }
      ]},
      { name: 'inputMint', displayName: 'Input Token', type: 'string', required: true, placeholder: 'Token mint address' },
      { name: 'outputMint', displayName: 'Output Token', type: 'string', required: true, placeholder: 'Token mint address' },
      { name: 'amount', displayName: 'Amount', type: 'number', required: true }
    ],
  },
  {
    name: 'nodes-base.wormhole',
    displayName: 'Wormhole',
    description: 'Cross-chain bridge protocol. Transfer assets between blockchains and monitor bridge transactions.',
    version: 1,
    group: ['input'],
    category: 'Input',
    iconUrl: '/logos/icon/wormhole.png',
    usableAsTool: true,
    popularityScore: 82,
    tags: ['scope:integration', 'node:type=action', 'category:web3', 'category:bridge', 'category:cross-chain', 'provider:wormhole', 'api:rest'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Transfer', value: 'transfer' },
        { name: 'Transaction', value: 'transaction' },
        { name: 'Chain', value: 'chain' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['transfer'] }}, options: [
        { name: 'Bridge Asset', value: 'bridge', action: 'Bridge asset' },
        { name: 'Get Transfer Status', value: 'status', action: 'Get transfer status' }
      ]},
      { name: 'sourceChain', displayName: 'Source Chain', type: 'options', required: true, options: [
        { name: 'Ethereum', value: 'ethereum' },
        { name: 'Solana', value: 'solana' },
        { name: 'Polygon', value: 'polygon' }
      ]},
      { name: 'targetChain', displayName: 'Target Chain', type: 'options', required: true, options: [
        { name: 'Ethereum', value: 'ethereum' },
        { name: 'Solana', value: 'solana' },
        { name: 'Polygon', value: 'polygon' }
      ]}
    ],
  },
  {
    name: 'nodes-base.meteora',
    displayName: 'Meteora',
    description: 'Solana liquidity protocol. Provide liquidity, swap tokens, and earn yield on Meteora pools.',
    version: 1,
    group: ['input'],
    category: 'Input',
    iconUrl: '/logos/icon/meteora.png',
    usableAsTool: true,
    popularityScore: 76,
    tags: ['scope:integration', 'node:type=action', 'category:web3', 'category:defi', 'category:liquidity', 'provider:meteora', 'api:rest'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Pool', value: 'pool' },
        { name: 'Position', value: 'position' },
        { name: 'Swap', value: 'swap' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['pool'] }}, options: [
        { name: 'Add Liquidity', value: 'addLiquidity', action: 'Add liquidity to pool' },
        { name: 'Remove Liquidity', value: 'removeLiquidity', action: 'Remove liquidity' }
      ]},
      { name: 'poolAddress', displayName: 'Pool Address', type: 'string', required: true, placeholder: 'Meteora pool address' }
    ],
  },
  {
    name: 'nodes-base.apechain',
    displayName: 'ApeChain',
    description: 'Layer 2 blockchain for the Ape ecosystem. Deploy contracts, send transactions, and interact with Ape dApps.',
    version: 1,
    group: ['input'],
    category: 'Input',
    iconUrl: '/logos/icon/apecoin.png',
    usableAsTool: true,
    popularityScore: 80,
    tags: ['scope:integration', 'node:type=action', 'category:web3', 'category:blockchain', 'category:layer2', 'provider:apechain', 'api:rpc'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Transaction', value: 'transaction' },
        { name: 'Contract', value: 'contract' },
        { name: 'Account', value: 'account' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['transaction'] }}, options: [
        { name: 'Send Transaction', value: 'send', action: 'Send transaction' },
        { name: 'Get Transaction', value: 'get', action: 'Get transaction details' }
      ]},
      { name: 'walletAddress', displayName: 'Wallet Address', type: 'string', required: true, placeholder: '0x...' },
      { name: 'network', displayName: 'Network', type: 'options', required: true, default: 'mainnet', options: [
        { name: 'Mainnet', value: 'mainnet' },
        { name: 'Testnet', value: 'testnet' }
      ]}
    ],
  },
  {
    name: 'nodes-base.bananet',
    displayName: 'Bananet',
    description: 'AI Agent platform on ApeChain. Create, deploy, and manage autonomous AI agents for the Ape ecosystem.',
    version: 1,
    group: ['input'],
    category: 'Input',
    icon: '/logos/icon/bananet.png',
    usableAsTool: true,
    popularityScore: 74,
    tags: ['scope:integration', 'node:type=action', 'category:web3', 'category:ai-agent', 'category:apechain', 'provider:bananet', 'api:rest'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Agent', value: 'agent' },
        { name: 'Task', value: 'task' },
        { name: 'Execution', value: 'execution' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['agent'] }}, options: [
        { name: 'Deploy Agent', value: 'deploy', action: 'Deploy AI agent' },
        { name: 'Execute Task', value: 'execute', action: 'Execute agent task' },
        { name: 'Get Agent Status', value: 'status', action: 'Get agent status' }
      ]},
      { name: 'agentId', displayName: 'Agent ID', type: 'string', placeholder: 'Agent identifier' },
      { name: 'task', displayName: 'Task', type: 'string', placeholder: 'Task description for agent' }
    ],
  },
  // ============================================================================
  // AI AGENT TOOLS & DATA SOURCES
  // ============================================================================
  {
    name: 'nodes-base.apechainMonitor',
    displayName: 'ApeChain Monitor Tool',
    description: 'Monitor ApeChain blockchain activity. Query transactions, events, NFT transfers, and on-chain data for AI agents.',
    version: 1,
    group: ['transform'],
    category: 'Transform',
    iconUrl: '/logos/icon/apecoin.png',
    usableAsTool: true,
    popularityScore: 98,
    tags: ['scope:integration', 'node:type=tool', 'category:ai-agent', 'category:web3', 'category:blockchain', 'provider:apechain', 'api:rpc'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Transaction', value: 'transaction' },
        { name: 'NFT', value: 'nft' },
        { name: 'Contract Event', value: 'event' },
        { name: 'Account Activity', value: 'account' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['transaction'] }}, options: [
        { name: 'Get Recent Transactions', value: 'getRecent', action: 'Get recent blockchain transactions' },
        { name: 'Get Transaction By Hash', value: 'getByHash', action: 'Get transaction details' },
        { name: 'Query Transaction History', value: 'queryHistory', action: 'Query historical transactions' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['nft'] }}, options: [
        { name: 'Get BAYC Holdings', value: 'getBAYC', action: 'Get Bored Ape holdings' },
        { name: 'Get NFT Transfers', value: 'getTransfers', action: 'Get NFT transfer events' },
        { name: 'Get Floor Price', value: 'getFloorPrice', action: 'Get collection floor price' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['event'] }}, options: [
        { name: 'Query Events', value: 'queryEvents', action: 'Query contract events' },
        { name: 'Get Event Logs', value: 'getLogs', action: 'Get event logs by block' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['account'] }}, options: [
        { name: 'Get Balance', value: 'getBalance', action: 'Get account APE balance' },
        { name: 'Get Activity Summary', value: 'getActivity', action: 'Get account activity summary' }
      ]},
      { name: 'address', displayName: 'Address', type: 'string', placeholder: '0x...', description: 'Wallet or contract address to query' },
      { name: 'limit', displayName: 'Limit', type: 'number', default: 10, description: 'Number of results to return' }
    ],
  },
  {
    name: 'nodes-base.xSentimentAnalyzer',
    displayName: 'X Sentiment Analyzer Tool',
    description: 'Analyze sentiment on X (Twitter). Monitor hashtags, mentions, trends for crypto/NFT communities. Perfect for AI agents tracking social sentiment.',
    version: 1,
    group: ['transform'],
    category: 'Transform',
    iconUrl: '/logos/x.png',
    usableAsTool: true,
    popularityScore: 99,
    tags: ['scope:integration', 'node:type=tool', 'category:ai-agent', 'category:social-media', 'category:sentiment', 'provider:twitter', 'api:rest'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Sentiment Analysis', value: 'sentiment' },
        { name: 'Trend Monitoring', value: 'trends' },
        { name: 'Community Pulse', value: 'community' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['sentiment'] }}, options: [
        { name: 'Analyze Hashtag Sentiment', value: 'analyzeHashtag', action: 'Analyze sentiment for hashtag' },
        { name: 'Analyze User Mentions', value: 'analyzeMentions', action: 'Analyze mentions sentiment' },
        { name: 'Get Sentiment Score', value: 'getScore', action: 'Get aggregated sentiment score' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['trends'] }}, options: [
        { name: 'Get Trending Topics', value: 'getTrending', action: 'Get trending topics' },
        { name: 'Monitor Keyword', value: 'monitorKeyword', action: 'Monitor specific keyword' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['community'] }}, options: [
        { name: 'BAYC Community Pulse', value: 'baycPulse', action: 'Analyze BAYC community sentiment' },
        { name: 'ApeCoin Sentiment', value: 'apeCoinSentiment', action: 'Analyze ApeCoin sentiment' },
        { name: 'NFT Market Sentiment', value: 'nftSentiment', action: 'Analyze NFT market sentiment' }
      ]},
      { name: 'query', displayName: 'Search Query', type: 'string', required: true, placeholder: '#BAYC or @boredapeyc', description: 'Hashtag, @mention, or keyword to analyze' },
      { name: 'timeframe', displayName: 'Timeframe', type: 'options', default: '24h', options: [
        { name: 'Last Hour', value: '1h' },
        { name: 'Last 24 Hours', value: '24h' },
        { name: 'Last 7 Days', value: '7d' },
        { name: 'Last 30 Days', value: '30d' }
      ]},
      { name: 'includeMetrics', displayName: 'Include Metrics', type: 'boolean', default: true, description: 'Include engagement metrics (likes, retweets, replies)' }
    ],
  },
  {
    name: 'nodes-base.baycLoreKnowledge',
    displayName: 'BAYC Lore Knowledge Memory',
    description: 'Access comprehensive Bored Ape Yacht Club lore, history, and community knowledge. RAG-powered knowledge base for AI agents.',
    version: 1,
    group: ['transform'],
    category: 'Transform',
    iconUrl: '/logos/icon/bayc.webp',
    usableAsTool: true,
    popularityScore: 97,
    tags: ['scope:integration', 'node:type=memory', 'category:ai-agent', 'category:knowledge-base', 'category:nft', 'provider:bayc', 'api:vector-db'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Lore Query', value: 'lore' },
        { name: 'Character Info', value: 'character' },
        { name: 'Events History', value: 'events' },
        { name: 'Community Context', value: 'community' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['lore'] }}, options: [
        { name: 'Query Lore', value: 'query', action: 'Query BAYC lore database' },
        { name: 'Get Storyline', value: 'getStoryline', action: 'Get specific storyline' },
        { name: 'Search Context', value: 'searchContext', action: 'Search for context about topic' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['character'] }}, options: [
        { name: 'Get Ape Info', value: 'getApe', action: 'Get info about specific ape' },
        { name: 'Get Traits', value: 'getTraits', action: 'Get ape traits and rarity' },
        { name: 'Get Backstory', value: 'getBackstory', action: 'Get ape backstory' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['events'] }}, options: [
        { name: 'Get Timeline', value: 'getTimeline', action: 'Get BAYC timeline' },
        { name: 'Get Major Events', value: 'getMajorEvents', action: 'Get major community events' },
        { name: 'Get Metaverse Events', value: 'getMetaverse', action: 'Get metaverse/Otherside events' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['community'] }}, options: [
        { name: 'Get Community Values', value: 'getValues', action: 'Get community values and culture' },
        { name: 'Get Slang/Terms', value: 'getSlang', action: 'Get BAYC slang and terminology' },
        { name: 'Get Benefits', value: 'getBenefits', action: 'Get holder benefits and utilities' }
      ]},
      { name: 'query', displayName: 'Query', type: 'string', required: true, placeholder: 'What is the origin story of BAYC?', description: 'Natural language question about BAYC' },
      { name: 'apeId', displayName: 'Ape ID', type: 'number', placeholder: '1234', description: 'Specific ape ID (0-9999) for character queries' },
      { name: 'includeContext', displayName: 'Include Context', type: 'boolean', default: true, description: 'Include surrounding context in response' }
    ],
  },
  {
    name: 'nodes-base.apechainExecutor',
    displayName: 'ApeChain Executor Tool',
    description: 'Execute transactions on ApeChain. Send APE, interact with contracts, trade NFTs. Tool for AI agents to take on-chain actions.',
    version: 1,
    group: ['transform'],
    category: 'Transform',
    iconUrl: '/logos/icon/apecoin.png',
    usableAsTool: true,
    popularityScore: 96,
    tags: ['scope:integration', 'node:type=tool', 'category:ai-agent', 'category:web3', 'category:blockchain', 'provider:apechain', 'api:rpc'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Transaction', value: 'transaction' },
        { name: 'NFT', value: 'nft' },
        { name: 'Contract Interaction', value: 'contract' },
        { name: 'Token Swap', value: 'swap' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['transaction'] }}, options: [
        { name: 'Send APE', value: 'sendAPE', action: 'Send APE tokens' },
        { name: 'Send Token', value: 'sendToken', action: 'Send ERC20 token' },
        { name: 'Batch Transfer', value: 'batchTransfer', action: 'Batch transfer to multiple addresses' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['nft'] }}, options: [
        { name: 'Transfer NFT', value: 'transferNFT', action: 'Transfer NFT to address' },
        { name: 'List NFT', value: 'listNFT', action: 'List NFT for sale' },
        { name: 'Buy NFT', value: 'buyNFT', action: 'Buy NFT from marketplace' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['contract'] }}, options: [
        { name: 'Call Function', value: 'callFunction', action: 'Call contract function' },
        { name: 'Write Transaction', value: 'writeTransaction', action: 'Execute write transaction' },
        { name: 'Deploy Contract', value: 'deployContract', action: 'Deploy smart contract' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['swap'] }}, options: [
        { name: 'Swap Tokens', value: 'swapTokens', action: 'Swap tokens via DEX' },
        { name: 'Add Liquidity', value: 'addLiquidity', action: 'Add liquidity to pool' }
      ]},
      { name: 'walletAddress', displayName: 'Wallet Address', type: 'string', required: true, placeholder: '0x...', description: 'Your wallet address (must have signing permission)' },
      { name: 'recipientAddress', displayName: 'Recipient Address', type: 'string', placeholder: '0x...', description: 'Destination address' },
      { name: 'amount', displayName: 'Amount', type: 'string', placeholder: '1.0', description: 'Amount in APE or token units' },
      { name: 'gasLimit', displayName: 'Gas Limit', type: 'number', default: 100000, description: 'Gas limit for transaction' },
      { name: 'requireConfirmation', displayName: 'Require Confirmation', type: 'boolean', default: true, description: 'Wait for transaction confirmation' }
    ],
  },
  {
    name: 'nodes-base.solanaExecutor',
    displayName: 'Solana Executor Tool',
    description: 'Execute transactions on Solana blockchain. Send SOL/tokens, trade NFTs, interact with programs. Tool for AI agents to take on-chain actions.',
    version: 1,
    group: ['transform'],
    category: 'Transform',
    iconUrl: '/logos/icon/solana.svg',
    usableAsTool: true,
    popularityScore: 100,
    tags: ['scope:integration', 'node:type=tool', 'category:ai-agent', 'category:web3', 'category:blockchain', 'provider:solana', 'api:rpc'],
    properties: [
      { name: 'resource', type: 'options', options: [
        { name: 'Transaction', value: 'transaction' },
        { name: 'Token', value: 'token' },
        { name: 'NFT', value: 'nft' },
        { name: 'DeFi Action', value: 'defi' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['transaction'] }}, options: [
        { name: 'Send SOL', value: 'sendSOL', action: 'Send SOL to address' },
        { name: 'Send Token', value: 'sendToken', action: 'Send SPL token' },
        { name: 'Create Account', value: 'createAccount', action: 'Create new account' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['token'] }}, options: [
        { name: 'Create Token', value: 'createToken', action: 'Create SPL token' },
        { name: 'Mint Tokens', value: 'mintTokens', action: 'Mint tokens to address' },
        { name: 'Burn Tokens', value: 'burnTokens', action: 'Burn tokens from supply' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['nft'] }}, options: [
        { name: 'Mint NFT', value: 'mintNFT', action: 'Mint NFT' },
        { name: 'Transfer NFT', value: 'transferNFT', action: 'Transfer NFT' },
        { name: 'List NFT', value: 'listNFT', action: 'List NFT on marketplace' },
        { name: 'Buy NFT', value: 'buyNFT', action: 'Buy NFT from marketplace' }
      ]},
      { name: 'operation', type: 'options', displayOptions: { show: { resource: ['defi'] }}, options: [
        { name: 'Swap via Jupiter', value: 'jupiterSwap', action: 'Swap tokens via Jupiter' },
        { name: 'Provide Liquidity', value: 'addLiquidity', action: 'Add liquidity to pool' },
        { name: 'Stake SOL', value: 'stakeSol', action: 'Stake SOL to validator' }
      ]},
      { name: 'network', displayName: 'Network', type: 'options', required: true, default: 'mainnet', options: [
        { name: 'Mainnet Beta', value: 'mainnet' },
        { name: 'Devnet', value: 'devnet' },
        { name: 'Testnet', value: 'testnet' }
      ]},
      { name: 'walletAddress', displayName: 'Wallet Address', type: 'string', required: true, placeholder: 'Base58 public key', description: 'Your Solana wallet address' },
      { name: 'recipientAddress', displayName: 'Recipient Address', type: 'string', placeholder: 'Recipient public key', description: 'Destination address' },
      { name: 'amount', displayName: 'Amount', type: 'string', placeholder: '1.0', description: 'Amount in SOL or token units' },
      { name: 'priorityFee', displayName: 'Priority Fee', type: 'number', default: 5000, description: 'Priority fee in lamports' },
      { name: 'requireConfirmation', displayName: 'Require Confirmation', type: 'boolean', default: true, description: 'Wait for transaction confirmation' }
    ],
  },
  // ============================================================================
  // TRIGGER VERSIONS (Event-Driven Workflow Starters)
  // ============================================================================
  {
    name: 'nodes-base.hyperliquidTrigger',
    displayName: 'Hyperliquid Trigger',
    description: 'Start workflow when events occur on Hyperliquid DEX. Monitor orders, positions, and market changes.',
    version: 1,
    group: ['trigger'],
    category: 'Trigger',
    iconUrl: '/logos/icon/hyperliquid.png',
    usableAsTool: true,
    popularityScore: 85,
    tags: ['scope:integration', 'node:type=trigger', 'category:web3', 'category:defi', 'provider:hyperliquid', 'api:webhook'],
    properties: [
      { name: 'resource', displayName: 'Resource', type: 'options', required: true, options: [
        { name: 'Order', value: 'order' },
        { name: 'Position', value: 'position' },
        { name: 'Market', value: 'market' }
      ]},
      { name: 'event', displayName: 'Trigger Event', type: 'options', required: true, displayOptions: { show: { resource: ['order'] }}, options: [
        { name: 'Order Filled', value: 'orderFilled', description: 'When your order is filled' },
        { name: 'Order Cancelled', value: 'orderCancelled', description: 'When order is cancelled' }
      ]},
      { name: 'event', displayName: 'Trigger Event', type: 'options', required: true, displayOptions: { show: { resource: ['position'] }}, options: [
        { name: 'Position Liquidated', value: 'positionLiquidated', description: 'When position is liquidated' },
        { name: 'Position Opened', value: 'positionOpened', description: 'When new position opened' }
      ]},
      { name: 'event', displayName: 'Trigger Event', type: 'options', required: true, displayOptions: { show: { resource: ['market'] }}, options: [
        { name: 'Price Alert', value: 'priceAlert', description: 'When price reaches target' },
        { name: 'Funding Rate Changed', value: 'fundingRateChanged', description: 'When funding rate updates' }
      ]},
      { name: 'walletAddress', displayName: 'Wallet Address', type: 'string', required: true, placeholder: '0x...' },
      { name: 'symbol', displayName: 'Trading Pair', type: 'options', displayOptions: { show: { event: ['priceAlert'] }}, options: [
        { name: 'BTC-USD', value: 'BTC-USD' },
        { name: 'ETH-USD', value: 'ETH-USD' }
      ]},
      { name: 'targetPrice', displayName: 'Target Price', type: 'number', displayOptions: { show: { event: ['priceAlert'] }}, placeholder: '50000' }
    ],
  },
  {
    name: 'nodes-base.polymarketTrigger',
    displayName: 'Polymarket Trigger',
    description: 'Start workflow when prediction market events occur. Monitor market resolutions, bets, and odds changes.',
    version: 1,
    group: ['trigger'],
    category: 'Trigger',
    iconUrl: '/logos/icon/polymarket.png',
    usableAsTool: true,
    popularityScore: 78,
    tags: ['scope:integration', 'node:type=trigger', 'category:web3', 'category:prediction-market', 'provider:polymarket', 'api:webhook'],
    properties: [
      { name: 'event', displayName: 'Trigger On', type: 'options', required: true, options: [
        { name: 'Market Resolved', value: 'marketResolved', description: 'When market outcome is determined' },
        { name: 'Order Matched', value: 'orderMatched', description: 'When your bet is matched' },
        { name: 'New Market Created', value: 'newMarket', description: 'When new market launches' },
        { name: 'Odds Changed', value: 'oddsChanged', description: 'When odds shift significantly' }
      ]},
      { name: 'marketId', displayName: 'Market ID', type: 'string', placeholder: 'Enter market ID (optional)' }
    ],
  },
  {
    name: 'nodes-base.solanaTrigger',
    displayName: 'Solana Trigger',
    description: 'Start workflow on Solana blockchain events. Monitor transactions, token transfers, and account changes.',
    version: 1,
    group: ['trigger'],
    category: 'Trigger',
    iconUrl: '/logos/icon/solana.svg',
    usableAsTool: true,
    popularityScore: 92,
    tags: ['scope:integration', 'node:type=trigger', 'category:web3', 'category:blockchain', 'provider:solana', 'api:websocket'],
    properties: [
      { name: 'event', displayName: 'Trigger On', type: 'options', required: true, options: [
        { name: 'Transaction Received', value: 'transactionReceived', description: 'When transaction sent to address' },
        { name: 'Token Received', value: 'tokenReceived', description: 'When SPL token received' },
        { name: 'Balance Changed', value: 'balanceChanged', description: 'When SOL balance changes' },
        { name: 'Program Event', value: 'programEvent', description: 'When program emits event' }
      ]},
      { name: 'network', displayName: 'Network', type: 'options', required: true, default: 'mainnet', options: [
        { name: 'Mainnet Beta', value: 'mainnet' },
        { name: 'Devnet', value: 'devnet' }
      ]},
      { name: 'walletAddress', displayName: 'Wallet Address', type: 'string', required: true, placeholder: 'Solana address to monitor' }
    ],
  },
  {
    name: 'nodes-base.pumpfunTrigger',
    displayName: 'Pump.fun Trigger',
    description: 'Start workflow when memecoin events occur. Monitor new launches, graduations, and trading activity.',
    version: 1,
    group: ['trigger'],
    category: 'Trigger',
    iconUrl: '/logos/icon/pumpfun.png',
    usableAsTool: true,
    popularityScore: 88,
    tags: ['scope:integration', 'node:type=trigger', 'category:web3', 'category:defi', 'category:memecoin', 'provider:pumpfun', 'api:webhook'],
    properties: [
      { name: 'event', displayName: 'Trigger On', type: 'options', required: true, options: [
        { name: 'New Token Launched', value: 'newToken', description: 'When new token is created' },
        { name: 'Bonding Curve Completed', value: 'bondingComplete', description: 'When bonding curve fills' },
        { name: 'Token Graduated', value: 'graduated', description: 'When token moves to Raydium' },
        { name: 'Large Trade', value: 'largeTrade', description: 'When significant buy/sell occurs' }
      ]},
      { name: 'minTradeSize', displayName: 'Minimum Trade Size', type: 'number', displayOptions: { show: { event: ['largeTrade'] }}, placeholder: '1000', description: 'USD value threshold' }
    ],
  },
  {
    name: 'nodes-base.wormholeTrigger',
    displayName: 'Wormhole Trigger',
    description: 'Start workflow on cross-chain bridge events. Monitor transfers, completions, and failures.',
    version: 1,
    group: ['trigger'],
    category: 'Trigger',
    iconUrl: '/logos/icon/wormhole.png',
    usableAsTool: true,
    popularityScore: 82,
    tags: ['scope:integration', 'node:type=trigger', 'category:web3', 'category:bridge', 'category:cross-chain', 'provider:wormhole', 'api:webhook'],
    properties: [
      { name: 'event', displayName: 'Trigger On', type: 'options', required: true, options: [
        { name: 'Transfer Initiated', value: 'transferInitiated', description: 'When bridge transfer starts' },
        { name: 'Transfer Completed', value: 'transferCompleted', description: 'When transfer finishes' },
        { name: 'Transfer Failed', value: 'transferFailed', description: 'When transfer fails' },
        { name: 'VAA Signed', value: 'vaaSigned', description: 'When validators approve transfer' }
      ]},
      { name: 'watchAddress', displayName: 'Address to Monitor', type: 'string', placeholder: 'Address (optional)' }
    ],
  },
  {
    name: 'nodes-base.meteoraTrigger',
    displayName: 'Meteora Trigger',
    description: 'Start workflow on liquidity pool events. Monitor swaps, liquidity changes, and fee collection.',
    version: 1,
    group: ['trigger'],
    category: 'Trigger',
    iconUrl: '/logos/icon/meteora.png',
    usableAsTool: true,
    popularityScore: 76,
    tags: ['scope:integration', 'node:type=trigger', 'category:web3', 'category:defi', 'category:liquidity', 'provider:meteora', 'api:webhook'],
    properties: [
      { name: 'event', displayName: 'Trigger On', type: 'options', required: true, options: [
        { name: 'Liquidity Added', value: 'liquidityAdded', description: 'When LP tokens minted' },
        { name: 'Liquidity Removed', value: 'liquidityRemoved', description: 'When LP tokens burned' },
        { name: 'Swap Executed', value: 'swapExecuted', description: 'When trade occurs in pool' },
        { name: 'Fees Collected', value: 'feesCollected', description: 'When fees are claimed' },
        { name: 'APY Changed', value: 'apyChanged', description: 'When pool APY shifts significantly' }
      ]},
      { name: 'poolAddress', displayName: 'Pool Address', type: 'string', required: true, placeholder: 'Meteora pool to monitor' }
    ],
  },
  {
    name: 'nodes-base.apechainTrigger',
    displayName: 'ApeChain Trigger',
    description: 'Start workflow on ApeChain events. Monitor transactions, contracts, and blockchain activity.',
    version: 1,
    group: ['trigger'],
    category: 'Trigger',
    iconUrl: '/logos/icon/apecoin.png',
    usableAsTool: true,
    popularityScore: 80,
    tags: ['scope:integration', 'node:type=trigger', 'category:web3', 'category:blockchain', 'category:layer2', 'provider:apechain', 'api:websocket'],
    properties: [
      { name: 'event', displayName: 'Trigger On', type: 'options', required: true, options: [
        { name: 'New Transaction', value: 'newTransaction', description: 'When transaction sent to address' },
        { name: 'Contract Deployed', value: 'contractDeployed', description: 'When new contract deployed' },
        { name: 'Event Emitted', value: 'eventEmitted', description: 'When specific event fires' },
        { name: 'Block Mined', value: 'blockMined', description: 'When new block is created' }
      ]},
      { name: 'network', displayName: 'Network', type: 'options', required: true, default: 'mainnet', options: [
        { name: 'Mainnet', value: 'mainnet' },
        { name: 'Testnet', value: 'testnet' }
      ]},
      { name: 'address', displayName: 'Address/Contract', type: 'string', placeholder: 'Address to monitor' }
    ],
  },
  {
    name: 'nodes-base.bananetTrigger',
    displayName: 'Bananet Trigger',
    description: 'Start workflow when AI agent events occur. Monitor task completions, errors, and status changes.',
    version: 1,
    group: ['trigger'],
    category: 'Trigger',
    icon: '/logos/icon/bananet.png',
    usableAsTool: true,
    popularityScore: 74,
    tags: ['scope:integration', 'node:type=trigger', 'category:web3', 'category:ai-agent', 'category:apechain', 'provider:bananet', 'api:webhook'],
    properties: [
      { name: 'event', displayName: 'Trigger On', type: 'options', required: true, options: [
        { name: 'Task Completed', value: 'taskCompleted', description: 'When agent finishes task' },
        { name: 'Agent Error', value: 'agentError', description: 'When agent encounters error' },
        { name: 'Status Changed', value: 'statusChanged', description: 'When agent status updates' },
        { name: 'Result Available', value: 'resultAvailable', description: 'When agent produces output' }
      ]},
      { name: 'agentId', displayName: 'Agent ID', type: 'string', placeholder: 'Specific agent to monitor (optional)' }
    ],
  }
]
// ============================================================================

// ============================================================================
// In-Memory Cache (5 minutes TTL)
// ============================================================================

let nodesCache: NodesResponse | null = null
let cacheTimestamp: number = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// DEMO: Force cache clear to show new crypto nodes
if (typeof window === 'undefined') {
  nodesCache = null
  cacheTimestamp = 0
}

function isCacheValid(): boolean {
  // Only use cache if it exists, is successful, and not expired
  return nodesCache !== null && nodesCache.success && Date.now() - cacheTimestamp < CACHE_TTL
}

/**
 * Clear the in-memory cache
 * Useful when you need to force a fresh fetch
 */
export function clearNodesCache(): void {
  nodesCache = null
  cacheTimestamp = 0
  console.log('[NodeService] 🗑️ Cache cleared')
}

// ============================================================================
// Types
// ============================================================================

export interface NodePropertyOption {
  name: string
  value: string
  action?: string
  description?: string
}

export interface NodePropertyDisplayOptions {
  show?: Record<string, string[]>
  hide?: Record<string, string[]>
}

export interface NodeProperty {
  name: string
  displayName?: string
  type: string
  required?: boolean
  default?: string | number | boolean
  placeholder?: string
  description?: string
  options?: NodePropertyOption[]
  displayOptions?: NodePropertyDisplayOptions
}

export interface NodeCredentialDefinition {
  name: string
  displayName?: string
  required?: boolean
}

export interface LucidNode {
  name: string
  displayName: string
  description?: string
  version?: number | number[]
  group?: string[]
  iconUrl?: string | { light: string; dark: string }
  icon?: string
  category: string
  subcategories?: Record<string, string[]>
  aliases?: string[]
  usableAsTool?: boolean
  docs?: string
  properties?: NodeProperty[]
  credentials?: NodeCredentialDefinition[]
  inputs?: string[]
  outputs?: string[]
  tags?: string[]
  popularityScore?: number
}

export interface NodesResponse {
  success: boolean
  nodes: LucidNode[]
  grouped: Record<string, LucidNode[]>
  categories: string[]
  count: number
  error?: string
}

export interface NodeSearchFilters {
  query?: string
  category?: string
  usableAsTool?: boolean
}

/** Raw node data as returned from the n8n/Lucid-L2 API before transformation */
interface RawNodeData {
  name: string
  displayName: string
  description?: string
  version?: number | number[]
  defaultVersion?: number
  group?: string[]
  iconUrl?: string | { light: string; dark: string }
  icon?: string
  category?: string
  codex?: {
    categories?: string[]
    subcategories?: Record<string, string[]>
    alias?: string[]
    resources?: {
      primaryDocumentation?: { url: string }[]
    }
  }
  usableAsTool?: boolean
  properties?: NodeProperty[]
  credentials?: NodeCredentialDefinition[]
  inputs?: string[]
  outputs?: string[]
  tags?: string[]
  [key: string]: unknown
}

/** Raw API response shape (can be multiple formats) */
type RawNodesApiResponse =
  | { nodes: RawNodeData[]; success?: boolean }
  | RawNodeData[]
  | { data: RawNodeData[] }
  | null
  | undefined

interface NodeResourceAction {
  name: string
  value: string
  action: string
  description?: string
}

interface NodeResource {
  name: string
  value: string
  actions: NodeResourceAction[]
}

// ============================================================================
// Core Service Functions (Request-Level Cached)
// ============================================================================

/**
 * Get all nodes with request-level caching
 * 
 * React cache() ensures this only fetches once per request,
 * even if called multiple times from different components.
 */
export const getNodes = cache(async (): Promise<NodesResponse> => {
  // Check in-memory cache first
  if (isCacheValid()) {
    console.log('[NodeService] ✅ Cache hit! (age:', Math.round((Date.now() - cacheTimestamp) / 1000), 'seconds)')
    return nodesCache!
  }
  
  console.log('[NodeService] 🔄 Cache miss, fetching from Lucid-L2...')
  
  try {
    const client = getLucidL2Client()
    
    // Industry standard: Only fetch what's needed
    // For initial load, fetch a reasonable page size
    // Search/filtering happens via Elasticsearch on-demand
    const { nodes: rawNodes } = await client.getAvailableNodes({
      limit: 100 // Standard page size
    })
    
    // Parse response
    const nodes = parseNodesResponse(rawNodes as RawNodesApiResponse)

    // Deduplicate nodes (take highest version)
    const deduplicated = deduplicateNodes(nodes)
    
    // Transform to our format
    const transformed = transformNodes(deduplicated)
    
    // DEMO: Inject crypto connectors for demo
    const allNodes = [...transformed, ...DEMO_CRYPTO_NODES]
    console.log('[NodeService] 🎲 Added', DEMO_CRYPTO_NODES.length, 'demo crypto connectors')
    
    // Group by category
    const grouped = groupNodes(allNodes)
    
    // Extract categories
    const categories = Object.keys(grouped).sort()
    
    const response: NodesResponse = {
      success: true,
      nodes: allNodes,
      grouped,
      categories,
      count: allNodes.length,
    }
    
    // Cache the successful response
    nodesCache = response
    cacheTimestamp = Date.now()
    console.log('[NodeService] ✅ Cached', response.count, 'nodes for 5 minutes')
    
    return response
  } catch (error: unknown) {
    console.error('[NodeService] Failed to fetch nodes:', error)

    return {
      success: false,
      nodes: [],
      grouped: {},
      categories: [],
      count: 0,
      error: error instanceof Error ? error.message : 'Failed to fetch nodes',
    }
  }
})

/**
 * Get nodes for a specific category
 * 
 * Uses getNodes() internally (benefits from same caching)
 */
export const getNodesByCategory = cache(async (category: string): Promise<NodesResponse> => {
  const allNodes = await getNodes()
  
  if (!allNodes.success) {
    return allNodes
  }
  
  const filtered = allNodes.nodes.filter(node => node.category === category)
  
  return {
    success: true,
    nodes: filtered,
    grouped: { [category]: filtered },
    categories: [category],
    count: filtered.length,
  }
})

/**
 * Search nodes by query
 * 
 * Industry standard: Query Elasticsearch directly for search
 * This gives access to ALL nodes, not just cached ones
 */
export const searchNodes = cache(async (filters: NodeSearchFilters): Promise<NodesResponse> => {
  try {
    const client = getLucidL2Client()
    
    // Query Elasticsearch with search parameters
    const { nodes: rawNodes } = await client.getAvailableNodes({
      search: filters.query,
      category: filters.category,
      limit: 500 // Higher limit for search results
    })
    
    // Parse and transform
    const nodes = parseNodesResponse(rawNodes as RawNodesApiResponse)
    const deduplicated = deduplicateNodes(nodes)
    let transformed = transformNodes(deduplicated)
    
    // DEMO: Add crypto connectors to search results
    transformed = [...transformed, ...DEMO_CRYPTO_NODES]
    
    // Filter by usableAsTool if specified
    if (filters.usableAsTool !== undefined) {
      transformed = transformed.filter(node => node.usableAsTool === filters.usableAsTool)
    }
    
    // Group by category
    const grouped = groupNodes(transformed)
    const categories = Object.keys(grouped).sort()
    
    return {
      success: true,
      nodes: transformed,
      grouped,
      categories,
      count: transformed.length,
    }
  } catch (error: unknown) {
    console.error('[NodeService] Search failed:', error)

    return {
      success: false,
      nodes: [],
      grouped: {},
      categories: [],
      count: 0,
      error: error instanceof Error ? error.message : 'Search failed',
    }
  }
})

/**
 * Get node actions/operations (resources and operations)
 * 
 * Extracts resources and operations from node properties
 * as documented in N8N_NODE_ACTIONS_API_GUIDE.md
 */
export const getNodeActions = cache(async (nodeName: string): Promise<{ success: boolean; resources: NodeResource[]; error?: string }> => {
  try {
    const allNodes = await getNodes()

    if (!allNodes.success) {
      return { success: false, resources: [], error: allNodes.error }
    }

    const node = allNodes.nodes.find(n => n.name === nodeName)

    if (!node || !node.properties) {
      return { success: false, resources: [], error: 'Node not found or has no properties' }
    }

    const resources = extractResourcesAndActions(node)

    return {
      success: true,
      resources,
    }
  } catch (error: unknown) {
    console.error('[NodeService] Failed to get node actions:', error)
    return {
      success: false,
      resources: [],
      error: error instanceof Error ? error.message : 'Failed to get node actions',
    }
  }
})

// ============================================================================
// Helper Functions (Pure - No Caching Needed)
// ============================================================================

/**
 * Parse raw API response into array of nodes
 * Handles various response formats from n8n API
 */
export function parseNodesResponse(rawResponse: RawNodesApiResponse): RawNodeData[] {
  if (!rawResponse) return []

  // Format 2: Direct array
  if (Array.isArray(rawResponse)) {
    return rawResponse
  }

  // Format 1: { nodes: [...], success: true }
  if ('nodes' in rawResponse && Array.isArray(rawResponse.nodes)) {
    return rawResponse.nodes
  }

  // Format 3: { data: [...] }
  if ('data' in rawResponse && Array.isArray(rawResponse.data)) {
    return rawResponse.data
  }

  return []
}

/**
 * Deduplicate nodes with same displayName (prefer defaultVersion)
 * 
 * n8n API returns multiple versions per node (e.g., Airtable v1, Airtable Tool v2.1).
 * We prefer nodes with defaultVersion property as they have the latest structure.
 */
export function deduplicateNodes(nodes: RawNodeData[]): RawNodeData[] {
  const nodeMap = new Map<string, RawNodeData>()

  // Log all Airtable nodes for debugging
  const airtableNodes = nodes.filter(n => n.displayName?.toLowerCase().includes('airtable'))
  if (airtableNodes.length > 0) {
    console.log('[NodeService] 🔍 Found Airtable nodes:', airtableNodes.map(n => ({
      name: n.name,
      displayName: n.displayName,
      version: n.version,
      defaultVersion: n.defaultVersion,
      hasResourceProp: n.properties?.some((p: NodeProperty) => p.name === 'resource'),
    })))
  }

  nodes.forEach(node => {
    // Group by displayName (normalize: remove " Tool" suffix for deduplication)
    // "Airtable Tool" -> "Airtable" so they're compared
    let key = node.displayName || node.name
    key = key.replace(/ Tool$/i, '') // Remove " Tool" suffix
    const existing = nodeMap.get(key)

    if (!existing) {
      nodeMap.set(key, node)
      if (key.toLowerCase().includes('airtable')) {
        console.log(`[NodeService] 📝 First Airtable node: ${node.name} (defaultVersion: ${node.defaultVersion})`)
      }
    } else {
      // Prefer nodes with resource/operation structure (v2+)
      const hasResourceProp = node.properties?.some((p: NodeProperty) => p.name === 'resource')
      const existingHasResourceProp = existing.properties?.some((p: NodeProperty) => p.name === 'resource')

      let shouldReplace = false
      let reason = ''

      // CRITICAL: Prefer nodes with resource property (modern structure)
      if (hasResourceProp && !existingHasResourceProp) {
        shouldReplace = true
        reason = 'current has resource property (v2+ structure)'
      } else if (!hasResourceProp && existingHasResourceProp) {
        // Keep existing with resource property
        shouldReplace = false
      } else {
        // Both have or both lack resource property - use other criteria
        const hasDefaultVersion = node.defaultVersion !== undefined
        const existingHasDefaultVersion = existing.defaultVersion !== undefined

        if (hasDefaultVersion && !existingHasDefaultVersion) {
          shouldReplace = true
          reason = 'current has defaultVersion, existing does not'
        } else if (hasDefaultVersion && existingHasDefaultVersion) {
          // Both have defaultVersion, pick higher one
          if ((node.defaultVersion as number) > (existing.defaultVersion as number)) {
            shouldReplace = true
            reason = `defaultVersion ${node.defaultVersion} > ${existing.defaultVersion}`
          }
        } else if (!hasDefaultVersion && !existingHasDefaultVersion) {
          // Neither has defaultVersion, compare version numbers
          const currentVersion = getNodeVersion(node)
          const existingVersion = getNodeVersion(existing)
          if (currentVersion > existingVersion) {
            shouldReplace = true
            reason = `version ${currentVersion} > ${existingVersion}`
          }
        }
      }

      if (shouldReplace) {
        nodeMap.set(key, node)
        if (key.toLowerCase().includes('airtable')) {
          console.log(`[NodeService] 🔄 Replacing Airtable: ${existing.name} → ${node.name} (${reason})`)
        }
      }
    }
  })

  // Log final selected Airtable node
  const finalAirtable = Array.from(nodeMap.values()).find(n =>
    n.displayName?.toLowerCase().includes('airtable') && !n.displayName?.toLowerCase().includes('trigger')
  )
  if (finalAirtable) {
    console.log('[NodeService] ✅ Final Airtable node selected:', {
      name: finalAirtable.name,
      displayName: finalAirtable.displayName,
      version: finalAirtable.version,
      defaultVersion: finalAirtable.defaultVersion,
      hasResourceProp: finalAirtable.properties?.some((p: NodeProperty) => p.name === 'resource'),
      hasOperationProp: finalAirtable.properties?.some((p: NodeProperty) => p.name === 'operation'),
      firstFewProperties: finalAirtable.properties?.slice(0, 5).map((p: NodeProperty) => p.name),
    })
  }

  return Array.from(nodeMap.values())
}

/**
 * Get numeric version from node (handles arrays)
 */
function getNodeVersion(node: RawNodeData): number {
  if (node.defaultVersion !== undefined) {
    return typeof node.defaultVersion === 'number' ? node.defaultVersion : parseFloat(String(node.defaultVersion))
  }
  if (Array.isArray(node.version)) {
    return Math.max(...node.version)
  }
  return node.version as number || 1
}

/**
 * Transform nodes to our standard format
 */
export function transformNodes(nodes: RawNodeData[]): LucidNode[] {
  return nodes.map(node => ({
    name: node.name,
    displayName: node.displayName,
    description: node.description,
    version: node.version,
    group: node.group || [],
    iconUrl: node.iconUrl || undefined,
    icon: node.icon || undefined,
    category: extractCategory(node),
    subcategories: node.codex?.subcategories || {},
    aliases: node.codex?.alias || [],
    usableAsTool: node.usableAsTool || false,
    docs: node.codex?.resources?.primaryDocumentation?.[0]?.url,
    properties: node.properties || [],
    credentials: node.credentials || [],
    inputs: node.inputs || [],
    outputs: node.outputs || [],
  }))
}

/**
 * Extract category from node
 * 
 * Use group field for top-level categories (Transform, Input, Output, Trigger)
 * Codex categories (Sales, Marketing) are secondary/semantic groupings
 */
function extractCategory(node: RawNodeData): string {
  // Capitalize first letter of group for display
  const group = node.group?.[0];
  if (group) {
    return group.charAt(0).toUpperCase() + group.slice(1);
  }
  
  return (
    node.codex?.categories?.[0] ||
    node.category ||
    'Other'
  )
}

/**
 * Group nodes by category
 */
function groupNodes(nodes: LucidNode[]): Record<string, LucidNode[]> {
  return nodes.reduce((acc, node) => {
    const category = node.category
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(node)
    return acc
  }, {} as Record<string, LucidNode[]>)
}

/**
 * Extract resources and operations from node properties
 * 
 * Implements the extraction logic documented in N8N_NODE_ACTIONS_API_GUIDE.md
 * 
 * Handles two structures:
 * 1. New: resource + operation pairs (e.g., Airtable v2.1, Gmail)
 * 2. Old: operation-only (e.g., older node versions)
 */
function extractResourcesAndActions(node: LucidNode): NodeResource[] {
  if (!node.properties || node.properties.length === 0) {
    return []
  }

  // Find resource property (new structure)
  const resourceProp = node.properties.find(
    (p: NodeProperty) => p.name === 'resource' && p.type === 'options'
  )

  // NEW STRUCTURE: resource + operation pairs
  if (resourceProp && resourceProp.options) {
    console.log('[NodeService] Extracting actions from resource/operation structure for', node.displayName)

    return resourceProp.options.map((resource: NodePropertyOption) => {
      const operationProp = node.properties?.find((p: NodeProperty) =>
        p.name === 'operation' &&
        p.type === 'options' &&
        p.displayOptions?.show?.resource?.includes(resource.value)
      )

      const actions = operationProp?.options || []

      return {
        name: resource.name,
        value: resource.value,
        actions: actions.map((action: NodePropertyOption) => ({
          name: action.name,
          value: action.value,
          action: action.action || `${action.name} ${resource.name}`,
          description: action.description,
        })),
      }
    })
  }

  // OLD STRUCTURE: operation-only (no resources)
  const operationProp = node.properties.find(
    (p: NodeProperty) => p.name === 'operation' && p.type === 'options'
  )

  if (operationProp && operationProp.options) {
    console.log('[NodeService] Extracting actions from operation-only structure for', node.displayName)

    // Return as single resource with all operations
    return [{
      name: 'Operations',
      value: 'default',
      actions: operationProp.options.map((action: NodePropertyOption) => ({
        name: action.name,
        value: action.value,
        action: action.action || action.description || action.name,
        description: action.description,
      })),
    }]
  }

  console.log('[NodeService] No resource or operation structure found for', node.displayName)
  return []
}

// ============================================================================
// Exports
// ============================================================================

export { DEMO_CRYPTO_NODES } // Export for API route

const nodeService = {
  getNodes,
  getNodesByCategory,
  searchNodes,
  getNodeActions,
}

export default nodeService
