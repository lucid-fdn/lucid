# Settings → Account: Complete Privy Implementation Guide

## 🎯 Final Recommendations (Corrected)

After reviewing all Privy documentation, here's the **correct** way to implement account settings.

---

## ✅ Privy Provides Everything We Need

### Available Methods

**From `usePrivy()` hook:**
```typescript
const { 
  user,                    // User object with all linked accounts
  updateEmail,            // Opens modal to update email
  updatePhone,            // Opens modal to update phone  
  unlinkEmail,            // Unlinks email
  unlinkPhone,            // Unlinks phone
  unlinkWallet,           // Unlinks wallet
  unlinkGoogle,           // Unlinks Google
  unlinkTwitter,          // Unlinks Twitter
  unlinkDiscord,          // Unlinks Discord
  unlinkGithub,           // Unlinks GitHub
  unlinkLinkedIn,         // Unlinks LinkedIn
  unlinkApple,            // Unlinks Apple
  unlinkSpotify,          // Unlinks Spotify
  unlinkInstagram,        // Unlinks Instagram
  unlinkTikTok,           // Unlinks TikTok
  unlinkTelegram,         // Unlinks Telegram
  unlinkFarcaster,        // Unlinks Farcaster
  unlinkPasskey,          // Unlinks passkey
} = usePrivy()
```

**From `useLinkAccount()` hook:**
```typescript
const {
  linkEmail,
  linkPhone,
  linkWallet,
  linkGoogle,
  linkTwitter,
  linkDiscord,
  linkGithub,
  // ... etc
} = useLinkAccount({
  onSuccess: (user, linkMethod, linkedAccount) => {},
  onError: (error) => {}
})
```

**From `useUpdateAccount()` hook:**
```typescript
const { updateEmail, updatePhone } = useUpdateAccount({
  onSuccess: ({user, updateMethod, updatedAccount}) => {},
  onError: (error, details) => {}
})
```

---

## 📋 Correct Implementation

### 1. Email Management (✅ CORRECT WAY)

```typescript
'use client'

import { usePrivy, useUpdateAccount } from '@privy-io/react-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Button } from '@/ui/components/button'
import { Badge } from '@/ui/components/badge'

export function EmailCard() {
  const { user } = usePrivy()
  
  // Use useUpdateAccount for callbacks
  const { updateEmail } = useUpdateAccount({
    onSuccess: ({user, updateMethod, updatedAccount}) => {
      console.log('Email updated successfully:', updatedAccount)
      // Optional: Show success toast
      // Optional: Trigger notification
    },
    onError: (error, details) => {
      console.error('Failed to update email:', error)
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Address</CardTitle>
        <CardDescription>
          Used for notifications and account recovery
        </CardDescription>
      </CardHeader>
      <CardContent>
        {user?.email ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{user.email.address}</p>
                <Badge variant="secondary" className="mt-1">
                  Verified
                </Badge>
              </div>
              <Button 
                variant="outline"
                size="sm"
                onClick={updateEmail}
              >
                Update Email
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Updating your email will require verification via OTP
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              No email linked to your account
            </p>
            <Button onClick={() => {/* Call linkEmail from useLinkAccount */}}>
              Link Email
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

**Key Points:**
- ✅ Use `updateEmail()` from `usePrivy()` or `useUpdateAccount()`
- ✅ Privy opens modal and handles verification
- ✅ User enters new email → gets OTP → verifies → email updated
- ✅ No manual implementation needed

### 2. Linked Accounts Card (✅ COMPLETE)

```typescript
'use client'

import { usePrivy, useLinkAccount } from '@privy-io/react-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Button } from '@/ui/components/button'
import { Wallet, Mail, Phone, type LucideIcon } from 'lucide-react'
import { FaGoogle, FaTwitter, FaDiscord, FaGithub, FaLinkedin } from 'react-icons/fa'

