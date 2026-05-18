/**
 * hl_place_order, hl_cancel_order, hl_deposit, hl_withdraw — Elevated Hyperliquid tools.
 *
 * Implementation: tools/hyperliquid.ts → Hyperliquid REST API (Arbitrum)
 * Stays built-in permanently (requires in-process EIP-712 signing / Privy tx execution).
 */
export { toolHlPlaceOrder, toolHlCancelOrder, toolHlDeposit, toolHlWithdraw } from '../../skills/hyperliquid/tools/hyperliquid.js'
