# Session Signers Testing Guide

This guide will walk you through testing the Privy session signers implementation step-by-step, with detailed logging to verify everything works correctly.

## Prerequisites

1. ✅ Database migration applied (`migrations/017_session_signer_permissions.sql`)
2. ✅ Environment variables configured (`.env.local`)
3. ✅ Development server running (`npm run dev`)
4. ✅ User logged in with an embedded wallet

## Testing Checklist

- [ ] Step 1: Enable session signer via UI
- [ ] Step 2: Verify in database
- [ ] Step 3: Test API status endpoint
- [ ] Step 4: Test transaction signing
- [ ] Step 5: Test revocation
- [ ] Step 6: Verify logs

---

## Step 1: Enable Session Signer via UI

### Actions:
1. Log in to your app
2. Navigate to **Settings → Account**
3. Scroll to **"Autonomous Transactions"** section
4. Toggle the switch **ON** for your embedded wallet
5. **Sign the Privy prompt** when it appears

### Expected Logs (Browser Console):
```
[SessionSignersSection] Fetching status for wallet: 0x...
[SessionSignersSection] Status response: { enabled: false }
[SessionSignersSection] Enabling session signer for: 0x...
[Privy] Adding session signer...
[SessionSignersSection] ✅ Session signer enabled
```

### Expected Result:
- ✅ Privy signature prompt appears
- ✅ After signing, switch stays ON
- ✅ Toast notification: "Autonomous transactions enabled"

### Troubleshooting:
If switch immediately turns off:
- Check browser console for errors
- Verify `PRIVY_SESSION_SIGNER_KEY_QUORUM_ID` is set
- Check that Privy app has session signers feature enabled

---

## Step 2: Verify in Database

### Check Permission Was Created:

```sql
SELECT 
  id,
  user_id,
  wallet_address,
  enabled,
  enabled_at,
  revoked_at
FROM session_signer_permissions
WHERE enabled = true
ORDER BY enabled_at DESC
LIMIT 10;
```

### Expected Result:
```
id                                   | user_id     | wallet_address | enabled | enabled_at
-------------------------------------|-------------|----------------|---------|-------------------
550e8400-e29b-41d4-a716-446655440000 | abc123...   | 0x1234...     | true    | 2025-11-05 14:30:00
```

### Expected Server Logs:
```
[SessionSigners] ✅ Enabled for { userId: 'abc123...', walletAddress: '0x1234...' }
```

---

## Step 3: Test API Status Endpoint

### Using curl:
```bash
curl -X GET 'http://localhost:3000/api/wallet/session-signer/status?address=0xYOUR_WALLET_ADDRESS' \
  -H 'Cookie: YOUR_SESSION_COOKIE'
```

### Using Browser Dev Tools:
```javascript
// In browser console (while logged in)
const response = await fetch('/api/wallet/session-signer/status?address=0xYOUR_WALLET_ADDRESS')
const data = await response.json()
console.log('Status:', data)
```

### Expected Response:
```json
{
  "enabled": true,
  "walletAddress": "0x1234..."
}
```

### Expected Server Logs:
```
[API] Checking session signer status
[SessionSigners] Checking permission for user: abc123..., wallet: 0x1234...
[API] Session signer status: enabled
```

---

## Step 4: Test Transaction Signing

### Using the Test Endpoint:

```bash
# Test permission check only
curl -X POST 'http://localhost:3000/api/wallet/session-signer/test' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: YOUR_SESSION_COOKIE' \
  -d '{
    "walletAddress": "0xYOUR_WALLET_ADDRESS"
  }'
```

### Test with Dummy Transaction:

```bash
# Test full signing flow
curl -X POST 'http://localhost:3000/api/wallet/session-signer/test' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: YOUR_SESSION_COOKIE' \
  -d '{
    "walletAddress": "0xYOUR_WALLET_ADDRESS",
    "testTransaction": {
      "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "value": "0x0",
      "data": "0x"
    }
  }'
```

### Expected Response (Permission Check):
```json
{
  "success": true,
  "test_results": {
    "user_id": "abc123...",
    "wallet_address": "0x1234...",
    "permission_check": {
      "enabled": true,
      "status": "✅ PASS"
    },
    "user_signers": {
      "count": 1,
      "signers": [{
        "wallet": "0x1234...",
        "enabled": true,
        "enabled_at": "2025-11-05T14:30:00Z"
      }],
      "status": "✅ PASS"
    }
  },
  "message": "All tests passed! Session signer is working correctly."
}
```

### Expected Response (With Transaction):
```json
{
  "success": true,
  "test_results": {
    ...all above fields...,
    "transaction_signing": {
      "success": true,
      "has_signature": true,
      "signature_preview": "0x1234567890abcdef...",
      "status": "✅ PASS"
    }
  }
}
```

### Expected Server Logs:
```
🧪 [TEST] Starting session signer test
🧪 [TEST] ✅ User authenticated: abc123...
🧪 [TEST] Wallet address: 0x1234...
🧪 [TEST] Session signer enabled: true
🧪 [TEST] User has 1 session signers
🧪 [TEST] Testing transaction signing...
🧪 [TEST] Transaction: { to: '0x742d...', value: '0x0', data: '0x' }
[SessionSigners] 🔍 Checking permission for user: abc123..., wallet: 0x1234...
[SessionSigners] ✅ Permission found in database
[SessionSigners] 🔐 Calling Privy API to sign transaction
[SessionSigners] ✅ Transaction signed successfully
🧪 [TEST] Sign result: { success: true, hasSignature: true }
```

---

## Step 5: Test Revocation

### Actions:
1. Go back to **Settings → Account**
2. Toggle the switch **OFF**
3. Confirm revocation

