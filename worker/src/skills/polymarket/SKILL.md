---
slug: polymarket
name: Polymarket Trading & Hedge Guide
description: Complete agent guide for Polymarket prediction markets — execution strategies, orderbook analysis, position sizing, P&L math, hedge analysis, coverage math, automation rules, and failure recovery
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

# Polymarket Trading & Hedge Guide

## Required Tools

This skill requires the following tools to be available. If you are running a standalone OpenClaw agent, you must provide implementations for these tools (e.g., via MCP plugins or client tools).

| Tool | Actions | Purpose |
|------|---------|---------|
| `polymarket_trade` | search, market_info, orderbook, buy_yes, buy_no, sell_yes, sell_no, split_and_sell, open_orders, cancel_order, get_positions | Trade on Polymarket CLOB + CTF (Polygon). Requires EIP-712 signing for CLOB auth and an agent wallet for on-chain CTF operations. |
| `lucid_hedge` | analyze_position, analyze_portfolio, suggest_hedge | Read-only hedge analysis — evaluates exposure, computes coverage, suggests strategies. No wallet needed. |
| `polymarket_automation` | list_rules, list_executions, create_rule, update_rule, delete_rule | Rule-based protective alerts (stop-loss, take-profit, trailing-stop, time-exit, portfolio rules). Requires a cron evaluator running every 60s. |

**Contracts (Polygon Mainnet):**
- USDC.e: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- CTF: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`
- CTF Exchange: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`
- Neg Risk CTF Exchange: `0xC5d563A36AE78145C45a50134d48A1215220f80a`
- Neg Risk Adapter: `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296`

**APIs:**
- Gamma REST: `https://gamma-api.polymarket.com` (market data, no auth)
- CLOB REST: `https://clob.polymarket.com` (orders, EIP-712 HMAC auth)

---

You have access to polymarket_trade (10 actions), lucid_hedge (3 actions), and polymarket_automation (5 actions) for trading on Polymarket prediction markets.

## How Polymarket Works

Polymarket uses binary outcome tokens (YES/NO) traded on Polygon. Each market has a condition_id and two token_ids. Prices range 0.00–1.00 and represent the market's implied probability of that outcome.

- YES price + NO price ≈ $1.00 (any deviation = arbitrage opportunity)
- You can buy YES to bet FOR an outcome, or buy NO to bet AGAINST it
- At resolution: winning tokens pay $1.00 each, losing tokens pay $0.00
- Max loss on any position = the amount you paid (no leverage, no liquidation)

### Neg-Risk Markets
Some markets use a neg-risk structure (multiple mutually exclusive outcomes, e.g., "Who wins the election?"). In neg-risk markets:
- Outcomes share a condition — only one can resolve YES
- The neg-risk exchange and adapter handle the token mechanics
- All outcomes' YES prices should sum to ≈ $1.00
- When presenting neg-risk markets, show ALL outcome prices so the user can compare

## Discovery → Execution Workflow

Always follow this sequence — never skip straight to buying:

1. **search** → find markets matching user's thesis (keyword, topic, event)
2. **market_info** → check: is it active? accepting orders? what's the min order size?
3. **orderbook** → assess liquidity: spread, depth, top-of-book size
4. **Execute** → choose strategy based on liquidity (see below)
5. **open_orders** → verify order status after placement
6. **get_positions** → confirm position appears in holdings

## Execution Strategies

### Strategy 1: Limit Order (buy_yes / buy_no with limitPrice)
**When**: Liquid markets (spread < 0.05), patient entries, size > $50
**How**: Set limitPrice at or slightly above best ask (buying) or below best bid (selling)
**Advantage**: Price control, no slippage
**Risk**: May not fill if market moves away

### Strategy 2: FOK Market Order (buy_yes / buy_no without limitPrice)
**When**: Urgent trades, small amounts (< $25), very liquid markets (spread < 0.03)
**How**: Fills immediately at best available price, or cancels entirely (Fill-or-Kill)
**Advantage**: Instant execution
**Risk**: Pays the spread — worse price on wide-spread markets

### Strategy 3: Split and Sell (split_and_sell)
**When**: Thin liquidity (spread > 0.10), large size relative to book depth, guaranteed entry needed
**How**: Deposits USDC into CTF contract → receives equal YES + NO tokens → sells the unwanted side on the orderbook
**Example**: To buy 100 YES tokens at $0.65 market price:
  1. Split $100 USDC → 100 YES + 100 NO tokens (on-chain, ~$0.30 gas)
  2. Sell 100 NO tokens via CLOB at ~$0.31 (10% below $0.35 market) → recover ~$31
  3. Net cost: $100 - $31 = $69 for 100 YES tokens → effective entry: $0.69/token
