# LucidGateway Feature Gating Plan

## Overview

This document defines the 3-tier feature gating strategy for LucidGateway (LiteLLM Proxy) features across **Free**, **Pro**, and **Enterprise** plans.

**Philosophy**: Don't gate everything — gate what creates value differentiation. Free users should have a useful product that naturally leads to upgrade needs as they scale.

---

## Part 1: Settings Modal Error Fix

### Problem
Two settings surfaces exist:
1. **Old page route**: `/(app)/[workspace-slug]/settings/gateway/page.tsx` — server component with `FeatureStatePanel` gating
2. **Settings modal**: `settings-content.tsx` → `gateway-keys-settings.tsx` → `GatewayKeysClient` — client-only, no gating

The modal route **crashes** because:
- The `gateway-keys-settings.tsx` wrapper only checks `workspace?.org?.id` but doesn't gate by plan/role
- The old page uses `getWorkspaceCapabilities()` (server-side) + `FeatureStatePanel` for proper gating
- The modal skips all capability checks and renders `GatewayKeysClient` directly

### Fix Strategy
- **Remove the old `/settings/gateway/page.tsx` route** — it's unused now that the modal is the primary surface
- **Add client-side capability gating** in `gateway-keys-settings.tsx` using `useSubscription()` and `workspace.role`
- The modal should show an upgrade CTA for Free users, not crash

---

## Part 2: Complete LiteLLM Proxy Feature Inventory

Based on the Lucid-L2 `proxyService.ts` and LiteLLM documentation:

### A. Key Management
| Feature | Description |
|---------|-------------|
| Virtual key generation | Create API keys with aliases |
| Key rotation | Replace old key → new key atomically |
| Key revocation | Permanently deactivate keys |
| Key info/listing | View all keys and their metadata |
| Per-key model restrictions | Limit which models a key can access |
| Per-key RPM limits | Requests per minute cap |
| Per-key TPM limits | Tokens per minute cap |
| Per-key budget | Max spend per duration (daily/weekly/monthly) |
| Key expiration | Auto-expire keys after duration |
| Key metadata/tags | Custom metadata on keys for tracking |

### B. Budget & Spend
| Feature | Description |
|---------|-------------|
| Per-key budget | Budget limit per virtual key |
| Budget duration | Time window (1h, 1d, 1mo) |
| Budget alerts | Warning/critical threshold notifications |
| Spend logs | Detailed per-request cost tracking |
| Spend by tags | Aggregate spend by custom tags |
| Org-level budget | Total org spend cap |

### C. Model Access
| Feature | Description |
|---------|-------------|
| 100+ models | Access to all available LLM models |
| Model fallbacks | Auto-fallback to alternative model on failure |
| Model aliases | Custom names for model endpoints |
| Load balancing | Distribute across model deployments |

### D. Team Management
| Feature | Description |
|---------|-------------|
| Team creation | Organize keys into teams |
| Team budgets | Budget caps per team |
| Team model access | Restrict models per team |
| Team rate limits | RPM/TPM per team |

### E. Advanced Features
| Feature | Description |
|---------|-------------|
| Key templates | Save/load common key configurations |
| Per-project keys | Scope keys to specific projects |
| Auto-rotation policy | Automatic key rotation on schedule |
| Audit timeline | Full event history for compliance |
| Guardrails | Content moderation, PII masking |
| Response caching | Redis/in-memory response cache |
| Custom callbacks | Webhook on spend/error events |
| Semantic caching | Cache by meaning, not exact match |

---

## Part 3: 3-Tier Feature Gating Matrix

### Design Principles

1. **Free tier is generous** — users can build real things and hit natural limits
2. **Pro unlocks scale + control** — higher limits, budget tracking, key management
3. **Enterprise unlocks governance** — audit, guardrails, compliance, SSO

### The Matrix

