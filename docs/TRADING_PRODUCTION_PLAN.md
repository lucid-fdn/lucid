# Autonomous Trading System — Production Readiness Plan

> **Goal**: Ship the autonomous trading feature safely to production with industry-standard security, scalability, and observability.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [⚠️ CRITICAL: Privy Wallet Authorization Model](#2--critical-privy-wallet-authorization-model)
3. [The 7 Non-Negotiables (Safety Architecture)](#3-the-7-non-negotiables-safety-architecture)
4. [Product & UX Structure](#4-product--ux-structure)
5. [Phase 0 — Pre-Production Hardening](#5-phase-0--pre-production-hardening)
6. [Phase 1 — Security & Access Control](#6-phase-1--security--access-control)
7. [Phase 2 — Complete Incomplete Implementations](#7-phase-2--complete-incomplete-implementations)
8. [Phase 3 — Observability & Monitoring](#8-phase-3--observability--monitoring)
9. [Phase 4 — Scalability & Performance](#9-phase-4--scalability--performance)
10. [Phase 5 — Testing & QA](#10-phase-5--testing--qa)
11. [Phase 6 — Staged Rollout](#11-phase-6--staged-rollout)
12. [Phase 7 — Post-Launch Operations](#12-phase-7--post-launch-operations)
13. [Risk Matrix](#13-risk-matrix)
14. [Environment Variables Checklist](#14-environment-variables-checklist)
15. [Implementation Priority & Timeline](#15-implementation-priority--timeline)

---

## 1. Executive Summary

The autonomous trading system is architecturally sound — Privy handles key custody, policies are enforced atomically in Postgres, and the worker/API separation keeps signing credentials off the worker. However, several gaps must be closed before production:

- **🚨 Privy auth model is incomplete** — Basic auth (`appId:appSecret`) authenticates the app, but wallets with an owner require an additional `privy-authorization-signature` header produced from a P-256 authorization key. Current code only does Basic auth.
- **Autonomous trading only works for wallets with server authorization key attached** — wallets with `owner_id` + our auth key in `additional_signers`. External wallets (MetaMask, Phantom) cannot be server-signed. Current code doesn't enforce this distinction.
- **Uses `wallet_address` as identifier** instead of `privy_wallet_id` — fragile and not aligned with Privy's canonical identity model.
- **Solana transfers don't work** (builder returns null)
- **Hyperliquid signing isn't wired** (EIP-712 not integrated)
- **Hardcoded prices** (no live oracle)
- **No rate limiting** on trading APIs
- **No circuit breakers** for cascading failures
- **No real-time transaction status tracking** (fire-and-forget after broadcast)
- **No user-facing kill switch** (emergency stop)
- **No replay protection** beyond timestamp window (needs request ID deduplication)
- **Confused-deputy risk** — internal execute API trusts worker-supplied userId/walletAddress without server-side verification

---

## 2. ⚠️ CRITICAL: Privy Wallet Authorization Model

> **This section must be resolved FIRST — it affects every other phase.**

### 2.1 The Problem: Basic Auth Alone Is Insufficient for Owned Wallets

The current `src/lib/session-signers/index.ts` authenticates Privy API calls using **Basic auth** (`appId:appSecret`):

```typescript
// CURRENT (incomplete for wallets with owners)
const authHeader = `Basic ${Buffer.from(`${privyAppId}:${privyAppSecret}`).toString('base64')}`
```

**Basic auth authenticates your app to Privy's API, but wallets with an owner require an additional authorization signature.** Privy wallet actions require a `privy-authorization-signature` header produced from a P-256 authorization key when the wallet has an `owner_id`.

Reference: [Privy Authorization Keys](https://docs.privy.io/controls/authorization-keys/keys/create/key) | [Use Signers](https://docs.privy.io/wallets/using-wallets/signers/use-signers)

### 2.2 Required: Authorization Key Infrastructure

```
┌──────────────────────────────────────────────────────────────┐
│                  One-Time Setup (Per Privy App)               │
│                                                                │
│  1. Generate P-256 key pair:                                  │
│     openssl ecparam -name prime256v1 -genkey -noout -out      │
│       privy-auth-key.pem                                      │
│     openssl ec -in privy-auth-key.pem -pubout -out            │
│       privy-auth-key-pub.pem                                  │
│                                                                │
│  2. Register public key with Privy Dashboard as               │
│     "Authorization Key"                                        │
│                                                                │
│  3. Store private key in:                                     │
│     - Vercel env: PRIVY_AUTHORIZATION_PRIVATE_KEY             │
│     - Worker env: (NOT needed — worker never signs directly)  │
│     - NEVER in source control                                  │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 Required: Wallet Eligibility Enforcement

**Autonomous trading ONLY works for wallets where your server authorization key is attached as a signer.** External wallets (MetaMask, Phantom, Ledger) cannot be server-signed.

> **Important**: Don't key eligibility off a `delegated` boolean. Privy's canonical wallet schema uses `owner_id` and `additional_signers` as the real signals. If a convenience `delegated` flag exists in some SDK objects, treat it as a hint — not the source of truth.

The reliable signal for "can this wallet be traded autonomously?" is:
1. The wallet has an `owner_id` — and that owner is an **authorization key or key quorum your server controls**
2. Your DB policy gates allow it

> `additional_signers` is **not** the canonical "can my server sign?" gate. What matters for `/v1/wallets/{wallet_id}/rpc` is: does the wallet have an `owner_id`, and is that owner an authorization key / key quorum your server controls? Privy's docs state that when `owner_id` is set, wallet actions require authorization signatures from the wallet's owner.
>
> Reference: [Authorization Signatures](https://docs.privy.io/api-reference/authorization-signatures)

> **Defensive approach**: When a wallet is selected/enabled, fetch the wallet from Privy and store the raw ownership fields: `wallet_owner_id`, `wallet_owner_kind` (auth_key | key_quorum | user). Compute `can_autotrade_computed = (wallet_owner_kind IN ('auth_key', 'key_quorum') AND owner is server-controlled)` + store `eligibility_reason`. This way, if Privy changes their SDK schema, you'll detect the mismatch rather than silently breaking eligibility checks.

```typescript
// NEW: eligibility check before enabling autonomous trading
export async function canEnableAutonomousTrading(
  privyWalletId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const privy = getPrivyClient()
  const wallet = await privy.getWallet(privyWalletId)

  // Check 1: wallet must have an owner (required for authorization signatures)
  if (!wallet.owner_id) {
    return {
      allowed: false,
      reason: 'Autonomous trading requires a Privy-managed wallet with an owner/signer attached. External wallets require manual confirmation for each trade.'
    }
  }

  // Check 2: verify the wallet's owner is a server-controlled authorization key or key quorum
  const ownerKind = wallet.owner_kind || 'unknown' // 'auth_key' | 'key_quorum' | 'user'
  const isServerControlled = ['auth_key', 'key_quorum'].includes(ownerKind)

  if (!isServerControlled) {
    return {
      allowed: false,
      reason: `Wallet owner type "${ownerKind}" is not server-controlled. Autonomous trading requires an authorization key or key quorum owner.`
    }
  }

  return { allowed: true }
}
```

**UI enforcement**: `SessionSignerSetup.tsx` must:
- Show **"Enable autonomous trading"** toggle only for wallets where the server auth key is attached
- Show **"Manual confirmation only"** for external/non-signer wallets
- Label wallets clearly as **Embedded** vs **External** in the UI

### 2.4 Required: Use `privy_wallet_id` as Canonical Identifier + Store Ownership Metadata

**Current problem**: The system uses `wallet_address` (e.g., `0xABC...`) as the primary identifier. This is fragile:
- Addresses can collide across chains
- Privy's signing API references wallets by `wallet_id`, not address
- Audit correlation is weaker

**Migration**:

```sql
-- Add privy_wallet_id + ownership metadata to session_signer_permissions
ALTER TABLE session_signer_permissions
  ADD COLUMN privy_wallet_id TEXT,
  ADD COLUMN privy_user_id TEXT,       -- Privy DID for audit correlation
  ADD COLUMN wallet_owner_id TEXT,                   -- raw owner_id from Privy
  ADD COLUMN wallet_owner_kind TEXT CHECK (wallet_owner_kind IN ('auth_key', 'key_quorum', 'user', 'unknown')),
  ADD COLUMN can_autotrade_computed BOOLEAN DEFAULT false,  -- computed: owner is server-controlled
  ADD COLUMN eligibility_reason TEXT,                -- why can/can't autotrade
  ADD COLUMN wallet_type TEXT DEFAULT 'embedded' CHECK (wallet_type IN ('embedded', 'external'));

-- Add privy_wallet_id to trading_transactions
ALTER TABLE trading_transactions
  ADD COLUMN privy_wallet_id TEXT;

-- Create index for lookup by privy_wallet_id
CREATE INDEX idx_ssp_privy_wallet_id ON session_signer_permissions(privy_wallet_id);
```

When a user connects with Privy, persist:
- `privy_user_id` (DID)
- `privy_wallet_id`
- `wallet_owner_id` — raw `owner_id` from Privy
- `wallet_owner_kind` — `auth_key` | `key_quorum` | `user` (type of the owner)
- `can_autotrade_computed` — computed flag: `true` when owner is server-controlled
- `eligibility_reason` — human-readable reason for eligibility/ineligibility

### 2.5 Required: Authorization Signature for Owned Wallets

Keep Basic auth for API authentication, but **add the authorization signature** when the wallet has an owner. Use Privy's canonical signature payload format (or their SDK to generate it) — do NOT invent a custom signing string.

> **SDK note**: `@privy-io/server-auth` is deprecated. Use `@privy-io/node` to avoid future churn.

```typescript
// Use @privy-io/node (NOT @privy-io/server-auth which is deprecated)
// Reference: https://docs.privy.io/controls/authorization-keys/keys/create/key
import { Privy } from '@privy-io/node'

const privy = new Privy({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
  // Register the authorization key for server signing
  authorizationPrivateKey: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!,
})

// Updated signing function
export async function signEVMTransaction(
  userId: string,
  privyWalletId: string, // Changed from walletAddress
  transaction: EVMTransactionRequest
): Promise<{ success: boolean; signedTransaction?: string; error?: string }> {
  // ... permission + eligibility checks (owner_id + our key in additional_signers) ...

  const url = `https://auth.privy.io/api/v1/wallets/${privyWalletId}/rpc`
  const requestBody = JSON.stringify({
    method: 'eth_signTransaction',
    params: { transaction: { /* ... */ } }
  })

  // The @privy-io/node SDK handles authorization signature generation
  // For manual requests, use Basic auth + privy-authorization-signature
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      // Basic auth authenticates the app (required baseline for all wallet endpoints)
      'Authorization': `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64')}`,
      'privy-app-id': process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      // Authorization signature required when wallet has an owner
      // Multi-sig/quorum can mean multiple signatures (comma-separated)
      'privy-authorization-signature': authorizationSignature,
      // Idempotency key for safe retries
      'privy-idempotency-key': `trade-${jobId}-${Date.now()}`,
      'Content-Type': 'application/json',
    },
    body: requestBody
  })
  // ...
}
```

**Key design decisions:**
- Basic auth (`appId:appSecret`) is the baseline for all Privy wallet endpoints — keep it
- `privy-authorization-signature` is required when the wallet has an `owner_id` (i.e., has signers attached)
- Multi-sig/quorum can mean multiple signatures (comma-separated in the header)
- Use `@privy-io/node` SDK to generate the signature when possible (handles format correctly)
- Use `privy-idempotency-key` for safe retries on network failures

### 2.6 Recommended: Key Quorums for High-Value Trades

For trades above a threshold (e.g., $1,000), require **key quorum** approval:
- Small trades: server authorization key alone (1-of-1)
- Large trades: server key + user confirmation (2-of-2 quorum)

Privy explicitly supports key quorums combining authorization key + user IDs.

Reference: [Privy Key Quorums](https://docs.privy.io/controls/key-quorum/overview)

### 2.7 Recommended: Privy Wallet-Level Policies

In addition to your DB-level `TradingPolicyGuard`, register **Privy policies** on wallets:
- Allowed contract addresses (DEX routers only)
- Max transaction value
- Allowed chains

This provides defense-in-depth: even if your app has a bug, Privy rejects unauthorized operations.

Reference: [Privy Policies](https://docs.privy.io/controls/policies/overview)

### 2.8 Confused-Deputy Protection (Critical)

**Current risk**: The internal execute API accepts `userId` and `walletAddress` from the worker request body. A compromised worker could forge these values.

**Fix**: Worker sends ONLY `{ jobId, assistantId, action }`. The internal API must **derive** everything else from trusted DB context:

```typescript
// POST /api/internal/trading/execute
// Worker sends: { jobId, assistantId, transactionRequest }
// Worker does NOT send: userId, walletAddress, privyWalletId, orgId
export async function POST(request: NextRequest) {
  // 1. Verify HMAC + replay protection (see Phase 1)
  // 2. Extract ONLY job context from request
  const { jobId, assistantId, transactionRequest } = body

  // 3. DERIVE user/wallet from DB (don't trust worker)
  const assistant = await getAssistant(assistantId)
  if (!assistant) return error(404, 'Assistant not found')

  const policy = await getTradingPolicy(assistantId)
  if (!policy?.enabled) return error(403, 'Trading not enabled')

  // 4. Get the authorized wallet for this assistant's org/user
  const permission = await getAuthorizedWallet(
    assistant.user_id,
    policy.wallet_id, // privy_wallet_id from policy config
    transactionRequest.chainType
  )
  if (!permission?.enabled || !permission?.can_autotrade_computed) {
    return error(403, 'No server-authorized wallet for this assistant')
  }

  // 5. Now sign using the verified privy_wallet_id
  const result = await executeTransaction(
    permission.privy_wallet_id, // From DB, not from request
    transactionRequest
  )
}
```

---

## 3. The 7 Non-Negotiables (Safety Architecture)

> These are the hard security rules that make prompt injection annoying but mostly harmless — rejected actions instead of lost money.

### Rule 1: Only server-authorized wallets for autonomous trading
External wallets (MetaMask/Phantom/Ledger) = **confirmation-only** (or fully blocked for autonomous mode). Check `owner_id` + `wallet_owner_kind` from Privy — autonomous only when owner is an authorization key or key quorum your server controls. This is the cleanest stance against prompt injection.

### Rule 2: Treat every inbound message as hostile input
Slack, Discord, Web, Telegram — all untrusted text. The agent can *suggest* actions, but it cannot *execute* outside hard gates. **The LLM is never the security boundary — the backend is.**

### Rule 3: Confused-deputy protection
Internal execute API derives `{user_id, org_id, privy_wallet_id, policy_id}` from DB using trusted keys (`assistant_id` / `channel_id`). Never trust worker/agent-supplied identity params.

### Rule 4: Two independent policy gates (defense-in-depth)
1. **Your DB policy guard** — limits, allowlists, daily caps, slippage, confirmations
2. **Privy wallet-level controls** — authorization keys / quorums / policies as the last line

### Rule 5: Key quorum for high-value trades
Small trades = server-authorized (1-of-1). Big trades = server key + user participation (2-of-2 quorum). Privy explicitly supports key quorums combining authorization key + user IDs.

Reference: [Privy Key Quorums](https://docs.privy.io/controls/key-quorum/create)

### Rule 6: Request authentication + replay protection (worker → Next.js API)
HMAC signatures + timestamp window + request-id dedup (Redis). Nobody can replay "execute trade" requests.

### Rule 7: Strict contract allowlists for swaps
Even if the LLM is tricked, it can only call **known router/spender contracts** per chain (plus token allowlist). No arbitrary `to:` addresses for swap operations.

> **Rule of thumb**: Autonomous trading = server-authorized wallet + strict policy gates + contract allowlists + quorum for big trades + backend-derived identity.

---

## 4. Product & UX Structure

### 4.1 Onchain ≠ Trading

**"Onchain" is the capability layer** — read + write primitives (balances/positions, approvals, transfers, swaps, perps, NFT, contract calls). Trading is just one module under that umbrella. The clean UX is: one "Onchain" area with a permissions matrix + per-action confirmations, rather than scattering "Solana tool / EVM tool / Trading tool" as separate plugins.

### 4.2 Three-Section Product Model

#### A) "Wallets & Permissions" (User-Level Settings)
One place to manage:
- Linked wallets labeled **Embedded** vs **External** (clear visual distinction)
- **Autonomous mode** eligibility (server auth key attached only)
- Session signer status, expiry, revoke
- Quorum setup for high-value (optional advanced)

#### B) "Assistant Onchain Policy" (Per-Assistant Configuration)
Per assistant:
- Select wallet (by `privy_wallet_id`, only server-authorized wallets shown for auto mode)
- Enable onchain capabilities toggle + safe defaults
- Onchain permissions matrix (see 4.3)
- Allowed chains (EVM / Solana toggles)
- Allowed assets (token allowlist)
- Limits: max per trade, daily cap, max price impact, slippage
- Confirmation threshold (e.g., "Ask me above $X")

#### C) "Execution & Audit" (System Truth)
- Transaction history (with status polling — pending → confirmed/failed)
- Clear rejection reasons: "policy rejected", "quorum required", "no server signer", "router not allowlisted"
- Global kill switch + per-user emergency stop (admin)

### 4.3 Onchain Capabilities Permission Matrix

One **Onchain** tab with a permissions matrix:

| Capability | Default | Options |
|-----------|---------|---------|
| **Read** (balances, positions) | ✅ On | On / Off |
| **Transfer** (send tokens) | ⚠️ Confirm | Off / Confirm / Auto |
| **Swap/Trade** (DEX) | ⚠️ Confirm | Off / Confirm / Auto |
| **Perps** (Hyperliquid) | ❌ Off | Off / Confirm / Auto |
| **Approve/Allowances** | ⚠️ Confirm | Off / Confirm / Auto |
| **NFT** (mint, transfer) | ❌ Off | Off / Confirm / Auto |
| **Contract Calls** (advanced) | ❌ Off | Off / Confirm |

Plus:
- Wallet selection (embedded vs external)
- Chain toggles (EVM / Solana)
- Limits + allowlists applied globally, then tightened per module

### 4.4 Confirmation UX — Trade Preview Card

For any action above a threshold / new token / new contract, the assistant replies with a **Trade Preview Card**:

```
┌─────────────────────────────────────────────┐
│  🔄 Trade Preview                            │
│                                               │
│  Swap 50 USDC → ~0.33 SOL                   │
│  Chain: Solana  •  Via: Jupiter               │
│                                               │
│  Price Impact: 0.12%  •  Slippage: 0.5%     │
│  Est. Fees: ~$0.01                            │
│                                               │
│  ✅ Policy checks passed                     │
│  ✅ Within daily limit ($450 / $5,000)       │
│                                               │
│  [ Confirm ]  [ Cancel ]                     │
│  [ Always allow USDC↔SOL ] (advanced)        │
└─────────────────────────────────────────────┘
```

For Discord/Slack: interactive buttons. For webchat: Vercel AI SDK UI renders the same card.

### 4.5 Safe-by-Default Onboarding Flow

1. User links wallet → UI labels it **Embedded** vs **External**
2. If external: show **"Manual confirmation only"** (no toggle for autonomous)
3. If embedded + server-authorized: allow **"Enable autonomous onchain actions"**
4. Require before enabling:
   - Set max per-trade + daily cap
   - Choose chains (EVM / Solana)
   - Default allowlist (USDC/ETH/SOL only)
5. Optional: enable quorum for trades above $X

---

## 5. Phase 0 — Pre-Production Hardening

### 5.1 Feature Flag Gate

All trading/onchain features must be behind the existing feature flag system:

```typescript
// src/lib/feature-flags.ts
export const FEATURE_FLAGS = {
  // ...existing flags
  AUTONOMOUS_TRADING: process.env.NEXT_PUBLIC_FF_AUTONOMOUS_TRADING === 'true',
  TRADING_SOLANA: process.env.NEXT_PUBLIC_FF_TRADING_SOLANA === 'true',
  TRADING_HYPERLIQUID: process.env.NEXT_PUBLIC_FF_TRADING_HYPERLIQUID === 'true',
}
```

- Start with `AUTONOMOUS_TRADING = false` in production
- Enable per-org via a `trading_enabled` column on `organizations` table
- Require Pro/Enterprise plan for autonomous trading

### 5.2 Database Migration Audit

**Current**: Migration creates tables + RPC functions inline.

**Action items**:
- [ ] Add explicit indexes on hot query paths:
  - `trading_transactions(user_id, assistant_id, created_at DESC)` — history queries
  - `trading_transactions(status) WHERE status = 'pending'` — partial index for stuck tx monitoring
  - `trading_daily_usage(user_id, assistant_id, usage_date)` — unique constraint already exists via RPC
  - `session_signer_permissions(user_id, wallet_address, chain_type)` — unique constraint for upsert
- [ ] Add `pg_cron` job to archive transactions older than 90 days to `trading_transactions_archive`
- [ ] Add `CHECK` constraints: `value_usd >= 0`, `daily_limit_usd > 0`, `max_trade_value_usd > 0`
- [ ] Verify RLS policies cover all CRUD — currently `trading_policies` uses org-based access but `trading_transactions` uses `user_id = auth.uid()`. Ensure worker service role bypasses RLS correctly.

### 5.3 Environment Variable Validation

Add startup validation in the worker and Next.js app:

```typescript
// worker/src/config.ts — add to existing getConfig()
function validateTradingConfig() {
  const required = [
    'INTERNAL_SERVICE_SECRET',
    'PRIVY_SESSION_SIGNER_KEY_QUORUM_ID',
    'PRIVY_APP_SECRET',
    'NEXT_PUBLIC_PRIVY_APP_ID',
  ]
  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    throw new Error(`Trading config missing: ${missing.join(', ')}`)
  }
}
```

---

## 6. Phase 1 — Security & Access Control

### 6.1 Internal API Authentication (Critical)

**Current**: `INTERNAL_SERVICE_SECRET` header check, falls through in dev mode.

**Improvements**:
- [ ] **Rotate secret on deploy** — generate via `crypto.randomBytes(32).toString('hex')`
- [ ] **Add HMAC request signing** — Worker signs `POST body + timestamp + requestId` with shared secret. API verifies signature + checks timestamp within 60s window.
- [ ] **Add request ID deduplication** — Each request gets a UUID (`X-Request-Id`). Store in Upstash Redis with 60s TTL. Reject duplicates. (Timestamp window alone allows replay within the window.)
- [ ] **IP allowlisting** — If worker runs on Railway/dedicated infra, restrict `/api/internal/*` to worker IP range via middleware or Vercel firewall rules.
- [ ] **Remove dev mode bypass** — Never skip auth, even locally. Use a fixed dev secret in `.env.local`.
- [ ] **Read body once** — `request.text()` is a one-shot stream in Next.js. Cache the raw body before HMAC verification to avoid double-read errors.

```typescript
// Improved internal auth with replay protection
async function verifyInternalAuth(request: NextRequest): Promise<{ valid: boolean; body?: string }> {
  const secret = process.env.INTERNAL_SERVICE_SECRET
  if (!secret) return { valid: false }

  const timestamp = request.headers.get('X-Timestamp')
  const signature = request.headers.get('X-Signature')
  const requestId = request.headers.get('X-Request-Id')
  if (!timestamp || !signature || !requestId) return { valid: false }

  // Reject if older than 60 seconds
  const age = Date.now() - parseInt(timestamp)
  if (isNaN(age) || age > 60_000 || age < -5_000) return { valid: false }

  // Read body ONCE (Next.js streams are one-shot)
  const rawBody = await request.text()

  // HMAC verification (includes requestId to bind signature to request)
  const payload = `${requestId}:${timestamp}:${rawBody}`
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    return { valid: false }
  }

  // Deduplication: reject replayed request IDs
  const redis = Redis.fromEnv()
  const isNew = await redis.set(`reqid:${requestId}`, '1', { nx: true, ex: 60 })
  if (!isNew) return { valid: false } // Replay detected

  return { valid: true, body: rawBody }
}
```

### 6.2 Rate Limiting

Add per-user rate limits on trading endpoints:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/trading/policy` (PUT) | 10 | 1 min |
| `/api/wallet/session-signer/enable` | 5 | 5 min |
| `/api/internal/trading/execute` | 30 | 1 min per user |
| Worker tool calls (dex_swap, wallet_transfer) | 10 | 1 min per assistant |

Implementation: Use Upstash Redis rate limiter (already have Upstash in the stack):

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const tradingLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'trading:execute',
})
```

### 6.3 Session Signer Permission Hardening

- [ ] **Expiry**: Add `expires_at` column to `session_signer_permissions`. Default 30 days. Require re-authorization.
- [ ] **Scope narrowing**: Add `max_value_per_tx` and `allowed_chains` directly to permission (defense in depth beyond policy).
- [ ] **Audit log**: Log every enable/revoke/use to a dedicated `session_signer_audit` table with IP, user agent, and action.
- [ ] **User notification**: Send email/push notification when session signer is enabled or a trade exceeds $50.
- [ ] **Store `privy_wallet_id`**: Use Privy wallet ID (not just address) as canonical identifier for signing + audit correlation.
- [ ] **Store `privy_user_id`**: Store Privy DID for cross-reference.
- [ ] **Store ownership metadata**: Record `wallet_owner_id` (raw), `wallet_owner_kind` (`auth_key` | `key_quorum` | `user`), `can_autotrade_computed` (derived), and `eligibility_reason`. The real gate is whether the wallet's owner is a server-controlled authorization key or key quorum — not `additional_signers` or a `delegated` flag.
- [ ] **Eligibility enforcement**: Only allow autonomous trading for wallets with `can_autotrade_computed = true` (i.e., `wallet_owner_kind IN ('auth_key', 'key_quorum')`). All others get `requires_confirmation = true`.

### 6.4 Policy Guard Hardening

- [ ] **Global kill switch**: Add `trading_global_enabled` setting in a `system_config` table. Check before any trade.
- [ ] **Per-user emergency stop**: Add `trading_suspended` boolean on `profiles` table. Admin can freeze a user's trading.
- [ ] **Cooldown period**: After 3 consecutive failed trades, pause trading for that assistant for 15 minutes.
- [ ] **IP-based anomaly detection**: If trades come from a new worker IP, flag for review.
- [ ] **Confused-deputy protection**: Internal execute API must derive `user_id` and `privy_wallet_id` from DB (via `assistant_id` → `trading_policy` → `wallet`) — never trust these values from the worker request body.
- [ ] **Contract allowlisting**: Only allow transactions to known DEX router contracts per chain. Reject arbitrary `to` addresses for swap operations.

---

## 7. Phase 2 — Complete Incomplete Implementations

### 7.1 Solana Transfer Transactions (P0)

Replace the stub in `worker/src/agent/tools/wallet.ts`:

```typescript
// Use @solana/web3.js v2 (already in the ecosystem)
import { Connection, PublicKey, SystemProgram, Transaction, VersionedTransaction } from '@solana/web3.js'
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token'

async function buildSolanaTransferTransaction(
  from: string, to: string, token: string, amount: string
): Promise<string | null> {
  const connection = new Connection(process.env.SOLANA_RPC_URL!)
  const fromPubkey = new PublicKey(from)
  const toPubkey = new PublicKey(to)

  if (token.toUpperCase() === 'SOL') {
    const lamports = Math.floor(parseFloat(amount) * 1e9)
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey, toPubkey, lamports })
    )
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    tx.feePayer = fromPubkey
    return Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64')
  }

  // SPL token transfer
  const mint = new PublicKey(SOLANA_TOKENS[token.toUpperCase()])
  const fromATA = await getAssociatedTokenAddress(mint, fromPubkey)
  const toATA = await getAssociatedTokenAddress(mint, toPubkey)
  const decimals = await getTokenDecimals(connection, mint) // Query on-chain
  const amountRaw = BigInt(Math.floor(parseFloat(amount) * 10 ** decimals))

  const tx = new Transaction().add(
    createTransferInstruction(fromATA, toATA, fromPubkey, amountRaw)
  )
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
  tx.feePayer = fromPubkey
  return Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64')
}
```

### 7.2 Hyperliquid EIP-712 Signing (P1)

Wire Hyperliquid's typed data signing through the session signer:

1. Add `signTypedData` to `src/lib/session-signers/index.ts` using Privy's `sign_typed_data` API **with authorization signature** (same P-256 key)
2. Build proper EIP-712 domain + types for Hyperliquid actions
3. Submit the signed payload to `api.hyperliquid.xyz/exchange`

### 7.3 Live Price Oracle (P0)

Replace hardcoded prices with a cached price service:

```typescript
// worker/src/services/price/index.ts
export class PriceService {
  private cache = new Map<string, { price: number; timestamp: number }>()
  private TTL = 30_000 // 30 second cache

  async getPrice(token: string, chain: string): Promise<number> {
    const key = `${chain}:${token}`
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.timestamp < this.TTL) return cached.price

    // Primary: CoinGecko API (free tier: 30 req/min)
    // Fallback: Jupiter price API (Solana) or 1inch price (EVM)
    const price = await this.fetchFromCoinGecko(token)
      ?? await this.fetchFromDex(token, chain)
      ?? 0

    this.cache.set(key, { price, timestamp: Date.now() })
    return price
  }
}
```

### 7.4 Token Decimal Resolution (P1)

Replace hardcoded decimals with on-chain queries + cache:

```typescript
// Cache decimals permanently (they never change)
const decimalCache = new Map<string, number>()

async function getTokenDecimals(chainId: string, tokenAddress: string): Promise<number> {
  const key = `${chainId}:${tokenAddress}`
  if (decimalCache.has(key)) return decimalCache.get(key)!

  // ERC20 decimals() call
  const result = await rpcCall(chainId, {
    to: tokenAddress,
    data: '0x313ce567' // decimals() selector
  })
  const decimals = parseInt(result, 16)
  decimalCache.set(key, decimals)
  return decimals
}
```

### 7.5 Privy Server Signing Alignment

Align the session signer service with Privy's **server recipes** rather than rolling custom signing:

- Use `@privy-io/node` SDK (NOT the deprecated `@privy-io/server-auth`)
- Use Privy's `POST /api/v1/wallets/{wallet_id}/rpc` endpoint with `eth_signTransaction` / `eth_sendTransaction` for EVM
- Use Privy's Solana sign+send flow for Solana transactions
- Always use `privy_wallet_id` (not address) in API paths
- Always include `privy-idempotency-key` header for safe retries
- Use the SDK to generate `privy-authorization-signature` (don't roll custom signing format)
- Use decimal/BigInt math for Solana amounts (never floats) — be mindful of blockhash expiry (build → sign → send quickly)
- Add slippage + max price impact checks at execution time (quotes can be stale)
- Allowlist DEX router/spender contract addresses per chain

Reference: [Privy Server Signing Recipes](https://docs.privy.io/recipes/wallets/user-and-server-signers)

---

## 8. Phase 3 — Observability & Monitoring

### 8.1 Sentry Integration

All trading operations must flow through `ErrorService` (already the project pattern):

```typescript
// Add trading-specific Sentry context
ErrorService.captureException(error, {
  severity: 'critical', // Trading errors are always high severity
  context: {
    endpoint: '/api/internal/trading/execute',
    userId, walletAddress, chain, valueUsd,
  },
  tags: {
    layer: 'trading',
    chain_type: chainType,
    tx_type: 'swap',
    dex: 'jupiter',
  },
})
```

### 8.2 Custom Metrics Dashboard

Track in Sentry Performance or a dedicated dashboard:

| Metric | Type | Alert Threshold |
|--------|------|-----------------|
| `trading.tx.submitted` | Counter | — |
| `trading.tx.failed` | Counter | > 5 in 5 min |
| `trading.tx.latency_ms` | Histogram | p95 > 30s |
| `trading.policy.rejected` | Counter | > 20 in 1 min (possible abuse) |
| `trading.daily_volume_usd` | Gauge | > $100k (platform-wide) |
| `trading.session_signer.enabled` | Counter | Spike detection |
| `trading.dex.quote_latency_ms` | Histogram | p95 > 5s |

### 8.3 Transaction Status Tracking (P0)

Current gap: After broadcast, transactions are marked "submitted" but never updated to "confirmed" or "failed".

**Solution**: Add a background job that polls transaction status:

```typescript
// worker/src/jobs/tx-status-poller.ts
// Runs every 30 seconds via cron or BullMQ
async function pollPendingTransactions() {
  const pending = await supabase
    .from('trading_transactions')
    .select('*')
    .in('status', ['pending', 'submitted'])
    .lt('created_at', new Date(Date.now() - 10_000).toISOString()) // > 10s old

  for (const tx of pending) {
    if (tx.chain_type === 'solana') {
      const status = await checkSolanaTransaction(tx.tx_hash)
      // Update to 'confirmed' or 'failed'
    } else {
      const receipt = await checkEVMTransaction(tx.tx_hash, tx.chain_id)
      // Update with block_number, confirmed_at, or error_message
    }
  }

  // Mark transactions older than 30 min without confirmation as 'timeout'
}
```

### 8.4 Alerting

- **PagerDuty/Slack**: Alert on > 3 failed transactions in 5 minutes
- **User notification**: Email digest of daily trading activity
- **Admin dashboard**: Real-time view of all pending/failed transactions across all users

---

## 9. Phase 4 — Scalability & Performance

### 9.1 Connection Pooling

- Worker → Supabase: Use connection pooling via Supabase's PgBouncer (`?pgbouncer=true` on connection string)
- Worker → RPC: Use `@solana/web3.js` connection reuse, EVM providers with `keepalive`

### 9.2 DEX Quote Caching

Current: 5-second in-memory cache per worker instance.

**Improvement**: Use Upstash Redis for shared quote cache across workers:

```typescript
const QUOTE_CACHE_TTL = 10 // 10 seconds
const redis = Redis.fromEnv()

async function getCachedQuote(params: QuoteParams): Promise<SwapQuote> {
  const key = `quote:${params.chain}:${params.inputToken}:${params.outputToken}:${params.amount}`
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached)

  const quote = await dexService.getQuote(params)
  await redis.set(key, JSON.stringify(quote), { ex: QUOTE_CACHE_TTL })
  return quote
}
```

### 9.3 RPC Provider Redundancy

Add fallback RPC providers for each chain:

```typescript
const EVM_RPC_PROVIDERS: Record<string, string[]> = {
  '1': [
    process.env.ETHEREUM_RPC_URL,
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
  ].filter(Boolean),
  // ... same pattern for all chains
}

async function rpcCallWithFallback(chainId: string, payload: object) {
  const providers = EVM_RPC_PROVIDERS[chainId] || []
  for (const url of providers) {
    try {
      const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) })
      if (res.ok) return await res.json()
    } catch { continue }
  }
  throw new Error(`All RPC providers failed for chain ${chainId}`)
}
```

### 9.4 Circuit Breaker

Wrap DEX and RPC calls with a circuit breaker:

```typescript
import CircuitBreaker from 'opossum'

const jupiterBreaker = new CircuitBreaker(jupiterQuote, {
  timeout: 15000,        // 15s timeout
  errorThresholdPercentage: 50,
  resetTimeout: 30000,   // Try again after 30s
  volumeThreshold: 5,    // Min 5 calls before tripping
})

jupiterBreaker.on('open', () => {
  console.warn('[CircuitBreaker] Jupiter API circuit OPEN — falling back')
  ErrorService.captureMessage('Jupiter API circuit breaker opened', { severity: 'warning' })
})
```

---

## 10. Phase 5 — Testing & QA

### 10.1 Unit Tests

| Module | Test Focus |
|--------|------------|
| `TradingPolicyGuard` | Policy validation logic, daily limit edge cases, confirmation thresholds |
| `DexAggregatorService` | Chain routing, quote parsing, error handling |
| Session signer lib | Permission checks, signing flow mocking |
| Price service | Cache behavior, fallback logic |

### 10.2 Integration Tests (Testnet)

- [ ] **EVM swap on Base Sepolia**: USDC → ETH via 1inch testnet
- [ ] **Solana swap on Devnet**: SOL → USDC via Jupiter devnet
- [ ] **EVM transfer on Sepolia**: ETH transfer with session signer
- [ ] **Solana transfer on Devnet**: SOL transfer with session signer
- [ ] **Policy rejection**: Attempt trade exceeding limits → verify rejection
- [ ] **Session signer not enabled**: Attempt trade without permission → verify block
- [ ] **Daily limit exhaustion**: Execute trades until daily limit → verify cutoff

### 10.3 Security Testing

- [ ] **Replay attack**: Replay a signed internal API request → should be rejected (request ID dedup)
- [ ] **Privilege escalation**: Worker attempts to trade for a user without session signer → blocked
- [ ] **Confused-deputy**: Worker sends forged userId/walletAddress → internal API ignores them, derives from DB
- [ ] **SQL injection**: Fuzz all RPC function parameters
- [ ] **Rate limit verification**: Burst 100 trade requests → verify rate limiter kicks in

### 10.4 Load Testing

- [ ] Simulate 50 concurrent swap quotes across 5 chains
- [ ] Simulate 20 concurrent trade executions
- [ ] Verify database handles daily_usage upserts under contention (use `ON CONFLICT` + `pg_advisory_lock`)

---

## 11. Phase 6 — Staged Rollout

### Stage 1: Internal Testing (Week 1)
- Enable for internal team wallets only
- Testnet chains only (Sepolia, Base Sepolia, Solana Devnet)
- Daily limit: $50
- Manual review of all transactions

### Stage 2: Alpha (Week 2-3)
- Enable for 10-20 invited users (Pro plan)
- Mainnet with conservative limits:
  - Max single trade: $100
  - Daily limit: $500
  - Allowed chains: Base, Solana only
  - Allowed tokens: ETH, SOL, USDC only
- Real-time monitoring, manual incident response

### Stage 3: Beta (Week 4-6)
- Open to all Pro/Enterprise users
- Increase limits:
  - Max single trade: $1,000
  - Daily limit: $5,000
  - All supported chains
- Automated alerting, circuit breakers active
- Hyperliquid perps enabled (if EIP-712 signing complete)

### Stage 4: General Availability (Week 7+)
- All plan tiers (with plan-based limits)
- User-configurable limits within plan caps
- Self-serve onchain policy management

---

## 12. Phase 7 — Post-Launch Operations

### 12.1 Runbook

| Scenario | Action |
|----------|--------|
| Mass failed transactions | 1. Check RPC provider status 2. Check Privy API status 3. If widespread, flip global kill switch 4. Notify affected users |
| Suspicious trading pattern | 1. Suspend user's trading 2. Review transaction audit log 3. Contact user if legitimate |
| DEX API outage | Circuit breaker auto-trips. Alert on-call. Trades will fail gracefully with user-friendly error. |
| Privy signing outage | All trades fail at signing step. Monitor Privy status page. No user funds at risk (unsigned txs). |

### 12.2 Compliance Considerations

- [ ] **Transaction reporting**: Export capability for user's tax reporting (CSV with timestamps, amounts, USD values)
- [ ] **Geo-blocking**: Respect jurisdictional restrictions on DEX trading (OFAC, etc.)
- [ ] **Terms of Service**: Update ToS to cover autonomous trading risks, liability limitations
- [ ] **Data retention**: 7-year transaction record retention for financial compliance

### 12.3 Future Enhancements

- **Webhook-based tx confirmation**: Replace tx status polling with Privy webhooks for real-time confirmation/failure events — lower latency, no polling overhead
- **Multi-sig approval for large trades**: Human-in-the-loop for trades above a configurable threshold (e.g., $10k) — require 2-of-3 approval (user + admin + time-lock)
- **Per-token allowlists**: Restrict which tokens agents can trade (not just which router addresses they can call) — prevents agents from buying illiquid/scam tokens even through approved routers
- **Take-profit / Stop-loss**: Policy-level automated exit conditions
- **Portfolio rebalancing**: Scheduled rebalancing based on target allocations
- **MEV protection**: Route EVM transactions through Flashbots Protect or similar
- **Cross-chain bridging**: Integrate bridge aggregators for cross-chain swaps

---

## 13. Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Privy authorization key compromise | Low | Critical | Key rotation procedure, Privy's HSM-backed infrastructure |
| RPC provider returns incorrect data | Low | High | Multi-provider verification for large trades |
| DEX returns manipulated quote | Medium | High | Slippage protection, max price impact check (reject > 5%) |
| User accidentally enables trading for wrong assistant | Medium | Medium | Confirmation dialog, email notification |
| Daily limit bypass via race condition | Low | High | Atomic Postgres function (already implemented via `check_trading_policy` RPC) |
| Worker compromise | Low | Critical | Worker has no signing keys; needs INTERNAL_SERVICE_SECRET + HMAC |
| Confused deputy (worker forges userId) | Medium | Critical | Internal API derives user/wallet from DB, never trusts worker params |
| Non-authorized wallet enabled for autonomous trading | Medium | High | Eligibility check (`owner_id` + `wallet_owner_kind`) blocks non-server-controlled wallets |
| Authorization key compromise | Low | Critical | Rotate key, Privy invalidates old key, all sessions re-auth required |
| Prompt injection triggers trade | Medium | Medium | LLM is not the security boundary; backend policy gates + contract allowlists block unauthorized actions |
| Transaction stuck in "pending" forever | Medium | Medium | TX status poller auto-times-out after 30 min |

---

## 14. Environment Variables Checklist

### Next.js App (Required)
```
INTERNAL_SERVICE_SECRET=          # Shared secret with worker (min 32 chars)
PRIVY_AUTHORIZATION_PRIVATE_KEY=  # P-256 private key PEM for authorization signatures (CRITICAL)
PRIVY_AUTHORIZATION_KEY_ID=       # ID of the registered authorization key in Privy
PRIVY_SESSION_SIGNER_KEY_QUORUM_ID=  # From Privy dashboard (for quorum flows)
PRIVY_APP_SECRET=                 # Privy server secret (for Basic auth API calls)
NEXT_PUBLIC_PRIVY_APP_ID=         # Privy app ID
NEXT_PUBLIC_FF_AUTONOMOUS_TRADING=false  # Feature flag

# RPC URLs (use premium providers in production)
ETHEREUM_RPC_URL=
BASE_RPC_URL=
POLYGON_RPC_URL=
ARBITRUM_RPC_URL=
SOLANA_RPC_URL=
```

### Worker (Required)
```
INTERNAL_SERVICE_SECRET=          # Same as Next.js app
LUCID_APP_URL=                    # Next.js app internal URL
NEXTJS_INTERNAL_URL=              # Alternative to LUCID_APP_URL

# DEX API Keys
ONEINCH_API_KEY=                  # 1inch aggregation API
JUPITER_API_KEY=                  # Jupiter (optional, increases rate limits)
```

### Optional (Recommended for Production)
```
COINGECKO_API_KEY=                # For live price feeds
UPSTASH_REDIS_REST_URL=           # For distributed quote cache + rate limiting + replay protection
UPSTASH_REDIS_REST_TOKEN=
```

---

## 15. Implementation Priority & Timeline

### P0 — Must Have Before Any Production Use (Week 1-2)
1. [ ] **🚨 Generate P-256 authorization key and register with Privy** (make-or-break)
2. [ ] **🚨 Add `privy-authorization-signature` header** to owned wallet signing calls (keep Basic auth + add authorization signature, use `@privy-io/node` SDK)
3. [ ] **🚨 Add `privy-idempotency-key` header** for safe retries
4. [ ] **🚨 Wallet eligibility enforcement** — check `owner_id` + `wallet_owner_kind`, only wallets with server-controlled owner (auth_key / key_quorum) get autonomous mode
5. [ ] **🚨 Add `privy_wallet_id` + `privy_user_id` + `wallet_owner_id` + `wallet_owner_kind` + `can_autotrade_computed` + `eligibility_reason` to DB schema**
6. [ ] **🚨 Confused-deputy fix** — worker sends only `{ jobId, assistantId, action }`, internal API derives identity from DB
7. [ ] **🚨 Migrate from `@privy-io/server-auth` to `@privy-io/node`** (deprecated SDK)
8. [ ] Feature flag gating (`AUTONOMOUS_TRADING`)
9. [ ] Remove dev mode auth bypass in internal API
10. [ ] HMAC request signing + request ID deduplication for internal API
11. [ ] Rate limiting on all trading endpoints (Upstash Redis)
12. [ ] Live price oracle (replace hardcoded prices)
13. [ ] Transaction status polling job
14. [ ] Global kill switch in `system_config` table
15. [ ] Database index optimization
16. [ ] Sentry error tracking on all trading paths
17. [ ] User email notification on session signer enable + large trades

### P1 — Required for Full Feature Set (Week 2-4)
18. [ ] Solana transfer transaction building (@solana/web3.js)
19. [ ] Align signing with Privy server recipes (use `/rpc` endpoint + `@privy-io/node` SDK)
20. [ ] On-chain token decimal resolution
21. [ ] RPC provider fallback chains
22. [ ] Circuit breakers on DEX APIs
23. [ ] Session signer permission expiry (30-day default)
24. [ ] Register Privy wallet-level policies (contract allowlist, max value)
25. [ ] Key quorum setup for high-value trades ($1k+)
26. [ ] DEX router contract allowlisting per chain
27. [ ] Shared quote cache (Redis)
28. [ ] Integration tests on testnets
29. [ ] Admin dashboard for transaction monitoring
30. [ ] Hyperliquid EIP-712 signing via Privy authorization signature
31. [ ] Build Trade Preview Card UI component (confirmation UX)
32. [ ] Implement Onchain capabilities permission matrix (Read/Transfer/Swap/Perps)

### P2 — Polish & Scale (Week 4-6)
33. [ ] Load testing (50 concurrent users)
34. [ ] MEV protection for EVM transactions
35. [ ] Transaction CSV export for tax reporting
36. [ ] Trading activity email digest
37. [ ] Plan-based trading limits (Free: disabled, Pro: $5k/day, Enterprise: custom)
38. [ ] Geo-blocking compliance checks
39. [ ] Safe-by-default onboarding flow (wallet labeling + guided setup)

---

*Last updated: 2026-02-13*
*Author: Cline (automated analysis of commit 7ce367c, refined with dev feedback on Privy wallet authorization model)*