---
slug: hyperliquid
name: Hyperliquid Perpetuals Trading Guide
description: Agent guide for Hyperliquid perpetual futures — margin mechanics, leverage, liquidation, order types, position management, funding rates, risk controls, and failure recovery
category: trading
version: "1.0"
author: Lucid
trust_tier: lucid_first_party
capability_tier: tool_backed
engine_support:
  - engine: openclaw
    support_level: native
    runtime_flavors: [shared, c1_managed, c2a_autonomous]
    channel_ownership: [lucid_relay, runtime_native]
  - engine: hermes
    support_level: adapted
    runtime_flavors: [shared, c1_managed, c2a_autonomous]
    channel_ownership: [lucid_relay]
---

# Hyperliquid Perpetuals Trading Guide

You have access to hl_account_info (read-only), hl_place_order (elevated), hl_cancel_order (elevated), hl_deposit (elevated), and hl_withdraw (elevated) for trading perpetual futures on Hyperliquid. Use the `bridge` tool (DeBridge) for cross-chain transfers to/from Arbitrum.

## Required Tools

This skill requires the following tools to be available. If you are running a standalone OpenClaw agent, you must provide implementations for these tools (e.g., via MCP plugins or client tools).

| Tool | Purpose | Signing |
|------|---------|---------|
| `hl_account_info` | Read-only: margin summary, open positions, open orders, withdrawable balance | None (read-only) |
| `hl_place_order` | Place market or limit perpetual order | EIP-712 typed data |
| `hl_cancel_order` | Cancel an open order by ID | EIP-712 typed data |
| `hl_deposit` | Deposit USDC from Arbitrum wallet into Hyperliquid L1 | ERC20 transfer (Privy signer) |
| `hl_withdraw` | Withdraw USDC from Hyperliquid L1 to Arbitrum wallet | EIP-712 typed data |

