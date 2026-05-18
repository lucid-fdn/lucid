# Settings -> Account: Privy Integration Guide

## 🎯 Executive Summary

**Current State:** Basic username management works, but we're misusing Privy's authentication system.

**Key Issues:**
1. ❌ Trying to manage email directly (Privy handles this)
2. ❌ Not showing linked accounts (wallets, socials)
3. ❌ Unused password schema (Privy is passwordless)
4. ❌ Missing account management features

**Recommended Action:** Refactor to use Privy's account management hooks properly.

---

## 🔍 Understanding Privy

### What Privy IS

Privy is a **passwordless authentication provider** that:
- Manages user identity across multiple login methods
- Handles email verification (OTP codes)
- Supports wallet connections (MetaMask, WalletConnect, etc.)
- Provides social logins (Google, Twitter, Discord, etc.)
- Uses WebAuthn passkeys
- Allows **progressive onboarding** (add accounts as needed)

### What Privy is NOT

- ❌ NOT a traditional email/password system
- ❌ NO password management needed
- ❌ NO manual email verification (Privy does it)
- ❌ NO custom auth flows (use Privy's)

### Supported Auth Methods

| Type | Count Allowed | Verification |
|------|--------------|--------------|
| Email | 1 | OTP via Privy |
| Phone | 1 | SMS OTP via Privy |
| Wallets | Unlimited | Signature |
| Passkeys | Unlimited | WebAuthn |
| Google | 1 | OAuth |
| Twitter | 1 | OAuth |
| Discord | 1 | OAuth |
| GitHub | 1 | OAuth |
| LinkedIn | 1 | OAuth |
| Apple | 1 | OAuth |
| Spotify | 1 | OAuth |
| Instagram | 1 | OAuth |
| TikTok | 1 | OAuth |
| Farcaster | 1 | QR Code |
| Telegram | 1 | OAuth |

---

## 📊 Current Implementation Issues

### ❌ Issue 1: Manual Email Management

**Current Code:**
```typescript
// src/components/settings/account-form.tsx
<FormField
  label="Email"
  name="email"
  type="email"
  placeholder="you@example.com"
  error={errors.email?.message}
  required
  register={register('email')}
/>
```

**Problem:** We're trying to manage email ourselves, but Privy owns it.

**What Happens:**
1. User changes email in form
2. We update our DB
3. But Privy still has old email
4. User can't login with new email
5. **Account broken**

### ❌ Issue 2: No Linked Accounts Display

**Current:** Only shows email input
**Should Show:**
- All linked wallets
- Social logins
- Email status
- Phone number
- Passkeys

**Missing:** Users can't see or manage their login methods

### ❌ Issue 3: Unused Password Schema

**Current Code:**
```typescript
// lib/forms/schemas.ts
export const passwordSchema = z.object({
  new_password: z.string().min(8),
  confirm_password: z.string(),
})
```

**Problem:** Never used. Privy doesn't have passwords.

---

## ✅ Correct Implementation

### Phase 1: Fix Email Management

#### Option A: Read-Only Display (Recommended)

```typescript
'use client'

import { usePrivy, useLinkAccount } from '@privy-io/react-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Button } from '@/ui/components/button'

export function AccountForm() {
  const { user } = usePrivy()
  const { linkEmail } = useLinkAccount()
  
  return (
    <div className="space-y-6">
      {/* Username Card */}
      <Card>
        <CardHeader>
          <CardTitle>Username</CardTitle>
          <CardDescription>
            Your unique username across the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsernameField {/* ... existing logic */} />
        </CardContent>
      </Card>

      {/* Email Card - READ ONLY */}
      <Card>
        <CardHeader>
          <CardTitle>Email Address</CardTitle>
          <CardDescription>
            Managed by Privy authentication
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user?.email ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {user.email.address}
                </span>
                <span className="text-xs text-muted-foreground">
                  Verified ✓
                </span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={linkEmail}
              >
                Change Email
              </Button>
              <p className="text-xs text-muted-foreground">
                Changing your email will require verification
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                No email linked
              </p>
              <Button onClick={linkEmail}>
                Link Email
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

**Benefits:**
- ✅ No database sync issues
- ✅ Privy handles verification
- ✅ User can still change email
- ✅ Matches Privy's model

### Phase 2: Add Linked Accounts

```typescript
// src/components/settings/linked-accounts-card.tsx
'use client'

import { usePrivy, useLinkAccount, useUnlinkAccount } from '@privy-io/react-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Button } from '@/ui/components/button'
import { Wallet, Mail, Twitter, Github, type LucideIcon } from 'lucide-react'

const accountIcons: Record<string, LucideIcon> = {
  wallet: Wallet,
  email: Mail,
  twitter: Twitter,
  github: Github,
  // ... more icons
}

export function LinkedAccountsCard() {
  const { user } = usePrivy()
  const {
    linkEmail,
    linkWallet,
    linkGoogle,
    linkTwitter,
    linkDiscord,
    linkGithub,
  } = useLinkAccount({
    onSuccess: () => {
      console.log('Account linked successfully')
    },
  })
  
  const { unlinkEmail, unlinkWallet, unlinkGoogle } = useUnlinkAccount({
    onSuccess: () => {
      console.log('Account unlinked successfully')
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked Accounts</CardTitle>
        <CardDescription>
          Manage how you sign in to your account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Email */}
        <LinkedAccountItem
          icon={Mail}
          type="Email"
          value={user?.email?.address}
          onUnlink={user?.email ? () => unlinkEmail(user.email.address) : undefined}
          onLink={!user?.email ? linkEmail : undefined}
        />

        {/* Wallets */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Wallets</p>
          {user?.linkedAccounts
            ?.filter(acc => acc.type === 'wallet')
            .map((wallet: any) => (
              <LinkedAccountItem
                key={wallet.address}
                icon={Wallet}
                type={wallet.walletClientType === 'privy' ? 'Embedded Wallet' : 'External Wallet'}
                value={`${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`}
                onUnlink={() => unlinkWallet(wallet.address)}
              />
            ))}
          <Button onClick={linkWallet} variant="outline" size="sm">
            + Add Wallet
          </Button>
        </div>

        {/* Google */}
        <LinkedAccountItem
          icon={accountIcons.google}
          type="Google"
          value={user?.google?.email}
          onUnlink={user?.google ? unlinkGoogle : undefined}
          onLink={!user?.google ? linkGoogle : undefined}
        />

        {/* Twitter */}
        <LinkedAccountItem
          icon={Twitter}
          type="Twitter"
          value={user?.twitter?.username}
          onUnlink={user?.twitter ? unlinkTwitter : undefined}
          onLink={!user?.twitter ? linkTwitter : undefined}
        />

        {/* More social logins... */}
      </CardContent>
    </Card>
  )
}

function LinkedAccountItem({
  icon: Icon,
  type,
  value,
  onLink,
  onUnlink,
}: {
  icon: LucideIcon
  type: string
  value?: string
  onLink?: () => void
  onUnlink?: () => void
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{type}</p>
          {value && (
            <p className="text-xs text-muted-foreground">{value}</p>
          )}
        </div>
      </div>
      {onLink && (
        <Button onClick={onLink} variant="outline" size="sm">
          Link
        </Button>
      )}
      {onUnlink && (
        <Button onClick={onUnlink} variant="ghost" size="sm">
          Remove
        </Button>
      )}
    </div>
  )
}
```

### Phase 3: Account Deletion

```typescript
// src/components/settings/danger-zone-card.tsx
'use client'

import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/components/alert-dialog'

export function DangerZoneCard() {
  const { user, logout } = usePrivy()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (confirmText !== user?.id) return

    setLoading(true)
    try {
      // 1. Delete from our database
      await deleteAccountAction()
      
      // 2. Logout from Privy
      await logout()
      
      // 3. Redirect
      window.location.href = '/'
    } catch (error) {
      console.error('Failed to delete account:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Irreversible and destructive actions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-1">Delete Account</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <Button 
              variant="destructive" 
              onClick={() => setOpen(true)}
            >
              Delete Account
            </Button>
          </div>
        </div>

        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  This will permanently delete your account and remove all your data from our servers.
                </p>
                <p className="font-medium text-foreground">
                  Type <code className="px-1 py-0.5 bg-muted rounded">{user?.id}</code> to confirm:
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Enter user ID"
                />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={confirmText !== user?.id || loading}
                className="bg-destructive hover:bg-destructive/90"
              >
                {loading ? 'Deleting...' : 'Delete Account'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
```

---

## 📁 Updated File Structure

```
src/components/settings/
├── account-form.tsx           ✅ Refactor (remove email editing)
├── linked-accounts-card.tsx   ❌ Create (show all Privy accounts)
├── danger-zone-card.tsx       ❌ Create (account deletion)
└── linked-account-item.tsx    ❌ Create (reusable account row)

src/lib/forms/
├── schemas.ts                 ✅ Remove passwordSchema
└── actions.ts                 ✅ Remove email update logic

src/app/(studio)/settings/account/
└── page.tsx                   ✅ Update to show all cards
```

---

## ⚙️ Implementation Checklist

### Immediate (Do Now)

- [ ] Update AccountForm to show read-only email
- [ ] Remove email editing from accountSchema
- [ ] Remove unused passwordSchema
- [ ] Add "Change Email" button that calls `linkEmail()`
- [ ] Test email change flow

### Short-term (This Week)

- [ ] Create LinkedAccountsCard component
- [ ] Implement account linking UI
- [ ] Implement account unlinking UI
- [ ] Add icons for each account type
- [ ] Test link/unlink flows

### Medium-term (Next Week)

- [ ] Create DangerZoneCard component
- [ ] Implement account deletion
- [ ] Add deletion confirmation modal
- [ ] Clean up user data properly
- [ ] Test deletion flow

---

## ✅ Benefits of This Approach

### Security
- ✅ Privy handles all verification
- ✅ No database sync issues
- ✅ OAuth tokens managed by Privy
- ✅ Wallet signatures validated by Privy

### User Experience
- ✅ Progressive onboarding
- ✅ Multiple login methods
- ✅ Easy to add/remove accounts
- ✅ Familiar social login UX

### Developer Experience
- ✅ Less code to maintain
- ✅ No custom auth logic
- ✅ Industry-standard patterns
- ✅ Well-documented Privy SDK

---

## 🎯 Summary

**What to Change:**
1. Make email read-only (Privy owns it)
2. Add linked accounts display
3. Remove unused password schema
4. Add account deletion

**What NOT to Do:**
- ❌ DON'T try to manage email verification
- ❌ DON'T implement custom password system
- ❌ DON'T store Privy auth tokens
- ❌ DON'T try to sync Privy email to DB

**Time Estimate:**
- Email fix: 1 hour
- Linked accounts: 4-6 hours
- Account deletion: 2-3 hours
- **Total: 1 day**

The key insight is to **let Privy manage authentication** and just display/orchestrate their UI flows.
