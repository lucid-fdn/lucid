/**
 * hl_place_order, hl_cancel_order — Elevated Hyperliquid perp trading.
 *
 * Implementation: tools/hyperliquid.ts → Hyperliquid REST API (Arbitrum)
 * Stays built-in permanently (requires in-process EIP-712 signing).
 */
export { toolHlPlaceOrder, toolHlCancelOrder } from './hyperliquid.js'
