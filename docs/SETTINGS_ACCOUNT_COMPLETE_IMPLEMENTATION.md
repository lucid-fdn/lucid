# Settings → Account - Complete Implementation Guide

## 🎯 What We're Implementing

Based on your feedback, here's what we need to add:

### 1. ✅ Toast System (Already Exists!)
- **Library:** Sonner
- **Location:** `src/ui/components/sonner.tsx`
- **Already in layout:** `src/app/(studio)/layout.tsx`
- **Action:** Add toast calls to settings actions

### 2. 🔐 MFA Setup (Privy Integration)
- **Privy Hook:** `useLinkPasskey()`
- **Effort:** 15 minutes (one-click integration)
- **Location:** Add to Account Identities Card

### 3. 🔑 Wallet Export (Advanced Mode)
- **Privy Hook:** `useExportWallet()`
- **Feature Flag:** Use existing `src/lib/features.ts`
- **Location:** New "Advanced Security" card

### 4. 🐛 Username Bug
- **Issue:** Handle is `user_841d8437` in database (auto-generated from wallet)
- **Fix:** Ensure onboarding completes + allow editing in settings
- **Already working:** The component is correct, showing DB value

---

## 📋 Implementation Plan

### Phase 1: Add Toast to Settings (15 min)
```typescript
// Update all setting actions to show success toast
import { toast } from 'sonner'

// In profile update:
toast.success('Profile updated successfully')

// In wallet connect:
toast.success('Wallet connected')

// In account deletion:
toast.success('Account deleted')
```

### Phase 2: Add MFA Card (15 min)
```typescript
// New component: SecurityCard
import { useLinkPasskey } from '@privy-io/react-auth'

export function SecurityCard() {
  const { user, linkPasskey, unlinkPasskey } = usePrivy()
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
        <CardDescription>
          Enhance your account security with multi-factor authentication
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!user?.linkedAccounts?.find(a => a.type === 'passkey') ? (
          <Button onClick={linkPasskey}>
            Enable Passkey (MFA)
          </Button>
        ) : (
          <div>
            ✅ Passkey enabled
            <Button onClick={() => unlinkPasskey()}>Remove</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

### Phase 3: Add Wallet Export (30 min)
```typescript
// New component: AdvancedSecurityCard (with feature flag)
import { useExportWallet } from '@privy-io/react-auth'
import { features } from '@/lib/features'

export function AdvancedSecurityCard() {
  if (!features.settings.advancedSecurity) return null
  
  const { exportWallet } = useExportWallet({
    onSuccess: () => toast.success('Wallet exported'),
    onError: (error) => toast.error('Export failed')
  })
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Advanced Security</CardTitle>
        <CardDescription className="text-warning">
          ⚠️ Advanced users only. Exporting your private key is irreversible.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={exportWallet} variant="outline">
          Export Private Key
        </Button>
      </CardContent>
    </Card>
  )
}
```

### Phase 4: Wallet Recovery Info (15 min)
```typescript
// Add info card explaining automatic recovery
export function WalletRecoveryInfo() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Wallet Recovery</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg bg-muted p-4">
          <h4 className="font-medium mb-2">📧 Email Users</h4>
          <p className="text-sm text-muted-foreground">
            Your wallet is automatically recoverable via email OTP. Simply log in
            with your email to recover access.
          </p>
        </div>
        
        <div className="rounded-lg bg-muted p-4">
          <h4 className="font-medium mb-2">🔐 Social Login Users</h4>
          <p className="text-sm text-muted-foreground">
            Your wallet is tied to your social account (Google, Discord, etc.).
            Log in with the same social account to recover access.
          </p>
        </div>
        
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            ℹ️ No manual recovery needed - Privy handles this automatically.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
```

---

## 🚀 Quick Implementation

### File Structure
```
src/components/settings/
├── profile-information-card.tsx ✅ (existing)
├── account-identities-card.tsx ✅ (existing)
├── security-card.tsx ⚠️ (new - MFA)
├── advanced-security-card.tsx ⚠️ (new - wallet export)
├── wallet-recovery-info.tsx ⚠️ (new - education)
└── danger-zone-card.tsx ✅ (existing)
```

### Update Account Page
```typescript
// src/app/(studio)/settings/account/page.tsx
export default async function AccountSettingsPage() {
  return (
    <div className="space-y-6">
      <ProfileInformationCard />
      <AccountIdentitiesCard />
      <SecurityCard /> {/* New - MFA */}
      <WalletRecoveryInfo /> {/* New - Education */}
      {features.settings.advancedSecurity && (
        <AdvancedSecurityCard /> {/* New - Wallet export */}
      )}
      <DangerZoneCard />
    </div>
  )
}
```

### Update Feature Flags
```typescript
// src/lib/features.ts
export const features = {
  settings: {
    advancedSecurity: false, // Enable in production with caution
    mfa: true, // MFA is safe to enable
  }
}
```

---

## ⏱️ Time Estimate

| Task | Time | Priority |
|------|------|----------|
| Add toasts to actions | 15 min | HIGH |
| MFA card | 15 min | HIGH |
| Wallet recovery info | 15 min | HIGH |
| Wallet export (advanced) | 30 min | MEDIUM |
| Skeleton loaders | 30 min | MEDIUM |
| **Total MVP** | **1.75 hrs** | - |

---

## 🎯 MVP Decision Matrix

| Feature | Include? | Reason |
|---------|----------|--------|
| Toast notifications | ✅ YES | 15 min, industry standard |
| MFA setup | ✅ YES | 15 min, Privy one-click |
| Wallet recovery info | ✅ YES | 15 min, educational |
| Wallet export | ⚠️ FLAGGED | 30 min, behind feature flag |
| Skeleton loaders | ✅ YES | 30 min, better UX |

**Recommendation:** Implement all except wallet export (keep behind flag, enable post-launch after security audit).

---

## 🔒 Security Considerations

### MFA (Safe ✅)
- Privy handles all security
- No private key exposure
- Standard WebAuthn/passkey
- **Recommendation:** Enable for MVP

### Wallet Export (⚠️ Risky)
- Exposes private key
- Irreversible if compromised
- Requires user education
- **Recommendation:** Feature flag OFF for MVP, document for post-launch

---

## 📝 Next Steps

1. **Implement toasts** (15 min)
   - Profile updates
   - Wallet connections
   - Account actions

2. **Add MFA card** (15 min)
   - Use `useLinkPasskey()`
   - Simple on/off toggle

3. **Add recovery info** (15 min)
   - Educational card
   - No user action needed

4. **Add wallet export** (30 min)
   - Behind feature flag
   - WITH security warnings
   - Document risks

5. **Add skeletons** (30 min)
   - Loading states
   - Better perceived perf

**Total:** ~2 hours for complete MVP

---

## ✅ Success Criteria

- [ ] All settings actions show success toast
- [ ] MFA can be enabled/disabled
- [ ] Users understand wallet recovery is automatic
- [ ] Wallet export available (but flagged off initially)
- [ ] Skeleton loaders show during data fetch
- [ ] All features documented
- [ ] Security reviewed

---

## 🎉 Post-MVP Enhancements

1. **Session Management**
   - View active sessions
   - Remote logout

2. **Login History**
   - Track login attempts
   - Show device info

3. **API Keys**
   - Generate API keys
   - Manage permissions

4. **2FA via SMS**
   - Additional MFA option
   - Backup method

Keep these documented for future iterations!
