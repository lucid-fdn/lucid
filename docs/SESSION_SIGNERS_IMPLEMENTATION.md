# Privy Session Signers Implementation

## Overview

This document describes the implementation of Privy's session signers feature in LucidMerged, allowing users to delegate transaction signing authority to the backend for autonomous agents like trading bots.

## What Are Session Signers?

Session signers enable your backend to sign and execute transactions on behalf of users without requiring manual approval each time. This is essential for:
- **Trading bots** - Automated trades without user intervention
- **AI agents** - Autonomous on-chain operations
- **Scheduled transactions** - Time-based automated actions

The user must explicitly opt-in by adding your "key quorum" (a backend-controlled authorization key) to their wallet as a session signer.

## Architecture

### 1. Environment Configuration
**File:** `.env.local`

```bash
# Key Quorum ID - identifies your session signer in Privy's system
PRIVY_SESSION_SIGNER_KEY_QUORUM_ID=hq3a7lpj1jgk6b2axr8zr08p
```

✅ **Important:** You do NOT need a private key! Privy manages the private key internally on their secure servers. Your backend only needs:
- `PRIVY_APP_ID` - Your app identifier
- `PRIVY_APP_SECRET` - For API authentication
- `PRIVY_SESSION_SIGNER_KEY_QUORUM_ID` - References the key quorum (session signer)

When you call Privy's API to sign a transaction, Privy uses the private key associated with the key quorum ID internally. The private key never leaves Privy's infrastructure.

### 2. Database Schema
**File:** `migrations/017_session_signer_permissions.sql`

Tracks which users have enabled session signers for which wallets:

```sql
CREATE TABLE session_signer_permissions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  wallet_address TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  enabled_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id, wallet_address)
);
```

### 3. Service Layer
**File:** `src/lib/session-signers/index.ts`

Provides functions for:
- `hasSessionSignerEnabled(userId, walletAddress)` - Check permission
- `enableSessionSigner(userId, walletAddress)` - Grant permission
- `revokeSessionSigner(userId, walletAddress)` - Revoke permission
- `signTransactionWithSessionSigner(...)` - Sign transactions (placeholder)
- `executeAutonomousTransaction(...)` - Sign + broadcast (placeholder)

### 4. API Endpoints

**Check Status:**
```
GET /api/wallet/session-signer/status?address=0x...
```

**Enable Session Signer:**
```
POST /api/wallet/session-signer/enable
Body: { walletAddress: "0x..." }
```

**Revoke Session Signer:**
```
POST /api/wallet/session-signer/revoke
Body: { walletAddress: "0x..." }
```

### 5. Frontend UI
**File:** `src/components/settings/account-identities-card.tsx`

Displays a section for each embedded wallet with:
- **Checkbox** - Enable/disable autonomous transactions
- **Auto-detection** - Checks existing permission status
- **User consent** - Privy prompts for signature when enabling

