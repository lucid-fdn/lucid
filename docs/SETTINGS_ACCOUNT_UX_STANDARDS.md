# Account Settings - UX Standards & Best Practices

## 🎯 Error Notification Patterns (Industry Standards)

### When to Use What

| Pattern | Use Case | Example | Pros | Cons |
|---------|----------|---------|------|------|
| **Inline Alert** | Form validation, contextual errors | "You must have at least one account" | ✅ Contextual<br>✅ Non-intrusive<br>✅ Persistent | ❌ Can be missed<br>❌ Not for critical errors |
| **Toast/Snackbar** | Success confirmations, transient errors | "Wallet connected successfully" | ✅ Non-blocking<br>✅ Auto-dismiss<br>✅ Stackable | ❌ Can be missed<br>❌ Too brief for complex messages |
| **Alert Dialog** | Critical actions, blocking errors | "Delete account?" | ✅ Forces attention<br>✅ Blocks workflow<br>✅ Clear actions | ❌ Disruptive<br>❌ Can frustrate users |

### ✅ Current Implementation (Inline Alert)

**Why it's correct:**
- **Non-critical error** - User tried to disconnect but was prevented (good)
- **Contextual** - Error appears exactly where the action was taken
- **Persistent** - User can read it at their own pace
- **Not blocking** - User can continue using the page

### 🎯 When to Upgrade to Toast

Consider using toast/sonner for:
```typescript
// Success messages (non-critical, positive feedback)
✅ "Wallet connected successfully"
✅ "Profile updated"
✅ "Settings saved"

// Transient errors (user can retry immediately)
⚠️ "Failed to connect wallet"
⚠️ "Network error, try again"
```

Keep inline alerts for:
```typescript
// Validation errors (need to see while fixing)
📝 Form field errors
📝 "You must have at least one account"
📝 "Username already taken"
```

Use dialog for:
```typescript
// Critical/destructive actions
🚨 Account deletion
🚨 Irreversible changes
🚨 Payment confirmations
```

---

## 📏 Form Field Height Consistency

### Problem
Different components may have inconsistent heights, creating visual noise.

### Solution: Central Input Height Standard

```typescript
// tailwind.config.js or global CSS
const formHeights = {
  sm: 'h-8',      // 32px - Compact forms
  md: 'h-10',     // 40px - Standard (RECOMMENDED)
  lg: 'h-12',     // 48px - Prominent actions
}
```

### Implementation

**Option 1: Update shadcn/ui Input component**
```typescript
// src/ui/components/input.tsx
const inputVariants = cva(
  "flex w-full rounded-md border...",
  {
    variants: {
      size: {
        sm: "h-8 text-sm",
        default: "h-10",  // Consistent 40px height
        lg: "h-12 text-lg",
      }
    },
    defaultVariants: {
      size: "default"
    }
  }
)
```

**Option 2: Global CSS Override**
```css
/* src/styles/globals.css */
input[type="text"],
input[type="email"],
input[type="password"],
textarea,
select,
.form-input {
  min-height: 2.5rem; /* 40px */
}
```

### ✅ Recommended Action

1. Set all `<Input>` components to `h-10` (40px)
2. Set all `<Button>` components to match input heights when inline
3. Use `<Label>` with consistent `text-sm` sizing
4. Maintain 0.5rem (8px) gap between fields

---

## 🚫 Console Errors - Can They Be Prevented?

### Current Error
```javascript
Failed to link account: exited_link_flow
```

### Analysis
- **Source**: Privy SDK
- **Cause**: User closed the modal without completing the flow
- **Is it an error?**: No, it's expected user behavior

### ✅ Solution (Already Implemented)

```typescript
onError: (error) => {
  // Filter out "not really errors"
  if (error === 'exited_link_flow') {
    return  // Silent, expected behavior
  }
  
  // Only log/show actual errors
  console.error('Failed to link account:', error)
  setError(`Failed to link account: ${error}`)
}
```

### Why Console Errors Happen

1. **Expected user actions** (modal close, cancel) - Filter these
2. **Network issues** - Should show to user
3. **SDK internal logging** - Can't prevent (Privy's code)

### Best Practice

```typescript
const IGNORABLE_ERRORS = [
  'exited_link_flow',
  'user_cancelled',
  'modal_closed',
]

onError: (error) => {
  if (IGNORABLE_ERRORS.includes(error)) {
    return // Silent
  }
  
  // Only show real errors
  showError(error)
}
```

---

## 🔐 Privy Embedded Wallet Features

### 1. Private Key Export

**Available via Privy SDK:**
```typescript
import { usePrivy, useExportWallet } from '@privy-io/react-auth'

export function WalletExportButton() {
  const { exportWallet } = useExportWallet({
    onSuccess: (address) => {
      // User has successfully exported their private key
      console.log('Exported wallet:', address)
    },
    onError: (error) => {
      console.error('Export failed:', error)
    }
  })

  return (
    <Button onClick={exportWallet}>
      Export Private Key
    </Button>
  )
}
```

**How it Works:**
1. User clicks export
2. Privy modal opens
3. User re-authenticates (OTP/biometric)
4. Private key displayed (one-time)
5. User copies and confirms

**Security:**
- ✅ Requires re-authentication
- ✅ One-time display
- ✅ Encrypted at rest
- ✅ Audit logged

### 2. Wallet Recovery

**Privy Handles Automatically:**

**For Email Users:**
```typescript
// User loses access → Privy recovery flow
1. User goes to login
2. Enters email
3. Receives recovery OTP
4. Wallet automatically recovered
```

**For Social OAuth:**
```typescript
// Recovery tied to social account
1. User logs in with Google/Discord/etc
2. Wallet automatically available
3. No manual recovery needed
```

**Manual Recovery (Advanced):**
```typescript
import { usePrivy } from '@privy-io/react-auth'

// Check if user needs recovery
const { user } = usePrivy()

if (user?.needsRecovery) {
  // Trigger recovery flow
  privy.startRecovery()
}
```

### 3. MFA (Multi-Factor Authentication)

**Privy MFA Options:**

**Built-in MFA:**
- Email OTP (automatic)
- SMS OTP (if phone linked)
- Passkeys (WebAuthn)

**Implementation:**
```typescript
import { usePrivy } from '@privy-io/react-auth'

export function SecuritySettings() {
  const { user, linkPasskey } = usePrivy()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Passkey MFA */}
        {!user?.passkey ? (
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

**MFA Features:**
- ✅ **Email OTP** - Already enabled by default
- ✅ **Passkeys** - Can be added via `linkPasskey()`
- ✅ **SMS OTP** - If phone number linked
- ⚠️ **Authenticator Apps** - Not directly supported (use passkeys instead)

### 4. Wallet Security Best Practices

**For Embedded Wallets:**
```typescript
// 1. Require re-auth for sensitive actions
const { user, reauthenticate } = usePrivy()

async function exportPrivateKey() {
  // Force re-authentication
  await reauthenticate()
  
  // Then allow export
  await exportWallet()
}

// 2. Limit wallet export frequency
const EXPORT_COOLDOWN = 24 * 60 * 60 * 1000 // 24 hours

// 3. Log security events
logSecurityEvent('wallet_export_requested', {
  userId: user.id,
  timestamp: Date.now()
})
```

**For External Wallets:**
```typescript
// User controls their own security
// We just verify ownership via signature
const { signMessage } = useWallet()

async function verifyOwnership() {
  const message = `Verify ownership: ${Date.now()}`
  const signature = await signMessage(message)
  
  // Verify on
