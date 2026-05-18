# Data Provider Refactor — Moralis/Helius as Internal Providers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Use Moralis (EVM+Solana) and Helius (Solana) as internal data providers behind our existing web3-operator tools. No duplicate tools exposed to agents. All 204 provider endpoints utilized through our clean 12-tool interface + new tools for capabilities we didn't have before.

**Architecture:** web3-operator tools call Moralis/Helius APIs first, fall back to current implementation (Jupiter/DexScreener/RPC). New tools added for capabilities only Moralis/Helius provide. Plugins removed from embedded-skill-loader (not user-facing).

**Constraint:** Do NOT modify openclaw-core. Changes only in web3-operator package + worker.

---

## Current State (confused)

```
Agent sees:
  12 web3-operator tools (built-in, always on)
  + 141 moralis tools (if plugin activated)
  + 63 helius tools (if plugin activated)
  = 216 tools, massive overlap, LLM confused
```

## Target State (clean)

```
Agent sees:
  ~20 web3-operator tools (built-in, always on)
  Each tool internally routes to best provider
  No plugins exposed for data — only for brain analysis (lucid-trade etc.)
```

---

## Tool Mapping: What Uses What

### Existing Tools → Upgrade with Provider Routing

| Tool | Current Source | After: Primary | After: Fallback |
|------|--------------|----------------|-----------------|
| `get_price` | Jupiter (Sol) + DexScreener (EVM) | Moralis `getTokenPrice` / `getMultipleTokenPrices` | Jupiter + DexScreener |
| `search_token` | Jupiter + DexScreener | Moralis `searchTokens` + `getDiscoveryToken` | DexScreener |
| `get_portfolio` | Direct RPC per chain | Moralis `getWalletTokenBalancesPrice` (EVM) / `getPortfolio` (Sol) | RPC fallback |
| `wallet_balance` | Direct RPC | Moralis `getNativeBalance` (EVM) / `balance` (Sol) + Helius `getBalance` | RPC |
| `wallet_history` | Helius parsed txs | Helius `getWalletHistory` + `getWalletTransfers` | Current Helius code |
| `get_quote_0x` | 0x Protocol | Keep as-is (swap routing, not data) | — |
| `risk_check` | Basic custom checks | Moralis `getTokenScore` + `getSnipersByPairAddress` + `reviewContracts` + custom checks | Custom only |
| `portfolio_snapshot` | DB save | Keep as-is (unique, DB persistence) | — |
| `get_pnl` | From snapshots | Moralis `getWalletProfitability` (if available) + snapshot PnL | Snapshot only |

### New Tools → Capabilities We Didn't Have

| New Tool | Source | What It Does |
|----------|--------|-------------|
| `get_token_info` | Moralis `getTokenStats` + `getTokenAnalytics` + `getTokenScore` | Complete token profile: price, volume, holders, security score, analytics — one call |
| `get_trending` | Moralis `getTrendingTokens` + `getTopGainersTokens` + `getTopLosersTokens` | Market movers: trending, top gainers, top losers |
| `get_liquidity` | Moralis `getTokenPairs` + `getPairStats` + `getPairReserves` | DEX liquidity depth per pair — critical for large trades |
| `get_holders` | Moralis `getTokenHolders` + `getTopHolders` (Sol) + `getTokenOwners` | Whale tracking: top holders, concentration, holder history |
| `get_defi_positions` | Moralis `getDefiSummary` + `getDefiPositionsByProtocol` | DeFi portfolio: LP, staking, lending positions across protocols |
| `get_wallet_profile` | Moralis `getWalletInsight` + `getWalletStats` + Helius `getWalletIdentity` | Wallet intelligence: activity metrics, profitability, identity |
| `get_market_data` | Moralis `getTopCryptoCurrenciesByMarketCap` + `getVolumeStatsByChain` | Global market overview: top coins, volume by chain |
| `detect_snipers` | Moralis `getSnipersByPairAddress` | Sniper bot detection on any DEX pair |

### Capabilities Used But Not As Separate Tools

| Moralis/Helius Capability | How We Use It |
|--------------------------|---------------|
| `getHistoricalTokenScore` | Inside `risk_check` — trend of security score |
| `getExperiencedBuyersTokens` | Inside `get_trending` — smart money signal |
| `getBuyingPressureTokens` | Inside `get_trending` — momentum signal |
| `getRisingLiquidityTokens` | Inside `get_trending` — liquidity growth signal |
| `getRiskyBetsTokens` | Inside `risk_check` — flagged tokens |
| `getBlueChipTokens` | Inside `get_trending` — safe picks |
| `getSolidPerformersTokens` | Inside `get_trending` — consistent picks |
| `getTopProfitableWalletPerToken` | Inside `get_holders` — smart money per token |
| `getWalletApprovals` | Inside `risk_check` — unlimited approvals warning |
| `getWalletActiveChains` | Inside `get_wallet_profile` — multi-chain activity |
| `getSwapsByWalletAddress` / `getSwapsByTokenAddress` | Inside `wallet_history` — swap-specific history |
| `getTokenBondingStatus` | Inside `risk_check` — bonding curve rug risk |
| `getNewTokensByExchange` / `getGraduatedTokensByExchange` | Inside `get_trending` — new launches |
| `getAggregatedTokenPairStats` | Inside `get_liquidity` — pair statistics |
| `getTimeSeriesTokenAnalytics` | Inside `get_token_info` — historical analytics |
| `getCandlesticks` / `getPairCandlesticks` | Inside `lucid_think` (brain layer) — OHLCV for TA |
| OHLCV (Moralis) | Replaces exchange adapter dependency in lucid-trade brain |
| ENS/Unstoppable resolution | Inside `get_wallet_profile` |
| `reviewContracts` | Inside `risk_check` — contract audit |
| Helius `parseTransactions` | Inside `wallet_history` — decoded tx details |
| Helius `getPriorityFeeEstimate` | Inside `dex_swap` — optimal gas |
| Helius webhooks (5 tools) | Available but not routed through web3-operator |
| Helius streaming (WebSocket, LaserStream) | Available but not routed through web3-operator |
| NFT tools (28 EVM + 2 Solana) | Not relevant for trading — skip |
| Helius DAS API (9 tools) | Asset metadata — inside `search_token` for Solana |
| Helius transfers (2 tools) | `transferSol`/`transferToken` — our `wallet_transfer` already handles this |
| Helius billing/docs (15 tools) | Not relevant — skip |