| Feature | Free | Pro ($29/mo) | Enterprise (custom) |
|---------|------|-------------|-------------------|
| **AI Chat** | ✅ | ✅ | ✅ |
| **Model access** | 20 models (GPT-4o-mini, Claude Haiku, Gemini Flash, etc.) | All 100+ models | All 100+ models + custom deployments |
| **Requests/month** | 1,000 | 50,000 | Unlimited |
| **Tokens/month** | 500K | 25M | Unlimited |
| **RPM per key** | 10 RPM (system-enforced) | Custom RPM (up to 1,000) | Custom RPM (unlimited) |
| **TPM per key** | 5,000 TPM | Custom TPM (up to 500K) | Custom TPM (unlimited) |
| | | | |
| **Virtual Keys** | 1 key (auto-generated, non-configurable) | Up to 25 keys | Unlimited keys |
| **Key configuration** | ❌ (system defaults) | ✅ Custom limits, model restrictions | ✅ Full configuration |
| **Key rotation** | ❌ | ✅ Manual rotation | ✅ Manual + auto-rotation policies |
| **Key revocation** | ❌ | ✅ | ✅ |
| **Key templates** | ❌ | ✅ Up to 10 templates | ✅ Unlimited |
| **Per-project keys** | ❌ | ✅ | ✅ |
| | | | |
| **Budget tracking** | View-only (total spend) | ✅ Per-key budgets + alerts | ✅ Per-key + per-team + org-level |
| **Budget alerts** | ❌ | ✅ Warning threshold | ✅ Warning + critical + webhook |
| **Spend analytics** | Basic (total this month) | ✅ By key, by model, by day | ✅ By key/model/day/team/tag + export |
| **Spend tags** | ❌ | ❌ | ✅ Custom tags for cost allocation |
| | | | |
| **Team management** | ❌ | ❌ | ✅ Teams with budgets/limits |
| **Audit timeline** | ❌ | ✅ 30-day retention | ✅ 1-year retention + export |
| **Auto-rotation** | ❌ | ❌ | ✅ Scheduled rotation policies |
| **Guardrails** | ❌ | ❌ | ✅ Content moderation, PII masking |
| **Response caching** | ❌ | ✅ Basic (in-memory) | ✅ Redis + semantic caching |
| **Model fallbacks** | ❌ (single model) | ✅ Automatic fallback | ✅ Custom fallback chains |
| **Custom callbacks** | ❌ | ❌ | ✅ Webhooks on events |
| **SSO/SAML** | ❌ | ❌ | ✅ |

---

## Part 4: Where to Gate (Implementation Plan)

> **✅ IMPLEMENTED** — All gateway feature gating uses the **centralized access control system** as a single source of truth. See below for the actual implementation.

### Layer 1: Centralized Plan Limits (`@/lib/access-control/types.ts`)

Gateway features are defined in the shared `PlanLimits` interface and `PLAN_LIMITS` constant, consumed by both client and server:

```typescript
// src/lib/access-control/types.ts — Single source of truth
interface PlanLimits {
  // ... existing fields (maxMembers, apiAccess, etc.)

  // Gateway Keys (8 fields)
  gatewayKeysEnabled: boolean      // Can user see gateway UI at all
  maxGatewayKeys: number           // Free: 1, Pro: 25, Enterprise: Infinity
  gatewayKeyCustomLimits: boolean  // Can configure RPM/TPM/models
  gatewayKeyBudgets: boolean       // Per-key budget tracking
  gatewayKeyRotation: boolean      // Auto-rotation policies
  gatewayKeyAudit: boolean         // Audit timeline access
  gatewayKeyTemplates: boolean     // Key configuration templates
  gatewayMaxModels: number         // Free: 20, Pro+: Infinity
}

export const PLAN_LIMITS: Record<WorkspacePlan, PlanLimits> = {
  free: {
    gatewayKeysEnabled: true,       // Can view auto-generated key
    maxGatewayKeys: 1,
    gatewayKeyCustomLimits: false,  // Read-only
    gatewayKeyBudgets: false,
    gatewayKeyRotation: false,
    gatewayKeyAudit: false,
    gatewayKeyTemplates: false,
    gatewayMaxModels: 20,
  },
  pro: {
    gatewayKeysEnabled: true,
    maxGatewayKeys: 25,
    gatewayKeyCustomLimits: true,   // Full configuration
    gatewayKeyBudgets: true,
    gatewayKeyRotation: false,      // Pro doesn't get auto-rotation
    gatewayKeyAudit: true,          // 30-day retention
    gatewayKeyTemplates: true,
    gatewayMaxModels: Infinity,
  },
  enterprise: {
    gatewayKeysEnabled: true,
    maxGatewayKeys: Infinity,
    gatewayKeyCustomLimits: true,
    gatewayKeyBudgets: true,
    gatewayKeyRotation: true,       // Auto-rotation policies
    gatewayKeyAudit: true,          // 1-year retention
    gatewayKeyTemplates: true,
    gatewayMaxModels: Infinity,
  },
}
```

