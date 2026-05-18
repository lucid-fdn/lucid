-- Unified Skills UI: extend plugin_catalog.kind + seed platform tool groups
-- Spec: docs/superpowers/specs/2026-03-25-unified-skills-ui-design.md

-- ---------------------------------------------------------------------------
-- 1. Extend kind CHECK to include 'platform'
-- ---------------------------------------------------------------------------

ALTER TABLE plugin_catalog DROP CONSTRAINT IF EXISTS plugin_catalog_kind_check;
ALTER TABLE plugin_catalog ADD CONSTRAINT plugin_catalog_kind_check
  CHECK (kind IN ('plugin', 'integration', 'platform'));

-- ---------------------------------------------------------------------------
-- 2. Seed platform tool groups (built-in tools visible in UI)
--
-- These rows make built-in tools appear in the unified Skills tab.
-- They are always-on and don't use org_plugin_installations or
-- assistant_plugin_activations. The tool_manifest is a snapshot of
-- CommandsAllowlist.ts schemas (CI test guards against drift).
-- ---------------------------------------------------------------------------

-- Platform Trading: wallet_transfer, dex_swap, hl_place_order, hl_cancel_order, polymarket_trade
INSERT INTO plugin_catalog (
  slug, name, description, version, category, kind, transport, trust_level,
  execution_mode, auth_type, source, verified, is_published, tool_manifest
) VALUES (
  'platform-trading',
  'Trading',
  'Execute trades, transfers, and perpetual orders across chains. Includes wallet transfers (Solana + EVM), DEX swaps (Jupiter + 1inch), Hyperliquid perpetuals, and Polymarket predictions.',
  '1.0.0',
  'trading',
  'platform',
  'embedded',
  'internal',
  'in_process',
  'none',
  'built-in',
  true,
  true,
  '[
    {"name":"wallet_transfer","description":"Transfer tokens to another address. Requires an authorized wallet and trading policy.","parameters":{"type":"object","properties":{"chain":{"type":"string","enum":["solana","ethereum","base","polygon","arbitrum"]},"toAddress":{"type":"string"},"token":{"type":"string"},"amount":{"type":"string"}},"required":["chain","toAddress","token","amount"]}},
    {"name":"dex_swap","description":"Execute a token swap via DEX aggregators (Jupiter for Solana, 1inch for EVM).","parameters":{"type":"object","properties":{"chain":{"type":"string","enum":["solana","ethereum","base","polygon","arbitrum"]},"inputToken":{"type":"string"},"outputToken":{"type":"string"},"amount":{"type":"string"},"slippageBps":{"type":"number"}},"required":["chain","inputToken","outputToken","amount"]}},
    {"name":"hl_place_order","description":"Place a perpetual order on Hyperliquid (up to 50x leverage).","parameters":{"type":"object","properties":{"market":{"type":"string"},"side":{"type":"string","enum":["long","short"]},"size":{"type":"string"},"orderType":{"type":"string","enum":["market","limit"]},"price":{"type":"string"},"reduceOnly":{"type":"boolean"},"leverage":{"type":"number"}},"required":["market","side","size","orderType"]}},
    {"name":"hl_cancel_order","description":"Cancel an open order on Hyperliquid.","parameters":{"type":"object","properties":{"orderId":{"type":"string"},"market":{"type":"string"}},"required":["orderId","market"]}},
    {"name":"polymarket_trade","description":"Trade on Polymarket prediction markets. Search, view orderbooks, buy/sell YES/NO tokens, manage orders.","parameters":{"type":"object","properties":{"action":{"type":"string","enum":["search","market_info","orderbook","buy_yes","buy_no","sell_yes","sell_no","split_and_sell","open_orders","cancel_order"]},"conditionId":{"type":"string"},"question":{"type":"string"},"amount":{"type":"string"},"limitPrice":{"type":"number"},"keepOutcome":{"type":"string","enum":["yes","no"]},"orderId":{"type":"string"}},"required":["action"]}}
  ]'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  version = EXCLUDED.version,
  category = EXCLUDED.category,
  kind = EXCLUDED.kind,
  transport = EXCLUDED.transport,
  trust_level = EXCLUDED.trust_level,
  execution_mode = EXCLUDED.execution_mode,
  auth_type = EXCLUDED.auth_type,
  source = EXCLUDED.source,
  verified = EXCLUDED.verified,
  is_published = EXCLUDED.is_published,
  tool_manifest = EXCLUDED.tool_manifest;