### Expected Logs:
```
[SessionSignersSection] Revoking session signer for: 0x...
[SessionSigners] ❌ Revoked for { userId: 'abc123...', walletAddress: '0x1234...' }
[SessionSignersSection] ✅ Session signer revoked
```

### Verify in Database:
```sql
SELECT 
  wallet_address,
  enabled,
  revoked_at
FROM session_signer_permissions
WHERE wallet_address = '0xYOUR_WALLET_ADDRESS';
```

### Expected Result:
```
wallet_address | enabled | revoked_at
---------------|---------|-------------------
0x1234...      | false   | 2025-11-05 14:35:00
```

### Test That Signing Now Fails:
```bash
curl -X POST 'http://localhost:3000/api/wallet/session-signer/test' \
  -H 'Content-Type: application/json' \
  -d '{
    "walletAddress": "0xYOUR_WALLET_ADDRESS"
  }'
```

### Expected Response:
```json
{
  "success": false,
  "step": "permission_check",
  "message": "Session signer not enabled for this wallet. Please enable it in Settings → Account first.",
  "enabled": false
}
```

---

## Step 6: Verify All Logs

### Enable Verbose Logging (Optional):

Add to your `.env.local`:
```bash
# Enable debug logs
DEBUG=session-signers:*
NODE_ENV=development
```

### Key Log Patterns to Look For:

#### ✅ Success Patterns:
```
[SessionSigners] ✅ Enabled for { userId: '...', walletAddress: '...' }
[SessionSigners] ✅ Permission found in database
[SessionSigners] ✅ Transaction signed successfully
🧪 [TEST] ✅ User authenticated
```

#### ❌ Error Patterns to Watch:
```
[SessionSigners] ❌ Error checking permission
[SessionSigners] ❌ Privy API error
[SessionSigners] ❌ Failed to sign transaction
[API] ❌ Error
```

---

## Complete Test Script

Save this as `test-session-signers.sh`:

```bash
#!/bin/bash

# Test Session Signers Implementation
# Usage: ./test-session-signers.sh YOUR_WALLET_ADDRESS

WALLET_ADDRESS=$1

if [ -z "$WALLET_ADDRESS" ]; then
  echo "Usage: ./test-session-signers.sh YOUR_WALLET_ADDRESS"
  exit 1
fi

echo "🧪 Testing Session Signers for wallet: $WALLET_ADDRESS"
echo ""

# Test 1: Check Status
echo "Test 1: Checking status..."
curl -s "http://localhost:3000/api/wallet/session-signer/status?address=$WALLET_ADDRESS" | jq
echo ""

# Test 2: Run Test Endpoint
echo "Test 2: Running test endpoint..."
curl -s -X POST "http://localhost:3000/api/wallet/session-signer/test" \
  -H "Content-Type: application/json" \
  -d "{\"walletAddress\":\"$WALLET_ADDRESS\"}" | jq
echo ""

# Test 3: Test Transaction Signing
echo "Test 3: Testing transaction signing..."
curl -s -X POST "http://localhost:3000/api/wallet/session-signer/test" \
  -H "Content-Type: application/json" \
  -d "{
    \"walletAddress\":\"$WALLET_ADDRESS\",
    \"testTransaction\": {
      \"to\": \"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\",
      \"value\": \"0x0\",
      \"data\": \"0x\"
    }
  }" | jq
echo ""

echo "✅ Tests complete!"
```

Make executable: `chmod +x test-session-signers.sh`

---

## Common Issues and Solutions

### Issue 1: "Session signer not enabled"
**Solution:** Enable it via UI first (Settings → Account)

### Issue 2: Switch turns off immediately
**Solution:** 
- Check browser console for errors
- Verify `PRIVY_SESSION_SIGNER_KEY_QUORUM_ID` in `.env.local`
- Check Privy dashboard to confirm key quorum exists

### Issue 3: "Failed to sign transaction"
**Solution:**
- Verify `PRIVY_APP_SECRET` is correct
- Check that key quorum is active in Privy dashboard
- Ensure wallet has session signer added (check Privy API logs)

### Issue 4: Database errors
**Solution:**
- Run migration: `psql $DATABASE_URL < migrations/017_session_signer_permissions.sql`
- Verify RLS policies are active
- Check user has valid session

### Issue 5: API returns 401
**Solution:**
- Ensure user is logged in
- Check session cookie is being sent
- Verify `requireUserId()` is working

---

## Production Checklist

Before deploying to production:

- [ ] Database migration applied
- [ ] Environment variables set (with real values, not placeholders)
- [ ] Key quorum verified active in Privy dashboard
- [ ] All tests pass in staging environment
- [ ] Logging configured appropriately (not too verbose)
- [ ] Error handling tested (user not logged in, permission denied, etc.)
- [ ] UI tested on multiple devices/browsers
- [ ] Rate limiting configured (optional but recommended)
- [ ] Monitoring/alerts set up for failures

---

## Monitoring in Production

### Key Metrics to Track:

1. **Enable Rate**: How many users enable session signers
2. **Transaction Success Rate**: % of signed transactions that succeed
3. **Revocation Rate**: How often users revoke access
4. **Error Rate**: Failed signing attempts
5. **API Latency**: Time to sign transactions

### Recommended Log Levels:

**Development:**
- All logs enabled (including debug)
- Full error stack traces

**Production:**
- Info level and above
- Error details (but sanitize sensitive data)
- Performance metrics

---

## Next Steps

Once all tests pass:

1. ✅ Enable for your trading bot/agent code
2. ✅ Implement transaction broadcasting
3. ✅ Add monitoring/alerts
4. ✅ Document for your team
5. ✅ Set up backup procedures

Congratulations! Your session signers implementation is fully tested and ready to use! 🎉
