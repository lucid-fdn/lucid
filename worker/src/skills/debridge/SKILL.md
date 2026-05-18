---
slug: debridge
name: Cross-Chain Bridge via DeBridge
description: Agent guide for cross-chain token bridging — route selection, fee estimation, transaction execution, and multi-chain funding workflows
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

# Cross-Chain Bridge via DeBridge

You have access to `bridge` for moving tokens between chains via [DeBridge DLN](https://debridge.finance/) (Decentralized Liquidity Network).

## Required Tools

| Tool | Purpose | Signing |
|------|---------|---------|
| `bridge` | Bridge tokens between any supported chains | EVM tx signing (Privy) or Solana tx signing |

**API**: DeBridge DLN (`deswap.debridge.finance/v1.0`) — free, no API key required
**Protocol**: Decentralized Liquidity Network — intent-based cross-chain swaps with guaranteed output
**Supported Chains**: Ethereum, Arbitrum, Polygon, Base, Avalanche, BSC, Optimism, Solana

## How It Works

1. Agent calls `bridge` with source/destination chain, token, and amount
2. DeBridge returns a quote (expected output, fees, estimated time) and transaction data
3. The tool automatically signs and submits the transaction via the agent's wallet
4. Funds arrive on the destination chain (typically 1-5 minutes)

DeBridge uses an **intent-based model**: a solver fulfills the order on the destination chain, then claims the locked funds on the source chain. This means:
- **Guaranteed output amount** (no slippage after quote)
- **No intermediate tokens** or multi-hop risk
- **Fast settlement** (1-5 minutes, varies by chain)

## Tool Usage

### Basic Bridge
```
bridge:
  fromChain: "solana"
  toChain: "arbitrum"
  fromToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"  # USDC on Solana
  toToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"        # USDC on Arbitrum
  amount: "100"
  fromAddress: "<agent solana wallet>"
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `fromChain` | Yes | Source chain (ethereum, arbitrum, polygon, base, solana, etc.) |
| `toChain` | Yes | Destination chain |
| `fromToken` | Yes | Source token address (use full contract address, NOT symbol) |
| `toToken` | No | Destination token address (defaults to same as fromToken) |
| `amount` | Yes | Amount in token units (e.g., "100" for 100 USDC) |
| `fromAddress` | Yes | Sender wallet address |
| `toAddress` | No | Receiver address (defaults to fromAddress — same wallet on destination chain) |

### Important: Use Contract Addresses, Not Symbols

The bridge tool requires **full contract addresses**, not ticker symbols. Common addresses:

| Token | Solana | Arbitrum | Ethereum | Polygon |
|-------|--------|----------|----------|---------|
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |
| Native | `So11111111111111111111111111111111111111112` (wSOL) | `0x0000000000000000000000000000000000000000` (ETH) | `0x0000000000000000000000000000000000000000` (ETH) | `0x0000000000000000000000000000000000000000` (MATIC) |

If you don't know the contract address, use `search_token` to look it up first.

## Common Workflows

### Solana → Hyperliquid (Fund HL Account)
```
1. dex_swap: SOL → USDC on Solana (if needed)
2. bridge: USDC Solana → USDC Arbitrum
3. hl_deposit: USDC Arbitrum → Hyperliquid L1
```

### Hyperliquid → Solana (Withdraw to Solana)
```
1. hl_withdraw: Hyperliquid L1 → USDC Arbitrum
2. bridge: USDC Arbitrum → USDC Solana
3. dex_swap: USDC → SOL on Solana (if needed)
```

### EVM → EVM Bridge
```
bridge:
  fromChain: "ethereum"
  toChain: "arbitrum"
  fromToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
  toToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
  amount: "500"
  fromAddress: "<agent evm wallet>"
```

## Pre-Bridge Checklist

Before every bridge:

1. **Check balance** — Use `wallet_balance` or `get_portfolio` to verify the agent has enough of the source token
2. **Verify addresses** — Use contract addresses, not symbols
3. **Same-chain check** — If source and destination are the same chain, use `dex_swap` instead
4. **Sufficient for fees** — The agent needs native tokens on the source chain for gas (SOL on Solana, ETH on Arbitrum/Ethereum)

## Fees and Timing

- **Protocol fee**: ~0.04% of bridged amount (included in the quote)
- **Gas fee**: Standard gas on the source chain (paid by the agent's wallet)
- **Time**: 1-5 minutes depending on chain finality
  - Solana → EVM: ~2-3 minutes
  - EVM → EVM: ~1-3 minutes
  - EVM → Solana: ~2-5 minutes

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| "Unsupported chain" | Chain not in DeBridge network | Check supported chains list |
| "Source and destination chain are the same" | Same-chain bridge attempt | Use `dex_swap` instead |
| "No bridge route found" | Token pair not bridgeable | Try bridging via USDC (bridge to USDC first, then swap on destination) |
| "DeBridge quote failed" | API error or amount too small | Check minimum amounts, retry |
| "Bridge transaction failed" | Wallet signing or gas issue | Check balance for gas, retry |
| "Unknown EVM chain" | Chain not mapped | Use supported chain names |

## Data Trust Rules

- **Quote output is guaranteed** — DeBridge guarantees the quoted output amount. Do not add extra slippage warnings.
- **Do not estimate bridge time** beyond "a few minutes" — actual time depends on chain congestion
- **Always show the quote** before executing — amount in, expected amount out, fees, estimated time
- **Do not retry failed bridges automatically** — report the error and wait for user decision