---

## Final Tool Surface (agent sees these)

### Read (8 tools)
| Tool | Description |
|------|------------|
| `get_price` | Token price (any chain) |
| `search_token` | Find token by name/symbol/address |
| `get_portfolio` | Full wallet holdings with USD values |
| `wallet_balance` | Native + token balances |
| `wallet_history` | Decoded transaction history |
| `get_token_info` | **NEW** — Complete token profile (price, volume, holders, security, analytics) |
| `get_trending` | **NEW** — Market movers (trending, gainers, losers, smart money signals) |
| `get_market_data` | **NEW** — Global market overview |

### Reason (6 tools)
| Tool | Description |
|------|------------|
| `risk_check` | Token security + sniper detection + contract review + portfolio risk |
| `portfolio_snapshot` | Save current state for PnL tracking |
| `get_pnl` | Profit/loss from snapshots or wallet profitability |
| `get_liquidity` | **NEW** — DEX pair liquidity depth |
| `get_holders` | **NEW** — Whale tracking + holder concentration |
| `get_wallet_profile` | **NEW** — Wallet intelligence (identity, stats, profitability) |

### Reason (DeFi)
| Tool | Description |
|------|------------|
| `get_defi_positions` | **NEW** — LP, staking, lending positions across protocols |

### Act (7 tools — unchanged)
| Tool | Description |
|------|------------|
| `dex_swap` | Execute swap (Jupiter/1inch) |
| `dex_get_quote` | Get swap quote |
| `get_quote_0x` | Get 0x Protocol quote |
| `wallet_transfer` | Transfer tokens |
| `hl_place_order` | Hyperliquid perp order |
| `hl_cancel_order` | Cancel Hyperliquid order |
| `limit_order` / `dca_create` / `stop_loss` / `bridge` | Advanced trading |

### Detect (1 tool)
| Tool | Description |
|------|------------|
| `detect_snipers` | **NEW** — Sniper bot detection on DEX pairs |

**Total: ~22 tools** (was 12, adding 8 new + 2 merged). Clean, no duplicates, all 204 provider endpoints utilized internally.

---

## Implementation Plan

### Task 1: Create provider routing layer
- Create `worker/src/agent/tools/web3-operator/providers/moralis.ts` — thin API client
- Create `worker/src/agent/tools/web3-operator/providers/helius-data.ts` — thin API client
- Pattern: `try moralis → catch → fallback to current`
- Cache: reuse existing `tool-cache.ts` TTLs

### Task 2: Upgrade existing tools
- Update `get_price` → call Moralis first
- Update `search_token` → call Moralis first
- Update `get_portfolio` → call Moralis first
- Update `wallet_balance` → call Moralis/Helius first
- Update `risk_check` → enrich with Moralis token score + snipers + contract review
- Update `get_pnl` → add Moralis wallet profitability option

### Task 3: Add new tools
- `get_token_info` — aggregates token stats + analytics + security
- `get_trending` — trending + gainers + losers + smart money
- `get_liquidity` — pair liquidity + reserves
- `get_holders` — top holders + concentration
- `get_defi_positions` — DeFi portfolio summary
- `get_wallet_profile` — wallet intelligence
- `get_market_data` — global market overview
- `detect_snipers` — sniper detection

### Task 4: Remove plugin exposure
- Remove `lucid-moralis` from `embedded-skill-loader.ts`
- Remove `lucid-helius` from `embedded-skill-loader.ts`
- Remove from `plugin_catalog` table
- Keep MCPGate servers for external users (different audience)

### Task 5: Update skills + documentation
- Update `web3-reader` skill for new tools
- Update `web3-operator` skill for new tools
- Update CLAUDE.md

### Task 6: Register new tools
- Add schemas to `CommandsAllowlist.ts`
- Add dispatch to `BuiltInToolExecutor.ts`
- Add to `@lucid-fdn/web3-operator` exports

---

## What We DON'T Use (intentional)

| Category | Why Skip |
|----------|----------|
| NFTs (30 tools) | Not relevant for trading agents |
| Helius billing/docs (15 tools) | Internal tooling, not agent-facing |
| Helius webhooks (5 tools) | Already configured at infra level |
| Helius streaming (5 tools) | Real-time infra, not per-request tool |
| Helius transfers (2 tools) | Our `wallet_transfer` already handles this |
| ENS resolution (4 tools) | Niche, used inside `get_wallet_profile` only |
| Block/transaction raw data (7 tools) | Low-level, agent doesn't need raw blocks |
| Contract execution (1 tool) | Security risk, don't expose |
| Market Data entities (4 tools) | Company/entity data, not trading |