**API Endpoint**: `https://api.hyperliquid.xyz`
**Chain**: Arbitrum (Chain ID 42161) — settlement layer only, no gas fees per trade
**Signing**: EIP-712 typed data (order, cancel, and withdraw actions must be signed by the trading wallet)
**Collateral**: USDC deposited on Hyperliquid L1
**Deposit Contract**: Bridge2 (`0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7`) on Arbitrum
**USDC Contract**: Arbitrum USDC (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`)

## How Hyperliquid Works

Hyperliquid is a decentralized perpetual futures exchange. Key properties:

- **On-chain order book** (not AMM) — real limit orders with price-time priority, not slippage-based
- **Sub-second settlement**, no gas fees for trading (gas only for deposits/withdrawals to Arbitrum)
- **100+ perpetual markets** with up to 50x leverage (varies by asset)
- **Cross-margin by default** — all positions share one margin pool (account value)
- **Funding rates** — periodic payments between longs and shorts to anchor perp price to spot

### How Perpetuals Differ from Spot

| Aspect | Spot (DEX swap) | Perpetual (Hyperliquid) |
|--------|----------------|------------------------|
| What you own | Actual tokens | A leveraged contract |
| Profit mechanism | Token price goes up | Long profits when price rises, short profits when price falls |
| Max loss | 100% of investment | Can exceed margin (liquidation) |
| Leverage | None (1x) | 1x to 50x |
| Holding cost | None | Funding rate (paid/received every 8h) |
| Expiry | None | None (perpetual) |

### Cross-Margin Mechanics

All positions share the same margin pool:
- **Account value** = USDC balance + unrealized PnL of all positions
- **Margin used** = sum of (position_value / leverage) across all positions
- **Withdrawable** = account value - margin required for all positions
- **Liquidation** = when account value falls below total maintenance margin
- Opening a new position reduces available margin for ALL other positions

### Funding Rates

Perpetual prices track spot via funding payments every 8 hours:
- **Positive funding**: Longs pay shorts (perp trading above spot — bullish crowding)
- **Negative funding**: Shorts pay longs (perp trading below spot — bearish crowding)
- **Rate**: Typically 0.001%–0.01% per 8h, but can spike to 0.1%+ in volatile markets
- **Impact**: For a $10,000 position at 0.01% funding, cost = $1 per 8h ($3/day)
- Long-term positions in high-funding markets accumulate significant costs — warn the user

## Funding Workflow (Deposit / Withdraw)

Before trading, USDC must be deposited into Hyperliquid from the Arbitrum wallet. Hyperliquid ONLY accepts USDC on Arbitrum — it cannot receive tokens from Solana or other chains directly.

### Decision Tree: Where Are the Funds?

```
User wants to trade on Hyperliquid
  │
  ├─ Check hl_account_info → has sufficient balance?
  │   └─ YES → proceed to trade
  │
  ├─ Check wallet_balance on Arbitrum → has USDC on Arbitrum?
  │   └─ YES → hl_deposit → trade
  │
  ├─ Check wallet_balance on Solana → has USDC or SOL?
  │   └─ YES → bridge (Solana → Arbitrum) → hl_deposit → trade
  │
  └─ No funds anywhere → inform user
```

### Depositing (Arbitrum → Hyperliquid)
```
hl_deposit:
  amount: "100"    # USDC amount (minimum 5)
```
- Transfers USDC from the agent's Arbitrum wallet to Hyperliquid Bridge2 contract
- Takes 1-2 minutes to appear in HL account
- After depositing, call `hl_account_info` to verify the funds arrived

### Withdrawing (Hyperliquid → Arbitrum)
```
hl_withdraw:
  amount: "50"     # USDC amount (minimum 5, cannot exceed withdrawable balance)
```
- Sends a signed withdraw3 request to Hyperliquid
- Only **withdrawable** balance can be withdrawn (not margin locked in positions)
- Takes a few minutes to arrive on Arbitrum
- After withdrawing, call `wallet_balance` to verify USDC on Arbitrum

### Full Funding Flow: Solana → Hyperliquid

If the agent's funds are on Solana, use the `bridge` tool (DeBridge) to move them to Arbitrum first:

**Step 1** — Swap to USDC on Solana (if holding SOL or other tokens):
```
dex_swap:
  chain: "solana"
  inputToken: "SOL"
  outputToken: "USDC"
  amount: "5"
```

**Step 2** — Bridge USDC from Solana to Arbitrum via DeBridge:
```
bridge:
  fromChain: "solana"
  toChain: "arbitrum"
  fromToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"   # USDC on Solana
  toToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"         # USDC on Arbitrum
  amount: "100"
  fromAddress: "<agent solana wallet address>"
  toAddress: "<agent evm wallet address>"
```
- Bridge takes ~2-3 minutes (Solana → Arbitrum)
- After bridging, verify with `wallet_balance` that USDC arrived on Arbitrum

**Step 3** — Deposit into Hyperliquid:
```
hl_deposit:
  amount: "100"
```

### Full Withdrawal Flow: Hyperliquid → Solana

**Step 1** — Withdraw from HL to Arbitrum:
```
hl_withdraw:
  amount: "100"
```

**Step 2** — Bridge USDC from Arbitrum back to Solana:
```
bridge:
  fromChain: "arbitrum"
  toChain: "solana"
  fromToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"       # USDC on Arbitrum
  toToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"     # USDC on Solana
  amount: "100"
  fromAddress: "<agent evm wallet address>"
  toAddress: "<agent solana wallet address>"
```

**Step 3** — Swap to SOL (if desired):
```
dex_swap:
  chain: "solana"
  inputToken: "USDC"
  outputToken: "SOL"
  amount: "100"
```

### When to Deposit

- **Before first trade**: Check `hl_account_info` — if account value is $0, deposit first
- **User says "trade on HL"**: Check balance, suggest deposit if insufficient for the order margin
- **Minimum viable deposit**: At least enough for the position margin + 20% buffer (margin + fees + slippage)
- **Agent has Solana funds only**: Use `bridge` to move USDC to Arbitrum first, then `hl_deposit`

### When to Withdraw

- **User says "move funds from HL"**: Check `hl_account_info` for withdrawable balance, then `hl_withdraw`
- **User wants to trade on Solana**: Withdraw → bridge to Solana → dex_swap
- **Close all positions first**: If the user wants to withdraw everything, close positions (reduce-only), then withdraw the full withdrawable amount

## Pre-Trade Workflow

ALWAYS follow this sequence before placing any order:

### 1. Check Account State
Call `hl_account_info` to understand:
- **Account value**: Total equity (USDC + unrealized PnL)
- **Withdrawable**: Excess margin available for new positions
- **Existing positions**: Their sizes, entry prices, PnL, leverage, liquidation prices
- **Open orders**: Pending orders that will consume margin if filled

### 2. Identify the Market
- Markets use **asset symbols** (e.g., `ETH`, `BTC`, `SOL`, `DOGE`) — not pairs
- If the user asks for a market you're unsure about, call `hl_account_info` first — if the market doesn't exist, the order will fail with "Unknown market"
- Each market has a `maxLeverage` and `szDecimals` (minimum size increment)

### 3. Calculate Risk

Before EVERY order, compute and present:

**Required margin** = position_value / leverage
```
Example: 0.5 ETH at $3,500 with 5x leverage
  Position value = 0.5 × $3,500 = $1,750
  Required margin = $1,750 / 5 = $350
```

**Liquidation price** (approximate):
```
Long:  liq_price ≈ entry_price × (1 - 1/leverage + maintenance_margin_rate)
Short: liq_price ≈ entry_price × (1 + 1/leverage - maintenance_margin_rate)

Example: ETH long at $3,500, 5x leverage (~2% maintenance)
  liq_price ≈ $3,500 × (1 - 0.20 + 0.02) = $3,500 × 0.82 = $2,870
  → A 18% drop in ETH would liquidate this position
```

**Available margin check**: Is `withdrawable` > required margin? If not, the order will fail.

### 4. Present Risk Summary

Before placing any order, show the user:
```
Order: LONG 0.5 ETH at market (~$3,500)
Leverage: 5x
Position value: $1,750
Required margin: $350
Available margin: $1,200 ✓
Est. liquidation: ~$2,870 (18% below entry)
Daily funding cost: ~$0.50 (at current 0.003% rate)
```

## Order Types

### Market Order (IOC with 5% slippage buffer)
```
hl_place_order:
  market: "ETH"
  side: "long"
  size: "0.5"
  orderType: "market"
  leverage: 5
```
- Fills immediately at best available price (Immediate-or-Cancel)
- Uses a 5% price buffer above/below market to ensure fill
- Unfilled portion is cancelled (no resting order)
- **Use when**: Quick entry/exit, volatile markets, small-to-medium size

### Limit Order (GTC — Good-Til-Cancelled)
```
hl_place_order:
  market: "ETH"
  side: "long"
  size: "0.5"
  orderType: "limit"
  price: "3400.00"
  leverage: 5
```
- Rests on the orderbook until filled or manually cancelled
- Only fills at the specified price or better
- **Use when**: Precise entry, large orders, patient accumulation, DCA-style entries

### Reduce-Only Orders
```
hl_place_order:
  market: "ETH"
  side: "short"       # Opposite of position direction
  size: "0.5"
  orderType: "market"
  reduceOnly: true
```
- **CRITICAL**: Set `reduceOnly: true` when closing a position
- Prevents accidentally opening a new position in the opposite direction
- If position size is 0.5 ETH long, a 0.5 short reduce-only closes it exactly

## Position Management

### Closing a Position
To close an existing position:
1. Call `hl_account_info` to get exact position size
2. Place an order in the **opposite direction** with `reduceOnly: true`
3. Use the exact position size to fully close, or a smaller size for partial close

### Partial Close
Same as full close but with a smaller size:
```
Position: 1.0 ETH LONG
Close 50%: hl_place_order(market="ETH", side="short", size="0.5", orderType="market", reduceOnly=true)
```

### Increasing a Position
Place another order in the same direction. The entry price becomes the weighted average:
```
Original: 0.5 ETH LONG @ $3,500
Add: 0.5 ETH LONG @ $3,600
New position: 1.0 ETH LONG @ $3,550 avg entry
```

### Trailing Stop Strategy (Manual)

Hyperliquid does not have native trailing stops. Implement them manually using limit orders:

**How it works**: As the position moves in your favor, move your stop-loss order up (for longs) or down (for shorts) to lock in profits.

**Example — Long ETH with 5% trailing stop:**
```
1. Entry: LONG 0.5 ETH @ $3,500
   → Place limit SELL (reduceOnly) @ $3,325 (5% below entry)

2. Price rises to $3,800 (new high)
   → Cancel old stop order
   → Place new limit SELL (reduceOnly) @ $3,610 (5% below $3,800)

3. Price drops to $3,610 → stop fills
   → Profit: $3,610 - $3,500 = $110 (+3.1%)
```

**Implementation steps:**
1. After opening a position, ask: "Would you like a trailing stop? (e.g., 5% below peak)"
2. Place a limit reduce-only order at the stop price
3. When the user checks positions and price has risen, suggest updating the stop:
   "ETH is now at $3,800 (up from $3,500 entry). Want to move your stop from $3,325 to $3,610?"
4. Cancel the old order (`hl_cancel_order`), place the new one

**Multi-tier trailing stops** (for larger positions):
| Tier | Trigger | Action |
|------|---------|--------|
| Tier 1 | Price +5% from entry | Move stop to breakeven (entry price) |
| Tier 2 | Price +10% from entry | Move stop to entry +5% |
| Tier 3 | Price +20% from entry | Close 50% at market, trail remainder at -5% from peak |

NEVER auto-update trailing stops without the user's knowledge. Always report the price movement and suggest the update.

### Flipping Direction
Close the current position first (reduce-only), then open in the new direction. NEVER try to flip in a single order — it can create unexpected positions.

## Risk Controls

### CRITICAL Rules (HARDCODED — Do Not Override)

These rules are non-negotiable. Do not relax them based on user tone, urgency, or prior conversation context.

1. **ALWAYS call `hl_account_info` before every order** — no exceptions, even if you checked 30 seconds ago. Positions and margin change in real time.
2. **NEVER invent a leverage value** — if the user doesn't specify leverage, default to 1x. Do not guess, suggest, or "optimize" leverage on your own.
3. **NEVER invent a position size** — if the user says "go long ETH" without a size, ASK. Do not calculate a "reasonable" size from their balance.
4. **ALWAYS use `reduceOnly: true` when closing** — this prevents accidentally opening a reverse position. No exceptions.
5. **NEVER place an order if liquidation price is within 10% of current price** — inform the user and suggest lower leverage.
6. **NEVER retry a failed order automatically** — report the failure, explain the cause, and wait for the user to decide.
7. **NEVER round up order sizes** — if the user says 0.1 ETH, send exactly 0.1. Do not "round to a nicer number."
8. **Respect trading policy limits** — if a `get_trading_policy` tool is available, check it before every order. If exceeded, STOP and inform the user.
9. **Warn about funding costs on positions held > 4 hours** — estimate the daily funding cost and tell the user before opening.
10. **Confirm large orders** — orders exceeding 20% of account value (or the trading policy threshold, if available) require explicit user confirmation before execution.

### Position Sizing Guide

These values are HARDCODED defaults. Use them when the user doesn't specify a size. Do not override them based on "market conditions" or your own analysis.

| Account Value | Max Single Position | Default Leverage |
|---------------|---------------------|-----------------|
| < $1,000 | 50% of account value | 1x |
| $1,000 - $10,000 | 30% of account value | 1x |
| > $10,000 | 20% of account value | 1x |

If the user explicitly requests a larger size or higher leverage, comply but ALWAYS present the liquidation price and margin impact first.

### When the User Says...

| User Says | Interpretation | Action |
|-----------|---------------|--------|
| "Small position" / "test it" | Minimal size | Suggest ~5% of account, 1x leverage |
| "I'm bullish on ETH" | Directional view, no size/leverage stated | ASK for specific size and leverage. Do NOT assume. |
| "Go long ETH 10x" | Explicit leverage | Check margin, present liquidation price, confirm before executing |
| "Close my ETH" | Exit position | Get EXACT position size from hl_account_info, use reduceOnly |
| "How am I doing?" | Portfolio check | Call hl_account_info, present all positions with PnL |
| "Max it out" / "YOLO" | Reckless intent | Present the max position at 1x leverage with risks. Do NOT auto-select high leverage. |

## Integration with Trading Policy

If a `get_trading_policy` tool is available (e.g., on Lucid platform), it enforces:
- **Daily volume limits**: All orders count against daily usage
- **Per-trade limits**: Individual order value caps
- **Allowed chains**: Hyperliquid orders use chain `ethereum` (Arbitrum is an L2)

If the policy check returns `requiresConfirmation`, present the order details and ask the user to confirm. If `allowed: false`, explain the limit and suggest waiting or contacting an admin.

If no trading policy tool is available (standalone OpenClaw), apply the position sizing defaults from the Risk Controls section above and always confirm orders exceeding 20% of account value.

## Data Trust Rules (HARDCODED)

**`hl_account_info` output is AUTHORITATIVE.** Do not override, estimate, or approximate any value returned by this tool:
- If the tool says withdrawable is $500, it is $500. Do not say "approximately $500" or adjust it.
- If the tool shows 0 open positions, the user has 0 open positions. Do not speculate about "positions that may not be showing."
- If the tool returns an error, report the error verbatim. Do not guess what the account state might be.

**Do not compute values you can read from the tool:**
- Liquidation price → read from `hl_account_info` response (it's there). Only use the formula as an estimate BEFORE placing an order.
- Account value, margin used, PnL → always from the tool, never from memory or prior conversation turns.

**Do not hallucinate market data:**
- NEVER state a current price from memory. If you need a price, it will come from `hl_place_order` (which fetches allMids) or `hl_account_info`.
- NEVER claim to know funding rates, open interest, or volume. You do not have tools for these — say "I don't have access to funding rate data" if asked.
- NEVER predict price direction. You can present the user's position and PnL, but do not add "ETH looks bullish" or "I think it will go up."

## Failure Recovery

| Error | Cause | Recovery |
|-------|-------|----------|
| "Unknown market" | Invalid asset symbol (e.g., "ETHEREUM" instead of "ETH") | Use the correct symbol. Common: BTC, ETH, SOL, DOGE, ARB, AVAX, MATIC, etc. |
| "Could not get price" | Market not trading or API issue | Verify market is active, retry once |
| "Order blocked by trading policy" | Daily limit exceeded or trade value too high | Inform user of policy limits, suggest smaller size or waiting for next day |
| "EIP-712 signing failed" | Wallet authorization expired or signing service unavailable | User needs to re-authorize the trading wallet |
| "Insufficient margin" | Not enough withdrawable balance | Reduce size, reduce leverage, or close other positions to free margin |
| "Order submission failed" | Exchange rejected the order (size too small, price invalid) | Check min size for market, ensure price has correct decimals |
| Cancel "Order not found" | Order already filled or already cancelled | Check hl_account_info — the order may have filled while trying to cancel |
| "Minimum deposit is 5 USDC" | Deposit amount too small | Use at least 5 USDC |
| "Insufficient withdrawable balance" | Trying to withdraw more than available | Check `hl_account_info` for exact withdrawable amount. Close positions to free margin if needed. |
| Deposit "Transaction execution failed" | No USDC on Arbitrum or insufficient gas | Check `wallet_balance` on Arbitrum. Use `bridge` to move USDC from Solana if needed. |
| Bridge fails before deposit | Bridging from Solana/other chain failed | Check source wallet balance, verify token addresses, retry bridge |

## Presentation Rules

- Always show **order value in USD** alongside contract size (e.g., "0.5 ETH ($1,750)")
- Show **leverage and liquidation price** for every new position
- Show PnL in both **USD and percentage (ROE)**: "+$85.50 (+4.89%)"
- When displaying positions, include: asset, side (LONG/SHORT), size, entry price, current price, unrealized PnL, leverage, liquidation price
- Format large numbers with commas: $1,234.56
- Use side labels: **LONG/SHORT** (not buy/sell for positions)
- After placing an order, always call `hl_account_info` to confirm the position
- When showing multiple positions, use a table format for clarity