export function LinkedAccountsCard() {
  const { user, unlinkEmail, unlinkPhone, unlinkWallet, unlinkGoogle, unlinkTwitter, unlinkDiscord } = usePrivy()
  
  const {
    linkEmail,
    linkPhone,
    linkWallet,
    linkGoogle,
    linkTwitter,
    linkDiscord,
    linkGithub,
  } = useLinkAccount({
    onSuccess: ({user, linkMethod, linkedAccount}) => {
      console.log(`${linkMethod} linked successfully`)
    },
    onError: (error) => {
      console.error('Failed to link account:', error)
    }
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
        <AccountRow
          icon={<Mail className="h-5 w-5" />}
          label="Email"
          value={user?.email?.address}
          isLinked={!!user?.email}
          onLink={linkEmail}
          onUnlink={unlinkEmail}
          canUnlink={user && user.linkedAccounts.length > 1}
        />

        {/* Phone */}
        <AccountRow
          icon={<Phone className="h-5 w-5" />}
          label="Phone"
          value={user?.phone?.number}
          isLinked={!!user?.phone}
          onLink={linkPhone}
          onUnlink={unlinkPhone}
          canUnlink={user && user.linkedAccounts.length > 1}
        />

        {/* Wallets */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Wallets</p>
          {user?.linkedAccounts
            ?.filter(acc => acc.type === 'wallet')
            .map((wallet: any) => (
              <AccountRow
                key={wallet.address}
                icon={<Wallet className="h-5 w-5" />}
                label={wallet.walletClientType === 'privy' ? 'Embedded Wallet' : 'External Wallet'}
                value={`${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`}
                isLinked={true}
                onUnlink={() => unlinkWallet(wallet.address)}
                canUnlink={user && user.linkedAccounts.length > 1}
              />
            ))}
          <Button onClick={linkWallet} variant="outline" size="sm" className="w-full">
            + Add Wallet
          </Button>
        </div>

        {/* Social Logins */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Social Accounts</p>
          
          <AccountRow
            icon={<FaGoogle className="h-5 w-5" />}
            label="Google"
            value={user?.google?.email}
            isLinked={!!user?.google}
            onLink={linkGoogle}
            onUnlink={unlinkGoogle}
            canUnlink={user && user.linkedAccounts.length > 1}
          />

          <AccountRow
            icon={<FaTwitter className="h-5 w-5" />}
            label="Twitter"
            value={user?.twitter?.username}
            isLinked={!!user?.twitter}
            onLink={linkTwitter}
            onUnlink={unlinkTwitter}
            canUnlink={user && user.linkedAccounts.length > 1}
          />

          <AccountRow
            icon={<FaDiscord className="h-5 w-5" />}
            label="Discord"
            value={user?.discord?.username}
            isLinked={!!user?.discord}
            onLink={linkDiscord}
            onUnlink={unlinkDiscord}
            canUnlink={user && user.linkedAccounts.length > 1}
          />

          {/* Add more social accounts as needed */}
        </div>
      </CardContent>
    </Card>
  )
}

function AccountRow({
  icon,
  label,
  value,
  isLinked,
  onLink,
  onUnlink,
  canUnlink = true
}: {
  icon: React.ReactNode
  label: string
  value?: string
  isLinked: boolean
  onLink?: () => void
  onUnlink?: () => void
  canUnlink?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg border">
      <div className="flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          {value && (
            <p className="text-xs text-muted-foreground">{value}</p>
          )}
        </div>
      </div>
      
      {isLinked ? (
        <Button 
          onClick={onUnlink} 
          variant="ghost" 
          size="sm"
          disabled={!canUnlink}
          title={!canUnlink ? "You must have at least one linked account" : "Remove"}
        >
          Remove
        </Button>
      ) : (
        <Button onClick={onLink} variant="outline" size="sm">
          Link
        </Button>
      )}
    </div>
  )
}
```

**Important Notes:**
- ✅ Users must have **at least 1 linked account** (can't unlink if it's the only one)
- ✅ Multiple wallets and passkeys allowed
- ✅ Only 1 of each other type (email, phone, social)
- ✅ All link/unlink operations handled by Privy

### 3. Account Page (✅ COMPLETE)

```typescript
// src/app/(studio)/settings/account/page.tsx
import { getUserId } from '@/lib/auth/server-utils'
import { getProfile } from '@/lib/db'
import { redirect } from 'next/navigation'
import { AccountFormClient } from '@/components/settings/account-form-client'

export const metadata = {
  title: 'Account Settings',
  description: 'Manage your account credentials',
}

export default async function AccountSettingsPage() {
  const userId = await getUserId()
  
  if (!userId) {
    redirect('/login')
  }
  
  const profile = await getProfile(userId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Account Settings</h2>
        <p className="text-muted-foreground mt-1">
          Manage your username and linked accounts
        </p>
      </div>

      <AccountFormClient handle={profile?.handle} />
    </div>
  )
}
```

```typescript
// src/components/settings/account-form-client.tsx
'use client'

import { UsernameCard } from './username-card'
import { EmailCard } from './email-card'
import { LinkedAccountsCard } from './linked-accounts-card'
import { DangerZoneCard } from './danger-zone-card'

export function AccountFormClient({ handle }: { handle?: string }) {
  return (
    <div className="space-y-6">
      <UsernameCard defaultHandle={handle} />
      <EmailCard />
      <LinkedAccountsCard />
      <DangerZoneCard />
    </div>
  )
}
```

---

## 📁 Final File Structure

```
src/components/settings/
├── account-form-client.tsx    ❌ Create (client wrapper)
├── username-card.tsx           ✅ Extract from account-form
├── email-card.tsx              ❌ Create (with updateEmail)
├── linked-accounts-card.tsx    ❌ Create (complete management)
├── danger-zone-card.tsx        ❌ Create (account deletion)
└── account-row.tsx             ❌ Create (reusable)

src/lib/forms/
├── schemas.ts                  ✅ REMOVE passwordSchema
└── actions.ts                  ✅ Keep username logic only

src/app/(studio)/settings/account/
└── page.tsx                    ✅ Refactor to use new components
```

---

## ✅ What to Remove

### 1. Remove Email from accountSchema

```typescript
// lib/forms/schemas.ts
export const accountSchema = z.object({
  handle: handleSchema,
  // REMOVE: email: z.string().email()
})
```

### 2. Remove updateAccountAction Email Logic

```typescript
// lib/forms/actions.ts
export async function updateAccountAction(data: unknown) {
  // Only handle username updates
  // Remove all email update logic
  await dbUpdateProfile(userId, {
    handle: validated.handle,
    // Don't touch email!
  })
}
```

### 3. Remove passwordSchema

```typescript
// lib/forms/schemas.ts  
// DELETE THIS ENTIRE SCHEMA
export const passwordSchema = z.object({
  new_password: z.string().min(8),
  confirm_password: z.string(),
})
```

---

## ⚙️ Implementation Checklist

### Phase 1: Cleanup (30 min)
- [ ] Remove `passwordSchema` from schemas.ts
- [ ] Remove email from `accountSchema`
- [ ] Remove email update logic from `updateAccountAction`
- [ ] Test username updates still work

### Phase 2: Email Card (1 hour)
- [ ] Create `email-card.tsx` component
- [ ] Use `updateEmail()` from `usePrivy()`
- [ ] Add `useUpdateAccount()` for callbacks
- [ ] Show verification badge
- [ ] Test email update flow

### Phase 3: Linked Accounts (4-6 hours)
- [ ] Create `linked-accounts-card.tsx`
- [ ] Import all link/unlink methods from `usePrivy()`
- [ ] Use `useLinkAccount()` for callbacks
- [ ] Create `AccountRow` reusable component
- [ ] Add all social login options
- [ ] Handle wallet display (multiple)
- [ ] Test link/unlink flows
- [ ] Ensure 1+ account requirement

### Phase 4: Integration (1 hour)
- [ ] Create `account-form-client.tsx` wrapper
- [ ] Update account page.tsx
- [ ] Test all flows together
- [ ] Add loading states
- [ ] Add error handling

---

## 🎯 Key Corrections from Previous Analysis

| What I Said Before | Reality |
|--------------------|---------|
| "Make email read-only" | ✅ Still show, but use `updateEmail()` button |
| "Use `useLinkAccount()` for unlinking" | ❌ Use `unlinkEmail()` directly from `usePrivy()` |
| "No way to change email" | ❌ Use `updateEmail()` which opens Privy modal |
| "Manual verification needed" | ✅ Correct - Privy handles it |

---

## ✅ Benefits of Correct Implementation

### Security
- ✅ Privy handles email verification (OTP)
- ✅ OAuth tokens managed by Privy
- ✅ Wallet signatures validated by Privy
- ✅ No database sync issues

### User Experience
- ✅ Familiar Privy modal UI
- ✅ Progressive onboarding
- ✅ Easy to add/remove accounts
- ✅ Clear verification flows

### Developer Experience
- ✅ Less code to maintain
- ✅ No custom verification logic
- ✅ Well-documented hooks
- ✅ Type-safe

---

## 📊 Time Estimate

| Task | Time |
|------|------|
| Cleanup (remove email/password) | 30 min |
| Email card with updateEmail() | 1 hour |
| Linked accounts card | 4-6 hours |
| Integration & testing | 1 hour |
| **Total** | **~7 hours (1 day)** |

---

## 🎯 Summary

**The Correct Way:**
1. ✅ Use `updateEmail()` from Privy (not manual input)
2. ✅ Use `unlinkEmail()` directly from `usePrivy()` (not `useLinkAccount`)
3. ✅ Show all linked accounts with proper link/unlink buttons
4. ✅ Let Privy handle all verification flows
5. ✅ Remove unused password schema

**Priority: MEDIUM** - Not critical for MVP but improves UX significantly

The key insight: **Privy provides complete account management - we just need to wire up the UI properly.**
