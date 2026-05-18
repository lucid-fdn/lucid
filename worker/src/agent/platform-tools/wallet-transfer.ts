/**
 * wallet_transfer — Elevated token transfer (Privy signing + policy guard).
 *
 * Implementation: tools/wallet.ts → services/chain/rpc-fallback.ts
 * Stays built-in permanently (requires in-process signing context).
 */
export { toolWalletTransfer } from '../tools/wallet.js'
