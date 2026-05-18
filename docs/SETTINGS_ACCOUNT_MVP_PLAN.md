# Settings → Account MVP Enhancement Plan

## 🎯 Critical Issues to Fix

### 1. ✅ Username Confirmation Bug
**Issue:** Shows `user_841d8437` instead of readable username
**Root Cause:** Profile might not have handle set, or handle format not user-friendly
**Solution:** Ensure handle is always set during onboarding + add fallback display

### 2. 🔔 Centralized Toast System
**Current:** No success feedback
**Industry Standard:** Toast on all mutations (create, update, delete)
**Solution:** Use sonner (already in package.json?) or create central toast provider

### 3. ⏳ Skeleton Loading States
**Current:** Blank screen while loading
**Industry Standard:** Skeleton placeholders during fetch
**Solution:** Add Skeleton components from shadcn

### 4. 🔐 Security Features (MFA, Wallet Export)
**Question:** Should these be in MVP?
**Analysis:** 
- MFA → YES (security table stakes)
- Wallet Export → MAYBE (advanced users only)
- Wallet Recovery → YES (critical for embedded wallets)

---

## 📋 Implementation Priority

### Phase 1: Critical Fixes (30 min)
```
✅ Fix username confirmation
✅ Add toast success messages
✅ Add skeleton loaders
```

### Phase 2: Security Features (2-3 hours)
```
⚠️ MFA setup (Passkeys)
⚠️ Wallet recovery info
⚠️ Private key export (with warnings)
```

### Phase 3: Optimization (1-2 hours)
```
⚠️ Centralized form system
⚠️ Cache strategy
⚠️ Performance audit
```

---

## 🏗️ Centralized Systems to Use

### 1. Toast System
**Check if exists:**
```bash
# Search for existing toast
grep -r "useToast\|toast\|sonner" src/
```

**If not, create:**
```typescript
// src/hooks/use-toast.ts
// Central toast hook using sonner or custom
```

### 2. Form System
**Check existing:**
```bash
# We have:
- src/lib/forms/schemas.ts ✅
- src/lib/forms/actions.ts ✅
- src/components/forms/ ✅
```

**Enhancement needed:**
```typescript
// Create reusable form wrapper with toast
// src/components/forms/form-card.tsx
```

### 3. Feature Flags
**Check:**
```bash
# src/lib/features.ts exists
# Use for:
- MFA features
- Wallet export
- Advanced settings
```

---

## 🎨 Industry Standards for MVP

### Loading States ✅ YES
```typescript
// Everyone does this
- GitHub
- Stripe
- Vercel
All show skeletons during load
```

### Success Toasts ✅ YES
```typescript
// Industry standard
- "Profile updated"
- "Wallet connected"  
- "Settings saved"
```

### MFA ⚠️ OPTIONAL for MVP
```typescript
// Nice to have, not critical
- Can launch without it
- Add in post-MVP
- But document how to add
```

### Wallet Export 🚫 NOT for MVP
```typescript
// Advanced feature
- Most users don't need
- Security risk if not careful
- Document for post-MVP
```

### Wallet Recovery ✅ YES
```typescript
// Critical for embedded wallets
- Users MUST be able to recover
- Privy handles this automatically
- Just need UI to explain it
```

---

## 📊 Decisions for MVP

| Feature | Include? | Priority | Effort | Reason |
|---------|----------|----------|--------|--------|
| Toast system | ✅ YES | HIGH | 30min | Industry standard |
| Skeletons | ✅ YES | HIGH | 30min | Better UX |
| Username fix | ✅ YES | CRITICAL | 10min | Bug fix |
| MFA setup | ❌ NO | LOW | 3hrs | Post-MVP |
| Wallet export | ❌ NO | LOW | 2hrs | Post-MVP, risky |
| Recovery info | ✅ YES | MEDIUM | 30min | Explain Privy recovery |
| Form heights | ✅ YES | LOW | 1hr | Polish |

**Total MVP work: ~2.5 hours**

---

## 🚀 Implementation Order

### Step 1: Fix Critical Bug (10 min)
```typescript
// Ensure username display in deletion
<DangerZoneCard username={profile?.handle || profile?.name || 'your account'} />
```

### Step 2: Add Toast System (30 min)
```typescript
// 1. Check if sonner installed
// 2. Create central toast hook
// 3. Add to all success actions
```

### Step 3: Add Skeletons (30 min)
```typescript
// 1. Create skeleton components
// 2. Show while profile loading
// 3. Show while wallets loading
```

### Step 4: Wallet Recovery Info (30 min)
```typescript
// Add info card explaining:
// - Email users: automatic recovery
// - Social users: tied to social account
// - No action needed from user
```

### Step 5: Documentation (30 min)
```typescript
// Update all docs with:
// - Toast system usage
// - Skeleton patterns
// - Recovery flow
```

---

## 🎯 Post-MVP Features

Document these for later:

### MFA Implementation
```typescript
// docs/SETTINGS_ACCOUNT_MFA.md
- Passkey setup
- SMS OTP
- Recovery codes
```

### Wallet Export
```typescript
// docs/SETTINGS_ACCOUNT_WALLET_EXPORT.md
- Private key export
- Security warnings
- Cooldown periods
```

### Advanced Settings
```typescript
// docs/SETTINGS_ACCOUNT_ADVANCED.md
- Session management
- Login history
- API keys
```

---

## ✅ MVP Scope (Final)

**What we're building NOW:**
1. ✅ Profile Information (first/last name, username, email)
2. ✅ Account Identities (wallets, social logins)
3. ✅ Account Deletion (with username confirmation)
4. ✅ Toast notifications (success/error feedback)
5. ✅ Skeleton loaders (better perceived performance)
6. ✅ Wallet recovery info (educational, no action needed)

**What we're NOT building now:**
1. ❌ MFA setup (passkeys, SMS)
2. ❌ Private key export
3. ❌ Session management
4. ❌ Login history
5. ❌ API keys

**Reasoning:**
- Core account management is complete ✅
- User can manage all login methods ✅
- Wallet recovery is automatic (Privy) ✅
- Advanced features don't block launch ✅
- Can iterate post-MVP based on feedback ✅

---

## 📏 Performance & Scalability

### Current Implementation
```typescript
✅ Server components by default
✅ Client components only where needed
✅ Server actions (no API routes)
✅ Type-safe with Zod
✅ Prisma/Drizzle for DB
```

### Optimizations Needed
```typescript
⚠️ Add React Query for client state
⚠️ Add SWR/cache for profile data
⚠️ Memoize expensive computations
⚠️ Lazy load components
```

### For MVP
```
✅ Current implementation is fine
✅ Optimize if metrics show need
✅ Focus on features first, perf second
```

---

## 🎨 UI Consistency

### Form Heights
```css
/* Global standard */
input, select, button[type="submit"] {
  min-height: 2.5rem; /* 40px */
}
```

### Spacing
```css
/* Consistent gaps */
.form-field {
  margin-bottom: 1rem; /* 16px */
}
```

### Loading States
```typescript
// Skeleton + Suspense
<Suspense fallback={<Skeleton />}>
  <AsyncComponent />
</Suspense>
```

---

## 📝 Summary

**Immediate Actions (MVP):**
1. Fix username confirmation bug
2. Add toast system  
3. Add skeleton loaders
4. Add wallet recovery info card

**Post-MVP:**
1. MFA setup
2. Wallet export
3. Advanced security features

**Total MVP Time:** ~2.5 hours
**Launch Ready:** YES, after these fixes