**Architecture:**
```
@/lib/access-control/types.ts  ← Single source of truth (plans, roles, limits)
    ├── Client: @/lib/access-control/hooks.ts  (useFeature, usePermission, etc.)
    ├── Client: @/components/access-control/   (FeatureGate, UpgradeCard)
    └── Server: @/lib/workspace/capabilities.ts (getWorkspaceCapabilities)
```

### Layer 2: API Enforcement (in API routes)

Check plan limits before executing operations using centralized `PLAN_LIMITS`:

```typescript
// In POST /api/orgs/[id]/lucidgateway-keys
import { PLAN_LIMITS } from '@/lib/access-control/types'

const capabilities = await getWorkspaceCapabilities(userId, orgId)
const existingKeys = await getOrgGatewayKeys(orgId)

if (existingKeys.length >= capabilities.limits.maxGatewayKeys) {
  return NextResponse.json(
    { error: 'Key limit reached', upgrade: true, currentPlan: capabilities.planName },
    { status: 403 }
  )
}

if (!capabilities.limits.gatewayKeyCustomLimits) {
  return NextResponse.json(
    { error: 'Custom key configuration requires Pro plan', upgrade: true },
    { status: 403 }
  )
}
```

### Layer 3: UI Gating (in components) — ✅ IMPLEMENTED

Uses the centralized access-control hooks and components:

**Settings Modal (`gateway-keys-settings.tsx`):**
```typescript
import { useFeature, useWorkspaceRole } from '@/lib/access-control/hooks'
import { UpgradeCard } from '@/components/access-control'

export function GatewayKeysSettings() {
  const { role } = useWorkspaceRole()
  const isAdmin = role === 'owner' || role === 'admin'
  const canCustomize = useFeature('gatewayKeyCustomLimits')

  if (!isAdmin) return <AdminAccessRequired />
  if (!canCustomize) return (
    <UpgradeCard
      feature="Gateway Keys"
      requiredPlan="pro"
      benefits={['Up to 25 custom API keys', 'Custom rate limits', ...]}
    />
  )
  return <GatewayKeysClient orgId={workspace.org.id} />
}
```

**Available UI components:**

| Component | Path | Purpose |
|-----------|------|---------|
| `FeatureGate` | `@/components/access-control/feature-gate.tsx` | Declarative permission + plan gate |
| `UpgradeCard` | `@/components/access-control/upgrade-card.tsx` | Upgrade CTA with benefits list |
| `UpgradeBadge` | `@/components/access-control/upgrade-badge.tsx` | Inline "Pro" badge |

**Available hooks:**

| Hook | Path | Purpose |
|------|------|---------|
| `useFeature(key)` | `@/lib/access-control/hooks.ts` | Check boolean plan feature |
| `usePermission(key)` | `@/lib/access-control/hooks.ts` | Check role permission |
| `useWorkspacePlan()` | `@/lib/access-control/hooks.ts` | Get plan + limits |
| `useWorkspaceRole()` | `@/lib/access-control/hooks.ts` | Get role + permissions |
| `useLimit(key, usage)` | `@/lib/access-control/hooks.ts` | Check numeric limit |
| `useCanPerformAction()` | `@/lib/access-control/hooks.ts` | Combined role + plan check |

**FeatureState system (server-side):**

| State | When | UI |
|-------|------|-----|
| `hidden` | Feature not relevant to plan | Don't render |
| `discoverable` | Feature exists on higher plan | Show teaser + upgrade CTA |
| `setup-required` | Feature available but not configured | Show setup wizard |
| `active` | Full access | Normal UI |
| `attention` | Errors or limits approaching | Warning badges |

### Layer 4: LiteLLM Proxy Enforcement

