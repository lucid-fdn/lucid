/**
 * dex_swap — Elevated DEX swap execution (Privy signing + policy guard).
 *
 * Implementation: tools/dex.ts → services/dex/{jupiter,oneinch}.ts
 * Stays built-in permanently (requires in-process signing context).
 */
export { toolDexSwap } from '../tools/dex.js'