**Advantage**: Guaranteed position regardless of orderbook depth
**Risk**: Sell-side slippage on the unwanted tokens, gas cost

### How to Choose
| Condition | Strategy |
|-----------|----------|
| Spread < 0.05, size < $50 | FOK market order |
| Spread < 0.05, size > $50 | Limit order |
| Spread 0.05–0.10 | Limit order (aggressive) |
| Spread > 0.10 or depth < order size | split_and_sell |
| User says "I need this position NOW" | FOK (small) or split_and_sell (large) |

## Orderbook Interpretation

When discussing any market, ALWAYS check the orderbook first and report:
- **Spread**: difference between best bid and best ask
- **Top-of-book depth**: how much size at the best price
- **Level count**: how many price levels exist on each side

| Signal | Meaning | Action |
|--------|---------|--------|
| Spread < 0.03 | Tight, liquid | Limit or FOK fine |
| Spread 0.03–0.10 | Moderate | Limit order recommended |
| Spread > 0.10 | Thin, illiquid | split_and_sell or warn user |
| Top size < order amount | Insufficient depth | Expect partial fills or use split_and_sell |
| < 5 levels on either side | Very illiquid | Warn user, consider smaller size |

## Position Sizing Rules

- NEVER risk more than the user specifies — do NOT round up or "optimize"
- "Small bet" or "test position" without amount → suggest $5–$10
- "Go big" or "full conviction" without amount → ASK for a specific USD figure, never assume
- Check minOrderSize from market_info before placing
- Max loss = amount paid. There is no leverage. Explain this to first-time users.

## P&L Calculation (explain to users)

For a position bought via limit/FOK:
- Entry cost = price × quantity
- Current value = current_price × quantity
- P&L = current_value - entry_cost

For a position bought via split_and_sell:
- Entry cost = split_amount - recovered_from_sell
- Effective entry price = entry_cost / token_count
- P&L = (current_price × token_count) - entry_cost

Always show: entry price, current price, P&L ($), P&L (%), quantity held.

## Market Status & Resolution

| Status | Meaning | Can Trade? |
|--------|---------|-----------|
| active | Market is live | Yes |
| closed | Trading halted, awaiting resolution | No |
| resolved | Outcome determined, tokens redeemable | No |

- As resolution date approaches (< 24h), expect wider spreads and lower liquidity
- Markets not accepting orders (acceptingOrders=false) are in settlement
- Resolved markets: winning tokens = $1.00, losing = $0.00

## Failure Recovery

If a trade fails, explain clearly what happened:
- **CLOB order rejected**: "Order was rejected — likely insufficient balance or market closed. Check your balance with get_positions."
- **Split succeeded but CLOB sell failed**: "Your split went through — you now hold both YES and NO tokens. The sell side failed. You can try selling the unwanted side manually with a sell_yes or sell_no order."
- **Insufficient balance**: "Not enough USDC in your wallet. Your current balance is $X."
- **Market closed**: "This market is no longer accepting orders. It may be in settlement."
- Never silently swallow errors — always tell the user what happened and suggest next steps.

## Position Tracking

When position tracking is enabled (get_positions action available):
- Shows outcome token balances, average entry price, current price, and P&L
- Positions are verified against on-chain CTF balances every 5 minutes
- Use this data with lucid_hedge for high-confidence hedge analysis
- If get_positions returns empty but user claims to have positions, explain the 5-min sync delay

## Hedge Analysis

When the user asks about hedging, risk exposure, or portfolio concentration, use the lucid_hedge tool.

### Core Concept: Coverage

Coverage measures how protected a portfolio is against loss:

Coverage = P(target wins) + P(target loses) × P(cover fires | target loses)

Example:
- You hold YES on "Region X captured" @ $0.80 (80% probability of winning)
- You hedge by buying YES on a correlated "Military operation in X" @ $0.15
- If your main bet loses (20% chance), the hedge fires 98% of the time
- Coverage = 0.80 + 0.20 × 0.98 = 99.6%
- Total cost: $0.95, expected return: ~$0.996 → small but near-certain profit

### Coverage Tiers
| Tier | Coverage | Meaning |
|------|----------|---------|
| HIGH | ≥ 95% | Near-arbitrage — strong recommendation |
| GOOD | 90–95% | Solid hedge — worth considering |
| MODERATE | 85–90% | Decent — noticeable residual risk |
| LOW | < 85% | Speculative — mention but don't recommend |

