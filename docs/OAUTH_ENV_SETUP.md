# OAuth Environment Variables Setup

## Required Environment Variables

Add these to your `.env.local` file:

### 1. NANGO_SECRET_KEY (✅ Already configured)
```bash
NANGO_SECRET_KEY=da554f11-462b-43fb-92fd-598db95d90b1
```
**Purpose:** Used server-side to create Nango session tokens  
**Location:** Found in your Nango Dashboard → Settings → Secret Key

---

### 2. NANGO_HMAC_KEY (❌ MISSING - Add this!)
```bash
NANGO_HMAC_KEY=your_hmac_key_here
```
**Purpose:** Verifies that webhooks are actually from Nango (security)  
**Location:** Found in your Nango Dashboard → Settings → HMAC Key  
**Important:** Without this, webhook signature verification is skipped (development only)

---

### 3. NEXT_PUBLIC_OAUTH_API_URL (✅ Already configured)
```bash
NEXT_PUBLIC_OAUTH_API_URL=https://api.lucid.foundation
```
**Purpose:** Points frontend SDK to your self-hosted Nango instance  
**Note:** This is public (exposed to browser)

---

## How to Find Your Keys

### IMPORTANT: HMAC Key Direction ⚠️

**YOU DON'T ADD HMAC KEY TO NANGO!**

The HMAC key flows **FROM Nango TO You**:

```
Nango generates HMAC key → You copy it → Add to your .env.local
```

### In Self-Hosted Nango Dashboard:

1. **Navigate to:** `https://api.lucid.foundation` (your Nango instance)
2. **Go to:** Environment Settings or Settings page
3. **COPY (don't add):**
   - **Secret Key** - Used for API authentication (✅ you have this)
   - **HMAC Key** - Nango generates this, you COPY it (❌ add to .env.local)

### What You CONFIGURE in Nango Dashboard:

1. **Webhook URL:** `https://yourdomain.com/api/oauth/webhooks`
2. **Enable Webhook Events:**
   - ✅ `auth.creation` - OAuth connection created
   - ✅ `auth.override` - OAuth connection updated  
   - ✅ `auth.deletion` - OAuth connection deleted

### Example Settings Page Structure:
```
Nango Dashboard Settings
├── Secret Key: da554f11-462b-43fb-92fd-598db95d90b1 (you already have)
├── HMAC Key: abc123xyz... (COPY THIS → add to your .env.local)
├── Webhook URL: https://yourdomain.com/api/oauth/webhooks (YOU CONFIGURE)
└── Webhook Events: ✅ auth.creation, auth.override, auth.deletion (ENABLE THESE)
```

---

## Complete .env.local Example

```bash
# Nango OAuth Configuration
NANGO_SECRET_KEY=da554f11-462b-43fb-92fd-598db95d90b1
NANGO_HMAC_KEY=your_hmac_key_from_dashboard
NEXT_PUBLIC_OAUTH_API_URL=https://api.lucid.foundation
# In the current Lucid + Nango production setup, providers redirect to Nango's callback endpoint
NEXT_PUBLIC_OAUTH_CALLBACK_URL=https://api.lucid.foundation/nango/oauth/callback
NEXT_PUBLIC_OAUTH_PROVIDER=nango
```

---

## Security Notes

### 🔒 HMAC Key Security
- **Never commit** HMAC key to git
- **Production:** HMAC verification is REQUIRED
- **Development:** Will work without it but logs a warning
- **Purpose:** Prevents malicious webhook spoofing

### 🔐 Secret Key Security
- **Server-side only** - Never expose to frontend
- **Used for:** Creating session tokens
- **Keep secure:** Treat like a password

### 🌐 Public Keys
- `NEXT_PUBLIC_*` variables are exposed to browser
- Only use for non-sensitive configuration
- OK to expose: API URLs, public settings

---

## Testing Configuration

### 1. Verify Environment Variables
```bash
# In your project root
cat .env.local | grep NANGO
```
Expected output:
```
NANGO_SECRET_KEY=da554f11-462b-43fb-92fd-598db95d90b1
NANGO_HMAC_KEY=your_hmac_key_here  # Add this!
NEXT_PUBLIC_OAUTH_API_URL=https://api.lucid.foundation
```

### 2. Test Webhook Endpoint
```bash
curl https://yourdomain.com/api/oauth/webhooks
```
Expected response:
```json
{
  "status": "ok",
  "endpoint": "oauth-webhooks",
  "message": "Webhook endpoint is ready to receive Nango events"
}
```

### 3. Check Nango Connection
```bash
# Test session token creation
curl -X POST https://yourdomain.com/api/oauth/session \
  -H "Content-Type: application/json" \
  -d '{"integrationIds": ["google"]}'
```

---

## Troubleshooting

### "NANGO_SECRET_KEY not configured"
- Add `NANGO_SECRET_KEY` to `.env.local`
- Restart Next.js server: `npm run dev`

### "NANGO_HMAC_KEY not configured - skipping verification"
- This is a warning, not an error
- Add `NANGO_HMAC_KEY` to `.env.local` for production
- OK to skip in development

### "Invalid signature - rejecting webhook"
- Check HMAC key matches your Nango dashboard
- Ensure key has no extra spaces/newlines
- Verify webhook is actually from your Nango instance

---

## Next Steps

1. ✅ Copy HMAC key from Nango dashboard
2. ✅ Add `NANGO_HMAC_KEY` to `.env.local`
3. ✅ Restart your dev server
4. ✅ Configure webhook URL in Nango dashboard
5. ✅ Test OAuth flow!