-- Platform Web3 Intelligence: get_price, search_token, get_portfolio, wallet_balance, etc.
INSERT INTO plugin_catalog (
  slug, name, description, version, category, kind, transport, trust_level,
  execution_mode, auth_type, source, verified, is_published, tool_manifest
) VALUES (
  'platform-web3',
  'Web3 Intelligence',
  'Blockchain data and analytics. Token prices, wallet balances, portfolio tracking, risk analysis, whale tracking, DeFi positions, market trends, and sniper detection.',
  '1.0.0',
  'blockchain',
  'platform',
  'embedded',
  'internal',
  'in_process',
  'none',
  'built-in',
  true,
  true,
  '[
    {"name":"get_price","description":"Get current token price, volume, and market data.","parameters":{"type":"object","properties":{"token":{"type":"string"},"chain":{"type":"string"}},"required":["token"]}},
    {"name":"search_token","description":"Search for tokens by name, symbol, or address.","parameters":{"type":"object","properties":{"query":{"type":"string"},"chain":{"type":"string"}},"required":["query"]}},
    {"name":"get_portfolio","description":"Get complete portfolio with balances and USD values across chains.","parameters":{"type":"object","properties":{"address":{"type":"string"},"chain":{"type":"string"}},"required":["address"]}},
    {"name":"wallet_balance","description":"Get current token balances for a wallet address.","parameters":{"type":"object","properties":{"chain":{"type":"string","enum":["all","solana","ethereum","base","polygon","arbitrum"]},"address":{"type":"string"}},"required":["chain","address"]}},
    {"name":"wallet_history","description":"Get transaction history for a wallet.","parameters":{"type":"object","properties":{"address":{"type":"string"},"chain":{"type":"string"},"mode":{"type":"string"}},"required":["address"]}},
    {"name":"risk_check","description":"Assess token risk: security score, liquidity, holder concentration.","parameters":{"type":"object","properties":{"token":{"type":"string"},"chain":{"type":"string"}},"required":["token"]}},
    {"name":"dex_get_quote","description":"Get a swap quote from DEX aggregators.","parameters":{"type":"object","properties":{"chain":{"type":"string"},"inputToken":{"type":"string"},"outputToken":{"type":"string"},"amount":{"type":"string"}},"required":["chain","inputToken","outputToken","amount"]}},
    {"name":"hl_account_info","description":"Get Hyperliquid account state: positions, balances, margin.","parameters":{"type":"object","properties":{"walletAddress":{"type":"string"}},"required":["walletAddress"]}},
    {"name":"get_token_info","description":"Complete token profile: price, volume, security score, analytics, pairs.","parameters":{"type":"object","properties":{"token":{"type":"string"},"chain":{"type":"string"}},"required":["token"]}},
    {"name":"get_trending","description":"Market movers: trending tokens, gainers, losers, smart money signals.","parameters":{"type":"object","properties":{"chain":{"type":"string"},"category":{"type":"string"}}}},
    {"name":"get_liquidity","description":"DEX pair liquidity depth and reserves.","parameters":{"type":"object","properties":{"token":{"type":"string"},"chain":{"type":"string"}},"required":["token"]}},
    {"name":"get_holders","description":"Token holder analysis: whales, concentration, historical count.","parameters":{"type":"object","properties":{"token":{"type":"string"},"chain":{"type":"string"}},"required":["token"]}},
    {"name":"get_defi_positions","description":"DeFi portfolio: LP, staking, lending across protocols.","parameters":{"type":"object","properties":{"address":{"type":"string"},"chain":{"type":"string"}},"required":["address"]}},
    {"name":"get_wallet_profile","description":"Wallet intelligence: activity, profitability, identity, funding source.","parameters":{"type":"object","properties":{"address":{"type":"string"},"chain":{"type":"string"}},"required":["address"]}},
    {"name":"get_market_data","description":"Global market overview: top coins by market cap and volume.","parameters":{"type":"object","properties":{"limit":{"type":"number"}}}},
    {"name":"detect_snipers","description":"Detect sniper bots on a DEX pair.","parameters":{"type":"object","properties":{"pair_address":{"type":"string"},"chain":{"type":"string"}},"required":["pair_address"]}}
  ]'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  version = EXCLUDED.version,
  category = EXCLUDED.category,
  kind = EXCLUDED.kind,
  transport = EXCLUDED.transport,
  trust_level = EXCLUDED.trust_level,
  execution_mode = EXCLUDED.execution_mode,
  auth_type = EXCLUDED.auth_type,
  source = EXCLUDED.source,
  verified = EXCLUDED.verified,
  is_published = EXCLUDED.is_published,
  tool_manifest = EXCLUDED.tool_manifest;