### Single Position Analysis

1. Call lucid_hedge with action "analyze_position" and the conditionId
2. Check the response:
   - **confidence**: "high" (DB positions), "medium" (orderbook data), "low" (open orders only)
   - **positionSource**: tells you where the data came from
3. Present: estimated exposure, current price, break-even probability, hedge cost estimate
4. If recommendation is "hold" or "monitor_only", explain WHY — don't push unnecessary trades

### Confidence Framing
| Confidence | Say | Don't Say |
|-----------|-----|-----------|
| high | "Your position is..." | — |
| medium | "Based on available data, your estimated position is..." | "Your portfolio shows..." |
| low | "Based on limited data (open orders), your estimated known exposure is..." | "Your portfolio exposure is..." |

### Portfolio Analysis

1. Collect all known conditionIds (from conversation, get_positions, or user input)
2. Call lucid_hedge with action "analyze_portfolio" passing all conditionIds
3. Present:
   - **Concentration index** (Herfindahl): 0 = diversified, 1 = single position
   - **Directional bias**: net YES vs NO exposure
   - **Relatedness scores**: how correlated positions are
4. Highlight high-priority recommendations first (highest concentration, most correlated)

### Hedge Execution

1. ALWAYS call lucid_hedge with action "suggest_hedge" BEFORE recommending any trade
2. Review the 6 possible strategies returned:
   - **buy_opposite**: Buy the other side of the same market
   - **split_and_sell**: CTF split to guarantee exit
   - **partial_exit**: Reduce position size
   - **exit**: Close entirely
   - **hold**: No action needed (already well-positioned)
   - **monitor_only**: Watch but don't act yet
3. Present ALL viable options with costs and trade-offs — let the user choose
4. If the user confirms a hedge, use polymarket_trade to execute
5. NEVER auto-execute a hedge trade

### Logical Implication Hedging

The strongest hedges are based on logical necessity between markets:
- "Election held" → "Election called" (definitional necessity)
- "City captured" → "Military operation in city" (physical necessity)
- "Person dies" → "Person was alive" (logical necessity)

When evaluating cross-market hedges, apply the counterexample test:
"Can I imagine a realistic scenario where A happens but B doesn't?"
If yes → NOT a valid hedge (it's just correlation)
If no → valid logical implication → strong hedge candidate

Invalid hedges (correlations, not implications):
- "War started" → "Peace talks failed" (war can start without talks)
- "Sanctions imposed" → "Conflict worsens" (could stabilize instead)
- Political behavior predictions (humans are unpredictable)

## Automation Rules

When automation is enabled, use polymarket_automation to manage protective rules:

| Rule Type | Trigger | Example |
|-----------|---------|---------|
| stop_loss | Price drops to threshold | "Set stop-loss at $0.30" |
| take_profit | Price rises to threshold | "Take profit at $0.85" |
| trailing_stop | Price drops X% from peak | "Trailing stop at 10%" |
| time_exit | Time before market close | "Exit 24 hours before close" |
| portfolio_stop_loss | Portfolio value drops to threshold | "Stop-loss if portfolio drops 20%" |
| portfolio_take_profit | Portfolio value rises to threshold | "Take profit at +50%" |
| concentration_guard | Single position exceeds % of portfolio | "No position > 30% of portfolio" |
| exposure_cap | Total exposure exceeds $ amount | "Cap total exposure at $1000" |

Rules are evaluated every 60 seconds. All rules require owner approval before executing (unless auto_execute mode is enabled).
Use list_rules to show active rules, list_executions for trigger history.

## Critical Rules

- NEVER present hedge analysis as definitive when confidence < "high"
- NEVER auto-execute a hedge — always present options and wait for confirmation
- ALWAYS include warnings and assumptions from the tool response
- If positionSource is "open_orders_proxy", explicitly tell the user: "Fully filled positions may not be reflected in this analysis"
- When total coverage exceeds 95%, mention it's near-arbitrage quality
- When coverage is below 85%, frame it as "speculative" not "recommended"

## Presentation Rules

- Always include the market question in your response (not just the ID)
- Show prices as probabilities: "YES at $0.65 (65% implied probability)"
- When comparing markets, use a table format
- After a trade: include the order ID, amount, price, and position summary
- After placing an order, always check open_orders to confirm status
- When the user asks "what do I have?", use get_positions before answering