Set limits directly on the LiteLLM proxy when generating keys:

```typescript
// Free tier: System-enforced limits
await proxyService.generateKey({
  key_alias: 'auto-generated-free-key',
  rpm_limit: 10,
  tpm_limit: 5000,
  max_budget: 5.00,        // $5/month hard cap
  budget_duration: '1mo',
  models: FREE_TIER_MODELS, // Subset of 20 models
})

// Pro tier: User-configurable within plan limits
await proxyService.generateKey({
  key_alias: userAlias,
  rpm_limit: Math.min(userRpm, 1000),  // Cap at plan max
  tpm_limit: Math.min(userTpm, 500000),
  max_budget: userBudget,              // User-set, no cap
  models: userModels,                   // All models available
})
```

---

## Part 5: UI Changes Needed

### Free Tier Gateway Tab (in settings modal)
- Show a single read-only card with the auto-generated key
- Show basic spend (total this month)
- Show "Upgrade to Pro" CTA for key management, budgets, analytics
- No create/rotate/revoke buttons

### Pro Tier Gateway Tab
- Full key CRUD (create, rotate, revoke)
- Key templates (up to 10)
- Per-key budget configuration
- Spend analytics by key/model/day
- 30-day audit timeline
- Model fallback configuration
- Response caching toggle

### Enterprise Tier Gateway Tab
- Everything Pro has, plus:
- Team management section
- Auto-rotation policy configuration
- Guardrails configuration
- Spend tags
- Custom callbacks/webhooks
- Full audit with export

---

## Part 6: Free Tier Model Whitelist

Recommended 20 models for Free tier (cost-efficient, capable):

```typescript
const FREE_TIER_MODELS = [
  // OpenAI
  'gpt-4o-mini',
  'gpt-3.5-turbo',
  
  // Anthropic
  'claude-3-5-haiku-latest',
  
  // Google
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  
  // Meta (via providers)
  'llama-3.1-8b',
  'llama-3.1-70b',
  
  // Mistral
  'mistral-small-latest',
  'mistral-nemo',
  
  // Cohere
  'command-r',
  
  // Open source via Groq/Together
  'groq/llama-3.1-8b-instant',
  'groq/mixtral-8x7b-32768',
  'together/meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  
  // Embedding models
  'text-embedding-3-small',
  'text-embedding-ada-002',
  
  // Cheap/fast options
  'deepseek-chat',
  'qwen-turbo',
  'yi-lightning',
  'phi-3-mini-128k-instruct',
]
```

---

## Implementation Priority

1. **P0 (This Sprint)**: ✅ DONE — Fix settings modal error, add plan-based visibility via centralized access-control
2. **P1 (Next Sprint)**: Implement Free tier auto-key, enforce limits in API routes using `PLAN_LIMITS`
3. **P2 (Sprint +2)**: Build spend analytics UI, key templates gating
4. **P3 (Sprint +3)**: Enterprise features (teams, guardrails, auto-rotation)

---

## Migration Notes

- Existing users without subscription → treated as Free tier
- Existing keys without limits → grandfather as Pro-level until next rotation
- ~~Database migration needed for `subscription.features` and `subscription.limits`~~ — **Not needed**: Gateway limits are defined in code via `PLAN_LIMITS` constant, not in the database. Plan name is read from `org_subscriptions.plan_name` and mapped to the corresponding limits object.

## Files Reference

| File | Purpose |
|------|---------|
| `src/lib/access-control/types.ts` | `PlanLimits`, `RolePermissions`, `PLAN_LIMITS`, `ROLE_PERMISSIONS` |
| `src/lib/access-control/hooks.ts` | Client-side hooks (`useFeature`, `usePermission`, etc.) |
| `src/lib/access-control/index.ts` | Server-side utilities (`hasPermission`, `hasFeature`, `checkLimit`) |
| `src/components/access-control/` | UI components (`FeatureGate`, `UpgradeCard`, `UpgradeBadge`) |
| `src/lib/workspace/capabilities.ts` | Server capability resolver (imports `PLAN_LIMITS`) |
| `src/components/settings/gateway-keys-settings.tsx` | Settings modal gateway tab (uses centralized hooks) |