-- Platform Runtime: cron_schedule, cron_list, cron_cancel, sessions_send, sessions_spawn
INSERT INTO plugin_catalog (
  slug, name, description, version, category, kind, transport, trust_level,
  execution_mode, auth_type, source, verified, is_published, tool_manifest
) VALUES (
  'platform-runtime',
  'Agent Runtime',
  'Agent infrastructure primitives. Schedule recurring tasks, send messages to other agents, and spawn focused sub-agents for parallel work.',
  '1.0.0',
  'orchestration',
  'platform',
  'embedded',
  'internal',
  'in_process',
  'none',
  'built-in',
  true,
  true,
  '[
    {"name":"cron_schedule","description":"Schedule a recurring or one-shot task for the agent.","parameters":{"type":"object","properties":{"name":{"type":"string"},"task_prompt":{"type":"string"},"cron_expression":{"type":"string"},"run_at":{"type":"string"},"timezone":{"type":"string"}},"required":["name","task_prompt"]}},
    {"name":"cron_list","description":"List scheduled tasks for this agent.","parameters":{"type":"object","properties":{"status":{"type":"string"},"limit":{"type":"number"}}}},
    {"name":"cron_cancel","description":"Cancel a scheduled task by ID.","parameters":{"type":"object","properties":{"task_id":{"type":"string"}},"required":["task_id"]}},
    {"name":"sessions_send","description":"Send a message to another agent in the organization.","parameters":{"type":"object","properties":{"target_assistant_id":{"type":"string"},"message":{"type":"string"}},"required":["target_assistant_id","message"]}},
    {"name":"sessions_spawn","description":"Spawn a focused sub-agent for parallel or delegated work.","parameters":{"type":"object","properties":{"task":{"type":"string"},"maxToolCalls":{"type":"number"},"maxWallTimeMs":{"type":"number"}},"required":["task"]}}
  ]'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  version = EXCLUDED.version,
  category = EXCLUDED.category,
  kind = EXCLUDED.kind,
  transport = EXCLUDED.transport,
  trust_level = EXCLUDED.trust_level,
  execution_mode = EXCLUDED.execution_mode,
  auth_type = EXCLUDED.auth_type,
  source = EXCLUDED.source,
  verified = EXCLUDED.verified,
  is_published = EXCLUDED.is_published,
  tool_manifest = EXCLUDED.tool_manifest;

-- Platform Native: web_search, web_fetch, image, pdf (OpenClaw native tools)
INSERT INTO plugin_catalog (
  slug, name, description, version, category, kind, transport, trust_level,
  execution_mode, auth_type, source, verified, is_published, tool_manifest
) VALUES (
  'platform-native',
  'Web & Media',
  'Search the web, fetch and parse URLs, analyze images, and read PDFs. Powered by the agent runtime.',
  '1.0.0',
  'general',
  'platform',
  'embedded',
  'internal',
  'in_process',
  'none',
  'built-in',
  true,
  true,
  '[
    {"name":"web_search","description":"Search the web for current information.","parameters":{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}},
    {"name":"web_fetch","description":"Fetch and parse a URL (HTML, JSON, text) with SSRF protection.","parameters":{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}},
    {"name":"image","description":"Analyze images using vision models.","parameters":{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}},
    {"name":"pdf","description":"Analyze PDF documents using vision models.","parameters":{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}}
  ]'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  version = EXCLUDED.version,
  category = EXCLUDED.category,
  kind = EXCLUDED.kind,
  transport = EXCLUDED.transport,
  trust_level = EXCLUDED.trust_level,
  execution_mode = EXCLUDED.execution_mode,
  auth_type = EXCLUDED.auth_type,
  source = EXCLUDED.source,
  verified = EXCLUDED.verified,
  is_published = EXCLUDED.is_published,
  tool_manifest = EXCLUDED.tool_manifest;