**Important:** The implementation uses **On-device execution** mode (Privy's default). When calling `addSessionSigners`, you must pass an empty `signers` array:

```typescript
await addSessionSigners({
  address: wallet.address,
  signers: [] // Empty for On-device execution
})
```

Privy manages the session signer configuration automatically on their backend. The TEE (Trusted Execution Environment) mode allows specifying signers manually, but On-device execution does not.

## User Flow

### Enabling Session Signers

1. User goes to **Settings → Account**
2. Scrolls to "Autonomous Transactions" section
3. Toggles switch for their embedded wallet
4. **Privy prompts** for signature to add session signer
5. User signs to approve
6. Permission recorded in database
7. Backend can now sign transactions for this wallet

### Using Session Signers (Backend)

```typescript
import { signTransactionWithSessionSigner } from '@/lib/session-signers'

// In your agent/bot code
const result = await signTransactionWithSessionSigner(
  userId,
  walletAddress,
  {
    to: '0x...',
    value: '0.1',
    data: '0x...'
  }
)

if (result.success) {
  // Transaction signed, broadcast it
  const tx = await broadcastTransaction(result.signedTransaction)
}
```

### Revoking Access

1. User toggles switch off
2. Session signer removed from wallet
3. Permission revoked in database
4. Backend can no longer sign transactions

## Security Considerations

### Permission Checks
Every transaction signing request:
1. **Authenticates user** - `requireUserId()`
2. **Checks permission** - `hasSessionSignerEnabled(userId, walletAddress)`
3. **Validates wallet ownership** - User must own the wallet
4. **Records audit trail** - All operations logged

### RLS Policies
Database uses Row Level Security:
- Users can only view/modify their own permissions
- Service role (backend) has full access for signing
- No direct user access to session signer operations

### Best Practices
- **Limit scope** - Only use for intended autonomous operations
- **Monitor usage** - Log all signed transactions
- **Rate limiting** - Prevent abuse
- **Policy restrictions** (Optional) - Configure Privy policies to limit amounts/contracts

## Next Steps

### 1. Verify Your Key Quorum ID
Check your Privy dashboard to confirm the key quorum ID `hq3a7lpj1jgk6b2axr8zr08p` exists and is active. You do NOT need the private key - Privy manages it securely.

### 2. Run Database Migration
```bash
# Apply the session_signer_permissions table
psql $DATABASE_URL < migrations/017_session_signer_permissions.sql
```

### 3. Implement Transaction Signing ✅ COMPLETE
The `signTransactionWithSessionSigner()` function is now fully implemented and calls Privy's REST API:

**Implementation Details:**
- Uses Basic Auth with `appId:appSecret`
- Calls `/api/v1/wallets/{address}/sign_transaction`
- Specifies session signer in authorization
- Returns signed transaction ready for broadcast

**Example Usage:**
```typescript
const result = await signTransactionWithSessionSigner(
  userId,
  walletAddress,
  {
    to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    value: '0.1', // in ETH
    data: '0x' // contract call data
  }
)

if (result.success) {
  const signedTx = result.signedTransaction
  // Broadcast this signed transaction to the network
}
```

### 4. Configure Policies (Optional)
In Privy Dashboard:
1. Go to **Wallet Infrastructure → Policies**
2. Create policies to restrict:
   - Maximum transaction amounts
   - Whitelisted contracts
   - Time windows
   - Rate limits
3. Add policy IDs to `getSessionSignerConfig()` in service layer

### 5. Test the Flow
1. Log in to your app
2. Go to Settings → Account
3. Enable "Autonomous Transactions" for a wallet
4. Verify in database: `SELECT * FROM session_signer_permissions;`
5. Test signing a transaction from backend
6. Verify it works, then disable to test revocation

## Usage Examples

### Trading Bot
```typescript
// In your trading bot service
async function executeTrade(userId: string, walletAddress: string, trade: Trade) {
  // Check permission
  const hasPermission = await hasSessionSignerEnabled(userId, walletAddress)
  if (!hasPermission) {
    throw new Error('User has not enabled autonomous trading')
  }
  
  // Build transaction
  const tx = {
    to: trade.exchangeAddress,
    value: '0',
    data: encodeTradeFunctionCall(trade)
  }
  
  // Sign and execute
  const result = await executeAutonomousTransaction(userId, walletAddress, tx)
  
  return result.txHash
}
```

### Scheduled Transactions
```typescript
// In your scheduler service
async function executeScheduledTransaction(scheduleId: string) {
  const schedule = await getSchedule(scheduleId)
  
  // Verify user still has permission
  const hasPermission = await hasSessionSignerEnabled(
    schedule.userId,
    schedule.walletAddress
  )
  
  if (!hasPermission) {
    await disableSchedule(scheduleId)
    return
  }
  
  // Execute transaction
  const result = await executeAutonomousTransaction(
    schedule.userId,
    schedule.walletAddress,
    schedule.transaction
  )
  
  await recordExecution(scheduleId, result.txHash)
}
```

## Troubleshooting

### "Session signer not enabled"
- Check database: `SELECT * FROM session_signer_permissions WHERE user_id = '...'`
- Verify user completed the enable flow
- Check Privy dashboard to confirm signer was added

### "Failed to sign transaction"
- Verify `PRIVY_SESSION_SIGNER_PRIVATE_KEY` is set correctly
- Check Privy API documentation for correct endpoint
- Verify the signing implementation is complete

### UI toggle doesn't work
- Check browser console for errors
- Verify API endpoints are accessible
- Check that `NEXT_PUBLIC_PRIVY_SESSION_SIGNER_KEY_QUORUM_ID` is set

## References

- [Privy Session Signers Documentation](https://docs.privy.io/guide/guides/embedded-wallets/session-signers)
- [Privy Authorization Signatures](https://docs.privy.io/guide/guides/embedded-wallets/authorization-signatures)
- [Privy Key Quorums](https://docs.privy.io/guide/guides/embedded-wallets/key-quorums)

## Support

For issues or questions:
1. Check Privy documentation
2. Contact Privy support for key quorum configuration
3. Review implementation in this codebase
4. Check database permissions and RLS policies
