# P1 Implementation Plan — Trading System

## Items to Implement (15 items, grouped by dependency)

### Group A: Worker Infrastructure (no frontend deps)
1. **P1-20** — On-chain token decimal resolution → `worker/src/services/chain/token-decimals.ts`
2. **P1-21** — RPC provider fallback ✅ Already done → `worker/src/services/chain/rpc-fallback.ts`
3. **P1-22** — Circuit breakers on DEX APIs → `worker/src/services/chain/circuit-breaker.ts`
4. **P1-26** — DEX router contract allowlisting → `worker/src/services/chain/contract-allowlist.ts`
5. **P1-27** — Shared quote cache (Redis) → `worker/src/cache/quote-cache.ts`
6. **P1-18** — Solana transfer tx building → update `worker/src/agent/tools/wallet.ts`

### Group B: Privy Integration
7. **P1-19** — Align signing with Privy server recipes → already done in P0 (SDK-based)
8. **P1-24** — Privy wallet-level policies → `src/lib/trading/privy-policies.ts`
9. **P1-25** — Key quorum for high-value trades → `src/lib/trading/key-quorum.ts`
10. **P1-30** — Hyperliquid EIP-712 signing → update `worker/src/agent/tools/hyperliquid.ts`

### Group C: Database Migration
11. **P1-23** — Session signer permission expiry ✅ Already done in P0

### Group D: Frontend Components
12. **P1-31** — Trade Preview Card UI → `src/components/trading/trade-preview-card.tsx`
13. **P1-32** — Onchain capabilities permission matrix → `src/components/trading/onchain-policy-form.tsx`
14. **P1-29** — Admin dashboard for transaction monitoring → `src/app/(app)/[workspace-slug]/settings/trading/`

### Group E: Testing
15. **P1-28** — Integration tests on testnets → `tests/trading/`

## Implementation Order
1. Group A (worker infra) — no deps, can all be done in parallel
2. Group B (Privy) — depends on Group A for contract allowlist
3. Group D (frontend) — depends on Group A+B for data
4. Group E (tests) — depends on everything else

## Files to Create/Modify
- CREATE: `worker/src/services/chain/token-decimals.ts`
- CREATE: `worker/src/services/chain/circuit-breaker.ts`  
- CREATE: `worker/src/services/chain/contract-allowlist.ts`
- CREATE: `worker/src/cache/quote-cache.ts`
- MODIFY: `worker/src/agent/tools/wallet.ts` (Solana transfers)
- MODIFY: `worker/src/services/dex/index.ts` (circuit breaker + cache)
- CREATE: `src/lib/trading/privy-policies.ts`
- CREATE: `src/lib/trading/key-quorum.ts`
- MODIFY: `worker/src/agent/tools/hyperliquid.ts` (EIP-712)
- CREATE: `src/components/trading/trade-preview-card.tsx`
- CREATE: `src/components/trading/onchain-policy-form.tsx`
- CREATE: `src/app/(app)/[workspace-slug]/settings/trading/page.tsx`
- CREATE: `src/app/(app)/[workspace-slug]/settings/trading/trading-admin-client.tsx`
- CREATE: `migrations/072_p1_onchain_capabilities.sql`
- CREATE: `tests/trading/integration.test.ts`
